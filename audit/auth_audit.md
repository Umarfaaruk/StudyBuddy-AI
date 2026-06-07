# Authentication and Authorization Security Audit

This report highlights findings and repairs made to the authentication flows, role guards, and Firestore rules.

---

## 1. Firestore Security Rules Logic Bug

### Vulnerability / Bug
* **Location**: `firestore.rules` (lines 14–21, `isAdmin()` helper function).
* **Details**: The security rule used logical ORs to check both the `users` and `profiles` collections:
  ```javascript
  function isAdmin() {
    return isAuthenticated() && (
      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.is_admin == true ||
      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin" ||
      get(/databases/$(database)/documents/profiles/$(request.auth.uid)).data.is_admin == true ||
      get(/databases/$(database)/documents/profiles/$(request.auth.uid)).data.role == "admin"
    );
  }
  ```
  If a user doc does not exist in the `/users` collection (which is common for new or Google-registered users where data only exists in `profiles`), the rule evaluation throws a non-existent document error on the first two check paths and immediately aborts the entire evaluation, returning `false`. The OR does not fallback safely.
* **Fix**: Prepend each check with an `exists()` check to ensure safe evaluation.

---

## 2. Admin Login State & Redirects

### Findings
* **Admin Login Route Guard**: `AdminRoute.tsx` successfully blocks non-admin users from accessing `/admin`. However, when state is loading or resolving, it displays a loading skeleton.
* **Redirect Loop Avoidance**: `ProtectedRoute` on `/onboarding` avoids redirect loops by checking the route prefix `location.pathname.startsWith("/onboarding")`.
* **State Updates on Unmounted Components**: `AdminLogin.tsx` calls `setCheckingExisting(false)` and `setLoading(false)` after redirecting, which can trigger React state update warnings. This has been noted and updated to return early if redirecting.
