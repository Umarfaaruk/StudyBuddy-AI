/**
 * YouTube Transcript API Proxy — v5
 * ===================================
 * Transcript fetcher ported from jdepoix/youtube-transcript-api (Python).
 *
 * Strategies (in order):
 *   1. InnerTube API (extracts API key from YouTube HTML, like the Python lib)
 *   2. Direct HTML playerResponse caption parsing (fallback)
 *   3. Video metadata fallback (title, channel, description)
 *
 * Endpoint: GET /api/youtube-transcript?v=<videoId>
 */

// ─── Constants (mirroring youtube-transcript-api _settings.py) ────────────────
const WATCH_URL = "https://www.youtube.com/watch?v={video_id}";
const INNERTUBE_API_URL =
  "https://www.youtube.com/youtubei/v1/player?key={api_key}";
const INNERTUBE_CONTEXT = {
  client: { clientName: "ANDROID", clientVersion: "20.10.38" },
};

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const INNERTUBE_USER_AGENT =
  "com.google.android.youtube/20.10.38 (Linux; U; Android 14)";

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
function selectCaptionTrack(captionTracks, preferredLangs = ["en"]) {
  if (!Array.isArray(captionTracks) || captionTracks.length === 0) return null;

  const manualTracks = {};
  const generatedTracks = {};

  for (const track of captionTracks) {
    const lang = (track.languageCode || "").toLowerCase();
    if (track.kind === "asr") {
      generatedTracks[lang] = track;
    } else {
      manualTracks[lang] = track;
    }
  }

  // 1. Try manual tracks in priority order
  for (const lang of preferredLangs) {
    if (manualTracks[lang]) return manualTracks[lang];
    for (const trackLang in manualTracks) {
      if (trackLang.startsWith(lang + "-")) {
        return manualTracks[trackLang];
      }
    }
  }

  // 2. Try generated tracks in priority order
  for (const lang of preferredLangs) {
    if (generatedTracks[lang]) return generatedTracks[lang];
    for (const trackLang in generatedTracks) {
      if (trackLang.startsWith(lang + "-")) {
        return generatedTracks[trackLang];
      }
    }
  }

  // 3. Fallback: Try any manual track
  const manualKeys = Object.keys(manualTracks);
  if (manualKeys.length > 0) {
    return manualTracks[manualKeys[0]];
  }

  // 4. Fallback: Try any generated track
  const generatedKeys = Object.keys(generatedTracks);
  if (generatedKeys.length > 0) {
    return generatedTracks[generatedKeys[0]];
  }

  return null;
}

