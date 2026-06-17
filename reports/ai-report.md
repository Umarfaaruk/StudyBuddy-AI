# AI System Report

**Date:** 2026-06-17

## Modules Reviewed

| Module | Entry Point | Model |
|--------|-------------|-------|
| AI Tutor | `AITutor.tsx` | llama-3.3-70b |
| Doubt Solver | `DoubtInput`, `AISolution` | llama-3.3-70b |
| Camera Q&A | `CameraQnA.tsx` | llama-4-scout (vision) |
| YouTube Summarizer | `QuickTools` / youtube lib | llama-3.3-70b |
| Flashcards | `Flashcards.tsx` | llama-3.1-8b |
| Quiz Generator | `QuizPage.tsx` | llama-3.1-8b |
| Study Planner | `StudyPlanner.tsx` | llama-3.1-8b |

## Reliability Mechanisms

- **Server proxy** `/api/groq` — auth required, model allowlist, payload caps, 55s timeout
- **Client queue** — max 2 concurrent AI requests per tab
- **Retry** — 3 attempts with exponential backoff + Retry-After header
- **User errors** — sanitized via `toUserFacingAIError()`

## Stress Test Plan (Requires Deployed Env + Token)

| Test | Count | Script |
|------|-------|--------|
| Tutor requests | 50 | Manual / k6 with token |
| Doubts | 20 | Manual |
| Vision | 10 | Manual |
| Flashcard sets | 20 | Manual |
| Quiz generations | 10 | Manual |
| YouTube summaries | 5 | Manual |

**Note:** Live stress tests were not executed in this audit (no production credentials in workspace). k6 script provided at `tests/k6/ai-groq-stress.js`.

## Known Limitations

- Groq free tier rate limits cause 429 under burst — handled gracefully
- Vision requests limited to 4.4 MB body (base64 image)
- Streaming retry shows transient "Rate limited — retrying" message in UI

## Fixes Applied

- Removed internal API key references from user-facing AILearning errors
- Sanitized upstream Groq error bodies at API layer

## Verdict

**AI architecture stable for beta** — recommend monitoring 429 rate in production first week.
