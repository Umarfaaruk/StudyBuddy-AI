/**
 * Unit tests for the onboarding schema registry (server-side authority).
 *   node tests/unit/onboarding.test.mjs   (or: npm run test:onboarding)
 */
import { pathToFileURL } from "url";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const mod = await import(pathToFileURL(`${ROOT}/api/_onboardingSchemas.js`).href);
const { validateSubmission, getFlow, isValidFlowType, FLOW_TYPES } = mod;

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

const validNeet = {
  flowType: "NEET",
  currentClass: "Class 12",
  attemptNumber: "First",
  previousScore: null,
  targetScore: 650,
  weakSubjects: ["Physics", "Chemistry"],
  coachingStatus: "Self-study only",
  studyHoursPerDay: "6-8",
  biggestChallenge: "Time management",
};

const validGeneral = {
  flowType: "GENERAL",
  learnerType: "College student",
  primaryGoal: "Learn a new skill",
  subjectsOfInterest: ["Mathematics"],
  studyHoursPerDay: "1-2",
  preferredFormat: "A mix",
  motivation: null,
};

console.log("\n=== registry ===");
check("exposes both flows", FLOW_TYPES.length === 2 && FLOW_TYPES.includes("NEET") && FLOW_TYPES.includes("GENERAL"));
check("getFlow is case-insensitive", getFlow("neet")?.flowType === "NEET");
check("getFlow rejects unknown", getFlow("BOGUS") === null);
check("isValidFlowType rejects junk", !isValidFlowType("BOGUS") && !isValidFlowType(null) && !isValidFlowType(42));
check("NEET has 8 questions", getFlow("NEET").questions.length === 8);
check("GENERAL has 6 questions", getFlow("GENERAL").questions.length === 6);

console.log("\n=== happy paths ===");
check("valid NEET accepted", validateSubmission("NEET", validNeet).ok);
check("valid GENERAL accepted", validateSubmission("GENERAL", validGeneral).ok);
check("optional nulls accepted", validateSubmission("NEET", { ...validNeet, previousScore: null, biggestChallenge: null }).ok);

console.log("\n=== flow-type validation (the core requirement) ===");
const mismatch = validateSubmission("GENERAL", validNeet);
check("NEET payload rejected on GENERAL route", !mismatch.ok, JSON.stringify(mismatch.error));
check("mismatch names both types", /NEET/.test(mismatch.error) && /GENERAL/.test(mismatch.error), mismatch.error);
check("unknown route type rejected", !validateSubmission("BOGUS", validNeet).ok);

// The corruption scenario the UI reset exists to prevent: same field id, option
// only valid in the other flow.
const crossContaminated = { ...validGeneral, studyHoursPerDay: "6-8" };
const cross = validateSubmission("GENERAL", crossContaminated);
check("cross-flow option value rejected", !cross.ok, JSON.stringify(cross.issues));
check("names the offending field", cross.issues.some(i => i.path === "studyHoursPerDay"), JSON.stringify(cross.issues));

console.log("\n=== field-level validation ===");
const over = validateSubmission("NEET", { ...validNeet, targetScore: 900 });
check("score above 720 rejected", !over.ok, JSON.stringify(over.issues));
check("names targetScore", over.issues.some(i => i.path === "targetScore"));
check("negative score rejected", !validateSubmission("NEET", { ...validNeet, targetScore: -1 }).ok);
check("empty multi-select rejected", !validateSubmission("NEET", { ...validNeet, weakSubjects: [] }).ok);
check("invalid enum rejected", !validateSubmission("NEET", { ...validNeet, currentClass: "Class 9" }).ok);
check("missing required field rejected", (() => { const { targetScore, ...rest } = validNeet; return !validateSubmission("NEET", rest).ok; })());
check("over-long textarea rejected", !validateSubmission("NEET", { ...validNeet, biggestChallenge: "x".repeat(501) }).ok);
check("unknown extra keys ignored", validateSubmission("NEET", { ...validNeet, injected: "evil" }).ok);

console.log("\n=== issues are reportable ===");
const bad = validateSubmission("NEET", { ...validNeet, targetScore: 900, weakSubjects: [] });
check("reports every failing field", bad.issues.length >= 2, JSON.stringify(bad.issues));
check("each issue has path + message", bad.issues.every(i => typeof i.path === "string" && typeof i.message === "string"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
