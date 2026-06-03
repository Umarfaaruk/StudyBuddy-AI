/**
 * YouTube Transcript API Proxy — Enhanced
 * ========================================
 * Fetches YouTube video captions/transcript using multiple strategies.
 * Fixed: better HTML parsing, improved caption track selection, robust fallbacks.
 *
 * Endpoint: /api/youtube-transcript?v=<videoId>
 */

import { YoutubeTranscript } from "youtube-transcript";

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

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
    if (escape) { escape = false; continue; }
    if (char === "\\") { escape = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (!inString) {
      if (char === "{") braceCount++;
      else if (char === "}") {
        braceCount--;
        if (braceCount === 0) {
          try { return JSON.parse(html.substring(startIndex, i + 1)); }
          catch { return null; }
        }
      }
    }
  }
  return null;
}

function decodeXMLEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

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
    const text = cleanCaptionText(seg.text);
    if (!text) continue;
    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.text === text) continue;
    cleaned.push({ start: Number(seg.start) || 0, text });
  }
  return cleaned;
}

function parseTimedTextXml(xml) {
  const segments = [];
  const regex = /<text start="([^"]+)"[^>]*>([^<]*(?:<[^/][^>]*>[^<]*<\/[^>]+>[^<]*)*)<\/text>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const rawText = match[2].replace(/<[^>]+>/g, " ");
    const text = decodeXMLEntities(rawText.trim());
    if (text) {
      segments.push({ start: parseFloat(match[1]), text });
    }
  }
  return segments;
}

function pickCaptionTrack(tracks) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null;
  const scoreTrack = (track) => {
    const lang = (track.languageCode || "").toLowerCase();
    let score = 0;
    if (lang === "en") score += 10;
    else if (lang.startsWith("en")) score += 8;
    if (track.kind !== "asr") score += 5; // Manual captions preferred
    if (track.vssId?.startsWith(".en")) score += 3;
    return score;
  };
  return [...tracks].sort((a, b) => scoreTrack(b) - scoreTrack(a))[0];
}

async function fetchCaptionsFromPlayerResponse(html) {
  const playerResponse =
    extractJsonFromHtml(html, "ytInitialPlayerResponse") ||
    extractJsonFromHtml(html, "var ytInitialPlayerResponse");

  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  const track = pickCaptionTrack(tracks);
  if (!track?.baseUrl) return null;

  let captionUrl = track.baseUrl.replace(/\\u0026/g, "&");
  if (!captionUrl.includes("fmt=")) {
    captionUrl += captionUrl.includes("?") ? "&fmt=3" : "?fmt=3";
  }

  try {
    const captionResp = await fetch(captionUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!captionResp.ok) return null;
    const captionText = await captionResp.text();
    if (!captionText.trim()) return null;

    if (captionText.trim().startsWith("{")) {
      try {
        const json = JSON.parse(captionText);
        const events = json?.events || [];
        const segments = [];
        for (const event of events) {
          const text = (event.segs || [])
            .map((seg) => seg.utf8 || "")
            .join("")
            .replace(/\n/g, " ")
            .trim();
          if (text && text !== "\n") {
            segments.push({ start: (event.tStartMs || 0) / 1000, text });
          }
        }
        return segments.length > 0 ? segments : null;
      } catch {
        return null;
      }
    }

    const segments = parseTimedTextXml(captionText);
    return segments.length > 0 ? segments : null;
  } catch {
    return null;
  }
}

