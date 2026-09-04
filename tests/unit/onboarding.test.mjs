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
check("exposes all three flows",
  FLOW_TYPES.length === 4 && ["JEE","NEET","GATE","GENERAL"].every(f => FLOW_TYPES.includes(f)),
  FLOW_TYPES.join(","));
check("getFlow is case-insensitive", getFlow("neet")?.flowType === "NEET");
check("getFlow rejects unknown", getFlow("BOGUS") === null);
check("isValidFlowType rejects junk", !isValidFlowType("BOGUS") && !isValidFlowType(null) && !isValidFlowType(42));
check("NEET has 9 questions", getFlow("NEET").questions.length === 9, String(getFlow("NEET").questions.length));
check("GENERAL has 7 questions", getFlow("GENERAL").questions.length === 7, String(getFlow("GENERAL").questions.length));

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


/* ── Appended: exam-track mapping + conditional questions ─────────────────── */
const { flowTypeForExamTrack, isQuestionVisible, visibleQuestions } = mod;

console.log("\n=== exam track -> flow ===");
check("jee-main -> JEE", flowTypeForExamTrack("jee-main") === "JEE");
check("neet -> NEET", flowTypeForExamTrack("neet") === "NEET");
check("gate-cs -> GATE", flowTypeForExamTrack("gate-cs") === "GATE");
check("gate-ec -> GATE", flowTypeForExamTrack("gate-ec") === "GATE");
check("case-insensitive", flowTypeForExamTrack("JEE-MAIN") === "JEE");
check("unknown track -> GENERAL", flowTypeForExamTrack("tspsc-group-1") === "GENERAL");
check("null track -> GENERAL", flowTypeForExamTrack(null) === "GENERAL");
check("JEE flow exists", getFlow("JEE") !== null);

console.log("\n=== conditional visibility ===");
const jee = getFlow("JEE");
const prev = jee.questions.find(q => q.id === "previousScore");
check("previousScore is conditional", !!prev.showIf);
check("hidden for first attempt", !isQuestionVisible(prev, { attemptNumber: "First" }));
check("shown for second attempt", isQuestionVisible(prev, { attemptNumber: "Second" }));
// Unanswered must NOT reveal it, or it flashes up before the choice is made.
check("hidden while unanswered", !isQuestionVisible(prev, {}));

const coachName = jee.questions.find(q => q.id === "coachingName");
check("coachingName shown for coaching", isQuestionVisible(coachName, { coachingStatus: "Online coaching" }));
check("coachingName hidden for self-study", !isQuestionVisible(coachName, { coachingStatus: "Self-study only" }));

const gen = getFlow("GENERAL");
const examName = gen.questions.find(q => q.id === "examName");
check("examName shown when goal is exam", isQuestionVisible(examName, { primaryGoal: "Pass an exam" }));
check("examName hidden otherwise", !isQuestionVisible(examName, { primaryGoal: "Learn a new skill" }));

check("visibleQuestions filters", 
  visibleQuestions(jee.questions, { attemptNumber: "First", coachingStatus: "Self-study only" })
    .every(q => q.id !== "previousScore" && q.id !== "coachingName"));

console.log("\n=== conditional validation ===");
const jeeFirst = {
  flowType: "JEE", currentClass: "Class 12", attemptNumber: "First",
  targetPercentile: 99, weakSubjects: ["Physics"],
  targetInstitute: "NIT", coachingStatus: "Self-study only",
  studyHoursPerDay: "6-8",
};
const r1 = validateSubmission("JEE", jeeFirst);
check("first attempt valid WITHOUT previousScore", r1.ok, JSON.stringify(r1.issues));

// The core guarantee: a hidden field must never be required.
const r2 = validateSubmission("JEE", { ...jeeFirst, attemptNumber: "Second" });
check("second attempt REQUIRES previousScore", !r2.ok && r2.issues.some(i => i.path === "previousScore"),
  JSON.stringify(r2.issues));
check("second attempt valid with previousScore",
  validateSubmission("JEE", { ...jeeFirst, attemptNumber: "Second", previousScore: 210 }).ok);

// Stale conditional answer must be rejected, not silently stored.
const stale = validateSubmission("JEE", { ...jeeFirst, previousScore: 210 });
check("answer for hidden question rejected", !stale.ok && stale.issues.some(i => i.path === "previousScore"),
  JSON.stringify(stale.issues));

console.log("\n=== flow isolation ===");
// weakSubjects options differ: Mathematics is JEE-only, Botany NEET-only.
check("NEET rejects JEE-only subject",
  !validateSubmission("NEET", {
    flowType: "NEET", currentClass: "Class 12", attemptNumber: "First",
    targetScore: 650, weakSubjects: ["Mathematics"],
    coachingStatus: "Self-study only", studyHoursPerDay: "6-8",
  }).ok);
check("JEE rejects NEET-only subject",
  !validateSubmission("JEE", { ...jeeFirst, weakSubjects: ["Botany"] }).ok);
