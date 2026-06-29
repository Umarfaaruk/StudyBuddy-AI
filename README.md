# EduOnx — AI-Powered Learning Platform

An intelligent learning platform with AI tutoring, study tracking, gamification, and personalized learning paths.

## Tech Stack

- **Framework**: Vite + React 18 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Backend**: Supabase (Auth, Postgres, Storage, Realtime)
- **AI**: Groq API (Llama 3.3 70B) via server proxy
- **Charts**: Recharts
- **Animation**: Framer Motion + GSAP
- **Deployment**: Vercel

## Features

- **AI Tutor** — Chat with an AI tutor about your study materials
- **Lessons** — Curated learning paths with progress tracking & XP
- **YouTube Workspace** — Embed videos inside lessons with side-by-side tools
- **Quick Tools** — Notes, Calculator, AI Summarizer (context-aware in lessons)
- **Study Planner** — AI-generated study roadmaps (toggle in Lessons)
- **Practice Arena** — Quiz engine with topic-based assessments
- **NDLI Library** — Search the National Digital Library of India for eBooks
- **Progress Dashboard** — Daily/weekly/monthly analytics
- **Gamification** — XP, streaks, achievements, leaderboards
- **Deep Focus Mode** — Minimal UI for distraction-free studying
- **Ask Doubt** — AI-powered doubt solving with image support

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase and Groq API keys

# Start development server
npm run dev
```

## Project Structure

```
src/
├── components/       # Shared components (layout, UI, landing)
├── contexts/         # React contexts (Auth)
├── hooks/            # Custom hooks (dashboard data, deep focus)
├── lib/              # Services (AI, Supabase, analytics, utils)
├── pages/            # Route pages
│   ├── auth/         # Login, Signup
│   ├── doubts/       # Ask Doubt, AI Solution, Camera Q&A
│   ├── lessons/      # Lesson List, Lesson Viewer (with YouTube + Tools)
│   ├── materials/    # Resource Library, AI Tutor, Flashcards, Study Planner
│   ├── progress/     # Progress Dashboard
│   ├── quiz/         # Practice Arena
│   ├── social/       # Leaderboard, Friends, Achievements
│   ├── timer/        # Study Timer
│   └── tools/        # Quick Tools (standalone fallback)
└── api/              # Vercel serverless functions (Groq proxy, NDLI proxy)
```

## Environment Variables

See [`.env.example`](./.env.example) for the full list. Copy it to `.env.local` and fill in your values.

| Variable | Scope | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | client | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | client | Supabase anon key (safe in browser; RLS protects data) |
| `VITE_SENTRY_DSN` | client | Sentry DSN for error monitoring (optional) |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | client | Sentry trace sample rate (optional) |
| `GROQ_API_KEY` | server | Groq API key for the `/api/groq` proxy |
| `SUPABASE_URL` | server | Supabase project URL (server functions) |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Supabase service-role key — bypasses RLS, server-only |
| `YOUTUBE_API_KEY` | server | YouTube Data API key (video metadata) |
| `SUPADATA_API_KEY` | server | Supadata key (YouTube transcripts) |
| `RESEND_API_KEY` | server | Resend API key (weekly email digest) |
| `RESEND_FROM` | server | Verified "from" address for Resend emails |
| `CRON_SECRET` | server | Secret guarding the weekly-email cron endpoint |

## License

This project was built as part of a freelancing engagement for a company called
**Edunox**. Edunox holds all rights to this product and its associated
deliverables. My role was specifically that of the **developer and UI designer**.

This repository and its contents are proprietary to Edunox and are not licensed
for reuse, redistribution, or modification without their explicit permission.

© 2026 Edunox. All rights reserved.
