/**
 * Clean & Simple YouTube Transcript Fetcher Backend
 * ==================================================
 * Uses the Android InnerTube API client strategy which is robust,
 * does not trigger browser consent flows, and bypasses device attestation
 * checks when fetched with the Android User-Agent.
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

function selectCaptionTrack(tracks, preferredLangs = ["en", "te", "hi", "mr", "ta", "ka", "ml", "bn"]) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null;

  const manual = {};
  const generated = {};

  for (const track of tracks) {
    const lang = (track.languageCode || "").toLowerCase();
    if (track.kind === "asr") {
      generated[lang] = track;
    } else {
      manual[lang] = track;
    }
  }

  // Check manual tracks by preference
  for (const lang of preferredLangs) {
    if (manual[lang]) return manual[lang];
    for (const tl in manual) {
      if (tl.startsWith(lang + "-")) return manual[tl];
    }
  }

  // Check generated tracks by preference
  for (const lang of preferredLangs) {
    if (generated[lang]) return generated[lang];
    for (const tl in generated) {
      if (tl.startsWith(lang + "-")) return generated[tl];
    }
  }

  // Fallback to any manual track
  const manualKeys = Object.keys(manual);
  if (manualKeys.length > 0) return manual[manualKeys[0]];

  // Fallback to any generated track
  const generatedKeys = Object.keys(generated);
  if (generatedKeys.length > 0) return generated[generatedKeys[0]];

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
      throw new Error("Captions are disabled or unavailable for this video.");
    }

    // 5. Select Best Track
    const track = selectCaptionTrack(tracks);
    if (!track || !track.baseUrl) {
      throw new Error("No suitable manual or automatic caption track found.");
    }

    // 6. Fetch Caption XML (must use ANDROID user-agent to bypass attestation checks)
    const capUrl = track.baseUrl.replace(/\\u0026/g, "&").replace(/&fmt=srv3/g, "");
    const capResp = await fetch(capUrl, {
      headers: {
        "User-Agent": ANDROID_USER_AGENT
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!capResp.ok) {
      throw new Error(`Failed to retrieve caption XML (HTTP ${capResp.status})`);
    }

    const captionText = await capResp.text();
    if (!captionText.trim()) {
      throw new Error("YouTube returned empty captions (Proof of Origin attestation active).");
    }

    // 7. Parse XML to segments
    const segments = parseXmlCaptions(captionText);
    if (segments.length === 0) {
      throw new Error("Parsed transcript segments are empty.");
    }

    // 8. Return Success Response
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
      segmentCount: segments.length,
      transcript: segments.map(s => s.text).join(" "),
      segments
    });

  } catch (error) {
    console.error(`[YouTube API Error] For video ${videoId}:`, error.message);

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    return res.status(200).json({
      videoId,
      title: "YouTube Video",
      channel: "Unknown Channel",
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
