/**
 * YouTube Transcript API Proxy — v4
 * ===================================
 * Multi-strategy transcript fetcher with improved non-English support.
 *
 * Strategies (in order):
 *   1. YouTube InnerTube API (works for ALL languages including Telugu)
 *   2. youtube-transcript npm library (tries multiple languages)
 *   3. Direct HTML playerResponse caption parsing
 *   4. Video metadata fallback (title, channel, description)
 *
 * Endpoint: GET /api/youtube-transcript?v=<videoId>
 */

import { YoutubeTranscript } from "youtube-transcript";

// ─── InnerTube constants ──────────────────────────────────────────────────────
const INNERTUBE_API_URL =
  "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const INNERTUBE_CLIENT_VERSION = "20.10.38";
const INNERTUBE_CONTEXT = {
  client: { clientName: "ANDROID", clientVersion: INNERTUBE_CLIENT_VERSION },
};
const INNERTUBE_USER_AGENT = `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`;

// ─── Decode helpers ───────────────────────────────────────────────────────────
function decodeHtmlEntities(text) {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)));
}

function decodeXMLEntities(text) {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)));
}

// ─── Text cleaning ────────────────────────────────────────────────────────────
function cleanCaptionText(text) {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u266a\u266b\u266c\u266d\u266e\u266f♪♫]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSegments(segments) {
  const cleaned = [];
  for (const seg of segments) {
    const text = cleanCaptionText(String(seg.text || ""));
    if (!text) continue;
    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.text === text) continue;
    cleaned.push({ start: Number(seg.start) || 0, text });
  }
  return cleaned;
}

// ─── XML caption parser ───────────────────────────────────────────────────────
function parseTimedTextXml(xml) {
  const segments = [];
  const regex = /<text start="([^"]+)"[^>]*>([^<]*)<\/text>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const text = decodeXMLEntities(match[2].trim());
    if (text) segments.push({ start: parseFloat(match[1]), text });
  }
  return segments;
}

