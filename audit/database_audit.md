# Database Schema and Security Audit

This report details Firestore index design, security rule constraints, and query optimizations.

---

## 1. Schema Optimization

Firestore is schema-less, but we maintain a consistent design pattern:
- **`users`**: Auth settings, roles, administrative properties.
- **`profiles`**: User details (full name, grade, total XP, profile picture) accessed via standard user lists, achievements, and leaderboards.
- **`study_sessions`**: Timed tracking docs containing `user_id`, `duration_seconds`, `started_at`, `ended_at`.
- **`quiz_attempts`**: Comprehensive practice logs containing `user_id`, `score`, `total_questions`, `created_at`.
- **`feedback`**: User rating surveys containing `userId`, `rating`, `comment`, `createdAt`.

### Fix Applied: Index Prevention for Queries
- Large collection queries filtering by `user_id` and ordering by `created_at` (such as in `notifications` or `study_sessions`) are optimized.
- We ensure Firestore Rules and client-side structures prevent unfiltered collections reads.

---

## 2. Integrity Verification
- Centralized user stats logic (`adminUserStats.ts`) ensures that computing metrics like active streaks or average quiz scores follows matching formulas across the admin panel and user dashboards, preventing mismatching analytics records.
- Deletion operations (`admin-delete-user.ts`) cascade across related records in Firestore (`user_preferences`, `study_sessions`, `profiles`, `xp_logs`), guaranteeing clean states.
