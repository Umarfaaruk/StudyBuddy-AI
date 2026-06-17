# Load Testing Report

**Date:** 2026-06-17

## Test Artifacts Created

```
tests/k6/
  dashboard-lessons.js   — 50 VU smoke + 100 VU ramp, public pages + API auth check
  ai-groq-stress.js      — 100 rapid AI requests (requires FIREBASE_ID_TOKEN)
```

## Execution Status

Tests were **authored but not executed** in CI (k6 not installed in workspace, no deployed URL/token).

## How to Run

```bash
# Install k6: https://k6.io/docs/get-started/installation/

# Public pages (no auth)
k6 run -e BASE_URL=https://eduonx.vercel.app tests/k6/dashboard-lessons.js

# AI stress (authenticated)
k6 run -e BASE_URL=https://eduonx.vercel.app \
       -e FIREBASE_ID_TOKEN=<firebase-id-token> \
       tests/k6/ai-groq-stress.js
```

## Scenarios

| Scenario | VUs | Duration | Endpoints |
|----------|-----|----------|-----------|
| smoke_50 | 50 | 2m | /, /login, /signup, /about, /api/groq |
| ramp_100 | 0→100→0 | 3.5m | Same |
| rapid_100 | 10 req/s | 30s | /api/groq (auth) |

## Thresholds

- `http_req_failed < 5%`
- `p(95) latency < 3s` (pages)
- AI: accepts 429 as expected under Groq free tier

## Limits to Monitor

- Vercel serverless: 60s function timeout (Groq uses 55s)
- Firestore: read/write quotas on admin dashboard
- Groq: RPM/TPM on free tier

## Verdict

**Load test scripts ready** — execute against staging before high-traffic launch.
