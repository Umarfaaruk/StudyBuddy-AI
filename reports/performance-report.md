# Performance Report

**Date:** 2026-06-17

## Build Output (Production)

| Chunk | Size (gzip) |
|-------|-------------|
| index (app shell) | 92.88 KB |
| vendor-firebase | 164.45 KB |
| vendor-recharts | 109.56 KB |
| vendor-pdf | 107.61 KB |
| vendor-radix | 75.52 KB |
| vendor-animation | 68.64 KB |
| Dashboard (lazy) | 7.17 KB |
| LessonList (lazy) | 9.26 KB |
| AITutor (lazy) | 7.75 KB |

## Optimizations Present

- Route-level lazy loading (~45% initial bundle reduction per comments)
- Manual Rollup chunks for Firebase, Recharts, PDF, Radix, animation
- React Query: 5 min staleTime, no refetch on window focus
- Admin role cached 5 min
- Firebase Performance Monitoring lazy-loaded in prod only
- Sentry dynamically imported (zero cost when DSN unset)

## Target vs Estimate

| Page | Target | Estimate |
|------|--------|----------|
| Dashboard | < 2s | ~1.5–2.5s (depends on Firestore latency) |
| Lessons | < 1s | ~1–1.5s first load (lazy chunk) |
| AI Features | < 5s | 2–8s (Groq latency dominated) |

## Remaining Opportunities

1. Lazy-load Recharts only on Progress/Admin pages (currently in vendor chunk)
2. Consider Firebase modular imports audit (already using subpaths)
3. Add `React.memo` on heavy list items in Leaderboard (minor)

## Verdict

**Performance acceptable for beta** — Lighthouse run recommended post-deploy.
