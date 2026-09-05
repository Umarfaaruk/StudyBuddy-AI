/**
 * POST /api/onboarding/submit
 * ===========================
 * Validates an onboarding submission against the schema for its declared flow
 * and persists it.
 *
 * The server re-validates rather than trusting the client's own check. Client
 * validation exists to give fast feedback; it is not a security boundary, since
 * anyone can POST here directly.
 *
 * Requires authentication and takes the user id from the VERIFIED TOKEN, never
 * from the body — accepting a user id from the payload would let any caller
 * overwrite another student's profile.
 */
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../_verifyToken.js";
import { validateSubmission, FLOW_TYPES } from "../_onboardingSchemas.js";
import { validateConsentBlock, POLICY_VERSION } from "../_guardianConsent.js";

function getDb() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const caller = await requireAuth(req, res);
  if (!caller) return;
  if (caller.unverified) {
    // Fails CLOSED: this writes durable profile data, so unlike the AI proxy it
    // must not serve a caller it cannot identify.
    return res.status(503).json({
      error: "Onboarding is unavailable: the server is missing Supabase credentials.",
    });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON body" }); }
  }

  const flowType: string = body?.flowType;
  const answers: Record<string, unknown> = body?.answers ?? {};
  const examTrackId: string | null = body?.examTrackId ?? null;
  const targetExamDate: string | null = body?.targetExamDate ?? null;
  const dateOfBirth: string | null = body?.dateOfBirth ?? null;
  const guardian = body?.guardian ?? null;

  if (!flowType) {
    return res.status(400).json({ error: "flowType is required", validTypes: FLOW_TYPES });
  }

  // Age and guardian consent are checked BEFORE the flow answers, and the
  // server recomputes whether the user is a minor from the submitted date of
  // birth rather than trusting a flag. A student who edits the client bundle to
  // hide the guardian fields changes what they see, not what is accepted.
  //
  // Fails closed on a missing or unparseable date of birth: isMinor() treats
  // "unknown age" as a child, so omitting the field cannot bypass the check.
  const consent = validateConsentBlock({ dateOfBirth, guardian });
  if (!consent.ok) {
    return res.status(422).json({
      error: "Age or guardian details are missing or invalid.",
      issues: consent.issues,
    });
  }

  // Validate the flow BEFORE saving, as required: a payload whose declared flow
  // does not match its shape is rejected rather than half-written.
  const result = validateSubmission(flowType, { ...answers, flowType });
  if (!result.ok) {
    return res.status(422).json({
      error: result.error ?? "Validation failed",
      issues: result.issues,
    });
  }

  try {
    const db = getDb();
    const validated = result.data as Record<string, unknown>;

    // Answers live in user_preferences.onboarding_payload as JSONB rather than
    // one column per question: the whole point of a flow registry is that a new
    // flow needs no migration, and a column-per-question model would defeat it.
    const { error } = await db
      .from("user_preferences")
      .upsert({
        user_id: caller.uid,
        onboarding_flow_type: flowType.toUpperCase(),
        exam_track_id_at_onboarding: examTrackId,
        onboarding_payload: validated,
        onboarding_version: 4,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    if (error) throw error;

    // Mark onboarding complete only after the answers are safely stored, so a
    // failed write never leaves a student flagged as onboarded with no data.
    //
    // exam_track_id is written HERE and not left to a later screen: the
    // diagnostic, exam countdown, RAG grounding and mock tests all key off it,
    // and a student who finishes onboarding without one lands on a dashboard
    // where every exam feature reports "pick your exam".
    const profileUpdate: Record<string, unknown> = {
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    };
    if (examTrackId) profileUpdate.exam_track_id = examTrackId;
    // Empty string would fail the date column; null is the "not known yet" value.
    if (targetExamDate) profileUpdate.target_exam_date = targetExamDate;
    if (consent.data?.dateOfBirth) profileUpdate.date_of_birth = consent.data.dateOfBirth;

    const { error: profileError } = await db
      .from("profiles")
      .update(profileUpdate)
      .eq("id", caller.uid);
    if (profileError) throw profileError;

    // Record the guardian's consent for a minor.
    //
    // Written LAST and with the service role, because guardian_consents has no
    // INSERT policy for `authenticated` at all — a student cannot forge a
    // consent record for themselves, only receive one written on their behalf
    // here after the server has agreed they need it.
    //
    // verified_at is deliberately left NULL. What is stored is the student's
    // DECLARATION that a guardian agreed, which is not the same as the guardian
    // confirming it. The out-of-band confirmation step (emailing
    // verification_token to guardian_email) is not implemented yet, and calling
    // this "verified" would make the record claim more than it knows.
    if (consent.data?.minor && consent.data.guardian) {
      const g = consent.data.guardian;
      const { error: consentError } = await db
        .from("guardian_consents")
        .upsert({
          user_id: caller.uid,
          guardian_name: g.guardianName,
          guardian_email: g.guardianEmail,
          guardian_relationship: g.guardianRelationship,
          student_date_of_birth: consent.data.dateOfBirth,
          policy_version: POLICY_VERSION,
          declared_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      // Hard failure: a minor's record must not be left without its consent row.
      if (consentError) throw consentError;
    }

    return res.status(200).json({
      ok: true,
      flowType: flowType.toUpperCase(),
      minor: consent.data?.minor ?? false,
    });
  } catch (err: any) {
    console.error("[onboarding/submit] failed:", err?.message ?? err);
    return res.status(500).json({ error: "Could not save your answers. Please try again." });
  }
}
