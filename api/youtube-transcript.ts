import { YoutubeTranscript } from "youtube-transcript";
import { requireAuth } from "./_firebaseAdmin";


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
  if (apiKey.startsWith("sd_")) {
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
      const errorData: any = await response.json().catch(() => ({}));
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
 * Try to fetch transcripts using the youtube-transcript community package
 */
async function fetchTranscriptViaTimedtext(
  videoId: string
): Promise<{ transcript: string; segments: Segment[] } | null> {
  try {
    console.log(`[YouTube API] Fetching transcript via youtube-transcript package for videoId: ${videoId}`);
    const result = await YoutubeTranscript.fetchTranscript(videoId);
    if (Array.isArray(result) && result.length > 0) {
      const segments = result.map((item: any) => ({
        start: (item.offset || 0) / 1000,
        text: item.text || "",
      }));
      const transcript = segments.map((seg) => seg.text).join(" ");
      return { transcript, segments };
    }
  } catch (err: any) {
    console.warn(
      "[YouTube API] youtube-transcript package failed:",
      err instanceof Error ? err.message : String(err)
    );
  }
  return null;
}

/**
 * Resolve a Supadata API key, if one is configured.
 * Prefers the dedicated SUPADATA_API_KEY; for backward compatibility also
 * accepts a Supadata key ("sd_…") accidentally placed in YOUTUBE_API_KEY.
 */
function getSupadataKey(): string | null {
  const dedicated = process.env.SUPADATA_API_KEY?.trim();
  if (dedicated) return dedicated;
  const yt = process.env.YOUTUBE_API_KEY?.trim();
  if (yt && yt.startsWith("sd_")) return yt;
  return null;
}

/**
 * Fetch a transcript from Supadata — a hosted captions API that is NOT blocked
 * by YouTube's anti-scraping checks, so it works reliably from Vercel's shared
 * serverless IPs (unlike the youtube-transcript scraping package).
 */
async function fetchTranscriptViaSupadata(
  videoId: string,
  apiKey: string
): Promise<{ transcript: string; segments: Segment[] } | null> {
  try {
    console.log(`[YouTube API] Fetching transcript via Supadata API...`);
    const response = await fetch(
      `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}`,
      {
        headers: { "x-api-key": apiKey },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      console.warn(`[YouTube API] Supadata API HTTP error: ${response.status}`);
      return null;
    }

    const data: any = await response.json();
    let transcript = "";
    const segments: Segment[] = [];

    if (Array.isArray(data.content)) {
      for (const item of data.content) {
        segments.push({ start: (item.offset || 0) / 1000, text: item.text || "" });
      }
      transcript = segments.map((s) => s.text).join(" ");
    } else if (typeof data.content === "string") {
      transcript = data.content;
      segments.push({ start: 0, text: transcript });
    }

    return transcript.length > 50 ? { transcript, segments } : null;
  } catch (err) {
    console.warn(
      "[YouTube API] Supadata fetch error:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Fetch a transcript, preferring the most reliable source available.
 *
 * Order matters in serverless: YouTube blocks the scraping package from Vercel's
 * shared IPs (403/429), so when a Supadata key is configured we try that FIRST
 * and only fall back to the free scraper. With no provider key, we degrade to
 * the scraper (works locally / on un-flagged IPs) plus a captions availability
 * check via the YouTube Data API.
 */
async function fetchTranscript(
  videoId: string,
  apiKey: string
): Promise<{ transcript: string; segments: Segment[] } | null> {
  try {
    // 1) Reliable hosted provider first (if configured).
    const supadataKey = getSupadataKey();
    if (supadataKey) {
      const viaProvider = await fetchTranscriptViaSupadata(videoId, supadataKey);
      if (viaProvider) return viaProvider;
    }

    // 2) Free scraping package — works off-Vercel, often blocked on Vercel.
    const timedtextResult = await fetchTranscriptViaTimedtext(videoId);
    if (timedtextResult) {
      return timedtextResult;
    }

    // 3) If the configured key is a Supadata key there's nothing more to try.
    if (apiKey.startsWith("sd_")) {
      return null;
    }

    // 4) YouTube Data API captions availability check (download needs OAuth)
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

  // ── Authentication: block anonymous scrapers from burning function quota ──
  const caller = await requireAuth(req, res);
  if (!caller) return; // requireAuth already wrote the 401 response

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