// ─── Ported from youtube-transcript-api: InnerTube API key extraction ─────────
function extractInnertubeApiKey(html) {
  const match = html.match(/"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/);
  if (match && match[1]) return match[1];
  return null;
}

// ─── Ported from youtube-transcript-api: Consent cookie handling ──────────────
function needsConsentCookie(html) {
  return html.includes('action="https://consent.youtube.com/s"');
}

function extractConsentValue(html) {
  const match = html.match(/name="v" value="(.*?)"/);
  return match ? match[1] : null;
}

// ─── Ported from youtube-transcript-api: Playability status checks ────────────
function assertPlayability(playabilityStatus) {
  if (!playabilityStatus) return; // assume OK if missing

  const status = playabilityStatus.status;
  if (status === "OK" || status === undefined) return;

  const reason = playabilityStatus.reason || "";
  const reasonLower = reason.toLowerCase();

  if (status === "LOGIN_REQUIRED") {
    if (reasonLower.includes("bot") || reasonLower.includes("sign in")) {
      throw new Error("[RequestBlocked] YouTube is blocking requests from your IP.");
    }
    if (reasonLower.includes("inappropriate") || reasonLower.includes("age")) {
      throw new Error("[AgeRestricted] This video is age-restricted.");
    }
  }

  if (status === "ERROR" && reasonLower.includes("unavailable")) {
    throw new Error("[VideoUnavailable] This video is no longer available.");
  }

  if (status !== "OK") {
    const subreasons = (
      playabilityStatus.errorScreen?.playerErrorMessageRenderer?.subreason?.runs || []
    ).map((r) => r.text || "").join(" ");
    throw new Error(
      `[VideoUnplayable] ${reason}${subreasons ? ` — ${subreasons}` : ""}`
    );
  }
}

// ─── Strategy 1: InnerTube (ported from youtube-transcript-api) ───────────────
async function fetchViaInnerTube(videoId, html) {
  try {
    // Step 1: Extract InnerTube API key from the watch page HTML
    let apiKey = extractInnertubeApiKey(html || "");

    // If we couldn't extract from HTML, try fetching the page ourselves
    if (!apiKey && !html) {
      const pageResp = await fetch(
        WATCH_URL.replace("{video_id}", videoId),
        {
          headers: {
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept-Language": "en-US,en;q=0.9",
          },
          signal: AbortSignal.timeout(12000),
        }
      );
      if (pageResp.ok) {
        html = await pageResp.text();
        apiKey = extractInnertubeApiKey(html);
      }
    }

    if (!apiKey) {
      // Fallback: use default key (like the Python lib's INNERTUBE_CONTEXT uses)
      apiKey = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
    }

    // Step 2: Call the InnerTube player API
    const url = apiKey
      ? INNERTUBE_API_URL.replace("{api_key}", apiKey)
      : "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
    const resp = await fetch(url, {
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

    // Step 3: Check playability
    try {
      assertPlayability(data.playabilityStatus);
    } catch (err) {
      console.warn("[InnerTube] Playability issue:", err.message);
      // Still try to extract metadata even if playability fails
    }

    // Step 4: Extract metadata
    const videoDetails = data?.videoDetails || {};
    const metadata = {
      title: decodeHtmlEntities(videoDetails.title || ""),
      channel: decodeHtmlEntities(
        videoDetails.author || videoDetails.channelTitle || ""
      ),
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

    // Step 5: Extract caption tracks
    const captionsJson =
      data?.captions?.playerCaptionsTracklistRenderer;

    if (!captionsJson || !Array.isArray(captionsJson.captionTracks) || captionsJson.captionTracks.length === 0) {
      return { segments: [], metadata };
    }

    const captionTracks = captionsJson.captionTracks;

    // Use selectCaptionTrack to prioritize English, Telugu, Hindi, etc.
    const selectedTrack = selectCaptionTrack(captionTracks, ["en", "te", "hi", "mr", "ta", "ka", "ml", "bn"]);
    if (!selectedTrack?.baseUrl) return { segments: [], metadata };

    // Like the Python lib: strip &fmt=srv3 and fetch raw XML
    let captionUrl = selectedTrack.baseUrl
      .replace(/\\u0026/g, "&")
      .replace(/&fmt=srv3/g, "");

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

    // Try JSON format first (fmt=3 returns JSON)
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

    // Try XML format (default format from InnerTube)
    if (segments.length === 0) {
      segments = parseTimedTextXml(captionText);
    }

    return { segments, metadata };
  } catch (err) {
    console.error("[InnerTube] Error:", err.message);
    return { segments: [], metadata: null, error: err.message };
  }
}

// ─── Strategy 2: HTML playerResponse scraping (fallback) ──────────────────────
async function fetchViaHtmlScraping(videoId, html) {
  if (!html) return [];

  const playerResponse =
    extractJsonFromHtml(html, "ytInitialPlayerResponse") ||
    extractJsonFromHtml(html, "var ytInitialPlayerResponse");

  const tracks =
    playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks) || tracks.length === 0) return [];

  const track = selectCaptionTrack(tracks, ["en", "te", "hi", "mr", "ta", "ka", "ml", "bn"]);
  if (!track?.baseUrl) return [];

  let captionUrl = track.baseUrl.replace(/\\u0026/g, "&");
  // Don't add fmt=3 here — let it return default XML
  if (captionUrl.includes("&fmt=srv3")) {
    captionUrl = captionUrl.replace(/&fmt=srv3/g, "");
  }

  try {
    const captionResp = await fetch(captionUrl, {
      headers: {
        "User-Agent": INNERTUBE_USER_AGENT,
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
    // Step 1: Fetch YouTube HTML page (like the Python lib does first)
    let html = "";
    let htmlMetadata = null;

    try {
      const pageResp = await fetch(
        WATCH_URL.replace("{video_id}", videoId) + "&hl=en",
        {
          headers: {
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept-Language": "en-US,en;q=0.9",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(15000),
        }
      );
      if (pageResp.ok) {
        html = await pageResp.text();

        // Handle consent cookie flow (ported from Python lib)
        if (needsConsentCookie(html)) {
          console.log("[YouTube] Consent page detected, attempting to bypass...");
          const consentValue = extractConsentValue(html);
          if (consentValue) {
            // Re-fetch with consent cookie
            const retryResp = await fetch(
              WATCH_URL.replace("{video_id}", videoId) + "&hl=en",
              {
                headers: {
                  "User-Agent": DEFAULT_USER_AGENT,
                  "Accept-Language": "en-US,en;q=0.9",
                  Cookie: `CONSENT=YES+${consentValue}`,
                },
                signal: AbortSignal.timeout(15000),
              }
            );
            if (retryResp.ok) {
              html = await retryResp.text();
            }
          }
        }

        htmlMetadata = extractMetadataFromHtml(html, videoId);
      }
    } catch (htmlErr) {
      console.warn("[YouTube] HTML fetch failed:", htmlErr.message);
    }

    // Strategy 1: InnerTube API (ported from youtube-transcript-api Python lib)
    console.log("[YouTube] Trying InnerTube API (youtube-transcript-api approach)...");
    const { segments: innerTubeSegments, metadata: innerTubeMetadata, error: innerTubeError } =
      await fetchViaInnerTube(videoId, html);

    // Strategy 2: HTML scraping fallback
    let htmlSegments = [];
    let htmlError = null;
    if (innerTubeSegments.length === 0 && html) {
      console.log("[YouTube] InnerTube empty, trying HTML scraping...");
      try {
        htmlSegments = await fetchViaHtmlScraping(videoId, html);
      } catch (err) {
        htmlError = err.message;
      }
    }

    // Pick best segment source
    const rawSegments =
      innerTubeSegments.length > 0 ? innerTubeSegments : htmlSegments;

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
      error: hasTranscript ? undefined : (innerTubeError || htmlError || "No captions found for this video.")
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
      error:
        "Could not fetch transcript. Please try again or watch the video directly.",
    });
  }
}
