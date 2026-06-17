# Monitoring Report

**Date:** 2026-06-17

## Systems Verified (Code)

| System | File | Status |
|--------|------|--------|
| Client error sink | `errorMonitor.ts` → `/api/log-error` | ✅ Active |
| Sentry (optional) | `sentry.ts` | ✅ Scaffolded (needs `VITE_SENTRY_DSN`) |
| Firebase Performance | `firebase.ts` | ✅ Prod-only lazy init |
| React Error Boundary | `ErrorBoundary.tsx` | ✅ Root + per-route |
| API error logging | `api/groq.ts`, `log-error.ts` | ✅ console.error structured |

## Error Capture Flow

1. `window.error` / `unhandledrejection` → `reportError()`
2. Dedup (1 per message per session) + budget (10/session)
3. `sendBeacon` to `/api/log-error` → Vercel logs `[CLIENT-ERROR]`
4. Optional Sentry `captureException()` if DSN configured

## Source Maps

Vite production build generates source maps by default only if configured — **recommend** enabling in Vercel:

```ts
// vite.config.ts
build: { sourcemap: true }
```

(Current config: source maps not explicitly enabled — add for Sentry symbolication.)

## Production Env Checklist

| Variable | Purpose |
|----------|---------|
| `VITE_SENTRY_DSN` | Sentry error tracking |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | Performance traces (default 0.1) |
| `FIREBASE_PROJECT_ID` | API auth verification |
| `GROQ_API_KEY` | AI proxy |

## Verdict

**Monitoring scaffold ready** — enable Sentry DSN + source maps before public launch.
