/**
 * EduOnx k6 — AI endpoint resilience (requires SUPABASE_ACCESS_TOKEN)
 *
 * Usage:
 *   k6 run -e BASE_URL=https://your-app.vercel.app \
 *          -e SUPABASE_ACCESS_TOKEN=<token> \
 *          tests/k6/ai-groq-stress.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const aiErrors = new Rate("ai_errors");

export const options = {
  scenarios: {
    rapid_100: {
      executor: "constant-arrival-rate",
      rate: 10,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 20,
      maxVUs: 50,
    },
  },
  thresholds: {
    ai_errors: ["rate<0.30"], // Groq free tier may 429 under burst — track, don't hard-fail CI
    http_req_duration: ["p(95)<60000"],
  },
};

const BASE = __ENV.BASE_URL || "http://localhost:5000";
const TOKEN = __ENV.SUPABASE_ACCESS_TOKEN;

export function setup() {
  if (!TOKEN) {
    throw new Error("SUPABASE_ACCESS_TOKEN is required for AI stress tests");
  }
}

export default function () {
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
    }
  );

  const ok = check(res, {
    "status 200 or 429": (r) => r.status === 200 || r.status === 429,
    "no raw upstream leak": (r) => {
      try {
        const body = JSON.parse(r.body);
        const err = body.error || "";
        return !err.includes("api.groq.com") && !err.includes("Bearer");
      } catch {
        return true;
      }
    },
  });
  aiErrors.add(!ok);
  sleep(0.5);
}
