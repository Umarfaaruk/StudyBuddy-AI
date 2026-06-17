/**
 * EduOnx k6 Load Test — Dashboard + API smoke
 *
 * Usage:
 *   k6 run tests/k6/dashboard-lessons.js
 *   k6 run -e BASE_URL=https://your-app.vercel.app tests/k6/dashboard-lessons.js
 *
 * Env vars:
 *   BASE_URL          — app origin (default http://localhost:5000)
 *   FIREBASE_ID_TOKEN — optional Bearer token for /api/groq auth tests
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("errors");
const pageLoad = new Trend("page_load_ms");

export const options = {
  scenarios: {
    smoke_50: {
      executor: "constant-vus",
      vus: 50,
      duration: "30s",
      startTime: "0s",
      tags: { scenario: "50_users" },
    },
    ramp_100: {
      executor: "constant-vus",
      vus: 100,
      duration: "30s",
      startTime: "30s",
      tags: { scenario: "100_users" },
    },
    stress_250: {
      executor: "constant-vus",
      vus: 250,
      duration: "30s",
      startTime: "1m",
      tags: { scenario: "250_users" },
    },
    spike_500: {
      executor: "constant-vus",
      vus: 500,
      duration: "30s",
      startTime: "1m30s",
      tags: { scenario: "500_users" },
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<3000"],
    errors: ["rate<0.05"],
  },
};

const BASE = __ENV.BASE_URL || "http://localhost:5000";
const TOKEN = __ENV.FIREBASE_ID_TOKEN || "";

export default function () {
  const pages = ["/", "/login", "/signup", "/about"];

  for (const path of pages) {
    const res = http.get(`${BASE}${path}`, { tags: { name: path } });
    pageLoad.add(res.timings.duration);
    const ok = check(res, {
      [`${path} status 200`]: (r) => r.status === 200,
    });
    errorRate.add(!ok);
  }

  // Static asset check (index.html references hashed bundles)
  const index = http.get(`${BASE}/`);
  check(index, { "index has root div": (r) => r.body && r.body.includes('id="root"') });

  // API health: groq rejects unauthenticated (401 expected without token)
  const groqRes = http.post(
    `${BASE}/api/groq`,
    JSON.stringify({ messages: [{ role: "user", content: "ping" }] }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "groq_unauth" } }
  );
  if (TOKEN) {
    const authGroq = http.post(
      `${BASE}/api/groq`,
      JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: "Say hi in one word." }],
        max_tokens: 10,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
        },
        tags: { name: "groq_auth" },
      }
    );
    check(authGroq, { "groq auth 200": (r) => r.status === 200 });
  } else {
    check(groqRes, { "groq unauth blocked": (r) => r.status === 401 });
  }

  sleep(1);
}
