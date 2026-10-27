 
/**
 * GROQ PROXY — hardened for production
 * =====================================
 * This is the only publicly reachable AI endpoint, so it enforces:
 *
 *  1. MODEL ALLOWLIST — only the models the app actually uses can be
 *     requested. Prevents anyone from using our API key against arbitrary
 *     (more expensive / higher-quota) models.
 *  2. PAYLOAD CAPS — max 24 messages, 60 000 total chars, 200 KB raw body.
 *     Prevents accidental or malicious token-bomb requests that burn quota.
 *  3. PARAMETER CLAMPS — temperature forced to 0–1, max_tokens to 1–4096.
 *  4. UPSTREAM TIMEOUT — 55 s (Vercel function limit is 60 s). A hung Groq
 *     connection times out cleanly instead of consuming a function slot.
 *  5. RETRY-AFTER PASSTHROUGH — on 429 the client's backoff uses Groq's real
 *     retry hint rather than guessing.
 */

import { requireAuth } from "./_verifyToken.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Only models the app uses. Anything else is rejected with 400.
 *
 * THIS LIST GOES STALE. That is not hypothetical — it has now happened twice:
 *
 *   1. llama-3.3-70b-versatile, llama-3.1-8b-instant and llama-4-scout were
 *      retired, killing every AI feature. Replaced with the compound models.
 *   2. groq/compound and groq/compound-mini were then retired in turn, killing
 *      them all again. Confirmed by `npm run verify:models`.
 *
 * Both times the symptom was a generic "AI request failed" with nothing in the
 * logs, because a retired model returns a normal HTTP error and the key keeps
 * working. Both times it was found by a person, not a check.
 *
 * The Daily checks workflow now runs the model comparison every morning, so a
 * third retirement should arrive as a red build rather than a broken tutor.
 *
 * Verified live against GET /openai/v1/models before being written here.
 */
const ALLOWED_MODELS = new Set([
  "llama-3.3-70b-versatile",            // default - chat, doubts, summaries
  "llama-3.1-8b-instant",               // fast JSON work, lower quota pressure
  "openai/gpt-oss-120b",                // heavier reasoning
  "openai/gpt-oss-20b",                 // fast reasoning
]);

/**
 * A llama model rather than a gpt-oss one, and the reason is recorded here
 * because it is not obvious and was learned the hard way: the gpt-oss family
 * spends output tokens on reasoning before emitting any text, so a short
 * max_tokens returns an EMPTY string rather than a brief answer, and it renders
 * formulae as LaTeX (\(F=ma\)) which this UI does not typeset.
 *
 * For a tutor explaining physics to a student, clean prose beats a reasoning
 * trace. Keep gpt-oss allowlisted for callers that explicitly want it; do not
 * make it the default without fixing both of those problems first.
 */
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const MAX_MESSAGES = 24;
const MAX_TOTAL_CHARS = 60_000;          // text-only requests
const MAX_BODY_BYTES = 200_000;          // text-only requests
const MAX_BODY_BYTES_VISION = 4_400_000; // vision requests carry a base64 image
                                          // (Vercel's own body limit is ~4.5 MB)
const MAX_TOKENS_CAP = 4096;
const UPSTREAM_TIMEOUT_MS = 55_000;

/** True if any message carries image parts (Camera Q&A vision requests) */
function isVisionPayload(messages: any[]): boolean {
  return messages.some(
    (m) => Array.isArray(m?.content) && m.content.some((p: any) => p?.type === "image_url")
  );
}

function getApiKey(): string {
  const key =
    process.env.GROQ_API_KEY?.trim() ||
    process.env.VITE_GROQ_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "Server is missing GROQ_API_KEY. Set it in Vercel env vars or .env.local."
    );
  }
  return key;
}

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

function sanitizeUpstreamError(status: number): string {
  if (status === 429) return "AI service is busy. Please try again in a moment.";
  if (status === 504) return "AI provider timed out. Please try again.";
  if (status >= 500) return "AI service temporarily unavailable. Please try again.";
  if (status === 401 || status === 403) return "Authentication required.";
  return "AI request failed. Please try again.";
}

