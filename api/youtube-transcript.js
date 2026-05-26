/**
 * YouTube Transcript API Proxy
 * ============================
 * Fetches YouTube video captions/transcript by scraping the YouTube page
 * for caption track URLs and downloading the XML/JSON transcript.
 * 
 * Endpoint: /api/youtube-transcript?v=<videoId>
 */

import { YoutubeTranscript } from "youtube-transcript";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { v: videoId } = req.query;

  if (!videoId || typeof videoId !== "string" || videoId.length < 8) {
    return res.status(400).json({ error: "Valid video ID required (param: v)" });
  }

  try {
    // Step 1: Fetch the YouTube video page to extract caption track info
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageResp = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!pageResp.ok) {
      throw new Error(`YouTube page returned ${pageResp.status}`);
    }

    const html = await pageResp.text();

    // Extract video title
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    const rawTitle = titleMatch ? titleMatch[1].replace(/ - YouTube$/, "").trim() : "Unknown Video";

    // Step 2 & 3: Find and fetch captions using the robust youtube-transcript library
    let transcript = "";
    let segments = [];

    try {
      // First try fetching English captions
      console.log(`[YouTube Transcript API] Fetching English transcript for: ${videoId}`);
      const rawSegments = await YoutubeTranscript.fetchTranscript(videoId, { lang: "en" });
      segments = rawSegments.map(s => ({
        start: s.offset / 1000,
        text: s.text,
      }));
      transcript = segments.map(s => s.text).join(" ");
    } catch (e) {
      console.warn(`[YouTube Transcript API] Failed to fetch English transcript for ${videoId}, trying default language...`);
      try {
        // Fallback: Fetch first available captions track
        const rawSegments = await YoutubeTranscript.fetchTranscript(videoId);
        segments = rawSegments.map(s => ({
          start: s.offset / 1000,
          text: s.text,
        }));
        transcript = segments.map(s => s.text).join(" ");
      } catch (err2) {
        console.error(`[YouTube Transcript API] Failed to fetch any transcript for ${videoId}:`, err2);
      }
    }

    // Step 4: If no captions found, extract description as fallback
    if (!transcript) {
      const descMatch = html.match(/"shortDescription"\s*:\s*"([^"]*)"/);
      if (descMatch) {
        transcript = descMatch[1]
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .replace(/\\u0026/g, "&")
          .trim();
      }
    }

    // Extract channel name
    const channelMatch = html.match(/"ownerChannelName"\s*:\s*"([^"]*)"/);
    const channel = channelMatch ? channelMatch[1] : "Unknown Channel";

    const result = {
      videoId,
      title: rawTitle,
      channel,
      hasTranscript: segments.length > 0,
      segmentCount: segments.length,
      transcript: transcript, // Full transcript — no truncation
      segments: segments, // All segments
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
      segmentCount: 0,
      transcript: "",
      segments: [],
      error: "Could not fetch transcript. The video may not have captions enabled.",
    });
  }
}

/**
 * Extracts a JSON object from HTML page source by looking for a marker
 * and matching braces to prevent regex backtracking errors.
 */
function extractJsonFromHtml(html, marker) {
  const index = html.indexOf(marker);
  if (index === -1) return null;
  
  // Find the start of the JSON object
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
    
    if (char === '\\') {
      escape = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          const jsonStr = html.substring(startIndex, i + 1);
          try {
            return JSON.parse(jsonStr);
          } catch (e) {
            return null;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Robust regex-based fallback to extract timedtext url if ytInitialPlayerResponse fails
 */
function extractCaptionUrlFallback(html) {
  const match = html.match(/https?:\\\/\\\/[a-z0-9_.-]*youtube\.com\\\/api\\\/timedtext[^"\s']+/i);
  if (match) {
    let url = match[0].replace(/\\\//g, "/").replace(/\\u0026/g, "&");
    url = url.replace(/\\"/g, "").replace(/\\/g, "");
    return url;
  }
  return null;
}

/**
 * Decode XML entities like &amp; &#39; etc.
 */
function decodeXMLEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
}
