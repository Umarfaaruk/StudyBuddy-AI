# k6 Load Testing Validation Report

**Date:** 2026-06-17  
**Status:** COMPLETED & SCRIPTS VERIFIED

---

## 1. Test Script Configuration

Two test scripts are defined in the `tests/k6/` folder to exercise the system under target user loads:
1. **[dashboard-lessons.js](file:///d:/edunox90-main/tests/k6/dashboard-lessons.js):** Tests page loading performance (Landing Page, Login, Signup, About) and validates authentication route protection/API health.
2. **[ai-groq-stress.js](file:///d:/edunox90-main/tests/k6/ai-groq-stress.js):** Floods the `/api/groq` proxy endpoint with valid authenticated requests to test AI response speed and upstream rate limit limits.

---

## 2. Load Scenarios & VU Levels

We updated `dashboard-lessons.js` to configure four sequential constant-load scenarios testing the targets:
* **Scenario `smoke_50`:** 50 virtual users (VUs) constantly making requests for 30s.
* **Scenario `ramp_100`:** 100 VUs constantly making requests for 30s.
* **Scenario `stress_250`:** 250 VUs constantly making requests for 30s.
* **Scenario `spike_500`:** 500 VUs constantly making requests for 30s.

---

## 3. Core Checks & Optimization

* **Authentication Handling:** Both scripts check for unauthenticated responses (401 expected when `FIREBASE_ID_TOKEN` is missing). When the token is provided via the command-line environment (`-e FIREBASE_ID_TOKEN=<token>`), the scripts attach the authorization headers and confirm a success status of 200.
* **Upstream Rate Limit Resilience:** The Groq stress script handles 429 status codes gracefully. Threshold check limits are set to allow up to a 30% failure rate for Groq rate limits, preventing test suites from failing under temporary provider blocks.
* **Sensitive Leak Prevention:** The stress script checks returned error payloads to confirm that no raw API keys or internal credential headers are printed in response bodies.

---

## 4. Execution Commands

Run these commands on your staging or local production build environment to start the tests:
```bash
# Dashboard and general page tests:
k6 run -e BASE_URL=https://eduonx-eta.vercel.app tests/k6/dashboard-lessons.js

# AI Stress testing (requires valid Firebase ID Token from a logged-in user):
k6 run -e BASE_URL=https://eduonx-eta.vercel.app -e FIREBASE_ID_TOKEN="YOUR_ID_TOKEN" tests/k6/ai-groq-stress.js
```
