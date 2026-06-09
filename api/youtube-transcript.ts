/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * YouTube Transcript API Endpoint
 * ==================================================
 * Uses YouTube Data API v3 to fetch video transcripts and metadata.
 * 
 * Requires: YOUTUBE_API_KEY environment variable
 * 
 * Returns:
 * {
 *   videoId: string,
 *   title: string,
 *   channel: string,
 *   thumbnail: string,
 *   duration: number | null,
 *   viewCount: number | null,
 *   hasTranscript: boolean,
 *   transcript: string,
 *   segments: Array<{start: number, text: string}>,
 *   transcriptSource: string,
 *   error: string | null
 * }
 */

interface Segment {
  start: number;
  text: string;
}

interface VideoMetadata {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number | null;
  viewCount: number | null;
}

interface TranscriptResponse {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number | null;
  viewCount: number | null;
  hasTranscript: boolean;
  transcript: string;
  segments: Segment[];
  transcriptSource: string;
  error: string | null;
}

function getApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "Server is missing YOUTUBE_API_KEY. Set it in Vercel env vars or .env.local."
    );
  }
  return key;
}

/**
 * Fetch basic metadata from public oEmbed (very high rate limits, never blocked)
 */
async function fetchOEmbedMetadata(videoId: string): Promise<VideoMetadata | null> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data: any = await resp.json();
      return {
        videoId,
        title: data.title || "YouTube Video",
        channel: data.author_name || "Unknown Channel",
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration: null,
        viewCount: null,
      };
    }
  } catch (err) {
    console.warn("[YouTube API] Failed to fetch oEmbed metadata fallback:", err);
  }
  return null;
}

/**
 * Fetch video metadata (title, channel, duration, view count, thumbnail)
 */
