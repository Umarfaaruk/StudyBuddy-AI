/**
 * INTEGRATION VERIFICATION
 * ========================
 *   node tests/verify-integrations.mjs            (or: npm run verify)
 *   node tests/verify-integrations.mjs --base https://your-app.vercel.app
 *
 * Confirms every third-party service the app depends on is reachable and
 * correctly configured, and that the onboarding endpoints respond.
 *
 * Design notes:
 *   • Reports per-service status rather than exiting on the first failure — a
 *     partial outage should still tell you which OTHER services are fine.
 *   • Distinguishes NOT CONFIGURED from UNREACHABLE. Those need completely
 *     different fixes (add a key vs. investigate an outage), and collapsing
 *     them into one red cross sends you looking in the wrong place.
 *   • Never prints a key. It reports presence and length only, so the output
 *     can be pasted into an issue without leaking a credential.
 *   • Exit code is non-zero only when something CONFIGURED is broken, so this
 *     is usable as a CI gate without failing on optional integrations.
 */
import { readFileSync, existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ── Load .env.local / .env without a dependency ──────────────────────────── */
function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env", ".env.local"]) {
    const p = resolve(ROOT, file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
      if (!m) continue;
      let [, k, v] = m;
      v = v.trim().replace(/^["']|["']$/g, "");
      // .env.local wins, matching Vite.
      if (v) env[k] = v;
    }
  }
  return env;
}

const env = loadEnv();
const argBase = (() => {
  const i = process.argv.indexOf("--base");
  return i !== -1 ? process.argv[i + 1] : null;
})();
const BASE = argBase || "http://localhost:5000";

const results = [];
const record = (name, status, detail, required = true) =>
  results.push({ name, status, detail, required });

const OK = "OK", MISSING = "NOT CONFIGURED", FAIL = "UNREACHABLE", WARN = "WARN";

async function timedFetch(url, opts = {}, ms = 10000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

/* ── 1. Supabase ──────────────────────────────────────────────────────────── */
async function checkSupabase() {
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    record("Supabase (client)", MISSING, "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set");
    return;
  }

  // The masked-key failure mode: a key copied while hidden is a string of
  // bullets, non-empty and therefore passes a naive presence check, but cannot
  // be encoded into an HTTP header. Catch it here rather than at runtime.
  const nonAscii = [...anon].filter((c) => c.codePointAt(0) > 127);
  if (nonAscii.length) {
    record("Supabase (client)", FAIL,
      `anon key contains ${nonAscii.length} non-ASCII char(s) — it was copied while masked. Reveal it first, then copy.`);
    return;
  }
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(anon) && !anon.startsWith("sb_publishable_")) {
    record("Supabase (client)", FAIL, "anon key is malformed (expected a JWT or sb_publishable_ key)");
    return;
  }

  try {
    const r = await timedFetch(`${url}/auth/v1/health`, { headers: { apikey: anon } });
    record("Supabase Auth", r.ok ? OK : FAIL, `HTTP ${r.status}`);
  } catch (e) {
    record("Supabase Auth", FAIL, String(e.message || e));
  }

  try {
    const r = await timedFetch(`${url}/rest/v1/exam_tracks?select=id&limit=1`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    });
    record("Supabase REST", r.ok ? OK : FAIL, `HTTP ${r.status}`);
  } catch (e) {
    record("Supabase REST", FAIL, String(e.message || e));
  }

  const svc = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  record("Supabase service role", svc ? OK : MISSING,
    svc ? `present (${svc.length} chars)` : "SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY not set — grading and onboarding submit will fail closed");
}

/* ── 2. Groq (AI) ─────────────────────────────────────────────────────────── */
async function checkGroq() {
  const key = env.GROQ_API_KEY;
  if (!key) { record("Groq (AI)", MISSING, "GROQ_API_KEY not set"); return; }
  try {
    const r = await timedFetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    record("Groq (AI)", r.ok ? OK : FAIL,
      r.ok ? `HTTP 200` : `HTTP ${r.status} — key may be revoked`);
  } catch (e) {
    record("Groq (AI)", FAIL, String(e.message || e));
  }
}

