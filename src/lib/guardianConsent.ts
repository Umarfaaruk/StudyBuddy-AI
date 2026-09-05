/**
 * GUARDIAN CONSENT — CLIENT MIRROR
 * ================================
 * Mirrors the age rules in api/_guardianConsent.js so the onboarding form knows
 * whether to show the guardian fields.
 *
 * THIS IS A UI CONCERN, NOT A SECURITY BOUNDARY. The server recomputes whether
 * the user is a minor from the submitted date of birth and rejects a payload
 * that omits guardian details for a child. Editing this file, or the shipped
 * bundle, changes which fields are DRAWN — never what is accepted or stored.
 *
 * Duplicated only because api/ is plain ESM .js that a .ts module cannot import
 * at runtime. tests/unit/guardianConsent.test.mjs compares the two
 * implementations across a range of dates, so a divergence fails the suite
 * rather than silently showing the wrong form.
 */

/** Must equal MINOR_AGE in api/_guardianConsent.js. */
export const MINOR_AGE = 18;

export type GuardianRelationship = "Mother" | "Father" | "Legal guardian";

export const GUARDIAN_RELATIONSHIPS: GuardianRelationship[] = [
  "Mother",
  "Father",
  "Legal guardian",
];

export interface GuardianDetails {
  guardianName: string;
  guardianEmail: string;
  guardianRelationship: GuardianRelationship | "";
  guardianConsentConfirmed: boolean;
}

export const emptyGuardian = (): GuardianDetails => ({
  guardianName: "",
  guardianEmail: "",
  guardianRelationship: "",
  guardianConsentConfirmed: false,
});

/**
 * Whole years old on a given date.
 *
 * UTC parts, not millisecond division: a ms-based age is wrong across leap
 * years, and reading local time can shift a birthday by a day depending on the
 * device's timezone. Someone turning 18 today is 18, not 17.
 */
export function ageOn(dateOfBirth: string | Date, asOf: string | Date = new Date()): number | null {
  const dob = dateOfBirth instanceof Date ? dateOfBirth : new Date(`${dateOfBirth}T00:00:00Z`);
  const now = asOf instanceof Date ? asOf : new Date(`${asOf}T00:00:00Z`);
  if (Number.isNaN(dob.getTime()) || Number.isNaN(now.getTime())) return null;

  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

/**
 * Whether a guardian's consent is required.
 *
 * Unknown or unparseable age returns true — fail closed, matching the server.
 * Treating "we don't know" as "adult" would let the check be skipped by leaving
 * the field blank.
 */
export function isMinor(
  dateOfBirth: string | Date | null | undefined,
  asOf: string | Date = new Date()
): boolean {
  if (!dateOfBirth) return true;
  const age = ageOn(dateOfBirth, asOf);
  if (age === null) return true;
  return age < MINOR_AGE;
}

/** Obviously-wrong dates, caught before the request is sent. */
export function dateOfBirthIssue(
  dateOfBirth: string | Date | null | undefined,
  asOf: string | Date = new Date()
): string | null {
  if (!dateOfBirth) return "Enter your date of birth.";
  const age = ageOn(dateOfBirth, asOf);
  if (age === null) return "Enter a valid date of birth.";
  if (age < 0) return "Date of birth cannot be in the future.";
  if (age > 120) return "Enter a valid date of birth.";
  return null;
}

/** Field-level problems with the guardian block, keyed for inline display. */
export function guardianIssues(g: GuardianDetails): Record<string, string> {
  const issues: Record<string, string> = {};
  if (g.guardianName.trim().length < 2) {
    issues.guardianName = "Enter your parent or guardian's full name.";
  }
  // Deliberately permissive: the server holds the authoritative check, and an
  // over-strict client pattern rejects valid addresses.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.guardianEmail.trim())) {
    issues.guardianEmail = "Enter a valid email address.";
  }
  if (!g.guardianRelationship) {
    issues.guardianRelationship = "Select the relationship.";
  }
  if (!g.guardianConsentConfirmed) {
    issues.guardianConsentConfirmed =
      "Your parent or guardian must agree before you can continue.";
  }
  return issues;
}

/** Whether the age step is complete enough to move on. */
export function consentStepComplete(
  dateOfBirth: string,
  guardian: GuardianDetails,
  asOf: string | Date = new Date()
): boolean {
  if (dateOfBirthIssue(dateOfBirth, asOf)) return false;
  if (!isMinor(dateOfBirth, asOf)) return true;
  return Object.keys(guardianIssues(guardian)).length === 0;
}
