/**
 * StudyBuddy AI — BREAKPOINT load test (k6)
 * ===================================
 * Runs ONE concurrency level and reports whether the app stayed healthy at it.
 * The Node sweeper (tests/run-load.mjs) calls this repeatedly with increasing
 * VUS to find the EXACT highest user count that stays under the error/latency
 * thresholds — a measured breakpoint, not an estimate.
 *
 * Run a single level by hand:
 *   k6 run -e BASE_URL=https://your-app.vercel.app -e VUS=200 -e MODE=frontend tests/load/breakpoint.js
 *
 * MODE=frontend  → hammers static pages (measures CDN/app-shell capacity)
 * MODE=api       → hammers /api/groq (measures AI capacity; needs SUPABASE_ACCESS_TOKEN)
 *
 * A level "PASSES" when:
 *   - request failure rate < 1%   (FAIL_RATE)
 *   - p95 latency < 3000 ms       (P95_MS)  for frontend
 *     (api uses 60s because Groq generation is slow)
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const VUS = parseInt(__ENV.VUS || "50", 10);
const DURATION = __ENV.DURATION || "20s";
const MODE = __ENV.MODE || "frontend";
const BASE = __ENV.BASE_URL || "http://localhost:4173";
const TOKEN = __ENV.SUPABASE_ACCESS_TOKEN || "";

const FAIL_RATE = 0.01;                                  // 1% errors = broken
const P95_MS = MODE === "api" ? 60000 : 3000;

const failures = new Rate("failures");
const latency = new Trend("latency_ms", true);

export const options = {
  scenarios: {
    level: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
    },
  },
  // Thresholds decide PASS/FAIL for this level. abortOnFail stops early once
  // it's clearly broken so the sweep doesn't waste time hammering a dead level.
  thresholds: {
    failures: [{ threshold: `rate<${FAIL_RATE}`, abortOnFail: false }],
    latency_ms: [`p(95)<${P95_MS}`],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "max"],
};

const FRONTEND_PATHS = ["/", "/login", "/signup", "/about"];

function testFrontend() {
  for (const path of FRONTEND_PATHS) {
    const res = http.get(`${BASE}${path}`, { tags: { name: path } });
    latency.add(res.timings.duration);
    const ok = check(res, { [`${path} 200`]: (r) => r.status === 200 });
    failures.add(!ok);
  }
  sleep(0.5);
}

function testApi() {
  const res = http.post(
    `${BASE}/api/groq`,
    JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: "Reply with the number 42 only." }],
      max_tokens: 5,
      temperature: 0,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      tags: { name: "groq" },
    }
  );
  latency.add(res.timings.duration);
  // 429 (rate limited) counts as a FAILURE here — it means a real user would
  // have been turned away at this concurrency. That's exactly the ceiling we
  // want to measure for the AI features.
  const ok = check(res, { "groq 200": (r) => r.status === 200 });
  failures.add(!ok);
  sleep(0.5);
}

export function setup() {
  if (MODE === "api" && !TOKEN) {
    throw new Error("MODE=api requires -e SUPABASE_ACCESS_TOKEN=<token>");
  }
}

export default function () {
  if (MODE === "api") testApi();
  else testFrontend();
}

// Emit a compact machine-readable line the Node sweeper parses, plus write the
// full summary to a file k6 picks up via --summary-export is not used; we hand
// back JSON through stdout so the runner stays dependency-free.
export function handleSummary(data) {
  const m = data.metrics;
  const failRate = (m.failures && m.failures.values.rate) || 0;
  const p95 = (m.latency_ms && m.latency_ms.values["p(95)"]) || 0;
  const reqs = (m.http_reqs && m.http_reqs.values.count) || 0;
  const passed = failRate < FAIL_RATE && p95 < P95_MS;

  const result = {
    mode: MODE,
    vus: VUS,
    duration: DURATION,
    failRate: Number((failRate * 100).toFixed(2)),  // %
    p95Ms: Math.round(p95),
    requests: reqs,
    passed,
  };

  return {
    stdout: `\nBREAKPOINT_RESULT ${JSON.stringify(result)}\n`,
  };
}