async function fetchVideoMetadata(
  videoId: string,
  apiKey: string
): Promise<VideoMetadata | null> {
  // If it's a Supadata key, skip the official Google API (it will fail)
  if (apiKey.startsWith("AQ.")) {
    return null;
  }
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,contentDetails,statistics");
    url.searchParams.set("id", videoId);
    url.searchParams.set("key", apiKey);

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || `HTTP ${response.status}`;
      
      if (response.status === 400) {
        console.warn(`[YouTube API] Invalid video ID: ${videoId}`);
        throw new Error(`Invalid video ID format: ${videoId}`);
      }
      if (response.status === 403) {
        console.warn("[YouTube API] Invalid or expired API key");
        throw new Error("YouTube API key is invalid or has expired");
      }
      if (response.status === 404) {
        console.warn(`[YouTube API] Video not found: ${videoId}`);
        return null;
      }
      
      console.warn(`[YouTube API] Metadata fetch failed: ${errorMsg}`);
      throw new Error(`Failed to fetch metadata: ${errorMsg}`);
    }

    const data: any = await response.json();
    
    if (!data.items || data.items.length === 0) {
      console.warn(`[YouTube API] Video not found or private: ${videoId}`);
      return null;
    }
    
    const video = data.items[0];
    const snippet = video.snippet || {};
    const details = video.contentDetails || {};
    const stats = video.statistics || {};

    // Parse ISO 8601 duration (PT15M33S) to seconds
    const duration = parseDuration(details.duration);

    return {
      videoId,
      title: snippet.title || "YouTube Video",
      channel: snippet.channelTitle || "Unknown Channel",
      thumbnail: snippet.thumbnails?.maxres?.url ||
        snippet.thumbnails?.high?.url ||
        `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      duration,
      viewCount: parseInt(stats.viewCount || "0", 10) || null,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[YouTube API] Metadata fetch error:", errorMsg);
    throw err; // Re-throw to let handler catch it
  }
}

/**
 * Parse ISO 8601 duration string to seconds
 * Example: PT1H30M45S -> 5445 seconds
 */
function parseDuration(iso8601: string): number | null {
  if (!iso8601) return null;
  const match = iso8601.match(
    /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/
  );
  if (!match) return null;

  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Parse caption track XML format
 */
function parseXmlCaptions(xml: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /<text start="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let match;

  while ((match = regex.exec(xml)) !== null) {
    const rawText = match[2];
    const strippedText = rawText
      .replace(/<[^>]*>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'");

    const text = strippedText.replace(/\s+/g, " ").trim();
    if (text) {
      segments.push({
        start: parseFloat(match[1]) || 0,
        text,
      });
    }
  }

  return segments;
}

/**
 * Parse caption track JSON format
 */
function parseJsonCaptions(raw: string): Segment[] {
  try {
    const data = JSON.parse(raw);
    const segments: Segment[] = [];
    const events = Array.isArray(data.events) ? data.events : [];

    for (const event of events) {
      if (!Array.isArray(event.segs)) continue;

      const text = event.segs
        .map((seg: any) => seg?.utf8 || "")
        .join("")
        .replace(/\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!text) continue;

      const startMs = typeof event.tStartMs === "number"
        ? event.tStartMs
        : parseInt(event.tStartMs || "0", 10);

      segments.push({
        start: Number.isFinite(startMs) ? startMs / 1000 : 0,
        text,
      });
    }

    return segments;
  } catch {
    return [];
  }
}

/**
 * Try to fetch transcripts using timedtext endpoint (more reliable than captions API)
 */
async function fetchTranscriptViaTimedtext(
  videoId: string
): Promise<{ transcript: string; segments: Segment[] } | null> {
  try {
    // YouTube's timedtext endpoint - used by embedded players
    // Priority: English variants first, then auto-generated, then any language
    const languages = [
      "en", "en-US", "en-GB", // English variants
      "en-US-asr", "en-GB-asr", // Auto-generated English
      "a.en", // Alternative English
    ];

    for (const lang of languages) {
      try {
        const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`;
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          signal: AbortSignal.timeout(8000),
        });

        if (response.ok) {
          const content = await response.text();
          if (content.trim()) {
            const segments = parseJsonCaptions(content);
            if (segments.length > 0) {
              const transcript = segments.map((seg) => seg.text).join(" ");
              return { transcript, segments };
            }
          }
        }
      } catch (err) {
        console.warn(`[YouTube API] Timedtext fetch failed for lang ${lang}`);
      }
    }

    return null;
  } catch (err) {
    console.warn(
      "[YouTube API] Timedtext endpoint error:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Fetch transcripts using YouTube Data API captions.list
 * Note: This requires OAuth for downloads; used primarily to check availability
 */
async function fetchTranscript(
  videoId: string,
  apiKey: string
): Promise<{ transcript: string; segments: Segment[] } | null> {
  try {
    // First, try the more reliable timedtext endpoint (no auth needed)
    const timedtextResult = await fetchTranscriptViaTimedtext(videoId);
    if (timedtextResult) {
      return timedtextResult;
    }

    // If it's a Supadata key, call Supadata API
    if (apiKey.startsWith("AQ.")) {
      console.log(`[YouTube API] Fetching transcript via Supadata API fallback...`);
      const response = await fetch(
        `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&text=true`,
        {
          headers: {
            "x-api-key": apiKey,
          },
          signal: AbortSignal.timeout(15000),
        }
      );

      if (response.ok) {
        const data: any = await response.json();
        const transcript = data.content || "";
        if (transcript.length > 50) {
          return {
            transcript,
            segments: [{ start: 0, text: transcript }],
          };
        }
      } else {
        console.warn(`[YouTube API] Supadata API HTTP error: ${response.status}`);
      }
      return null;
    }

    // Fallback to YouTube Data API (may have limited access without OAuth)
    const url = new URL("https://www.googleapis.com/youtube/v3/captions");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("videoId", videoId);
    url.searchParams.set("key", apiKey);

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(
        `[YouTube API] Captions list failed (HTTP ${response.status})`
      );
      return null;
    }

    const data: any = await response.json();
    const captions = data.items || [];

    if (captions.length === 0) {
      console.log("[YouTube API] No captions available for this video");
      return null;
    }

    console.log(
      `[YouTube API] Found ${captions.length} caption tracks, but captions.download requires OAuth`
    );
    return null;
  } catch (err) {
    console.warn(
      "[YouTube API] Transcript fetch error:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { v: videoId } = req.query;

  // Validate video ID
  if (!videoId || typeof videoId !== "string" || videoId.length < 8) {
    return res.status(400).json({
      error: "Valid YouTube video ID required",
      example: "?v=dQw4w9WgXcQ",
    });
  }

  try {
    let apiKey: string;
    try {
      apiKey = getApiKey();
    } catch (err) {
      console.error("[YouTube API] Configuration error:", err instanceof Error ? err.message : String(err));
      return res.status(200).json({
        videoId,
        title: "Configuration Error",
        channel: "System",
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration: null,
        viewCount: null,
        hasTranscript: false,
        transcript: "",
        segments: [],
        transcriptSource: "none",
        error: "Server is not configured. Please set YOUTUBE_API_KEY environment variable.",
      } as TranscriptResponse);
    }

    // Fetch metadata (title, channel, duration, etc.)
    let metadata: VideoMetadata | null = null;
    let metadataError: string | null = null;
    try {
      metadata = await fetchVideoMetadata(videoId, apiKey);
    } catch (err) {
      metadataError = err instanceof Error ? err.message : String(err);
      console.warn("[YouTube API] Primary metadata fetch failed, trying oEmbed fallback:", metadataError);
    }

    if (!metadata) {
      metadata = await fetchOEmbedMetadata(videoId);
    }

    if (!metadata) {
      return res.status(200).json({
        videoId,
        title: "Video Not Found",
        channel: "Unknown Channel",
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration: null,
        viewCount: null,
        hasTranscript: false,
        transcript: "",
        segments: [],
        transcriptSource: "none",
        error: metadataError || "Video not found or is private. Please check the video ID.",
      } as TranscriptResponse);
    }

    // Attempt to fetch transcript
    const transcriptData = await fetchTranscript(videoId, apiKey);

    if (!transcriptData) {
      // No transcript available - return metadata only with 200 status
      return res.status(200).json({
        ...metadata,
        hasTranscript: false,
        transcript: "",
        segments: [],
        transcriptSource: "none",
        error: "No captions available for this video",
      } as TranscriptResponse);
    }

    // Success: return full data with transcript
    return res.status(200).json({
      ...metadata,
      hasTranscript: true,
      transcript: transcriptData.transcript,
      segments: transcriptData.segments,
      transcriptSource: "youtube_api",
      error: null,
    } as TranscriptResponse);
  } catch (err) {
    console.error("[YouTube API] Unexpected error:", err);

    // Return error response with 200 status
    return res.status(200).json({
      videoId,
      title: "Error",
      channel: "Unknown",
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      duration: null,
      viewCount: null,
      hasTranscript: false,
      transcript: "",
      segments: [],
      transcriptSource: "none",
      error: err instanceof Error ? err.message : "Internal server error",
    } as TranscriptResponse);
  }
}
