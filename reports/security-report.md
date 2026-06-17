# Security Audit Report

**Date:** 2026-06-17

## OWASP-Style Review

| Category | Finding | Severity | Status |
|----------|---------|----------|--------|
| Broken Access Control | Notification create for any user | High | ✅ Fixed |
| Broken Access Control | parent_guidance open read/write | High | ✅ Fixed |
| Privilege Escalation | Self-grant admin on profile | — | ✅ Already blocked |
| IDOR | doubt_messages (historical) | — | ✅ Already owner-scoped |
| IDOR | lesson_progress (historical) | — | ✅ Already owner-scoped |
| Secret Exposure | GROQ errors in UI | Medium | ✅ Fixed |
| Secret Exposure | VITE_GROQ in server fallback | Low | Server-only path; prefer GROQ_API_KEY only |
| XSS | React default escaping + markdown | Low | Review user-generated markdown |
| CSRF | Stateless Firebase Bearer tokens | Low | Acceptable for SPA API |
| Storage | No rules file | High | ✅ Fixed |

## Authentication

- Firebase Auth for identity
- API routes verify JWT via Google JWKS (`jose`)
- Admin delete requires verified admin token + Admin SDK

## Authorization Tests (Rule-Level)

| Test | Expected | Result |
|------|----------|--------|
| User A reads User B lesson_progress | DENIED | ✅ Rules enforce `user_id` |
| User writes `is_admin: true` on profile | DENIED | ✅ Rules block |
| User creates notification for User B | DENIED | ✅ Fixed (needs from_user_id) |
| Anonymous calls /api/groq | 401 | ✅ |

## Environment Variables

Client (`VITE_*`): Firebase public config only — acceptable.  
Server: `GROQ_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_KEY`, `YOUTUBE_API_KEY` — must remain server-only.

## Residual Risks

1. **Profile email visibility** — any authenticated user can read profiles (leaderboard feature)
2. **Auth fail-open** if `FIREBASE_PROJECT_ID` unset on server
3. **No CSP headers** in vercel.json — recommend adding Content-Security-Policy

## Verdict

**Security audit passed for beta** after deploying Firestore + Storage rule updates.
