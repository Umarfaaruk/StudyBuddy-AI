/**
 * Robust YouTube Transcript Fetcher Backend
 * ==================================================
 * 1. Primary Strategy: Uses the Android InnerTube API client which requires no key,
 *    works out-of-the-box on localhost, and fetches structured caption tracks.
 * 2. Fallback Strategy: If InnerTube is blocked (common in serverless/cloud hosting like Vercel),
 *    falls back to Supadata API if SUPADATA_API_KEY is configured.
 * 3. Metadata: Uses public oEmbed API for video metadata.
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
    return res.status(400).json({ error: "Valid video ID required" });
  }

  let finalTitle = "YouTube Video";
  let finalChannel = "Unknown Channel";

  // Pre-fetch oEmbed metadata to ensure we have title/channel even if scrapers fail
  const oEmbedMeta = await fetchOEmbedMetadata(videoId);
  if (oEmbedMeta) {
    finalTitle = oEmbedMeta.title;
    finalChannel = oEmbedMeta.channel;
  }

  // 1. Try Android InnerTube Scraping (requires no API key)
  try {
    console.log(`[YouTube API] Trying InnerTube scraper for videoId: ${videoId}`);
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
      throw new Error(`InnerTube HTTP error: ${resp.status}`);
    }

    const data = await resp.json();
    const playStatus = data.playabilityStatus || {};
    if (playStatus.status && playStatus.status !== "OK") {
      throw new Error(playStatus.reason || "Video unplayable");
    }

    const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (Array.isArray(tracks) && tracks.length > 0) {
      const sortedTracks = getSortedCaptionTracks(tracks);
      let selectedSegments = [];
      
      for (const track of sortedTracks) {
        try {
          const { segments } = await fetchCaptionSegments(track.baseUrl);
          if (segments.length > 0) {
            selectedSegments = segments;
            break;
          }
        } catch (err) {
          console.warn(`[YouTube API] Failed to fetch track ${track.languageCode}:`, err.message);
        }
      }

      if (selectedSegments.length > 0) {
        const transcriptText = selectedSegments.map(s => s.text).join(" ");
        return res.status(200).json({
          videoId,
          title: finalTitle,
          channel: finalChannel,
          thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          hasTranscript: true,
          transcript: transcriptText,
          segments: selectedSegments,
          transcriptSource: "captions",
          transcriptStrategy: "innertube_android",
          error: null
        });
      }
    }
    console.log("[YouTube API] No captions found via InnerTube scraper.");
  } catch (err) {
    console.warn("[YouTube API] InnerTube scraper failed:", err.message);
  }

  // 2. Try Supadata API Fallback
  const supadataKey = process.env.SUPADATA_API_KEY;
  if (supadataKey && !supadataKey.startsWith("AQ.")) {
    try {
      console.log(`[YouTube API] Trying Supadata API for videoId: ${videoId}`);
      const resp = await fetch(
        `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&text=true`,
        {
          headers: {
            "x-api-key": supadataKey
          },
          signal: AbortSignal.timeout(15000)
        }
      );

      if (resp.ok) {
        const data = await resp.json();
        const transcript = data.content || "";
        if (transcript.length > 50) {
          return res.status(200).json({
            videoId,
            title: finalTitle,
            channel: finalChannel,
            thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            hasTranscript: true,
            transcript: transcript,
            segments: [{ start: 0, text: transcript }],
            transcriptSource: "supadata",
            error: null
          });
        }
      } else {
        console.warn(`[YouTube API] Supadata API HTTP error: ${resp.status}`);
      }
    } catch (err) {
      console.warn("[YouTube API] Supadata API failed:", err.message);
    }
  }

  // 3. Fallback: No Transcript Available
  return res.status(200).json({
    videoId,
    title: finalTitle,
    channel: finalChannel,
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    hasTranscript: false,
    transcript: "",
    segments: [],
    transcriptSource: "none",
    error: "No transcript available for this video."
  });
}