/** Extract video metadata (title, channel, duration, thumbnail, description) */
function extractVideoMetadata(html, videoId) {
  // Title
  const titleMatch =
    html.match(/"title"\s*:\s*\{"runs"\s*:\s*\[\{"text"\s*:\s*"([^"]+)"/) ||
    html.match(/<title>([^<]*)<\/title>/);
  const rawTitle = titleMatch
    ? decodeHtmlEntities(titleMatch[1].replace(/ - YouTube$/, "").trim())
    : "Unknown Video";

  // Channel
  const channelMatch =
    html.match(/"ownerChannelName"\s*:\s*"([^"]*)"/) ||
    html.match(/"author"\s*:\s*"([^"]*)"/);
  const channel = channelMatch ? decodeHtmlEntities(channelMatch[1]) : "Unknown Channel";

  // Duration (from playerResponse)
  let duration = null;
  const playerResponse = extractJsonFromHtml(html, "ytInitialPlayerResponse");
  if (playerResponse) {
    duration =
      playerResponse?.videoDetails?.lengthSeconds ||
      playerResponse?.microformat?.playerMicroformatRenderer?.lengthSeconds ||
      null;
  }

  // Description
  const descMatch =
    html.match(/"shortDescription"\s*:\s*"((?:[^"\\]|\\.)*)"/s) ||
    html.match(/"description"\s*:\s*"([^"]*)"/);
  const description = descMatch
    ? decodeHtmlEntities(
        descMatch[1]
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .replace(/\\u0026/g, "&")
          .trim()
      )
    : "";

  // View count
  const viewMatch = html.match(/"viewCount"\s*:\s*"(\d+)"/);
  const viewCount = viewMatch ? parseInt(viewMatch[1], 10) : null;

  // Thumbnail (best quality available)
  const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  return { title: rawTitle, channel, duration, description, viewCount, thumbnail };
}

async function fetchTranscriptSegments(videoId, html) {
  // Strategy 1: youtube-transcript library (English first)
  try {
    const rawSegments = await YoutubeTranscript.fetchTranscript(videoId, { lang: "en" });
    if (rawSegments?.length > 0) {
      return rawSegments.map((s) => ({
        start: (s.offset ?? s.start ?? 0) / 1000,
        text: s.text,
      }));
    }
  } catch { /* fall through */ }

  // Strategy 2: youtube-transcript library (any language)
  try {
    const rawSegments = await YoutubeTranscript.fetchTranscript(videoId);
    if (rawSegments?.length > 0) {
      return rawSegments.map((s) => ({
        start: (s.offset ?? s.start ?? 0) / 1000,
        text: s.text,
      }));
    }
  } catch { /* fall through */ }

  // Strategy 3: Direct YouTube player response parsing
  const playerSegments = await fetchCaptionsFromPlayerResponse(html);
  if (playerSegments?.length > 0) {
    return playerSegments;
  }

  return [];
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { v: videoId } = req.query;

  if (!videoId || typeof videoId !== "string" || videoId.length < 8) {
    return res.status(400).json({ error: "Valid video ID required (param: v)" });
  }

  try {
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
    const pageResp = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!pageResp.ok) {
      throw new Error(`YouTube page returned ${pageResp.status}`);
    }

    const html = await pageResp.text();

    // Extract rich metadata
    const metadata = extractVideoMetadata(html, videoId);

    // Fetch transcript
    const rawSegments = await fetchTranscriptSegments(videoId, html);
    const segments = normalizeSegments(rawSegments);
    const hasTranscript = segments.length > 0;

    let transcript = "";
    let transcriptSource = "none";

    if (hasTranscript) {
      transcript = segments.map((s) => s.text).join(" ");
      transcriptSource = "captions";
    } else {
      // Fallback to description
      if (metadata.description) {
        transcript = metadata.description;
        transcriptSource = "description";
      }
    }

    const result = {
      videoId,
      title: metadata.title,
      channel: metadata.channel,
      duration: metadata.duration ? parseInt(metadata.duration, 10) : null,
      thumbnail: metadata.thumbnail,
      viewCount: metadata.viewCount,
      description: metadata.description,
      hasTranscript,
      transcriptSource,
      segmentCount: segments.length,
      transcript,
      segments,
    };

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    return res.status(200).json(result);
  } catch (error) {
    console.error("[YouTube Transcript] Error:", error);
    return res.status(200).json({
      videoId,
      title: "Video",
      channel: "",
      duration: null,
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      viewCount: null,
      description: "",
      hasTranscript: false,
      transcriptSource: "none",
      segmentCount: 0,
      transcript: "",
      segments: [],
      error: "Could not fetch transcript. The video may not have captions enabled.",
    });
  }
}
