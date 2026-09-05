/**
 * AUTHENTICATED END-TO-END CHECK
 * ==============================
 *   node tests/e2e-authenticated.mjs [--base http://localhost:5000]
 *
 * Exercises the half of the application that unit tests and the integration
 * check cannot reach: the endpoints that require a real signed-in user.
 *
 * Creates a throwaway account with the service-role key, signs in as it to get
 * a genuine JWT, drives the real endpoints with that token, then DELETES the
 * account. Every user-owned table references auth.users(id) ON DELETE CASCADE,
 * so removing the account removes everything it created.
 *
 * The cleanup runs in a `finally` block and its result is reported, because a
 * test that leaves debris in a production database is worse than no test.
 */
import { readFileSync, existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env", ".env.local"]) {
    const p = resolve(ROOT, file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
      if (!m) continue;
      const v = m[2].trim().replace(/^["']|["']$/g, "");
      if (v) env[m[1]] = v;
    }
  }
  return env;
}

const env = loadEnv();
const i = process.argv.indexOf("--base");
const BASE = i !== -1 ? process.argv[i + 1] : "http://localhost:5000";

const URL_ = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;

if (!URL_ || !ANON || !SERVICE) {
  console.error("Missing SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

// Recognisable, unique, and obviously disposable if cleanup ever fails.
const stamp = Date.now();
const TEST_EMAIL = `e2e-check-${stamp}@studybuddy-e2e.invalid`;
const TEST_PASSWORD = `E2e!${stamp}aA`;

let userId = null;

async function api(path, { method = "POST", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* some routes return no body */ }
  return { status: res.status, json };
}

try {
  /* ── Create and sign in ────────────────────────────────────────────── */
  console.log(`\n=== throwaway account ===`);
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  check("account created", !createErr && !!created?.user?.id, createErr?.message ?? "");
  userId = created?.user?.id ?? null;
  if (!userId) throw new Error("cannot continue without a test user");

  const anonClient = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: session, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: TEST_EMAIL, password: TEST_PASSWORD,
  });
  const token = session?.session?.access_token ?? null;
  check("signed in, JWT issued", !signInErr && !!token, signInErr?.message ?? "");
  if (!token) throw new Error("cannot continue without a token");

  /* ── Auth boundary ─────────────────────────────────────────────────── */
  console.log(`\n=== auth boundary ===`);
  check("submit rejects no token",
    (await api("/api/onboarding/submit", { body: { flowType: "GATE", answers: {} } })).status === 401);
  check("submit rejects a garbage token",
    (await api("/api/onboarding/submit", { token: "not-a-jwt", body: { flowType: "GATE", answers: {} } })).status === 401);
  check("grade rejects no token",
    (await api("/api/grade", { body: { answers: [] } })).status === 401);

  /* ── Guardian consent, enforced server-side ────────────────────────── */
  console.log(`\n=== guardian consent (DPDP) ===`);
  const gateAnswers = {
    candidateStage: "Final year", attemptNumber: "First",
    targetGoal: "PSU recruitment", targetScore: 750,
    weakSubjects: ["Engineering Mathematics"],
    preparationMode: "Self-study", studyHoursPerDay: "4-6",
  };

  // A minor with no guardian block must be refused, even though the client
  // could simply not render those fields.
  const minorNoGuardian = await api("/api/onboarding/submit", {
    token,
    body: { flowType: "GATE", answers: gateAnswers, examTrackId: "gate-cs",
            targetExamDate: null, dateOfBirth: "2012-05-10", guardian: null },
  });
  check("minor without guardian is rejected", minorNoGuardian.status === 422,
    `HTTP ${minorNoGuardian.status}`);

  // Missing date of birth must fail closed, not be treated as an adult.
  const noDob = await api("/api/onboarding/submit", {
    token,
    body: { flowType: "GATE", answers: gateAnswers, examTrackId: "gate-cs",
            targetExamDate: null, dateOfBirth: null, guardian: null },
  });
  check("missing date of birth is rejected", noDob.status === 422, `HTTP ${noDob.status}`);

  const minorOk = await api("/api/onboarding/submit", {
    token,
    body: {
      flowType: "GATE", answers: gateAnswers, examTrackId: "gate-cs",
      targetExamDate: "2027-02-06", dateOfBirth: "2012-05-10",
      guardian: {
        guardianName: "Test Guardian", guardianEmail: "guardian@studybuddy-e2e.invalid",
        guardianRelationship: "Mother", guardianConsentConfirmed: true,
      },
    },
  });
  check("minor WITH guardian is accepted", minorOk.status === 200, `HTTP ${minorOk.status} ${JSON.stringify(minorOk.json)}`);
  check("response reports minor status", minorOk.json?.minor === true);

  const { data: consentRow } = await admin
    .from("guardian_consents").select("*").eq("user_id", userId).maybeSingle();
  check("consent row written", !!consentRow);
  check("consent stores the policy version", !!consentRow?.policy_version);
  check("verified_at is NULL (declaration, not verification)", consentRow?.verified_at === null);
  check("guardian email stored", consentRow?.guardian_email === "guardian@studybuddy-e2e.invalid");

  /* ── Onboarding persisted where the app reads it ───────────────────── */
  console.log(`\n=== onboarding persistence ===`);
  const { data: prof } = await admin
    .from("profiles").select("exam_track_id, target_exam_date, date_of_birth, onboarding_completed")
    .eq("id", userId).maybeSingle();
  check("onboarding marked complete", prof?.onboarding_completed === true);
  check("exam track written to profile", prof?.exam_track_id === "gate-cs", String(prof?.exam_track_id));
  check("target exam date written", prof?.target_exam_date === "2027-02-06", String(prof?.target_exam_date));
  check("date of birth written", prof?.date_of_birth === "2012-05-10", String(prof?.date_of_birth));

  const { data: prefs } = await admin
    .from("user_preferences").select("onboarding_flow_type, onboarding_payload")
    .eq("user_id", userId).maybeSingle();
  check("flow type recorded", prefs?.onboarding_flow_type === "GATE");
  check("answers stored as payload", !!prefs?.onboarding_payload?.targetGoal);

  // A payload whose declared flow does not match its shape must be refused.
  const wrongFlow = await api("/api/onboarding/submit", {
    token,
    body: { flowType: "NEET", answers: gateAnswers, examTrackId: "neet",
            targetExamDate: null, dateOfBirth: "1998-01-01", guardian: null },
  });
  check("mismatched flow/answers rejected", wrongFlow.status === 422, `HTTP ${wrongFlow.status}`);

  /* ── Grading ───────────────────────────────────────────────────────── */
  console.log(`\n=== grading ===`);
  const { data: qs } = await admin
    .from("questions").select("id, exam_track_id")
    .eq("exam_track_id", "gate-cs").eq("status", "published").limit(3);
  check("questions available to grade", (qs?.length ?? 0) === 3, String(qs?.length));

  const { data: keys } = await admin
    .from("question_answers").select("question_id, correct_answer")
    .in("question_id", qs.map((q) => q.id));
  const keyById = new Map(keys.map((k) => [k.question_id, k.correct_answer]));

  // Two right, one deliberately wrong, so the score is a real computation.
  const answers = qs.map((q, idx) => ({
    questionId: q.id,
    selectedAnswer: idx === 2
      ? (keyById.get(q.id) === "a" ? "b" : "a")
      : keyById.get(q.id),
    timeTakenMs: 5000,
  }));

  const graded = await api("/api/grade", { token, body: { answers, source: "practice" } });
  check("grade returns 200", graded.status === 200, `HTTP ${graded.status} ${JSON.stringify(graded.json)}`);
  check("scored 2 of 3 correct", graded.json?.correct === 2,
    `correct=${graded.json?.correct}`);
  check("per-question results returned", Array.isArray(graded.json?.results) && graded.json.results.length === 3);

  /* ── Public grading leaks no key ───────────────────────────────────── */
  console.log(`\n=== public grading (anonymous) ===`);
  const pub = await api("/api/public-grade", { body: { answers } });
  check("public-grade returns 200", pub.status === 200, `HTTP ${pub.status}`);
  const pubText = JSON.stringify(pub.json ?? {});
  check("returns per-topic aggregates", Array.isArray(pub.json?.perTopic) || !!pub.json?.perTopic);
  // The oracle test: an anonymous caller must not learn WHICH answers were right.
  check("does NOT return per-question correctness",
    !/"isCorrect"|"correctAnswer"/.test(pubText), pubText.slice(0, 160));

  /* ── AI proxy ──────────────────────────────────────────────────────── */
  console.log(`\n=== AI proxy ===`);
  const ai = await api("/api/groq", {
    token,
    body: { messages: [{ role: "user", content: "Reply with the single word: ok" }], max_tokens: 8 },
  });
  check("groq proxy responds", ai.status === 200 || ai.status === 400, `HTTP ${ai.status} ${JSON.stringify(ai.json).slice(0,140)}`);

} catch (err) {
  fail++;
  console.log(`\n  FAIL  unexpected error: ${err.message}`);
} finally {
  /* ── Cleanup, always ───────────────────────────────────────────────── */
  console.log(`\n=== cleanup ===`);
  if (userId) {
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    check("test account deleted", !delErr, delErr?.message ?? "");

    const { data: leftoverProfile } = await admin
      .from("profiles").select("id").eq("id", userId).maybeSingle();
    check("profile cascade-deleted", !leftoverProfile);

    const { data: leftoverConsent } = await admin
      .from("guardian_consents").select("id").eq("user_id", userId).maybeSingle();
    check("guardian consent cascade-deleted", !leftoverConsent);
  } else {
    console.log("  ----  nothing to clean up");
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
