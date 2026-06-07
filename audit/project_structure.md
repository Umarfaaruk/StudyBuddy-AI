# Project Discovery & Structure Mapping

This document details the architectural, technical, and data flow design of the EduOnx educational application.

---

## 1. Directory Structure Map

```
d:\edunox90-main
├── .vscode
├── api/                           # Vercel serverless function backend API endpoints
│   ├── admin-delete-user.ts       # Service-account powered backend deletion of Firebase Auth accounts
│   ├── groq.ts                    # LLM completion/streaming proxy to Groq
│   ├── ndli.js                    # Book search API proxy supplementing Open Library and NDLI links
│   └── youtube-transcript.js      # Robust YouTube scraper utilizing InnerTube Android client APIs
├── src/
│   ├── assets/                    # Static assets & logos
│   ├── components/                # Reusable UI & core workflow wrapper components
│   │   ├── layout/                # Desktop/Mobile sidebars and page wrappers (AppLayout.tsx)
│   │   ├── ui/                    # Radix + custom shadcn primitive UI elements
│   │   ├── AdminRoute.tsx         # Route guard to check user is_admin/admin role
│   │   ├── EduOnxAIChat.tsx       # Ambient AI tutor/assistant chat bar
│   │   ├── ErrorBoundary.tsx      # Prevents page-level crashes
│   │   ├── FeedbackEnforcer.tsx   # Enforces weekly rating/feedback modal
│   │   ├── GlobalTimer.tsx        # Global Pomodoro-like focus timer
│   │   ├── NotificationPanel.tsx  # Unread and historical notification system
│   │   ├── ProtectedRoute.tsx     # Session protection and onboarding redirect enforcer
│   │   └── SnapEnhance.tsx        # Quick screenshot tool for AI doubt asking
│   ├── contexts/                  # AuthContext, NotificationContext
│   ├── hooks/                     # Custom react hooks (useDashboardData, useDeepFocus)
│   ├── lib/                       # SDK wrappers, utils, shared calculations
│   │   ├── adminUserStats.ts      # Stats computing logic for the admin overview
│   │   ├── aiService.ts           # Central client wrapper for LLM completions/streaming
│   │   ├── firebase.ts            # Client SDK initialization
│   │   ├── firebaseAuthErrors.ts  # Friendly UI strings for auth errors
│   │   ├── studySession.ts        # Focus session storage, streaks, and retry queue
│   │   ├── userStats.ts           # Common metrics and calculations
│   │   ├── utils.ts               # Shared helper functions
│   │   └── youtube.ts             # Video ID validation and extractors
│   ├── pages/                     # Routed page screens
│   │   ├── admin/                 # Admin Login & panel dashboard page
│   │   ├── auth/                  # Login & Signup screens
│   │   ├── doubts/                # Doubt resolver workspaces & history
│   │   ├── lessons/               # Syllabus/Academy lectures
│   │   ├── materials/             # Study materials uploaded & AI tutoring (AITutor.tsx)
│   │   ├── onboarding/            # Mandatory user profile segmentation flow
│   │   ├── progress/              # Detailed performance dashboards
│   │   ├── quiz/                  # Practice Arena quiz taking & results
│   │   ├── social/                # Leaderboards & Achievements
│   │   ├── timer/                 # Timer session details
│   │   └── tools/                 # YoutubeSummarizer, ConceptExplorer
│   ├── App.tsx                    # Routes, Context Providers and Toast setups
│   ├── index.css                  # Tailwind styles and custom variables
│   └── main.tsx                   # Mounting entry point
├── firestore.rules                # Firebase Firestore Security Rules
├── package.json                   # Dependencies, scripts, and target engines
├── tailwind.config.ts             # Custom design tokens, palettes, and animations
├── vercel.json                    # API routes proxy configuration for local development
└── vite.config.ts                 # Dev server configuration and build setups
```

---

## 2. Technical Stack Identification

* **Frontend Framework**: React 18 (Vite, TypeScript, TailwindCSS 3)
* **Backend Framework**: Vercel Serverless Functions (Node.js API Router in `/api`)
* **Database**: Firebase Cloud Firestore
* **Authentication**: Firebase Authentication
* **AI Integrations**: Groq API Proxying (LLaMA-3.3-70b-versatile, LLaMA-4-Scout-17b vision)
* **External APIs**: YouTube InnerTube Client, oEmbed API, Open Library Search API

---

## 3. Core Workflows & Data Flow

### A. Authentication & Onboarding Flow
1. User visits `/login` or `/signup`.
2. Completes OAuth or Email/Password setup.
3. `ProtectedRoute` intercepts the user session and queries the `profiles` collection:
   - If profile exists and `onboarding_completed == true`, user accesses `/dashboard`.
   - If profile doesn't exist or `onboarding_completed == false`, user is redirected to `/onboarding`.
4. Once onboarding pages are completed, a new document is written to `profiles` and `user_preferences`.

### B. YouTube Summarizer Pipeline
1. User provides a YouTube link.
2. Link is processed to extract 11-char ID using `extractYouTubeVideoId`.
3. Frontend queries `/api/youtube-transcript?v=<videoId>&t=<ts>`.
4. Backend issues a POST to InnerTube Player API with Android headers.
5. If captions are found, they are sorted (prioritizing English manual over auto-generated), retrieved, and returned.
6. If captions fail, backend falls back to metadata (oEmbed title, description) and returns it.
7. Frontend splits transcript into chunks, invokes Groq completion/streams for parallel summarization, and combines results.

### C. Admin Panel & Security Guard
1. Accessing `/admin` is guarded by `AdminRoute.tsx`.
2. `AdminRoute` queries `users/{uid}` and `profiles/{uid}` in Firestore for `is_admin == true` or `role == "admin"`.
3. If verification succeeds, they are allowed; otherwise, they are redirected to `/admin-login`.
4. Security rules in `firestore.rules` protect read/write scopes of collections, only allowing admins delete capabilities.
