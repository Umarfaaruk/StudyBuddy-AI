/**
 * YouTube Transcript API Proxy
 * ============================
 * Fetches YouTube video captions/transcript by scraping the YouTube page
 * for caption track URLs and downloading the XML/JSON transcript.
 * 
 * Endpoint: /api/youtube-transcript?v=<videoId>
 */

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

    // Step 2: Find captions/transcript URL from the page source
    let captionUrl = null;
    const playerResponse = extractJsonFromHtml(html, "ytInitialPlayerResponse");
    
    if (playerResponse && playerResponse.captions && playerResponse.captions.playerCaptionsTracklistRenderer) {
      const tracks = playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        // Prefer English, or first available track
        const englishTrack = tracks.find(t => t.languageCode === "en" || t.languageCode?.startsWith("en"));
        const chosenTrack = englishTrack || tracks[0];
        if (chosenTrack && chosenTrack.baseUrl) {
          captionUrl = chosenTrack.baseUrl;
        }
      }
    }

    if (!captionUrl) {
      captionUrl = extractCaptionUrlFallback(html);
    }

    let transcript = "";
    let segments = [];

    if (captionUrl) {
      // Step 3: Fetch the actual transcript XML or JSON
      const captionResp = await fetch(captionUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (captionResp.ok) {
        const rawContent = await captionResp.text();
        const trimmed = rawContent.trim();

        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          // JSON (fmt=json3 format)
          try {
            const data = JSON.parse(trimmed);
            if (data.events && Array.isArray(data.events)) {
              segments = data.events
                .filter(ev => ev.segs && Array.isArray(ev.segs))
                .map(ev => {
                  const text = ev.segs.map(s => s.utf8).join(" ").trim();
                  return {
                    start: (ev.tStartMs || 0) / 1000,
                    text: text
                  };
                })
                .filter(s => s.text.length > 0);
              transcript = segments.map(s => s.text).join(" ");
            }
          } catch (e) {
            console.error("[YouTube Transcript] Failed to parse JSON captions:", e);
          }
        } else {
          // XML format
          const textMatches = [...trimmed.matchAll(/<text\s+start="([^"]*)"[^>]*>([^<]*)<\/text>/g)];
          segments = textMatches.map(m => ({
            start: parseFloat(m[1]),
            text: decodeXMLEntities(m[2]).trim(),
          })).filter(s => s.text.length > 0);

          transcript = segments.map(s => s.text).join(" ");
        }
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
      transcript: transcript.substring(0, 30000), // Cap at 30K chars
      segments: segments.slice(0, 500), // Cap segments for response size
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
