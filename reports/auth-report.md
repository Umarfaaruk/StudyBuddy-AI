# Authentication & Authorization Report

**Date:** 2026-06-17

## Flows Validated (Code Review)

| Flow | Implementation | Status |
|------|----------------|--------|
| Email signup | `AuthContext.signUp` → profile doc | ✅ |
| Email login | Firebase `signInWithEmailAndPassword` | ✅ |
| Google OAuth | Login + Signup → `ensureGoogleUserProfile` | ✅ Fixed |
| Password reset | `sendPasswordResetEmail` on Login | ✅ |
| Logout | Clears session keys + retry queue | ✅ |
| Session persistence | Firebase `onAuthStateChanged` | ✅ |
| Token refresh | Firebase auto-refresh + `getIdToken()` | ✅ |
| Route guards | `ProtectedRoute`, `AdminRoute` | ✅ |

## Route Protection Matrix

| Route | Unauthenticated | Normal User | Admin |
|-------|-----------------|-------------|-------|
| `/dashboard` | → `/login` | ✅ | ✅ |
| `/lessons` | → `/login` | ✅ | ✅ |
| `/quiz` | → `/login` | ✅ | ✅ |
| `/progress` | → `/login` | ✅ | ✅ |
| `/doubts` | → `/login` | ✅ | ✅ |
| `/profile` | → `/login` | ✅ | ✅ |
| `/admin` | → `/admin-login` | → `/admin-login` | ✅ |

## Role Validation

- **Client:** `AdminRoute` checks `users/{uid}` then `profiles/{uid}` for `role === "admin"` or `is_admin === true` (React Query cached 5 min).
- **Firestore rules:** Users cannot write `is_admin` or `role` on their own profile; `/users/{uid}` writes admin-only.
- **API:** `/api/admin-delete-user` verifies admin via Admin SDK + ID token.
- **AI endpoints:** JWT verification via `jose` + Google JWKS.

## Issues Fixed

- Google login now creates profile document (prevents onboarding redirect loops for new OAuth users).

## Residual Risks

- `ProtectedRoute` allows through on Firestore profile read error (`isError`) — intentional UX tradeoff; user may skip onboarding check offline.
- Admin role stored in Firestore (not custom claims) — acceptable for current scale; migrate to custom claims for faster admin checks at scale.

## Verdict

**Authentication stable for beta** — pending live OAuth domain authorization in Firebase Console for production domain.
