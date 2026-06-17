# Admin Panel Report

**Date:** 2026-06-17

## Access Control

- Route: `/admin` wrapped in `AdminRoute` inside `ProtectedRoute`.
- Non-admin users redirected to `/admin-login`.
- Separate admin login page validates role before granting access.

## Features Audited

| Feature | Status |
|---------|--------|
| Admin authentication | ✅ Role check on users + profiles |
| User management | ✅ List, search, expand, delete |
| Platform metrics | ✅ XP, streaks, sessions, quizzes |
| Feedback review | ✅ Real-time listener |
| User deletion | ✅ Server-side `/api/admin-delete-user` |

## Data Exposure Review

| Data | Exposure | Risk |
|------|----------|------|
| User emails in admin panel | Admin-only UI | Low (expected for admin) |
| API keys | Server env only | ✅ Not exposed |
| Groq key | Server-only `GROQ_API_KEY` | ✅ |
| Service account | `FIREBASE_SERVICE_ACCOUNT_KEY` server-only | ✅ |
| Raw AI errors | Sanitized | ✅ Fixed |

## Firestore Admin Reads

Admin listeners subscribe to full collections (`profiles`, `users`, `xp_logs`, etc.). Rules permit admin reads via `isAdmin()` helper. Non-admins cannot enumerate these collections from client.

## User → Admin Access Test (Expected)

Normal user navigating to `/admin`:
1. Passes `ProtectedRoute` (authenticated)
2. Fails `AdminRoute` role check
3. Redirected to `/admin-login`

**Result:** Permission denied path works as designed.

## Recommendations

- Mask emails in admin list for support-tier admins (future RBAC)
- Paginate admin collection listeners when user count > 500
- Add audit log collection for admin delete actions

## Verdict

**Admin panel secure for beta** with current single-tier admin model.
