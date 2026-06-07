/**
 * Clean & Simple YouTube Transcript Fetcher Backend
 * ==================================================
 * Uses the Android InnerTube API client strategy which is robust,
 * does not trigger browser consent flows, and bypasses device attestation
 * checks when fetched with the Android User-Agent.
 * 
 * Fallback: Uses YouTube oEmbed API to get real metadata (title/author) if blocked.
 * The frontend is responsible for AI prompt budgeting so this route can return
 * the actual caption sequence instead of dropping transcript lines.
 */

const ANDROID_PLAYER_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const ANDROID_USER_AGENT = "com.google.android.youtube/20.10.38 (Linux; U; Android 14)";
const ANDROID_CONTEXT = {
  client: { clientName: "ANDROID", clientVersion: "20.10.38" }
};

function decodeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, c) => String.fromCharCode(parseInt(c, 16)));
}

function parseXmlCaptions(xml) {
  const segments = [];
  const regex = /<text start="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const rawText = match[2];
    const strippedText = rawText.replace(/<[^>]*>/g, ""); // Strip inner HTML tags
    const text = decodeHtml(strippedText.trim());
    if (text) {
      segments.push({
        start: parseFloat(match[1]) || 0,
        text: text.replace(/\s+/g, " ")
      });
    }
  }
  return segments;
}

function parseJsonCaptions(raw) {
  const data = JSON.parse(raw);
  const segments = [];
  const events = Array.isArray(data.events) ? data.events : [];

  for (const event of events) {
    if (!Array.isArray(event.segs)) continue;
    const text = event.segs
      .map((seg) => seg?.utf8 || "")
      .join("")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) continue;

    const startMs =
      typeof event.tStartMs === "number"
        ? event.tStartMs
        : parseInt(event.tStartMs || "0", 10);

    segments.push({
      start: Number.isFinite(startMs) ? startMs / 1000 : 0,
      text: decodeHtml(text)
    });
  }

  return segments;
}

function parseCaptionPayload(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("{")) {
    return parseJsonCaptions(trimmed);
  }

  return parseXmlCaptions(trimmed);
}

function buildCaptionUrl(baseUrl, format) {
  const normalizedBase = baseUrl.replace(/\\u0026/g, "&");
  const url = new URL(normalizedBase);
  url.searchParams.set("fmt", format);
  return url.toString();
}