/**
 * WHY THIS LOGS BUT THE CLIENT RESPONSE DOES NOT
 * ==============================================
 * sanitizeUpstreamError deliberately gives the browser a vague message: the
 * provider's raw error can name models, quotas and account details that have no
 * business reaching an end user.
 *
 * The cost of that was paid in production. The AI tutor started failing with a
 * generic "Something went wrong", and because the only non-OK path returned the
 * sanitised string and logged NOTHING, the runtime logs showed healthy-looking
 * requests and no error at all. A 400 for a retired model, a 401 for a revoked
 * key and a 404 for a bad path were indistinguishable from outside.
 *
 * So: say nothing useful to the client, say everything to stderr. The body is
 * truncated because provider errors can be long, and this is a log line, not an
 * archive.
 */
async function logUpstreamFailure(upstream: any, model: string, streamed: boolean) {
  let detail = "";
  try {
    detail = (await upstream.text()).slice(0, 500);
  } catch {
    detail = "(body unreadable)";
  }
  console.error(
    `[groq] upstream rejected: status=${upstream.status} ${upstream.statusText || ""} ` +
      `model=${model} stream=${streamed} body=${detail}`
  );
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── Authentication: only signed-in StudyBuddy AI users may spend our AI quota ──
  const caller = await requireAuth(req, res);
  if (!caller) return; // requireAuth already wrote the 401 response

  try {
    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { messages, temperature = 0.7, max_tokens, maxTokens, stream = false, model } = body ?? {};

    // ── Message validation ───────────────────────────────────
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages must be a non-empty array" });
    }
    if (messages.length > MAX_MESSAGES) {
      return res.status(400).json({ error: `Too many messages (max ${MAX_MESSAGES})` });
    }

    const vision = isVisionPayload(messages);

    // ── Body size guard (vision requests carry a base64 image) ──
    if (rawBody.length > (vision ? MAX_BODY_BYTES_VISION : MAX_BODY_BYTES)) {
      return res.status(413).json({ error: "Request body too large" });
    }

    // ── Text char cap (image parts excluded from the count) ──
    let totalChars = 0;
    for (const m of messages) {
      if (!m || typeof m !== "object" || typeof m.role !== "string") {
        return res.status(400).json({ error: "Each message needs a role and content" });
      }
      if (typeof m.content === "string") {
        totalChars += m.content.length;
      } else if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (part?.type === "text" && typeof part.text === "string") {
            totalChars += part.text.length;
          }
        }
      }
    }
    if (totalChars > MAX_TOTAL_CHARS) {
      return res.status(400).json({ error: `Combined message content too large (max ${MAX_TOTAL_CHARS} chars)` });
    }

    // ── Model allowlist ──────────────────────────────────────
    const requestedModel = typeof model === "string" && model.trim() ? model.trim() : DEFAULT_MODEL;
    if (!ALLOWED_MODELS.has(requestedModel)) {
      return res.status(400).json({ error: `Model not allowed: ${requestedModel}` });
    }

    // ── Parameter clamps ─────────────────────────────────────
    const safeTemperature = clamp(Number(temperature) || 0.7, 0, 1);
    const tokenLimit = clamp(Number(max_tokens || maxTokens) || MAX_TOKENS_CAP, 1, MAX_TOKENS_CAP);

    // ── Upstream call with timeout ───────────────────────────
    const upstream = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: JSON.stringify({
        model: requestedModel,
        messages,
        temperature: safeTemperature,
        max_tokens: tokenLimit,
        stream,
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    // Pass Groq's real retry hint to the client so backoff is accurate
    if (upstream.status === 429) {
      const retryAfter = upstream.headers.get("retry-after");
      if (retryAfter) res.setHeader("Retry-After", retryAfter);
    }

    if (stream) {
      if (!upstream.ok || !upstream.body) {
        await logUpstreamFailure(upstream, requestedModel, true);
        return res.status(upstream.status).json({ error: sanitizeUpstreamError(upstream.status) });
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");

      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
      return;
    }

    // Checked BEFORE .json(): reading the body consumes it, and the error text
    // is the only thing that explains the failure.
    if (!upstream.ok) {
      await logUpstreamFailure(upstream, requestedModel, false);
      return res.status(upstream.status).json({ error: sanitizeUpstreamError(upstream.status) });
    }

    const data: any = await upstream.json().catch(async () => {
      const text = await upstream.text();
      return { error: { message: text || "Invalid upstream response" } };
    });

    return res.status(200).json(data);
  } catch (error: any) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return res.status(504).json({ error: "AI provider timed out. Please try again." });
    }
    console.error("[groq] handler error:", error?.message || error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