// ─── JSON extractor from HTML ─────────────────────────────────────────────────
function extractJsonFromHtml(html, marker) {
  const index = html.indexOf(marker);
  if (index === -1) return null;
  const startIndex = html.indexOf("{", index);
  if (startIndex === -1) return null;

  let braceCount = 0;
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < html.length; i++) {
    const char = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") braceCount++;
      else if (char === "}") {
        braceCount--;
        if (braceCount === 0) {
          try {
            return JSON.parse(html.substring(startIndex, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

// ─── Caption track selection ──────────────────────────────────────────────────
function pickCaptionTrack(tracks, requestedLang = null) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null;

  const scoreTrack = (track) => {
    const lang = (track.languageCode || "").toLowerCase();
    let score = 0;

    // If a specific language is requested, prioritize it
    if (requestedLang && lang === requestedLang.toLowerCase()) score += 100;

    // English is preferred if no specific request
    if (!requestedLang) {
      if (lang === "en") score += 20;
      else if (lang.startsWith("en")) score += 15;
    }

    // Manual captions preferred over ASR
    if (track.kind !== "asr") score += 10;

    return score;
  };

  return [...tracks].sort((a, b) => scoreTrack(b) - scoreTrack(a))[0];
}

// ─── Strategy 1: InnerTube API with multi-language fallback ────────────────────
async function fetchViaInnerTube(videoId) {
  try {
    const resp = await fetch(INNERTUBE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": INNERTUBE_USER_AGENT,
      },
      body: JSON.stringify({
        context: INNERTUBE_CONTEXT,
        videoId,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!resp.ok) return { segments: [], metadata: null };

    const data = await resp.json();

    // Extract metadata
    const videoDetails = data?.videoDetails || {};
    const metadata = {
      title: decodeHtmlEntities(videoDetails.title || ""),
      channel: decodeHtmlEntities(videoDetails.author || videoDetails.channelTitle || ""),
      duration: videoDetails.lengthSeconds
        ? parseInt(videoDetails.lengthSeconds, 10)
        : null,
      viewCount: videoDetails.viewCount
        ? parseInt(videoDetails.viewCount, 10)
        : null,
      description: decodeHtmlEntities(
        (videoDetails.shortDescription || "")
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .trim()
      ),
      keywords: videoDetails.keywords || [],
    };

    // Extract caption tracks
    const captionTracks =
      data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!Array.isArray(captionTracks) || captionTracks.length === 0) {
      return { segments: [], metadata };
    }

    // Try to fetch captions in order: first English, then any first available
    const langPriority = ["en", "te", "hi", "mr", "ta", "ka", "ml", "bn"];
    let selectedTrack = null;

    for (const lang of langPriority) {
      selectedTrack = pickCaptionTrack(captionTracks, lang);
      if (selectedTrack) break;
    }

    if (!selectedTrack) selectedTrack = captionTracks[0];
    if (!selectedTrack?.baseUrl) return { segments: [], metadata };

    let captionUrl = selectedTrack.baseUrl.replace(/\\u0026/g, "&");
    if (!captionUrl.includes("fmt=")) {
      captionUrl += captionUrl.includes("?") ? "&fmt=3" : "?fmt=3";
    }

    const captionResp = await fetch(captionUrl, {
      headers: {
        "User-Agent": INNERTUBE_USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!captionResp.ok) return { segments: [], metadata };

    const captionText = await captionResp.text();
    if (!captionText.trim()) return { segments: [], metadata };

    let segments = [];

    // Try JSON format first
    if (captionText.trim().startsWith("{")) {
      try {
        const json = JSON.parse(captionText);
        for (const event of json?.events || []) {
          const text = (event.segs || [])
            .map((s) => s.utf8 || "")
            .join("")
            .replace(/\n/g, " ")
            .trim();
          if (text && text !== "\n") {
            segments.push({ start: (event.tStartMs || 0) / 1000, text });
          }
        }
      } catch {
        // Fall through to XML
      }
    }

    // Try XML format
    if (segments.length === 0) {
      segments = parseTimedTextXml(captionText);
    }

    return { segments, metadata };
  } catch (err) {
    console.error("[InnerTube] Error:", err.message);
    return { segments: [], metadata: null };
  }
}

// ─── Strategy 2: youtube-transcript npm library ───────────────────────────────
async function fetchViaLibrary(videoId) {
  // Try multiple languages in priority order
  const langAttempts = ["en", "te", "hi", "mr", "ta", "ka", "ml", "bn", null];

  for (const lang of langAttempts) {
    try {
      const config = lang ? { lang } : {};
      const rawSegments = await YoutubeTranscript.fetchTranscript(videoId, config);
      if (rawSegments?.length > 0) {
        return rawSegments.map((s) => ({
          start: (s.offset ?? s.start ?? 0) / 1000,
          text: s.text,
        }));
      }
    } catch {
      // Try next language
    }
  }
  return [];
}

// ─── Strategy 3: HTML playerResponse scraping ─────────────────────────────────
async function fetchViaHtmlScraping(videoId, html) {
  if (!html) return [];

  const playerResponse =
    extractJsonFromHtml(html, "ytInitialPlayerResponse") ||
    extractJsonFromHtml(html, "var ytInitialPlayerResponse");

  const tracks =
    playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks) || tracks.length === 0) return [];

  const track = pickCaptionTrack(tracks);
  if (!track?.baseUrl) return [];

  let captionUrl = track.baseUrl.replace(/\\u0026/g, "&");
  if (!captionUrl.includes("fmt=")) {
    captionUrl += captionUrl.includes("?") ? "&fmt=3" : "?fmt=3";
  }

  try {
    const captionResp = await fetch(captionUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!captionResp.ok) return [];
    const captionText = await captionResp.text();
    if (!captionText.trim()) return [];

    // Try JSON format
    if (captionText.trim().startsWith("{")) {
      try {
        const json = JSON.parse(captionText);
        const segments = [];
        for (const event of json?.events || []) {
          const text = (event.segs || [])
            .map((s) => s.utf8 || "")
            .join("")
            .replace(/\n/g, " ")
            .trim();
          if (text && text !== "\n") {
            segments.push({ start: (event.tStartMs || 0) / 1000, text });
          }
        }
        return segments;
      } catch {
        return [];
      }
    }

    // Try XML format
    return parseTimedTextXml(captionText);
  } catch {
    return [];
  }
}

// ─── Metadata extraction from HTML ────────────────────────────────────────────
function extractMetadataFromHtml(html, videoId) {
  if (!html) {
    return {
      title: "Unknown Video",
      channel: "Unknown Channel",
      duration: null,
      viewCount: null,
      description: "",
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    };
  }

  // Title
  let title = "Unknown Video";
  const titlePatterns = [
    /"title"\s*:\s*\{"runs"\s*:\s*\[\{"text"\s*:\s*"([^"]+)"/,
    /"title"\s*:\s*"([^"]+)"/,
    /<title>([^<]*)<\/title>/,
  ];
  for (const pat of titlePatterns) {
    const m = html.match(pat);
    if (m?.[1]) {
      title = decodeHtmlEntities(m[1].replace(/ - YouTube$/, "").trim());
      break;
    }
  }

  // Channel
  let channel = "Unknown Channel";
  const channelPatterns = [
    /"ownerChannelName"\s*:\s*"([^"]+)"/,
    /"channelName"\s*:\s*"([^"]+)"/,
    /"author"\s*:\s*"([^"]+)"/,
    /"ownerText"\s*:\s*\{"runs"\s*:\s*\[\{"text"\s*:\s*"([^"]+)"/,
  ];
  for (const pat of channelPatterns) {
    const m = html.match(pat);
    if (m?.[1] && m[1] !== "null") {
      channel = decodeHtmlEntities(m[1]);
      break;
    }
  }

  // Duration
  let duration = null;
  const playerResponse = extractJsonFromHtml(html, "ytInitialPlayerResponse");
  if (playerResponse?.videoDetails?.lengthSeconds) {
    duration = parseInt(playerResponse.videoDetails.lengthSeconds, 10);
  }

  // View count
  let viewCount = null;
  const viewMatch = html.match(/"viewCount"\s*:\s*"(\d+)"/);
  if (viewMatch) viewCount = parseInt(viewMatch[1], 10);

  // Description
  let description = "";
  const descMatch = html.match(/"shortDescription"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
  if (descMatch) {
    description = decodeHtmlEntities(
      descMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\u0026/g, "&")
        .trim()
    );
  }

  return {
    title,
    channel,
    duration,
    viewCount,
    description,
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { v: videoId } = req.query;
  if (!videoId || typeof videoId !== "string" || videoId.length < 8) {
    return res.status(400).json({ error: "Valid video ID required (param: v)" });
  }

  try {
    // Fetch YouTube HTML page for metadata and HTML fallback
    let html = "";
    let htmlMetadata = null;

    try {
      const pageResp = await fetch(
        `https://www.youtube.com/watch?v=${videoId}&hl=en`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(15000),
        }
      );
      if (pageResp.ok) {
        html = await pageResp.text();
        htmlMetadata = extractMetadataFromHtml(html, videoId);
      }
    } catch (htmlErr) {
      console.warn("[YouTube] HTML fetch failed:", htmlErr.message);
    }

    // Strategy 1: InnerTube API (best for non-English)
    console.log("[YouTube] Trying InnerTube API...");
    const { segments: innerTubeSegments, metadata: innerTubeMetadata } =
      await fetchViaInnerTube(videoId);

    // Strategy 2: youtube-transcript library
    let librarySegments = [];
    if (innerTubeSegments.length === 0) {
      console.log("[YouTube] InnerTube empty, trying library...");
      librarySegments = await fetchViaLibrary(videoId);
    }

    // Strategy 3: HTML scraping
    let htmlSegments = [];
    if (innerTubeSegments.length === 0 && librarySegments.length === 0 && html) {
      console.log("[YouTube] Library empty, trying HTML scraping...");
      htmlSegments = await fetchViaHtmlScraping(videoId, html);
    }

    // Pick best segment source
    const rawSegments =
      innerTubeSegments.length > 0
        ? innerTubeSegments
        : librarySegments.length > 0
          ? librarySegments
          : htmlSegments;

    const segments = normalizeSegments(rawSegments);
    const hasTranscript = segments.length > 0;

    // Best metadata: InnerTube > HTML > minimal
    const meta = {
      title:
        (innerTubeMetadata?.title && innerTubeMetadata.title !== "Unknown Video"
          ? innerTubeMetadata.title
          : htmlMetadata?.title) || "Unknown Video",
      channel:
        (innerTubeMetadata?.channel &&
        innerTubeMetadata.channel !== "Unknown Channel"
          ? innerTubeMetadata.channel
          : htmlMetadata?.channel) || "Unknown Channel",
      duration: innerTubeMetadata?.duration ?? htmlMetadata?.duration ?? null,
      viewCount:
        innerTubeMetadata?.viewCount ?? htmlMetadata?.viewCount ?? null,
      description:
        innerTubeMetadata?.description || htmlMetadata?.description || "",
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    };

    // Build transcript string
    let transcript = "";
    let transcriptSource = "none";

    if (hasTranscript) {
      transcript = segments.map((s) => s.text).join(" ");
      transcriptSource = "captions";
    } else if (meta.description) {
      transcript = meta.description;
      transcriptSource = "description";
    }

    const transcriptStrategy =
      innerTubeSegments.length > 0
        ? "innertube"
        : librarySegments.length > 0
          ? "library"
          : htmlSegments.length > 0
            ? "html"
            : "none";

    console.log(
      `[YouTube] Done: "${meta.title}" | channel="${meta.channel}" | segments=${segments.length} | strategy=${transcriptStrategy}`
    );

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    return res.status(200).json({
      videoId,
      title: meta.title,
      channel: meta.channel,
      duration: meta.duration,
      thumbnail: meta.thumbnail,
      viewCount: meta.viewCount,
      description: meta.description,
      hasTranscript,
      transcriptSource,
      transcriptStrategy,
      segmentCount: segments.length,
      transcript,
      segments,
    });
  } catch (error) {
    console.error("[YouTube Transcript] Fatal error:", error);
    return res.status(200).json({
      videoId,
      title: "Video",
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
      error: "Could not fetch transcript. Please try again or watch the video directly.",
    });
  }
}
