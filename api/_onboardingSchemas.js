/**
 * ONBOARDING SCHEMA REGISTRY
 * ==========================
 * Canonical definition of every onboarding flow: the questions, their field
 * types, and the Zod schema that validates the submitted answers.
 *
 * SERVER-SIDE and authoritative. The client does not keep its own copy — it
 * fetches these definitions from GET /api/onboarding-questions/:type and derives
 * its form and its client-side validation from them. Two hand-maintained copies
 * of a validation schema drift, and when they drift the client accepts data the
 * server then rejects, which surfaces to a student as a form that silently
 * refuses to submit.
 *
 * Plain .js with a sibling .d.ts, matching _verifyToken.js and
 * _spacedRepetition.js: package.json is "type": "module", so Node's ESM loader
 * needs a real runtime file with an explicit extension. A .ts file imported
 * from an API route fails with ERR_MODULE_NOT_FOUND.
 */
import { z } from "zod";

export const FLOW_TYPES = ["NEET", "GENERAL"];

/** Shared across flows — every submission carries these. */
const baseSchema = {
  flowType: z.enum(["NEET", "GENERAL"]),
};

/* ── NEET: academic background and exam preparation ───────────────────────── */

const NEET_QUESTIONS = [
  {
    id: "currentClass",
    label: "Which class are you in?",
    type: "single_select",
    required: true,
    options: ["Class 11", "Class 12", "Dropper / Repeater", "Graduate"],
  },
  {
    id: "attemptNumber",
    label: "Which NEET attempt is this?",
    type: "single_select",
    required: true,
    options: ["First", "Second", "Third or later"],
  },
  {
    id: "previousScore",
    label: "Your previous NEET score, if you have one",
    type: "number",
    required: false,
    min: 0,
    max: 720, // NEET is scored out of 720; anything higher is a typo.
    help: "Out of 720. Leave blank if this is your first attempt.",
  },
  {
    id: "targetScore",
    label: "What score are you aiming for?",
    type: "number",
    required: true,
    min: 0,
    max: 720,
  },
  {
    id: "weakSubjects",
    label: "Which subjects worry you most?",
    type: "multi_select",
    required: true,
    minSelected: 1,
    options: ["Physics", "Chemistry", "Botany", "Zoology"],
  },
  {
    id: "coachingStatus",
    label: "Are you attending coaching?",
    type: "single_select",
    required: true,
    options: ["Full-time coaching", "Online coaching", "Self-study only", "School only"],
  },
  {
    id: "studyHoursPerDay",
    label: "How many hours can you study each day?",
    type: "single_select",
    required: true,
    options: ["Less than 2", "2-4", "4-6", "6-8", "More than 8"],
  },
  {
    id: "biggestChallenge",
    label: "What gets in the way most?",
    type: "textarea",
    required: false,
    maxLength: 500,
  },
];

const neetSchema = z.object({
  ...baseSchema,
  flowType: z.literal("NEET"),
  currentClass: z.enum(["Class 11", "Class 12", "Dropper / Repeater", "Graduate"]),
  attemptNumber: z.enum(["First", "Second", "Third or later"]),
  // Nullable rather than merely optional: an empty form field posts null, and
  // a schema that only allows `undefined` rejects it.
  previousScore: z.number().int().min(0).max(720).nullable().optional(),
  targetScore: z.number().int().min(0).max(720),
  weakSubjects: z.array(z.enum(["Physics", "Chemistry", "Botany", "Zoology"])).min(1),
  coachingStatus: z.enum([
    "Full-time coaching", "Online coaching", "Self-study only", "School only",
  ]),
  studyHoursPerDay: z.enum(["Less than 2", "2-4", "4-6", "6-8", "More than 8"]),
  biggestChallenge: z.string().max(500).nullable().optional(),
});

/* ── GENERAL: standard profile building ───────────────────────────────────── */

const GENERAL_QUESTIONS = [
  {
    id: "learnerType",
    label: "Which best describes you?",
    type: "single_select",
    required: true,
    options: ["School student", "College student", "Working professional", "Self-learner"],
  },
  {
    id: "primaryGoal",
    label: "What are you here to do?",
    type: "single_select",
    required: true,
    options: ["Pass an exam", "Learn a new skill", "Improve grades", "Build a study habit"],
  },
  {
    id: "subjectsOfInterest",
    label: "What do you want to study?",
    type: "multi_select",
    required: true,
    minSelected: 1,
    options: ["Mathematics", "Physics", "Chemistry", "Biology", "Computer Science", "Other"],
  },
  {
    id: "studyHoursPerDay",
    label: "How many hours can you study each day?",
    type: "single_select",
    required: true,
    options: ["Less than 1", "1-2", "2-4", "More than 4"],
  },
  {
    id: "preferredFormat",
    label: "How do you learn best?",
    type: "single_select",
    required: true,
    options: ["Video", "Reading", "Practice questions", "A mix"],
  },
  {
    id: "motivation",
    label: "Anything else we should know?",
    type: "textarea",
    required: false,
    maxLength: 500,
  },
];

const generalSchema = z.object({
  ...baseSchema,
  flowType: z.literal("GENERAL"),
  learnerType: z.enum([
    "School student", "College student", "Working professional", "Self-learner",
  ]),
  primaryGoal: z.enum([
    "Pass an exam", "Learn a new skill", "Improve grades", "Build a study habit",
  ]),
  subjectsOfInterest: z.array(z.enum([
    "Mathematics", "Physics", "Chemistry", "Biology", "Computer Science", "Other",
  ])).min(1),
  studyHoursPerDay: z.enum(["Less than 1", "1-2", "2-4", "More than 4"]),
  preferredFormat: z.enum(["Video", "Reading", "Practice questions", "A mix"]),
  motivation: z.string().max(500).nullable().optional(),
});

/** The registry. Adding a flow means adding one entry here and nothing else. */
export const ONBOARDING_REGISTRY = {
  NEET: {
    flowType: "NEET",
    title: "NEET preparation",
    description: "A few questions about your academic background and exam prep.",
    questions: NEET_QUESTIONS,
    schema: neetSchema,
  },
  GENERAL: {
    flowType: "GENERAL",
    title: "Your profile",
    description: "A few questions so we can tailor what you see.",
    questions: GENERAL_QUESTIONS,
    schema: generalSchema,
  },
};

export function isValidFlowType(value) {
  return typeof value === "string" && FLOW_TYPES.includes(value.toUpperCase());
}

export function getFlow(flowType) {
  if (!isValidFlowType(flowType)) return null;
  return ONBOARDING_REGISTRY[flowType.toUpperCase()] ?? null;
}

/**
 * Validate a submission against the schema for its declared flow.
 *
 * The flowType inside the payload is what selects the schema, and it is checked
 * against the caller-supplied type — a mismatch means the client changed flow
 * without clearing state, which is exactly the corruption the UI guards against.
 */
export function validateSubmission(flowType, payload) {
  const flow = getFlow(flowType);
  if (!flow) {
    return { ok: false, error: `Unknown flow type: ${flowType}`, issues: [] };
  }
  if (payload?.flowType && payload.flowType !== flow.flowType) {
    return {
      ok: false,
      error: `Payload flowType "${payload.flowType}" does not match route type "${flow.flowType}".`,
      issues: [],
    };
  }

  const result = flow.schema.safeParse({ ...payload, flowType: flow.flowType });
  if (!result.success) {
    return {
      ok: false,
      error: "Validation failed",
      issues: result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    };
  }
  return { ok: true, data: result.data, issues: [] };
}
