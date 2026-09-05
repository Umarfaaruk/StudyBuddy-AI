/**
 * GUARDIAN CONSENT RULES  (DPDP Act 2023)
 * =======================================
 * Server-side authority for "is this user a child" and for validating the
 * guardian block submitted at onboarding.
 *
 * Plain .js with a sibling .d.ts, matching _onboardingSchemas.js and
 * _verifyToken.js: package.json is "type": "module", so Node's ESM loader needs
 * a real runtime file and cannot import a .ts across the api/ boundary.
 *
 * THE CLIENT DOES NOT DECIDE WHO IS A MINOR. src/lib/guardianConsent.ts mirrors
 * ageOn() so the form knows whether to show the guardian fields, but the server
 * recomputes it here from the submitted date of birth and rejects a payload
 * that omits guardian details for a minor. A student who edits the client
 * bundle changes what they SEE, not what is stored.
 */
import { z } from "zod";

/** Under this age, a guardian must consent. 18 is the DPDP Act threshold. */
export const MINOR_AGE = 18;

/**
 * The privacy policy version being consented to.
 *
 * Consent is to a specific text, not to the abstract idea of a policy. Bump
 * this whenever LAST_UPDATED in src/pages/legal/LegalLayout.tsx changes, so
 * existing records still say what was actually agreed.
 */
export const POLICY_VERSION = "2026-09-05";

/**
 * Whole years old on a given date.
 *
 * Uses UTC date parts rather than millisecond arithmetic: a difference in
 * milliseconds divided by a year length is wrong across leap years, and a
 * local-time reading can shift someone's birthday by a day depending on the
 * device timezone. Someone turning 18 today is 18, not 17.
 */
export function ageOn(dateOfBirth, asOf = new Date()) {
  const dob = dateOfBirth instanceof Date ? dateOfBirth : new Date(`${dateOfBirth}T00:00:00Z`);
  const now = asOf instanceof Date ? asOf : new Date(`${asOf}T00:00:00Z`);
  if (Number.isNaN(dob.getTime()) || Number.isNaN(now.getTime())) return null;

  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  // Birthday has not arrived yet this year.
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

/**
 * Whether a guardian's consent is required.
 *
 * An UNPARSEABLE or MISSING date of birth returns true — fail closed. Treating
 * "we do not know how old this user is" as "adult" would let the entire
 * protection be bypassed by omitting a field.
 */
export function isMinor(dateOfBirth, asOf = new Date()) {
  const age = ageOn(dateOfBirth, asOf);
  if (age === null) return true;
  return age < MINOR_AGE;
}

/** Obviously-wrong dates, rejected before they reach the database. */
export function dateOfBirthIssue(dateOfBirth, asOf = new Date()) {
  const age = ageOn(dateOfBirth, asOf);
  if (age === null) return "Enter a valid date of birth.";
  if (age < 0) return "Date of birth cannot be in the future.";
  if (age > 120) return "Enter a valid date of birth.";
  return null;
}

const guardianSchema = z.object({
  guardianName: z.string().trim().min(2, "Enter your parent or guardian's full name.").max(120),
  guardianEmail: z.string().trim().email("Enter a valid email address.").max(200),
  guardianRelationship: z.enum(["Mother", "Father", "Legal guardian"], {
    errorMap: () => ({ message: "Select the relationship." }),
  }),
  // Must be an explicit affirmation. A default-true checkbox is not consent.
  guardianConsentConfirmed: z.literal(true, {
    errorMap: () => ({ message: "Your parent or guardian must agree before you can continue." }),
  }),
});

/**
 * Validate the whole age/consent block.
 *
 * Returns { ok, data } or { ok: false, issues: [{ path, message }] } — the same
 * shape validateSubmission() uses, so the client can render both identically.
 */
export function validateConsentBlock(input, asOf = new Date()) {
  const issues = [];
  const dob = input?.dateOfBirth;

  const dobIssue = dateOfBirthIssue(dob, asOf);
  if (dobIssue) {
    return { ok: false, issues: [{ path: "dateOfBirth", message: dobIssue }] };
  }

  // An adult needs no guardian: this is a PASS, not a failure.
  if (!isMinor(dob, asOf)) {
    return { ok: true, data: { dateOfBirth: dob, minor: false, guardian: null } };
  }

  const parsed = guardianSchema.safeParse(input?.guardian ?? {});
  if (!parsed.success) {
    for (const err of parsed.error.errors) {
      issues.push({ path: `guardian.${err.path.join(".")}`, message: err.message });
    }
    return { ok: false, issues };
  }

  return {
    ok: true,
    data: { dateOfBirth: dob, minor: true, guardian: parsed.data },
  };
}
