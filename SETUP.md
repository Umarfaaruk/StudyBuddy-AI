# SETUP — third-party services and API keys

Every external service StudyBuddy AI uses, why it is needed, how to obtain a
production key, and where to put it.

Run `npm run verify` at any point to check what is configured and reachable.

---

## Ground rules for keys

**Never hardcode a key.** All configuration is read from environment variables:
`.env.local` locally, Vercel → Settings → Environment Variables in production.
`.env.local` is gitignored via `*.local`; confirm with `git check-ignore .env.local`.

**The `VITE_` prefix is a public marker, not a naming convention.** Vite inlines
any `VITE_*` variable into the JavaScript bundle, so anyone can read it in
DevTools. Only publishable keys may carry that prefix. A secret with a `VITE_`
prefix is a published secret.

| Prefix | Visibility | Use for |
|---|---|---|
| `VITE_*` | **Public** — shipped in the browser bundle | Supabase anon key, public URLs |
| no prefix | Server-only — never leaves the serverless function | service-role keys, API secrets |

**Copy keys only after revealing them.** Dashboards mask secrets with bullet
characters. A masked copy is a non-empty string, so it passes naive checks, but
`•` (U+2022) cannot be encoded in an HTTP header — the request fails before it
is sent and surfaces as a misleading "network error". This exact failure took
the app down earlier in its history; both the build (`vite.config.ts`) and
`npm run verify` now reject a non-ASCII key explicitly.

**Rotate on exposure.** If a key is pasted into a chat, a screenshot, a commit,
or an issue, treat it as burned and rotate it. Deleting the message does not
un-share it.

---

## 1. Supabase — REQUIRED

**Purpose:** the entire backend. Authentication (email/password + Google OAuth),
PostgreSQL database, Row Level Security, and file storage. Onboarding cannot
save without it.

### Getting the keys

1. Sign in at <https://supabase.com/dashboard>.
2. Select the project (or **New project** → choose a region near your users;
   `ap-south-1` / `ap-southeast-1` for India).
