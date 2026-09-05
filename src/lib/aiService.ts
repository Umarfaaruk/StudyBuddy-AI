/**
 * STUDYBUDDY AI AI SERVICE — Groq Integration
 * ======================================
 *
 * Centralized AI service using the Groq API (OpenAI-compatible).
 * Uses the groq/compound-mini model for fast, high-quality responses.
 *
 * API endpoint: /api/groq (server-side proxy to Groq)
 * Auth: Bearer token via server-only GROQ_API_KEY
 * Vision: NO vision-capable model is currently available on Groq, so image
 * Q&A falls back to the text model and cannot read the image. See below.
 *
 * RATE LIMIT HANDLING:
 *   Both aiComplete() and aiStream() automatically retry on 429 errors
 *   with exponential backoff (2s → 4s → 8s), up to 3 retries.
 */

import { getAuthHeaders } from "@/lib/authHeaders";
import { toUserFacingAIError } from "@/lib/userFacingErrors";

const GROQ_PROXY_URL = "/api/groq";

/**
 * Model selection:
 *   MODEL_LARGE — 70B, best quality. Use for: chat, doubt solving, YT summaries.
 *   MODEL_SMALL — 8B instant, 3× faster + lower rate-limit pressure.
 *                 Use for: quiz JSON generation, study planner JSON, doc analysis.
 */
// Both retired by Groq and replaced. Must stay inside ALLOWED_MODELS in
// api/groq.ts, which rejects anything else with a 400.
export const MODEL_LARGE = "groq/compound-mini";
export const MODEL_SMALL = "qwen/qwen3.8-27b";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000; // 2 seconds initial backoff

/* ──────────────────────────────────────────────────────────────────────────
 * CLIENT-SIDE REQUEST QUEUE (scalability)
 * =======================================
 * Groq's free tier allows a limited number of requests/min. Without a queue,
 * a user with several tabs or rapid actions fires parallel requests that all
 * 429 together and retry together (thundering herd). This semaphore caps
 * concurrent in-flight AI requests at 2 per browser tab; extra requests wait
 * their turn (FIFO) instead of failing. Combined with the exponential backoff
 * below, the app degrades to "slightly slower" under load instead of crashing.
 * ────────────────────────────────────────────────────────────────────────── */
const MAX_CONCURRENT_AI_REQUESTS = 2;
let activeRequests = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const tryAcquire = () => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      activeRequests++;
      resolve();
    };
    if (activeRequests < MAX_CONCURRENT_AI_REQUESTS) {
      tryAcquire();
    } else {
      waitQueue.push(tryAcquire);
      signal?.addEventListener("abort", () => {
        const idx = waitQueue.indexOf(tryAcquire);
        if (idx !== -1) {
          waitQueue.splice(idx, 1);
          reject(new DOMException("Aborted", "AbortError"));
        }
      }, { once: true });
    }
  });
}

function releaseSlot(): void {
  activeRequests = Math.max(0, activeRequests - 1);
  const next = waitQueue.shift();
  if (next) next();
}

/**
 * Sleep helper that respects AbortSignal.
 * Rejects immediately if the signal is already aborted or gets aborted during sleep.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

/**
 * Extract the Retry-After header value in milliseconds.
 * Falls back to exponential backoff if header is missing.
 */
function getRetryDelay(resp: Response, attempt: number): number {
  const retryAfter = resp.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 30_000); // Cap at 30s
    }
  }
  // Exponential backoff: 2s, 4s, 8s
  return BASE_DELAY_MS * Math.pow(2, attempt);
}

export interface ChatMessageContentItem {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatMessageContentItem[];
}

interface AIRequestOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Override the default model. Pass MODEL_SMALL for JSON-generation tasks. */
  model?: string;
}

async function buildHeaders(): Promise<Record<string, string>> {
  return {
    "Content-Type": "application/json",
    ...(await getAuthHeaders()),
  };
}

/**
 * Handle non-429 errors. Throws with a descriptive message.
 */
async function handleErrorResponse(resp: Response): Promise<never> {
  const errData = await resp.json().catch(() => ({}));
  const raw = errData?.error?.message || errData?.error || "";
  if (resp.status === 401 || resp.status === 403) {
    throw new Error("unauthorized");
  }
  if (resp.status === 429) {
    throw new Error("rate limit");
  }
  if (resp.status === 504) {
    throw new Error("timeout");
  }
  // Log raw detail for engineers; throw a generic token for user-facing mapping
  if (raw) console.warn("[AI] upstream error:", raw);
  throw new Error("ai request failed");
}

/**
 * Non-streaming AI completion with automatic retry on rate limits.
 * Returns the full response text.
 */