/* ── 3. Resend (email) ────────────────────────────────────────────────────── */
async function checkResend() {
  const key = env.RESEND_API_KEY;
  if (!key) { record("Resend (email)", MISSING, "RESEND_API_KEY not set", false); return; }
  try {
    const r = await timedFetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
    });
    record("Resend (email)", r.status === 200 || r.status === 401 ? (r.status === 200 ? OK : FAIL) : WARN,
      `HTTP ${r.status}`, false);
  } catch (e) {
    record("Resend (email)", FAIL, String(e.message || e), false);
  }
}

/* ── 4. Optional content APIs ─────────────────────────────────────────────── */
function checkOptionalKeys() {
  record("Supadata (transcripts)", env.SUPADATA_API_KEY ? OK : MISSING,
    env.SUPADATA_API_KEY ? "present" : "SUPADATA_API_KEY not set — YouTube transcripts unavailable", false);
  record("YouTube Data API", env.YOUTUBE_API_KEY ? OK : MISSING,
    env.YOUTUBE_API_KEY ? "present" : "YOUTUBE_API_KEY not set — falls back to public oEmbed", false);
  record("Government env (health)", env.VITE_GOV_HEALTH_URL ? OK : MISSING,
    env.VITE_GOV_HEALTH_URL ? env.VITE_GOV_HEALTH_URL : "VITE_GOV_HEALTH_URL not set — health check reports 'not configured'", false);
}

/* ── 5. Onboarding endpoints ──────────────────────────────────────────────── */
async function checkOnboarding() {
  for (const type of ["NEET", "GENERAL"]) {
    try {
      const r = await timedFetch(`${BASE}/api/onboarding-questions/${type}`);
      if (!r.ok) { record(`GET /api/onboarding-questions/${type}`, FAIL, `HTTP ${r.status}`); continue; }
      const body = await r.json();
      const ok = body.flowType === type && Array.isArray(body.questions) && body.questions.length > 0;
      record(`GET /api/onboarding-questions/${type}`, ok ? OK : FAIL,
        ok ? `${body.questions.length} questions` : "unexpected payload shape");
    } catch (e) {
      record(`GET /api/onboarding-questions/${type}`, FAIL, String(e.message || e));
    }
  }

  try {
    const r = await timedFetch(`${BASE}/api/onboarding-questions/BOGUS`);
    record("Unknown flow type rejected", r.status === 404 ? OK : FAIL, `HTTP ${r.status} (expected 404)`);
  } catch (e) {
    record("Unknown flow type rejected", FAIL, String(e.message || e));
  }

  // Must NOT accept an unauthenticated submit.
  try {
    const r = await timedFetch(`${BASE}/api/onboarding/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flowType: "NEET", answers: {} }),
    });
    const closed = r.status === 401 || r.status === 503;
    record("Submit rejects unauthenticated", closed ? OK : FAIL,
      `HTTP ${r.status} (expected 401, or 503 when server creds are absent)`);
  } catch (e) {
    record("Submit rejects unauthenticated", FAIL, String(e.message || e));
  }
}

/* ── Run ──────────────────────────────────────────────────────────────────── */
console.log(`\nVerifying integrations against ${BASE}\n`);

await checkSupabase();
await checkGroq();
await checkResend();
checkOptionalKeys();
await checkOnboarding();

const pad = Math.max(...results.map((r) => r.name.length));
let hardFailures = 0;

for (const r of results) {
  const mark = r.status === OK ? "PASS" : r.status === MISSING ? (r.required ? "MISS" : "skip") : "FAIL";
  if (r.status === FAIL && r.required) hardFailures++;
  if (r.status === MISSING && r.required) hardFailures++;
  console.log(`  ${mark}  ${r.name.padEnd(pad)}  ${r.status}${r.detail ? " — " + r.detail : ""}`);
}

console.log(
  `\n${results.filter((r) => r.status === OK).length}/${results.length} checks OK` +
  (hardFailures ? `, ${hardFailures} required failure(s)` : "")
);

// Optional integrations never fail the run; only required ones do.
process.exit(hardFailures === 0 ? 0 : 1);