3. Go to **Project Settings → API**.
4. Copy **Project URL** → `VITE_SUPABASE_URL` and `SUPABASE_URL`.
5. Under **Project API keys**, click the eye icon to reveal, then copy:
   - **anon / public** → `VITE_SUPABASE_ANON_KEY` (safe in the browser; RLS is
     what protects the data)
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY` — **bypasses RLS entirely.**
     Server-only. Never give it a `VITE_` prefix.

```bash
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...        # public, JWT shape
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...     # SECRET
```

> If you connect the **Vercel ↔ Supabase integration**, it injects `SUPABASE_URL`
> and `SUPABASE_SECRET_KEY` automatically (the code accepts either name). It
> does **not** provide any `VITE_*` variables, so the two client vars above must
> still be set by hand or the production build fails its env guard.

### Also configure

**Authentication → URL Configuration** — set **Site URL** to your live origin and
add `<origin>/**` to **Redirect URLs**. If a redirect target is not allow-listed,
Supabase silently discards it and falls back to the Site URL, which sends users
to the wrong host after login.

**Authentication → Policies** — enable **Leaked password protection**
(checks against HaveIBeenPwned). Currently disabled; there is no API for it.

---

## 2. Groq — REQUIRED for AI features

**Purpose:** powers the AI tutor, doubt solving, quiz generation, summaries and
takeaways, via the `/api/groq` proxy. Onboarding itself does not need it.

1. Sign up at <https://console.groq.com>.
2. **API Keys → Create API Key**, name it (e.g. `studybuddy-prod`).
3. Copy immediately — it is shown once.

```bash
GROQ_API_KEY=gsk_...                        # SECRET, server-only
```

The proxy requires a signed-in caller, so the key is never exposed to browsers
and cannot be spent by anonymous traffic.

---

## 3. Resend — OPTIONAL (weekly digest emails)

**Purpose:** sends the weekly progress email. Everything else works without it.

1. Sign up at <https://resend.com>.
2. **Domains → Add Domain**, add the DNS records they provide, wait for
   verification. Without a verified domain you can only send from
   `onboarding@resend.dev`, which is fine for testing but will land in spam in
   production.
3. **API Keys → Create API Key** with **Sending access** only.

```bash
RESEND_API_KEY=re_...                       # SECRET
RESEND_FROM="StudyBuddy AI <noreply@yourdomain.com>"
PUBLIC_APP_URL=https://your-app.vercel.app  # absolute links inside emails
CRON_SECRET=<random-32-chars>               # protects the cron endpoint
```

Generate `CRON_SECRET` with `openssl rand -hex 32`.

---

## 4. Supadata — OPTIONAL (YouTube transcripts)

**Purpose:** fetches captions for the YouTube summariser. Used because YouTube
blocks scraping from shared serverless IPs.

1. Sign up at <https://supadata.ai> and copy the key from the dashboard.

```bash
SUPADATA_API_KEY=sd_...                     # SECRET
```

---

## 5. YouTube Data API — OPTIONAL (video metadata)

**Purpose:** duration and channel details. Without it the app falls back to
public oEmbed, which still returns title and author.

1. <https://console.cloud.google.com> → create/select a project.
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **Credentials → Create Credentials → API key**.
4. **Restrict the key**: API restrictions → YouTube Data API v3 only. An
   unrestricted Google key can be used against every enabled API on the project.

```bash
YOUTUBE_API_KEY=AIza...                     # SECRET
```

> A Supadata key (`sd_…`) is **not** a YouTube key. They are different services;
> putting one in the other's variable silently degrades metadata lookups.

---

## 6. Google OAuth — OPTIONAL (Google sign-in)

**Purpose:** the "Continue with Google" button.

1. Google Cloud Console → **APIs & Services → Credentials → Create OAuth client
   ID → Web application**.
2. **Authorised redirect URI:** `https://<ref>.supabase.co/auth/v1/callback`
   — Supabase's callback, *not* your app's URL. This is the most common
   misconfiguration.
3. Copy the client ID and secret into Supabase → **Authentication → Providers →
   Google**.

No variables in `.env` — Supabase stores these.

---

## 7. Government exam environment — NOT CONFIGURED

**Purpose:** health-check target for a government-exam data service.

**This has no counterpart in the codebase.** It is wired as a configurable
endpoint and reports *"not configured"* — deliberately distinct from
*"unreachable"*, so an unset variable never raises a false alarm. Supply a URL
when the service exists:

```bash
VITE_GOV_HEALTH_URL=https://<host>/health
```

Health checks never block onboarding, whatever this returns.

---

## 8. Sentry — OPTIONAL (error monitoring)

Without a DSN, Sentry is a no-op; the app still logs client errors to Vercel via
`/api/log-error`.

```bash
VITE_SENTRY_DSN=https://...@o0.ingest.sentry.io/0
VITE_SENTRY_TRACES_SAMPLE_RATE=0.1
```

---

## Not used

No payment provider, CRM, or analytics SaaS is integrated, and none is required
for onboarding. Analytics are computed in Postgres (`cohort_analytics`,
`public_most_improved`). Adding Stripe or a CRM would be a new decision, not a
missing dependency — the onboarding flow is complete without them.

---

## Verifying

```bash
npm run verify                                    # against localhost:5000
npm run verify -- --base https://your-app.vercel.app
```

Reports each service as `OK`, `NOT CONFIGURED`, or `UNREACHABLE`. Those last two
are kept distinct because they need opposite responses: add a key, versus
investigate an outage. Optional services never fail the run, so it is safe as a
CI gate. No key is ever printed — only presence and length.

```bash
npm run qa        # typecheck, dead code, lint, production build
npm test          # unit suites (diagnostic/SM-2 + onboarding schemas)
```
