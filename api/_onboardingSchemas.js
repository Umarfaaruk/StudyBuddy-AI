/**
 * ONBOARDING SCHEMA REGISTRY
 * ==========================
 * Canonical definition of every onboarding flow: the questions, when each is
 * shown, and the Zod schema validating the answers.
 *
 * SERVER-SIDE and authoritative. The client fetches these definitions from
 * GET /api/onboarding-questions/:type and derives its form and its client-side
 * validation from them. Two hand-maintained copies of a validation schema
 * drift, and a drifted client accepts data the server then rejects — which a
 * student experiences as a form that silently refuses to submit.
 *
 * QUESTIONS ADAPT TO THE USER ON TWO AXES:
 *   1. WHICH FLOW — chosen from the student's exam track, so a JEE candidate is
 *      asked about JEE and a NEET candidate about NEET. Mapping lives in
 *      flowTypeForExamTrack().
 *   2. WHICH QUESTIONS WITHIN A FLOW — `showIf` hides questions that cannot
 *      apply. Asking a first-time candidate for their previous score is not
 *      just noise, it invites a fabricated answer.
 *
 * Plain .js with a sibling .d.ts, matching _verifyToken.js: package.json is
 * "type": "module", so Node's ESM loader needs a real runtime file.
 */
import { z } from "zod";

export const FLOW_TYPES = ["JEE", "NEET", "GATE", "GENERAL"];

/**
 * Map an exam track to its onboarding flow.
 *
 * Unknown or absent tracks fall back to GENERAL rather than erroring: a student
 * who has not chosen a track must still be able to onboard, and a new track
 * added to the database before its flow exists degrades to sensible questions
 * instead of a dead end.
 */
export function flowTypeForExamTrack(examTrackId) {
  switch ((examTrackId || "").toLowerCase()) {
    case "jee-main":
    case "jee-advanced":
      return "JEE";
    case "neet":
      return "NEET";
    case "gate-cs":
    case "gate-ec":
    case "gate-ee":
    case "gate-me":
      return "GATE";
    default:
      return "GENERAL";
  }
}

/* ── Shared question fragments ─────────────────────────────────────────────── */

const currentClass = (options) => ({
  id: "currentClass",
  label: "Which class are you in?",
  type: "single_select",
  required: true,
  options,
});

const attemptNumber = (examName) => ({
  id: "attemptNumber",
  label: `Which ${examName} attempt is this?`,
  type: "single_select",
  required: true,
  options: ["First", "Second", "Third or later"],
});

/** Only meaningful once there IS a previous attempt. */
const previousScore = (max, help) => ({
  id: "previousScore",
  label: "What did you score last time?",
  type: "number",
  required: true,
  min: 0,
  max,
  help,
  showIf: { field: "attemptNumber", notEquals: "First" },
});

const coachingStatus = {
  id: "coachingStatus",
  label: "Are you attending coaching?",
  type: "single_select",
  required: true,
  options: ["Full-time coaching", "Online coaching", "Self-study only", "School only"],
};

/** Only asked of students who are actually at a coaching institute. */
const coachingName = {
  id: "coachingName",
  label: "Which institute?",
  type: "text",
  required: false,
  maxLength: 120,
  showIf: { field: "coachingStatus", in: ["Full-time coaching", "Online coaching"] },
};

const studyHours = (options) => ({
  id: "studyHoursPerDay",
  label: "How many hours can you study each day?",
  type: "single_select",
  required: true,
  options,
});

const biggestChallenge = {
  id: "biggestChallenge",
  label: "What gets in the way most?",
  type: "textarea",
  required: false,
  maxLength: 500,
};

/* ── Flow definitions ──────────────────────────────────────────────────────── */

const EXAM_HOURS = ["Less than 2", "2-4", "4-6", "6-8", "More than 8"];

const JEE_QUESTIONS = [
  currentClass(["Class 11", "Class 12", "Dropper / Repeater", "Graduate"]),
  attemptNumber("JEE"),
  previousScore(300, "JEE Main is scored out of 300."),
  {
    id: "targetPercentile",
    label: "What percentile are you aiming for?",
    type: "number",
    required: true,
    min: 0,
    max: 100,
    help: "JEE Main results are reported as a percentile.",
  },
  {
    id: "weakSubjects",
    label: "Which subjects worry you most?",
    type: "multi_select",
    required: true,
    minSelected: 1,
    options: ["Physics", "Chemistry", "Mathematics"],
  },
  {
    id: "targetInstitute",
    label: "What are you aiming for?",
    type: "single_select",
    required: true,
    options: ["IIT (via Advanced)", "NIT", "IIIT", "State / private college", "Not decided"],
  },
  coachingStatus,
  coachingName,
  studyHours(EXAM_HOURS),
  biggestChallenge,
];

