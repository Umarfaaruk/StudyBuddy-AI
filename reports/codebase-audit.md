# EduOnx Codebase Audit Report

**Date:** 2026-06-17  
**Scope:** Full repository (`src/`, `api/`, Firebase rules, Vite config)

## Executive Summary

The codebase is a well-structured React 18 + Vite SPA with route-level code splitting, React Query caching, hardened Firestore rules, and a secured Groq proxy. Production build and ESLint pass cleanly.

## Validation Results

| Check | Result |
|-------|--------|
| `npm run build` | ✅ Pass (8–30s) |
| `npm run lint` | ✅ Pass (0 errors) |
| Broken imports | ✅ None found |
| Route protection | ✅ `ProtectedRoute` + `AdminRoute` |
| Error boundaries | ✅ Per-route + root |
| Code splitting | ✅ Lazy routes + manual chunks |

## Issues Found & Fixed

### Critical / High

1. **Google OAuth profile gap on Login** — New Google users signing in via `/login` did not get a Firestore profile (only Signup handled this). **Fixed:** shared `ensureGoogleUserProfile()` used in both flows.

2. **Notification spam / IDOR** — Any authenticated user could create notifications for any `user_id`. **Fixed:** Firestore rules require `from_user_id == auth.uid` for cross-user system notifications; friend flows updated.

3. **`parent_guidance` IDOR** — Collection was read/write by any authenticated user. **Fixed:** owner-scoped rules.

4. **Raw Groq errors exposed to clients** — Upstream error bodies leaked to UI. **Fixed:** server-side sanitization + `toUserFacingAIError()` in `aiService`.

5. **Missing Storage rules** — No `storage.rules`; avatar uploads unprotected at rules layer. **Fixed:** added rules + `firebase.json` storage config.

6. **AILearning exposed `GROQ_API_KEY` in user-facing errors** — **Fixed:** generic message.

### Medium (Documented, Not Blocking Beta)

- **Profiles publicly readable** — Intentional for leaderboard/friends; emails searchable in Leaderboard. Consider field-level redaction for non-admin reads in a future release.
- **Admin panel reads entire collections** — Expensive but admin-gated; acceptable for small user bases.
- **Large vendor chunks** — Firebase (719 KB gzip 164 KB) and Recharts (406 KB) exceed 600 KB warning; already split into manual chunks.
- **`requireAuth` fail-open** when `FIREBASE_PROJECT_ID` missing — Dev convenience; must be set in production Vercel env.

## Architecture Strengths

- Centralized `aiService` with concurrency queue + exponential backoff
- Firestore rules block privilege escalation on `is_admin` / `role`
- Server-side admin delete via Firebase Admin SDK
- Error monitor + optional Sentry + Firebase Performance (prod lazy load)

## Recommendations (Post-Beta)

- Add Vitest/Playwright E2E for auth flows
- Standardize API response envelope `{ success, data?, error? }` without breaking Groq OpenAI-compat shape
- Deploy Firestore + Storage rules: `firebase deploy --only firestore:rules,storage`
