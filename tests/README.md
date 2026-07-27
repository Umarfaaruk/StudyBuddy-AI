# StudyBuddy AI — Free Automated Testing

Everything here is **free** and uses **no paid services**. Two independent tools:

1. **Deep QA report** — finds bugs, type errors, dead code, build failures (no install needed).
2. **Load breakpoint** — measures the **exact** number of concurrent users your app handles (needs the free k6 binary).

---

## 1. Deep QA / bug report  (zero setup)

```bash
npm run qa
```

Runs TypeScript type-check, a dead-code scan, ESLint, and a production build, then writes:

- `tests/reports/qa-report.md`  (read in any editor)
- `tests/reports/qa-report.html` (open in a browser)

Exit code is non-zero if anything compile-breaking is found, so it works in CI too.

**Covers:** compile-breaking bugs, dead code, lint violations, build integrity.
**Does NOT cover:** runtime behaviour of live features (auth flow, AI answers, uploads).
That requires browser end-to-end tests (Playwright), which need dev dependencies installed —
say the word and I'll add them.

---

## 2. How many users can it handle?  (measured, not estimated)

### Install k6 (free, one-time)

```bash
winget install k6 --source winget     # Windows
# choco install k6                     # Windows (Chocolatey)
# brew install k6                      # macOS
# https://k6.io/docs/get-started/installation/  for Linux
```

### Run

```bash
# Static pages (landing, login, dashboard shell) — served by Vercel CDN
npm run load:frontend -- --base https://your-app.vercel.app

# AI features (/api/groq) — needs a real Supabase access token to authenticate
npm run load:api -- --base https://your-app.vercel.app --token <SUPABASE_ACCESS_TOKEN>
```

The sweeper climbs a concurrency ladder, then **binary-searches** between the last
healthy level and the first failing level to pinpoint the exact maximum number of
concurrent users that stays under **<1% errors** and acceptable latency. Result is
written to `tests/reports/load-frontend.json` / `load-api.json` and printed like:

```
RESULT (api): Maximum concurrent users with <1% errors: 27. Degrades at ~30.
```

### Getting a Supabase access token (for the API test)

`/api/groq` verifies a **Supabase** access token (see `api/_verifyToken.js`).

1. Open your deployed app, sign in.
2. Open DevTools → Console and run:
   ```js
   (await window.supabase.auth.getSession()).data.session.access_token
   ```
   If the client isn't exposed on `window`, grab the `Authorization: Bearer …`
   header from any `/api/groq` request in the Network tab instead.
3. Pass it via `--token`.

> Supabase access tokens expire after ~1 hour by default. Grab a fresh one right
> before a long run, or the test will start reporting 401s partway through and
> look like a capacity failure.

---

## ⚠️ What the "user number" actually means

Your app is **three systems with three different ceilings**, none set by your code alone:

| Subsystem | Real bottleneck | Who caps it |
|-----------|-----------------|-------------|
| Static pages | Vercel CDN | Effectively tens of thousands+; your load generator/network usually breaks first |
| **AI features** | **Groq free-tier rate limit (~30 req/min)** + `MAX_CONCURRENT_AI_REQUESTS=2`/tab + Vercel function concurrency | **Groq** — upgrade the Groq plan to raise it |
| Database | Supabase Free tier: shared Postgres compute + connection limits | **Supabase** — upgrade the project to raise it |

So the load test gives a **real measured breakpoint for the environment you point it at** —
but that ceiling is your provider quotas, not a property of the source code. To raise the
AI number, upgrade Groq; to raise the data number, upgrade the Supabase project.

> **Run against a preview/staging URL, not production**, if you can — a load test consumes
> real Groq/Supabase quota and can rate-limit real users while it runs.