async function fetchCaptionSegments(baseUrl) {
  const formats = ["json3", "srv1"];
  let lastError = null;

  for (const format of formats) {
    try {
      const capResp = await fetch(buildCaptionUrl(baseUrl, format), {
        headers: {
          "User-Agent": ANDROID_USER_AGENT
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!capResp.ok) {
        throw new Error(`Failed to retrieve ${format} captions (HTTP ${capResp.status})`);
      }

      const captionText = await capResp.text();
      if (!captionText.trim()) {
        throw new Error(`YouTube returned empty ${format} captions.`);
      }

      const segments = parseCaptionPayload(captionText);
      if (segments.length > 0) {
        return { segments, captionFormat: format };
      }

      throw new Error(`Parsed ${format} captions are empty.`);
    } catch (err) {
      lastError = err;
      console.warn(`[YouTube API] ${format} caption fetch failed:`, err.message);
    }
  }

  throw lastError || new Error("Failed to retrieve captions.");
}

function getTrackRank(track, preferredLangs = ["en", "te", "hi", "mr", "ta", "ka", "ml", "bn"]) {
  const lang = (track.languageCode || "").toLowerCase();
  const isAsr = track.kind === "asr";

  for (let i = 0; i < preferredLangs.length; i++) {
    const pref = preferredLangs[i];
    if (!isAsr && (lang === pref || lang.startsWith(pref + "-"))) {
      return i;
    }
  }

  const offset = preferredLangs.length;
  for (let i = 0; i < preferredLangs.length; i++) {
    const pref = preferredLangs[i];
    if (isAsr && (lang === pref || lang.startsWith(pref + "-"))) {
      return offset + i;
    }
  }

  if (!isAsr) {
    return offset * 2;
  }

  return offset * 2 + 1;
}

function getSortedCaptionTracks(tracks) {
  if (!Array.isArray(tracks) || tracks.length === 0) return [];
  return [...tracks].sort((a, b) => getTrackRank(a) - getTrackRank(b));
}

// Fetch basic metadata from public oEmbed (very high rate limits, never bot-blocked)
async function fetchOEmbedMetadata(videoId) {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = await resp.json();
      return {
        title: data.title || "YouTube Video",
        channel: data.author_name || "Unknown Channel",
      };
    }
  } catch (err) {
    console.warn("[YouTube API] Failed to fetch oEmbed metadata fallback:", err.message);
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { v: videoId } = req.query;
  if (!videoId || typeof videoId !== "string" || videoId.length < 8) {
    return res.status(400).json({ error: "Valid video ID query parameter required (e.g. ?v=videoId)" });
  }

  console.log(`[YouTube API] Fetching transcript via Android client for videoId: ${videoId}`);

  try {
    // 1. Request InnerTube Player API
    const resp = await fetch(ANDROID_PLAYER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": ANDROID_USER_AGENT
      },
      body: JSON.stringify({
        context: ANDROID_CONTEXT,
        videoId
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!resp.ok) {
      throw new Error(`InnerTube API request failed (HTTP ${resp.status})`);
    }

    const data = await resp.json();

    // 2. Check Playability Status
    const playStatus = data.playabilityStatus || {};
    if (playStatus.status && playStatus.status !== "OK") {
      const reason = playStatus.reason || "Video unplayable";
      throw new Error(reason);
    }

    // 3. Extract Metadata
    const details = data.videoDetails || {};
    const metadata = {
      title: decodeHtml(details.title || "YouTube Video"),
      channel: decodeHtml(details.author || "Unknown Channel"),
      duration: details.lengthSeconds ? parseInt(details.lengthSeconds, 10) : null,
      viewCount: details.viewCount ? parseInt(details.viewCount, 10) : null,
      description: decodeHtml(details.shortDescription || "")
    };

    // 4. Get Caption Tracks
    const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(tracks) || tracks.length === 0) {
      // Captions unavailable, but we have metadata — return it instead of throwing
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      return res.status(200).json({
        videoId,
        title: metadata.title,
        channel: metadata.channel,
        duration: metadata.duration,
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        viewCount: metadata.viewCount,
        description: metadata.description,
        hasTranscript: false,
        transcriptSource: "none",
        transcriptStrategy: "innertube_android",
        segmentCount: 0,
        transcript: "",
        segments: [],
        error: "Captions are disabled or unavailable for this video."
      });
    }

    // 5. Sort tracks by language preference and kind (manual vs ASR)
    const sortedTracks = getSortedCaptionTracks(tracks);

    // 6. Iterate and validate captions to bypass empty placeholder tracks
    let selectedTrack = null;
    let selectedSegments = [];
    let selectedFormat = "";

    for (const track of sortedTracks) {
      try {
        const { segments, captionFormat } = await fetchCaptionSegments(track.baseUrl);
        const totalLength = segments.reduce((sum, s) => sum + s.text.length, 0);

        if (segments.length >= 5 && totalLength >= 150) {
          selectedTrack = track;
          selectedSegments = segments;
          selectedFormat = captionFormat;
          break; // Found a valid full transcript
        } else {
          // If a track is too short, keep it as fallback in case all fail
          if (!selectedTrack || totalLength > selectedSegments.reduce((sum, s) => sum + s.text.length, 0)) {
            selectedTrack = track;
            selectedSegments = segments;
            selectedFormat = captionFormat;
          }
        }
      } catch (err) {
        console.warn(`[YouTube API] Failed to fetch track ${track.languageCode}:`, err.message);
      }
    }

    const finalLength = selectedSegments.reduce((sum, s) => sum + s.text.length, 0);
    if (!selectedTrack || selectedSegments.length === 0 || finalLength < 50) {
      throw new Error("No valid transcripts or captions available for this video.");
    }

    // 7. Return Success Response
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    return res.status(200).json({
      videoId,
      title: metadata.title,
      channel: metadata.channel,
      duration: metadata.duration,
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      viewCount: metadata.viewCount,
      description: metadata.description,
      hasTranscript: true,
      transcriptSource: "captions",
      transcriptStrategy: "innertube_android",
      captionFormat: selectedFormat,
      captionLanguage: selectedTrack.languageCode || null,
      isAutoGenerated: selectedTrack.kind === "asr",
      segmentCount: selectedSegments.length,
      transcript: selectedSegments.map(s => s.text).join(" "),
      segments: selectedSegments
    });

  } catch (error) {
    console.error(`[YouTube API Error] For video ${videoId}:`, error.message);

    // Try oEmbed fallback to at least get real title and channel name for metadata
    const fallbackMeta = await fetchOEmbedMetadata(videoId);

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    return res.status(200).json({
      videoId,
      title: fallbackMeta?.title || "YouTube Video",
      channel: fallbackMeta?.channel || "Unknown Channel",
      duration: null,
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      viewCount: null,
      description: "",
      hasTranscript: false,
      transcriptSource: "none",
      transcriptStrategy: "none",
      segmentCount: 0,
      transcript: "",
      segments: [],
      error: error.message || "Failed to fetch transcript."
    });
  }
}
