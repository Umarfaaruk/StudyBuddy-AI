# Sentry Production Validation & Configuration

**Date:** 2026-06-17  
**Status:** PRODUCTION READY

---

## 1. Dynamic Initialization & DSN Configuration

EduOnx implements a **zero-cost, lazy-loading Sentry wrapper** in [sentry.ts](file:///d:/edunox90-main/src/lib/sentry.ts):
* **On-Demand Loading:** If `VITE_SENTRY_DSN` is not present, Sentry remains completely inert. The `@sentry/react` package is never imported, meaning no additional bundle weight is shipped to the end-users.
* **Production Activation:** To activate Sentry in production, add `VITE_SENTRY_DSN` in Vercel (**Project Settings → Environment Variables**) and trigger a rebuild.

---

## 2. Source Map Generation

* **Vite Integration:** Source maps are explicitly enabled in [vite.config.ts](file:///d:/edunox90-main/vite.config.ts) via `sourcemap: true` in the build configuration.
* **Readable Stack Traces:** This configuration ensures that compiled client-side JavaScript traces are mapped back to original TypeScript components (with accurate file names and line numbers) inside Sentry.

---

## 3. Error Capturing Coverage

Errors are routed to Sentry through a unified error handler wrapper [errorMonitor.ts](file:///d:/edunox90-main/src/lib/errorMonitor.ts):
* **Frontend Errors:** Caught by global React Error Boundaries and forwarded using `errorMonitor.reportError`.
* **API Errors:** Serverless function handlers under `/api/` log failures server-side, which can be viewed in Vercel logs.
* **Firebase SDK Errors:** Auth and Firestore database exceptions are caught inline and reported.
* **Groq AI Errors:** Failed completions are caught, sanitized (generic client messages), and original stack traces/upstream statuses are logged and tracked without showing private API key secrets to the user.

---

## 4. Sensitive Data Leakage Prevention

To prevent credentials from leaking into Sentry's dashboard logs:
* Local error messages strip any instances of `GROQ_API_KEY`, `Authorization Bearer` headers, or user password details before forwarding.
* Groq upstream failures are translated to clean user-friendly text messages (e.g., `AI request failed. Please try again.`) inside [api/groq.ts](file:///d:/edunox90-main/api/groq.ts).

---

## 5. Verification Checklist

1. Set `VITE_SENTRY_DSN` in Vercel dashboard.
2. Build the project (`npm run build`) and verify that `.map` files are generated in `dist/assets/`.
3. Force a frontend exception (e.g., calling an undefined helper) and confirm that Sentry captures the error and resolves the TypeScript stack trace correctly.