async function aiCompleteInner(options: AIRequestOptions): Promise<string> {
  const { messages, temperature = 0.7, maxTokens = 4096, signal, model = MODEL_LARGE } = options;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const resp = await fetch(GROQ_PROXY_URL, {
      method: "POST",
      headers: await buildHeaders(),
      signal,
      body: JSON.stringify({
        model: model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      return data?.choices?.[0]?.message?.content || "";
    }

    // Rate limited — retry with backoff
    if (resp.status === 429) {
      if (attempt < MAX_RETRIES) {
        const delay = getRetryDelay(resp, attempt);
        console.log(`[AI] ⏳ Rate limited. Retrying in ${(delay / 1000).toFixed(1)}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await sleep(delay, signal);
        continue;
      }
      // All retries exhausted
      throw new Error(
        "Rate limit exceeded after multiple retries. The free model has limited capacity — please wait 30-60 seconds and try again."
      );
    }

    // Non-retryable error
    await handleErrorResponse(resp);
  }

  throw new Error("Unexpected error in AI completion");
}

/**
 * Streaming AI completion with automatic retry on rate limits.
 * Calls onToken for each chunk of text received.
 * Returns the full accumulated response.
 */
async function aiStreamInner(
  options: AIRequestOptions,
  onToken: (token: string) => void
): Promise<string> {
  const { messages, temperature = 0.7, maxTokens = 4096, signal, model = MODEL_LARGE } = options;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const resp = await fetch(GROQ_PROXY_URL, {
      method: "POST",
      headers: await buildHeaders(),
      signal,
      body: JSON.stringify({
        model: model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
    });

    if (resp.ok) {
      // Successful response — process the stream
      if (!resp.body) {
        throw new Error("No response stream from API");
      }
      return await processStream(resp.body, onToken);
    }

    // Rate limited — retry with backoff
    if (resp.status === 429) {
      if (attempt < MAX_RETRIES) {
        const delay = getRetryDelay(resp, attempt);
        console.log(`[AI] ⏳ Rate limited. Retrying in ${(delay / 1000).toFixed(1)}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        // Notify the UI that we're waiting
        onToken(`\n\n⏳ *Rate limited — retrying in ${Math.ceil(delay / 1000)}s...*\n\n`);
        await sleep(delay, signal);
        // Clear the retry message by sending empty — the caller will handle deduplication
        continue;
      }
      throw new Error(
        "Rate limit exceeded after multiple retries. The free model has limited capacity — please wait 30-60 seconds and try again."
      );
    }

    // Non-retryable error
    await handleErrorResponse(resp);
  }

  throw new Error("Unexpected error in AI stream");
}

/**
 * Process an SSE stream body and extract text tokens.
 */
async function processStream(
  body: ReadableStream<Uint8Array>,
  onToken: (token: string) => void
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullResponse = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      // Process complete lines, keep last incomplete line in buffer
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line.startsWith("data: ")) {
          const jsonStr = line.substring(6);
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const text = parsed?.choices?.[0]?.delta?.content || "";
            if (text) {
              onToken(text);
              fullResponse += text;
            }
          } catch {
            // Incomplete JSON chunk, skip
          }
        }
      }
      buffer = lines[lines.length - 1];
    }

    // Process remaining buffer
    if (buffer.trim().startsWith("data: ")) {
      try {
        const jsonStr = buffer.trim().substring(6);
        if (jsonStr !== "[DONE]") {
          const parsed = JSON.parse(jsonStr);
          const text = parsed?.choices?.[0]?.delta?.content || "";
          if (text) {
            onToken(text);
            fullResponse += text;
          }
        }
      } catch { }
    }
  } finally {
    reader.releaseLock();
  }

  return fullResponse.trim() || "I couldn't generate a response. Please try rephrasing your question.";
}

export async function aiVisionComplete(
  options: AIRequestOptions
): Promise<string> {
  const { messages, temperature = 0.5, maxTokens = 2048, signal } = options;

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const resp = await fetch(GROQ_PROXY_URL, {
        method: "POST",
        headers: await buildHeaders(),
        signal,
        body: JSON.stringify({
          // Groq retired llama-4-scout and currently serves NO vision model,
          // so this path can no longer read an image. It degrades to the text
          // model, which will answer from the typed question alone.
          model: MODEL_LARGE,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: false,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        return data?.choices?.[0]?.message?.content || "";
      }

      if (resp.status === 429) {
        if (attempt < MAX_RETRIES) {
          const delay = getRetryDelay(resp, attempt);
          console.log(`[AI Vision] ⏳ Rate limited. Retrying in ${(delay / 1000).toFixed(1)}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
          await sleep(delay, signal);
          continue;
        }
        throw new Error("Rate limit exceeded after multiple retries. Please wait and try again.");
      }

      await handleErrorResponse(resp);
    }

    throw new Error("Unexpected error in AI vision completion");
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new Error(toUserFacingAIError(e));
  }
}

/**
 * Public API: non-streaming completion, queued through the concurrency
 * limiter so bursts of simultaneous calls never overwhelm the rate limit.
 */
export async function aiComplete(options: AIRequestOptions): Promise<string> {
  await acquireSlot(options.signal);
  try {
    return await aiCompleteInner(options);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new Error(toUserFacingAIError(e));
  } finally {
    releaseSlot();
  }
}

/**
 * Public API: streaming completion, queued through the concurrency limiter.
 */
export async function aiStream(
  options: AIRequestOptions,
  onToken: (token: string) => void
): Promise<string> {
  await acquireSlot(options.signal);
  try {
    return await aiStreamInner(options, onToken);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new Error(toUserFacingAIError(e));
  } finally {
    releaseSlot();
  }
}