check("JEE payload rejected on NEET route", !validateSubmission("NEET", jeeFirst).ok);



/* ── GATE flow (Phase 1b) ─────────────────────────────────────────────────── */
console.log("\n=== GATE flow ===");
const gate = getFlow("GATE");
check("GATE flow exists", gate !== null);

// GATE is scored out of 1000, not 300 (JEE) or 720 (NEET). Getting this wrong
// would let a candidate enter a target their exam cannot produce.
const gateTarget = gate.questions.find(q => q.id === "targetScore");
check("targetScore capped at 1000", gateTarget.max === 1000, String(gateTarget.max));

// Working professionals are the only ones for whom weekday hours is the binding
// constraint; asking everyone else is noise.
const weekday = gate.questions.find(q => q.id === "weekdayHours");
check("weekdayHours conditional", !!weekday.showIf);
check("shown when preparing alongside a job",
  isQuestionVisible(weekday, { preparationMode: "Alongside a job" }));
check("hidden for full-time preparation",
  !isQuestionVisible(weekday, { preparationMode: "Self-study" }));
check("hidden while unanswered", !isQuestionVisible(weekday, {}));

const gateFirst = {
  flowType: "GATE", candidateStage: "Final year", attemptNumber: "First",
  targetGoal: "PSU recruitment", targetScore: 750,
  weakSubjects: ["Engineering Mathematics"],
  preparationMode: "Self-study", studyHoursPerDay: "4-6",
};
const g1 = validateSubmission("GATE", gateFirst);
check("first attempt valid without previousScore", g1.ok, JSON.stringify(g1.issues));

const g2 = validateSubmission("GATE", { ...gateFirst, previousScore: 620 });
check("previousScore rejected for a first attempt", !g2.ok);

const g3 = validateSubmission("GATE",
  { ...gateFirst, attemptNumber: "Second", previousScore: 620 });
check("second attempt valid WITH previousScore", g3.ok, JSON.stringify(g3.issues));

const g4 = validateSubmission("GATE", { ...gateFirst, attemptNumber: "Second" });
check("second attempt REQUIRES previousScore", !g4.ok);

const g5 = validateSubmission("GATE",
  { ...gateFirst, preparationMode: "Alongside a job" });
check("weekdayHours required once shown", !g5.ok);

const g6 = validateSubmission("GATE",
  { ...gateFirst, preparationMode: "Alongside a job", weekdayHours: "1-2" });
check("valid once weekdayHours supplied", g6.ok, JSON.stringify(g6.issues));

// A JEE answer set must not validate as GATE, or a mis-set flowType would
// silently persist the wrong profile.
check("JEE answers rejected as GATE", !validateSubmission("GATE", jeeFirst).ok);


/* ── Server/client parity of the track -> flow map ────────────────────────── */
/**
 * src/lib/onboardingFlows.ts duplicates flowTypeForExamTrack() because the .ts
 * cannot import the .js registry at runtime across the ESM boundary. A silent
 * divergence would show a student one set of questions and validate them
 * against another, so the two switch statements are compared as source.
 */
console.log("\n=== server/client mirror parity ===");
const { readFileSync } = await import("fs");   // ROOT is already resolved above.

/** Extract `case "x": ... return "Y"` pairs from a flowTypeForExamTrack body. */
function extractMap(source) {
  const body = source.slice(source.indexOf("function flowTypeForExamTrack"));
  const switchBody = body.slice(body.indexOf("switch"), body.indexOf("\n}"));
  const map = new Map();
  let pending = [];
  for (const line of switchBody.split("\n")) {
    const c = line.match(/case\s+"([^"]+)"/);
    if (c) { pending.push(c[1]); continue; }
    const r = line.match(/return\s+"([^"]+)"/);
    if (r) { for (const k of pending) map.set(k, r[1]); pending = []; }
  }
  return map;
}

const serverMap = extractMap(readFileSync(resolve(ROOT, "api/_onboardingSchemas.js"), "utf8"));
const clientMap = extractMap(readFileSync(resolve(ROOT, "src/lib/onboardingFlows.ts"), "utf8"));

check("server map is non-empty", serverMap.size > 0, `${serverMap.size} entries`);
check("both maps cover the same tracks",
  serverMap.size === clientMap.size &&
  [...serverMap.keys()].every(k => clientMap.has(k)),
  `server=[${[...serverMap.keys()]}] client=[${[...clientMap.keys()]}]`);
check("every track maps to the same flow",
  [...serverMap].every(([k, v]) => clientMap.get(k) === v),
  [...serverMap].filter(([k, v]) => clientMap.get(k) !== v).map(([k]) => k).join(", ") || "all agree");

// Parity is worthless if the flow it names does not exist.
check("every mapped flow is a real flow",
  [...new Set(serverMap.values())].every(f => getFlow(f) !== null));


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
