/**
 * YouTube Transcript API Proxy
 * ============================
 * Fetches YouTube video captions/transcript using multiple strategies.
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
      if (char === "{") {
        braceCount++;
      } else if (char === "}") {
        braceCount--;
        if (braceCount === 0) {
          const jsonStr = html.substring(startIndex, i + 1);
          try {
            return JSON.parse(jsonStr);
          } catch {
            return null;
          }
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

function parseTimedTextXml(xml) {
  const segments = [];
  const regex = /<text start="([^"]+)"[^>]*>([^<]*)<\/text>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const text = decodeXMLEntities(match[2].trim());
    if (text) {
      segments.push({
        start: parseFloat(match[1]),
        text,
      });
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
    if (track.kind !== "asr") score += 5;
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

  const captionResp = await fetch(captionUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(10000),
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
        if (text) {
          segments.push({
            start: (event.tStartMs || 0) / 1000,
            text,
          });
        }
      }
      return segments.length > 0 ? segments : null;
    } catch {
      return null;
    }
  }

  const segments = parseTimedTextXml(captionText);
  return segments.length > 0 ? segments : null;
}

async function fetchTranscriptSegments(videoId, html) {
  const strategies = [
    () => YoutubeTranscript.fetchTranscript(videoId, { lang: "en" }),
    () => YoutubeTranscript.fetchTranscript(videoId),
  ];

  for (const strategy of strategies) {
    try {
      const rawSegments = await strategy();
      if (rawSegments?.length > 0) {
        return rawSegments.map((s) => ({
          start: s.offset / 1000,
          text: s.text,
        }));
      }
    } catch {
      // Try next strategy
    }
  }

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
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageResp = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!pageResp.ok) {
      throw new Error(`YouTube page returned ${pageResp.status}`);
    }

    const html = await pageResp.text();

    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    const rawTitle = titleMatch
      ? decodeHtmlEntities(titleMatch[1].replace(/ - YouTube$/, "").trim())
      : "Unknown Video";

    const segments = await fetchTranscriptSegments(videoId, html);
    let transcript = segments.map((s) => s.text).join(" ");
    let transcriptSource = segments.length > 0 ? "captions" : "none";

    if (!transcript) {
      const descMatch = html.match(/"shortDescription"\s*:\s*"([^"]*)"/);
      if (descMatch) {
        transcript = decodeHtmlEntities(
          descMatch[1]
            .replace(/\\n/g, "\n")
            .replace(/\\"/g, '"')
            .replace(/\\u0026/g, "&")
            .trim()
        );
        transcriptSource = transcript ? "description" : "none";
      }
    }

    const channelMatch = html.match(/"ownerChannelName"\s*:\s*"([^"]*)"/);
    const channel = channelMatch ? decodeHtmlEntities(channelMatch[1]) : "Unknown Channel";

    const result = {
      videoId,
      title: rawTitle,
      channel,
      hasTranscript: segments.length > 0,
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
      hasTranscript: false,
      transcriptSource: "none",
      segmentCount: 0,
      transcript: "",
      segments: [],
      error: "Could not fetch transcript. The video may not have captions enabled.",
    });
  }
}