const NEET_QUESTIONS = [
  currentClass(["Class 11", "Class 12", "Dropper / Repeater", "Graduate"]),
  attemptNumber("NEET"),
  previousScore(720, "NEET is scored out of 720."),
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
  coachingStatus,
  coachingName,
  studyHours(EXAM_HOURS),
  biggestChallenge,
];

/**
 * GATE differs from school-leaving exams in ways the questions must reflect:
 * candidates are final-year undergraduates or working engineers, the score that
 * matters is a normalised GATE score out of 1000 plus an All India Rank, and
 * the outcome they are chasing is usually a PSU job OR an M.Tech seat — which
 * changes what "doing well" means to them.
 */
const GATE_QUESTIONS = [
  {
    id: "candidateStage",
    label: "Where are you right now?",
    type: "single_select",
    required: true,
    options: [
      "Pre-final year",
      "Final year",
      "Graduated, preparing full-time",
      "Working professional",
    ],
  },
  attemptNumber("GATE"),
  {
    id: "previousScore",
    label: "What was your GATE score last time?",
    type: "number",
    required: true,
    min: 0,
    max: 1000,
    help: "The normalised GATE score, out of 1000.",
    showIf: { field: "attemptNumber", notEquals: "First" },
  },
  {
    id: "targetGoal",
    label: "What are you aiming for?",
    type: "single_select",
    required: true,
    options: ["PSU recruitment", "M.Tech at an IIT", "M.Tech at an NIT", "Research / PhD", "Not decided"],
  },
  {
    id: "targetScore",
    label: "What GATE score are you targeting?",
    type: "number",
    required: true,
    min: 0,
    max: 1000,
  },
  {
    id: "weakSubjects",
    label: "Which areas worry you most?",
    type: "multi_select",
    required: true,
    minSelected: 1,
    // Kept deliberately paper-agnostic so one flow serves CS, ECE and any GATE
    // paper added later without a new registry entry.
    options: [
      "General Aptitude",
      "Engineering Mathematics",
      "Core subjects",
      "Programming / numerical problems",
      "Theory-heavy subjects",
    ],
  },
  {
    id: "preparationMode",
    label: "How are you preparing?",
    type: "single_select",
    required: true,
    options: ["Coaching institute", "Online course", "Self-study", "Alongside a job"],
  },
  {
    // Only asked of the people for whom it is the binding constraint.
    id: "weekdayHours",
    label: "Realistically, how many hours on a working day?",
    type: "single_select",
    required: true,
    options: ["Less than 1", "1-2", "2-3", "More than 3"],
    showIf: { field: "preparationMode", equals: "Alongside a job" },
  },
  studyHours(EXAM_HOURS),
  biggestChallenge,
];

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
    id: "examName",
    label: "Which exam are you preparing for?",
    type: "text",
    required: false,
    maxLength: 120,
    showIf: { field: "primaryGoal", equals: "Pass an exam" },
  },
  {
    id: "subjectsOfInterest",
    label: "What do you want to study?",
    type: "multi_select",
    required: true,
    minSelected: 1,
    options: ["Mathematics", "Physics", "Chemistry", "Biology", "Computer Science", "Other"],
  },
  studyHours(["Less than 1", "1-2", "2-4", "More than 4"]),
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

/* ── Conditional visibility ────────────────────────────────────────────────── */

/**
 * Whether a question should be shown, given the answers so far.
 *
 * Exported and used by BOTH the renderer and the validator, so a field can
 * never be required by the server while hidden in the UI — the failure mode
 * would be a submit button that does nothing, with the offending field
 * invisible on screen.
 */
