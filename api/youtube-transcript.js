/**
 * YouTube Transcript API Proxy
 * ============================
 * Fetches YouTube video captions/transcript by scraping the YouTube page
 * for caption track URLs and downloading the XML transcript.
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
    // YouTube embeds caption info in the page as JSON
    const captionMatch = html.match(/"captions":\s*(\{[^}]*"playerCaptionsTracklistRenderer"[^}]*\})/s);
    let captionUrl = null;

    if (captionMatch) {
      // Try to find a caption track URL
      const urlMatch = html.match(/"baseUrl"\s*:\s*"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]*)"/);
      if (urlMatch) {
        captionUrl = urlMatch[1].replace(/\\u0026/g, "&");
      }
    }

    // Alternate method: look for timedtext URL directly
    if (!captionUrl) {
      const altMatch = html.match(/https:\/\/www\.youtube\.com\/api\/timedtext[^"\\]*/);
      if (altMatch) {
        captionUrl = altMatch[0].replace(/\\u0026/g, "&");
      }
    }

    let transcript = "";
    let segments = [];

    if (captionUrl) {
      // Step 3: Fetch the actual transcript XML
      const captionResp = await fetch(captionUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (captionResp.ok) {
        const xml = await captionResp.text();

        // Parse XML transcript: <text start="0.0" dur="2.5">Hello world</text>
        const textMatches = [...xml.matchAll(/<text\s+start="([^"]*)"[^>]*>([^<]*)<\/text>/g)];
        segments = textMatches.map(m => ({
          start: parseFloat(m[1]),
          text: decodeXMLEntities(m[2]).trim(),
        })).filter(s => s.text.length > 0);

        transcript = segments.map(s => s.text).join(" ");
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
