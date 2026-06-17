# Firestore Validation Report

**Date:** 2026-06-17

## Collections Reviewed

`users`, `profiles`, `user_preferences`, `study_sessions`, `xp_logs`, `user_streaks`, `lesson_progress`, `quiz_attempts`, `topics`, `lessons`, `friends_list`, `doubt_sessions`, `doubt_messages`, `analytics`, `feedback`, `topic_progress`, `materials`, `flashcards`, `study_plans`, `notifications`, `follows`, `parent_guidance`

## Security Posture

| Pattern | Status |
|---------|--------|
| Owner-scoped reads (lesson_progress, doubts) | ✅ |
| Admin privilege escalation blocked | ✅ |
| Custom topic/lesson ownership | ✅ |
| Feedback field name (`userId`) | ✅ Fixed in rules |
| Follows collection rules | ✅ |
| Notifications create abuse | ✅ Fixed |
| parent_guidance IDOR | ✅ Fixed |

## React Query Cache

- Global `staleTime: 5 min`, `refetchOnWindowFocus: false`
- Profile onboarding check: 30s stale, invalidated on navigation
- Admin check: 5 min cache
- Dashboard: consolidated hook reduces duplicate reads

## Index Configuration

`firestore.indexes.json` present — composite indexes defined for queried fields.

## Read Optimization Opportunities

1. Admin panel: replace 11 `onSnapshot` listeners with paginated queries
2. Leaderboard: batch profile fetches already chunked (10 IDs)
3. Dashboard: single parallel fetch pattern in `useDashboardData`

## Persistence

- Lesson progress, quiz attempts, study plans write with `user_id` stamp
- Study session retry queue cleared on logout (prevents cross-user replay)

## Deploy Required

```bash
firebase deploy --only firestore:rules,storage
```

## Verdict

**Firestore rules production-ready** after deploying updated rules to Firebase project.