export function isQuestionVisible(question, answers) {
  const cond = question.showIf;
  if (!cond) return true;
  const actual = answers?.[cond.field];

  if (cond.equals !== undefined) return actual === cond.equals;
  if (cond.notEquals !== undefined) {
    // An unanswered controlling field means the dependent question stays hidden.
    // Treating "not yet answered" as "not equal" would flash the question up
    // before the student has made the choice that governs it.
    return actual !== undefined && actual !== null && actual !== "" && actual !== cond.notEquals;
  }
  if (Array.isArray(cond.in)) return cond.in.includes(actual);
  return true;
}

export function visibleQuestions(questions, answers) {
  return questions.filter((q) => isQuestionVisible(q, answers));
}

/* ── Schema construction ───────────────────────────────────────────────────── */

function fieldSchema(q) {
  switch (q.type) {
    case "single_select":
      return q.options?.length ? z.enum(q.options) : z.string();
    case "multi_select": {
      const item = q.options?.length ? z.enum(q.options) : z.string();
      return z.array(item);
    }
    case "number": {
      let n = z.number().int();
      if (typeof q.min === "number") n = n.min(q.min);
      if (typeof q.max === "number") n = n.max(q.max);
      return n;
    }
    default: {
      let s = z.string();
      if (typeof q.maxLength === "number") s = s.max(q.maxLength);
      return s;
    }
  }
}

/**
 * Build a flow's schema.
 *
 * EVERY field is optional/nullable in the base object, with required-ness
 * enforced in superRefine against the questions actually VISIBLE for the
 * submitted answers. A statically-required conditional field would reject a
 * perfectly valid submission from a first-time candidate who was never shown
 * the "previous score" question.
 */
function buildFlowSchema(flowType, questions) {
  const shape = { flowType: z.literal(flowType) };
  for (const q of questions) {
    shape[q.id] = fieldSchema(q).nullable().optional();
  }

  return z.object(shape).superRefine((data, ctx) => {
    for (const q of visibleQuestions(questions, data)) {
      const v = data[q.id];

      if (q.required) {
        const missing =
          v === undefined || v === null || v === "" ||
          (Array.isArray(v) && v.length === 0);
        if (missing) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [q.id], message: "This field is required" });
          continue;
        }
      }

      if (q.type === "multi_select" && Array.isArray(v)) {
        const min = q.minSelected ?? (q.required ? 1 : 0);
        if (v.length < min) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom, path: [q.id],
            message: `Select at least ${min} option${min === 1 ? "" : "s"}`,
          });
        }
      }
    }

    // A value supplied for a HIDDEN question means the client and server
    // disagree about visibility — usually stale state after a flow or answer
    // switch. Reject rather than silently store an answer to a question the
    // student was never shown.
    for (const q of questions) {
      if (isQuestionVisible(q, data)) continue;
      const v = data[q.id];
      const present = !(v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0));
      if (present) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom, path: [q.id],
          message: "Answer supplied for a question that does not apply",
        });
      }
    }
  });
}

export const ONBOARDING_REGISTRY = {
  JEE: {
    flowType: "JEE",
    title: "JEE preparation",
    description: "A few questions about your background and how you are preparing.",
    questions: JEE_QUESTIONS,
    schema: buildFlowSchema("JEE", JEE_QUESTIONS),
  },
  GATE: {
    flowType: "GATE",
    title: "GATE preparation",
    description: "A few questions about your background and what you are aiming for.",
    questions: GATE_QUESTIONS,
    schema: buildFlowSchema("GATE", GATE_QUESTIONS),
  },
  NEET: {
    flowType: "NEET",
    title: "NEET preparation",
    description: "A few questions about your background and how you are preparing.",
    questions: NEET_QUESTIONS,
    schema: buildFlowSchema("NEET", NEET_QUESTIONS),
  },
  GENERAL: {
    flowType: "GENERAL",
    title: "Your profile",
    description: "A few questions so we can tailor what you see.",
    questions: GENERAL_QUESTIONS,
    schema: buildFlowSchema("GENERAL", GENERAL_QUESTIONS),
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
 * The payload's flowType is checked against the route's — a mismatch means the
 * client changed flow without clearing state, which is exactly the corruption
 * the UI reset guards against.
 */
export function validateSubmission(flowType, payload) {
  const flow = getFlow(flowType);
  if (!flow) {
    return { ok: false, error: `Unknown flow type: ${flowType}`, issues: [] };
  }
  if (payload?.flowType && payload.flowType.toUpperCase() !== flow.flowType) {
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
