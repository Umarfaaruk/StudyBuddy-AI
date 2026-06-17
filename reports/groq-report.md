# Groq Resilience Report

**Date:** 2026-06-17

## Integration Architecture

```
Client (aiService.ts)
  → acquireSlot() [max 2 concurrent]
  → fetch /api/groq + Firebase Bearer token
  → retry on 429 (2s/4s/8s or Retry-After)
  → toUserFacingAIError() on failure

Server (api/groq.ts)
  → requireAuth()
  → model allowlist (3 models)
  → payload validation (24 msgs, 60k chars, 200KB / 4.4MB vision)
  → AbortSignal.timeout(55s)
  → sanitizeUpstreamError() on failures
```

## Rate Limit Handling

| Layer | Mechanism |
|-------|-----------|
| Client | Concurrency semaphore (2) |
| Client | 3 retries + exponential backoff |
| Server | Passes Retry-After header on 429 |
| Server | Parameter clamps (temp 0–1, tokens 1–4096) |
| UI | Friendly messages, no raw API text |

## 100 Rapid Request Test

Script: `tests/k6/ai-groq-stress.js`

```bash
k6 run -e BASE_URL=https://<app>.vercel.app \
       -e FIREBASE_ID_TOKEN=<token> \
       tests/k6/ai-groq-stress.js
```

Expected under free tier: mix of 200 and 429; no 500 from timeout if within limits.

## Fixes Applied

- `sanitizeUpstreamError()` — never returns raw Groq JSON to client
- Client `handleErrorResponse` logs upstream detail to console only
- 500 handler logs server-side, returns generic message

## Verdict

**Groq integration production-ready for beta** with documented free-tier constraints.
