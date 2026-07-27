/**
 * StudyBuddy AI — Load breakpoint sweeper (Node, zero dependencies)
 * ==========================================================
 * Drives tests/load/breakpoint.js across increasing concurrency until the app
 * crosses the failure threshold, then BINARY-SEARCHES between the last passing
 * and first failing level to pinpoint the exact maximum concurrent users.
 *
 * Usage:
 *   node tests/run-load.mjs --base https://your-app.vercel.app --mode frontend
 *   node tests/run-load.mjs --base https://your-app.vercel.app --mode api --token <SUPABASE_ACCESS_TOKEN>
 *
 * Requires the free k6 binary on PATH (https://k6.io/docs/get-started/installation/).
 * Writes tests/reports/load-<mode>.json and prints the pinpoint number.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = join(__dirname, "reports");

// ── args ──────────────────────────────────────────────────────────
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const BASE = arg("base", "http://localhost:4173");
const MODE = arg("mode", "frontend");
const TOKEN = arg("token", "");
const DURATION = arg("duration", "20s");

// Coarse ladder. API mode starts tiny because Groq's free tier saturates fast.
const LADDER =
  MODE === "api"
    ? [1, 2, 5, 10, 20, 40, 80]
    : [25, 50, 100, 200, 350, 500, 750, 1000, 1500, 2000];

function k6Available() {
  const r = spawnSync("k6", ["version"], { encoding: "utf8" });
  return r.status === 0;
}

function runLevel(vus) {
  const env = { ...process.env, BASE_URL: BASE, MODE, VUS: String(vus), DURATION };
  if (TOKEN) env.SUPABASE_ACCESS_TOKEN = TOKEN;
  process.stdout.write(`  → testing ${vus} concurrent VUs ... `);
  const r = spawnSync("k6", ["run", join(__dirname, "load", "breakpoint.js")], {
    env,
    encoding: "utf8",
  });
  const out = (r.stdout || "") + (r.stderr || "");
  const line = out.split("\n").find((l) => l.includes("BREAKPOINT_RESULT"));
  if (!line) {
    console.log("no result (k6 error)");
    console.log(out.slice(-800));
    return null;
  }
  const res = JSON.parse(line.replace("BREAKPOINT_RESULT", "").trim());
  console.log(
    `${res.passed ? "PASS" : "FAIL"}  (errors ${res.failRate}%, p95 ${res.p95Ms}ms, ${res.requests} reqs)`
  );
  return res;
}

function main() {
  mkdirSync(REPORT_DIR, { recursive: true });

  if (!k6Available()) {
    console.error(
      "\n✗ k6 is not installed. Install the free binary first:\n" +
        "    Windows : winget install k6 --source winget   (or: choco install k6)\n" +
        "    macOS   : brew install k6\n" +
        "    Linux   : sudo apt-get install k6  (see k6.io/docs)\n"
    );
    process.exit(2);
  }

  console.log(`\nStudyBuddy AI load breakpoint — mode=${MODE}  target=${BASE}\n`);
  const history = [];
  let lastPass = 0;
  let firstFail = null;

  // Phase 1: climb the ladder until something fails.
  for (const vus of LADDER) {
    const res = runLevel(vus);
    if (!res) break;
    history.push(res);
    if (res.passed) {
      lastPass = vus;
    } else {
      firstFail = vus;
      break;
    }
  }

  // Phase 2: binary-search between lastPass and firstFail to pinpoint.
  if (firstFail !== null && firstFail - lastPass > 1) {
    console.log(`\n  pinpointing between ${lastPass} and ${firstFail} ...`);
    let lo = lastPass;
    let hi = firstFail;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const res = runLevel(mid);
      if (!res) break;
      history.push(res);
      if (res.passed) lo = mid;
      else hi = mid;
    }
    lastPass = lo;
  }

  const verdict =
    firstFail === null
      ? `Handled the entire ladder (max tested: ${lastPass} concurrent VUs) without crossing the failure threshold.`
      : `Maximum concurrent users with <1% errors and acceptable latency: ${lastPass}. Degrades at ~${firstFail}.`;

  const report = {
    mode: MODE,
    target: BASE,
    generatedAt: new Date().toISOString(),
    maxHealthyConcurrentUsers: lastPass,
    degradesAt: firstFail,
    note:
      MODE === "api"
        ? "This ceiling is set by the Groq free-tier rate limit + Vercel function concurrency, NOT your code. Upgrading Groq tier raises it."
        : "Static/app-shell capacity served by Vercel's CDN. The bottleneck is usually the load generator/network, not the app.",
    levels: history.sort((a, b) => a.vus - b.vus),
  };

  const file = join(REPORT_DIR, `load-${MODE}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));

  console.log(`\n${"═".repeat(64)}`);
  console.log(`  RESULT (${MODE}): ${verdict}`);
  console.log(`  ${report.note}`);
  console.log(`  Saved → ${file}`);
  console.log(`${"═".repeat(64)}\n`);
}

main();
