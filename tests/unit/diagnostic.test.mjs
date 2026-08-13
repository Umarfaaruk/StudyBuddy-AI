/**
 * Unit tests for the pure diagnostic + study-plan logic.
 *
 *   node tests/unit/diagnostic.test.mjs      (or: npm run test:unit)
 *
 * No test framework: these modules are pure functions, and a dependency-free
 * script keeps them runnable in CI without adding a devDependency.
 *
 * The TypeScript is transpiled on the fly and its browser-only Supabase imports
 * are stripped, so the tests exercise the SAME source the app ships rather than
 * a copy that can drift.
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { pathToFileURL } from "url";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const { transformSync } = await import(
  pathToFileURL(`${ROOT}/node_modules/esbuild/lib/main.js`).href
);

const OUT = `${ROOT}/node_modules/.cache/diagtest`;
mkdirSync(OUT, { recursive: true });

function compile(src, name, strip = [], prepend = "") {
  let code = readFileSync(`${ROOT}/src/lib/${src}`, "utf8");
  for (const re of strip) code = code.replace(re, "");
  const js = prepend + transformSync(code, { loader: "ts", format: "esm" }).code;
  const p = `${OUT}/${name}`;
  writeFileSync(p, js);
  return pathToFileURL(p).href + `?t=${Date.now()}`;
}

const diagUrl = compile("diagnostic.ts", "diagnostic.mjs", [
  /import \{ supabase \}[^\n]*\n/,
  /import type \{[^}]*\} from "@\/lib\/examTracks";\n/,
  /export async function fetchDiagnosticPool[\s\S]*?\n\}\n/,
  /export async function startDiagnosticSession[\s\S]*?\n\}\n/,
  /export async function completeDiagnosticSession[\s\S]*?\n\}\n/,
]);
const diag = await import(diagUrl);

const planUrl = compile(
  "studyPlan.ts", "studyPlan.mjs",
  [
    /import \{ supabase \}[^\n]*\n/,
    /import type \{ PerTopicResult \}[^\n]*\n/,
    /import \{ rankWeakestTopics \}[^\n]*\n/,
    /export async function saveStudyPlan[\s\S]*?\n\}\n/,
  ],
  `import { rankWeakestTopics } from ${JSON.stringify(diagUrl)};\n`
);
const plan = await import(planUrl);

const srUrl = pathToFileURL(`${ROOT}/api/_spacedRepetition.js`).href;
const sr = await import(srUrl);

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

// Synthetic pool: 3 subjects x 3 chapters x 3 difficulties x 2 questions.
const pool = [];
let n = 0;
for (const subj of ["Physics", "Chemistry", "Mathematics"]) {
  for (let ch = 1; ch <= 3; ch++) {
    for (const d of ["easy", "medium", "hard"]) {
      for (let k = 0; k < 2; k++) {
        pool.push({
          id: `q${n++}`, exam_track_id: "jee-main",
          syllabus_node_id: `${subj}-ch${ch}`, question_text: "x",
          question_type: "mcq", options: [], difficulty: d,
          is_pyq: false, pyq_year: null, pyq_session: null, tags: [],
          syllabusName: `${subj} ch${ch}`, subjectName: subj,
        });
      }
    }
  }
}

console.log("\n=== coverage: buildChapterOrder ===");
const grouped = diag.groupPool(pool);
const order = diag.buildChapterOrder(grouped);
check("orders every chapter", order.length === 9, `got ${order.length}`);

const subjOf = (c) => grouped.get(c).values().next().value[0].subjectName;
let adjacent = 0;
for (let i = 1; i < order.length; i++) if (subjOf(order[i]) === subjOf(order[i - 1])) adjacent++;
check("interleaves subjects", adjacent <= 2, `adjacent=${adjacent}`);

console.log("\n=== adaptivity: pickQuestion ===");
// Regression guard: an earlier implementation pinned difficulty at medium and
// never moved it, so "adaptive" selection was inert.
const easyPick = diag.pickQuestion(grouped, order, 0, 0, new Set());
const hardPick = diag.pickQuestion(grouped, order, 0, 2, new Set());
check("difficultyIdx 0 yields easy", easyPick?.difficulty === "easy", easyPick?.difficulty);
check("difficultyIdx 2 yields hard", hardPick?.difficulty === "hard", hardPick?.difficulty);
check("same chapter regardless of difficulty",
  easyPick.syllabus_node_id === hardPick.syllabus_node_id);

function walk(answerFn, len = 20) {
  const used = new Set();
  let dIdx = 1;
  const picked = [];
  for (let i = 0; i < len; i++) {
    const q = diag.pickQuestion(grouped, order, i, dIdx, used);
    if (!q) break;
    used.add(q.id);
    picked.push(q);
    dIdx = diag.nextDifficultyIndex(dIdx, answerFn(i));
  }
  return picked;
}

const strong = walk(() => true);
const weak = walk(() => false);
check("full-length walk", strong.length === 20, `got ${strong.length}`);
check("no duplicates", new Set(strong.map((q) => q.id)).size === strong.length);
check("covers all 9 chapters", new Set(strong.map((q) => q.syllabus_node_id)).size === 9);

const hardCount = strong.filter((q) => q.difficulty === "hard").length;
const easyCount = weak.filter((q) => q.difficulty === "easy").length;
check("always-correct trends HARD", hardCount >= 12, `hard=${hardCount}/20`);
check("always-wrong trends EASY", easyCount >= 12, `easy=${easyCount}/20`);
check("the two walks genuinely differ",
  hardCount !== weak.filter((q) => q.difficulty === "hard").length);

console.log("\n=== thin / empty bank ===");
const thinGrouped = diag.groupPool(pool.slice(0, 5));
const thinOrder = diag.buildChapterOrder(thinGrouped);
const thinUsed = new Set();
let thinPicked = 0;
for (let i = 0; i < 20; i++) {
  const q = diag.pickQuestion(thinGrouped, thinOrder, i, 1, thinUsed);
  if (!q) break;
  thinUsed.add(q.id); thinPicked++;
}
check("never exceeds available", thinPicked === 5, `got ${thinPicked}`);
check("empty pool yields nothing",
  diag.pickQuestion(diag.groupPool([]), [], 0, 1, new Set()) === undefined);

console.log("\n=== nextDifficultyIndex ===");
check("correct steps up", diag.nextDifficultyIndex(1, true) === 2);
check("wrong steps down", diag.nextDifficultyIndex(1, false) === 0);
check("clamps at hard", diag.nextDifficultyIndex(2, true) === 2);
check("clamps at easy", diag.nextDifficultyIndex(0, false) === 0);

console.log("\n=== rankWeakestTopics ===");
const topics = [
  { syllabusNodeId: "a", name: "Strong", correct: 4, total: 4, score: 100 },
  { syllabusNodeId: "b", name: "Weak", correct: 0, total: 4, score: 0 },
  { syllabusNodeId: "c", name: "Mid", correct: 2, total: 4, score: 50 },
];
const ranked = diag.rankWeakestTopics(topics);
check("weakest first", ranked[0].name === "Weak" && ranked[2].name === "Strong",
  ranked.map((t) => t.name).join(","));

console.log("\n=== generateStudyPlan ===");
const long = plan.generateStudyPlan(topics, 200, new Date("2026-08-01"));
check("weakest scheduled first", long.items[0].topic === "Weak");
check("critical gets 90 min", long.items[0].minutes === 90, `got ${long.items[0].minutes}`);
check("critical priority tagged", long.items[0].priority === "critical");
check("strong gets least time", long.items[2].minutes === 40, `got ${long.items[2].minutes}`);
check("dates increment daily",
  long.items[0].date === "2026-08-01" && long.items[1].date === "2026-08-02");
check("reason cites the score", /Scored 0%/.test(long.items[0].reason), long.items[0].reason);

const short = plan.generateStudyPlan(topics, 4, new Date("2026-08-01"));
check("short horizon still schedules >=3", short.items.length >= 3, `got ${short.items.length}`);

const many = Array.from({ length: 40 }, (_, i) => ({
  syllabusNodeId: `n${i}`, name: `T${i}`, correct: 0, total: 2, score: i,
}));
const capped = plan.generateStudyPlan(many, 10, new Date("2026-08-01"));
check("caps set on short runway", capped.items.length === 5, `got ${capped.items.length}`);
check("defers the rest", capped.deferred.length === 35, `got ${capped.deferred.length}`);
check("keeps weakest, defers strongest",
  capped.items[0].topic === "T0" && capped.items.every((i) => !capped.deferred.includes(i.topic)));

console.log("\n=== SM-2 scheduler ===");
// Mirrors the values verified against the live database on 2026-07-30.
let st = { ...sr.INITIAL_REVIEW_STATE };
let r1 = sr.scheduleNextReview(st, { isCorrect: true, timeTakenMs: 20000, difficulty: "easy" }, new Date("2026-07-28"));
check("first correct: quality 5", r1.quality === 5, `q=${r1.quality}`);
check("first correct: ease 2.6", r1.state.ease === 2.6, `${r1.state.ease}`);
check("first correct: interval 1d", r1.state.intervalDays === 1);
let r2 = sr.scheduleNextReview(r1.state, { isCorrect: true, timeTakenMs: 20000, difficulty: "easy" }, new Date("2026-07-30"));
check("second correct: ease 2.7", r2.state.ease === 2.7, `${r2.state.ease}`);
check("second correct: interval 3d", r2.state.intervalDays === 3, `${r2.state.intervalDays}`);
let r3 = sr.scheduleNextReview(r2.state, { isCorrect: false, timeTakenMs: 20000, difficulty: "easy" }, new Date("2026-07-30"));
check("wrong: quality 0", r3.quality === 0, `q=${r3.quality}`);
check("wrong: ease 1.9", r3.state.ease === 1.9, `${r3.state.ease}`);
check("wrong: interval resets to 1d", r3.state.intervalDays === 1);
check("wrong: repetitions reset", r3.state.repetitions === 0);
check("wrong: lapses increment", r3.state.lapses === 1);
check("fast+wrong scores above slow+wrong",
  sr.deriveQuality({ isCorrect: false, timeTakenMs: 5000, difficulty: "easy" }) >
  sr.deriveQuality({ isCorrect: false, timeTakenMs: 40000, difficulty: "easy" }));
check("ease floors at 1.3", (() => {
  let s = { ...sr.INITIAL_REVIEW_STATE };
  for (let i = 0; i < 20; i++) s = sr.scheduleNextReview(s, { isCorrect: false, timeTakenMs: 40000, difficulty: "easy" }).state;
  return s.ease >= 1.3;
})());

console.log("\n=== mastery EMA ===");
check("two perfect answers -> 44", (() => {
  let m = sr.updateMastery(0, true, 5);
  m = sr.updateMastery(m, true, 5);
  return m === 44;
})());
check("wrong answer drops 44 -> 33", sr.updateMastery(44, false, 0) === 33);
check("clamped 0..100", sr.updateMastery(100, true, 5) <= 100 && sr.updateMastery(0, false, 0) >= 0);

console.log("\n=== exam retrieval: buildTsQuery ===");
const retrUrl = compile("examRetrieval.ts", "examRetrieval.mjs", [
  /import \{ supabase \}[^\n]*\n/,
  /export async function retrieveExamContext[\s\S]*?\n\}\n/,
]);
const retr = await import(retrUrl);

const q1 = retr.buildTsQuery("How do I solve projectile motion problems?");
check("drops stopwords and question words", !/\b(how|do|solve|problems)\b/.test(q1), q1);
check("keeps subject terms", q1.includes("projectile") && q1.includes("motion"), q1);
check("joins with OR", q1.includes(" | "), q1);

// AND semantics cannot match a chapter literally named "Kinematics"; verified
// against the live database, where the AND form returned zero rows.
check("never emits AND operators", !q1.includes("&"), q1);

// tsquery operators must not survive: to_tsquery would either error or be
// steered by them.
const injected = retr.buildTsQuery("motion & !kinematics | (drop):* 'x'");
check("strips tsquery operators", !/[&!:*'()|]/.test(injected.replace(/ \| /g, " ")), injected);
check("still yields usable terms", injected.includes("motion"), injected);

check("empty input yields empty query", retr.buildTsQuery("") === "");
check("stopwords-only yields empty query", retr.buildTsQuery("how do I the a of") === "");
check("short tokens dropped", !retr.buildTsQuery("a be at momentum").includes("be"),
  retr.buildTsQuery("a be at momentum"));
check("deduplicates repeated terms",
  retr.buildTsQuery("motion motion motion").split(" | ").length === 1);

const manyTerms = retr.buildTsQuery(Array.from({ length: 40 }, (_, i) => `term${i}`).join(" "));
check("caps term count at 12", manyTerms.split(" | ").length === 12,
  `${manyTerms.split(" | ").length}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
