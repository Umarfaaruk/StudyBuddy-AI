/**
 * EXAM-PREP COPY
 * ==============
 * Every user-facing string that carries the exam-prep positioning lives here,
 * so repositioning the product is an edit to ONE file rather than a hunt across
 * forty components.
 *
 * You said you'd supply final copy separately — this is the structure to drop
 * it into. Replace the values; leave the keys alone and every screen updates.
 *
 * Conventions:
 *   • `{exam}` in a template is replaced with the student's track name
 *     ("JEE Main", "NEET") via `fillCopy`. Anything with a placeholder is a
 *     function, not a bare string, so TypeScript reminds you to pass the value.
 *   • Nothing here reads from the database. Keep it that way: this file should
 *     stay importable from anywhere, including prerendered marketing pages that
 *     have no Supabase session (Phase 4).
 */

/** Replace `{exam}` and any other `{token}` placeholders. */
export function fillCopy(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match
  );
}

/** Shown before a student has picked a track — must stay exam-agnostic. */
export const GENERIC_EXAM_LABEL = "your exam";

export const landingCopy = {
  eyebrow: "JEE, NEET & GATE PREPARATION",
  headline: "Crack {exam} with a tutor that knows your weak spots.",
  headlineGeneric: "Crack JEE, NEET & GATE with a tutor that knows your weak spots.",
  subheadline:
    "Diagnostic-led practice, syllabus-grounded answers, and a study plan built around your exam date — not generic tutoring.",
  primaryCta: "Take the free diagnostic",
  secondaryCta: "Log in",
  trustBadges: [
    "Free to start",
    "No credit card",
    "Built on the official syllabus",
  ],
} as const;

export const authCopy = {
  loginHeadline: "Back to your prep.",
  loginSubheadline:
    "Your study plan, weak-topic drills and revision queue are waiting.",
  loginBullets: [
    "Answers grounded in the official syllabus",
    "Practice targeted at your weakest chapters",
    "Daily streaks that keep the schedule honest",
  ],
  signupHeadline: "Start preparing properly.",
  signupSubheadline:
    "Pick your exam, take a short diagnostic, and get a plan built around your target date.",
  signupBullets: [
    "Know exactly which chapters are costing you marks",
    "Revision scheduled by performance, not by calendar",
    "Track progress against your exam date",
  ],
} as const;

export const onboardingCopy = {
  examStageTitle: "Your Exam",
  examStageSubtitle: "Everything is built around this choice",
  examPickerLabel: "Which exam are you preparing for?",
  examPickerHelp:
    "This sets your syllabus, question bank and the style of every answer you get.",
  examDateLabel: "When is your exam?",
  examDateHelp:
    "An approximate date is fine — it drives how your study plan is paced. You can change it later.",
  examDateMissing: "I don't know the date yet",
} as const;

export const dashboardCopy = {
  /** Greeting above the countdown. */
  greeting: (name: string) => `Hi ${name}`,
  countdownLabel: (days: number) =>
    days > 1
      ? `${days} days to {exam}`
      : days === 1
        ? "1 day to {exam}"
        : days === 0
          ? "{exam} is today"
          : "Exam date passed",
  countdownUrgent: 30, // below this many days the countdown styles as urgent
  noExamSet: "Pick your exam to unlock a syllabus-based plan",
  noExamCta: "Choose exam",
} as const;

/**
 * Resolve the exam name for display, falling back to a neutral phrase when the
 * student hasn't chosen a track yet. Prevents "Crack undefined" style bugs.
 */
export function examLabel(trackName: string | null | undefined): string {
  return trackName?.trim() || GENERIC_EXAM_LABEL;
}
