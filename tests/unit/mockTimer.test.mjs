/**
 * Unit tests for the mock test clock.
 *   node tests/unit/mockTimer.test.mjs
 *
 * These cover the bug this module was extracted to fix: the deadline used to be
 * computed from Date.now() when Start was pressed, so a refresh minted a brand
 * new attempt with a full fresh clock. The rules below are the ones that make a
 * refresh survivable AND non-exploitable.
 *
 * Reads the .ts source and strips the type annotations rather than adding a
 * TypeScript test runner. The functions are plain arithmetic, so the stripped
 * source is the same code that ships; `npx tsc --noEmit` already type-checks it.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const src = readFileSync(resolve(ROOT, "src/lib/mockTimer.ts"), "utf8")
  .replace(/:\s*"submit"\s*\|\s*"resume"/g, "")
  .replace(/(\w+)\s*:\s*number/g, "$1")
  .replace(/\)\s*:\s*(number|boolean)\s*\{/g, ") {")
  .replace(/^export /gm, "");

const {
  deadlineFrom, remainingSeconds, isExpired, resumeDecision,
} = await import(
  "data:text/javascript," +
  encodeURIComponent(src + "\nexport { deadlineFrom, remainingSeconds, isExpired, resumeDecision };")
);

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

const T0 = 1_700_000_000_000; // a fixed epoch, so nothing here depends on "now"

console.log("\n=== deadline is anchored to the server start ===");
check("30 minutes after start", deadlineFrom(T0, 30) === T0 + 30 * 60_000);
check("18 minutes after start", deadlineFrom(T0, 18) === T0 + 18 * 60_000);
// The regression: a refresh 10 minutes in must NOT move the deadline. Same
// started_at in, same deadline out, regardless of when it is asked.
check("deadline does not depend on when it is computed",
  deadlineFrom(T0, 30) === deadlineFrom(T0, 30));

console.log("\n=== remaining time ===");
check("full duration at the start", remainingSeconds(deadlineFrom(T0, 30), T0) === 1800);
check("half way through", remainingSeconds(deadlineFrom(T0, 30), T0 + 15 * 60_000) === 900);
check("never negative once lapsed",
  remainingSeconds(deadlineFrom(T0, 30), T0 + 90 * 60_000) === 0);
check("zero exactly at the deadline",
  remainingSeconds(deadlineFrom(T0, 30), T0 + 30 * 60_000) === 0);

console.log("\n=== expiry is inclusive ===");
check("not expired one second before", !isExpired(deadlineFrom(T0, 30), T0 + 30 * 60_000 - 1000));
// Strict > would leave a tick where the clock reads 00:00 but answers still count.
check("expired exactly at the deadline", isExpired(deadlineFrom(T0, 30), T0 + 30 * 60_000));
check("expired after the deadline", isExpired(deadlineFrom(T0, 30), T0 + 31 * 60_000));

console.log("\n=== resuming an attempt found in progress ===");
check("resume with time left", resumeDecision(T0, 30, T0 + 5 * 60_000) === "resume");
check("resume just before expiry", resumeDecision(T0, 30, T0 + 30 * 60_000 - 1) === "resume");
// The laptop-closed-overnight case: grade what exists, do not restart the clock.
check("submit when the deadline passed while away",
  resumeDecision(T0, 30, T0 + 8 * 60 * 60_000) === "submit");
check("submit exactly at the deadline", resumeDecision(T0, 30, T0 + 30 * 60_000) === "submit");

console.log("\n=== a refresh cannot buy time ===");
// Start, then "refresh" three times over 20 minutes. The deadline must be
// identical every time, and the remaining time must only ever decrease.
const deadline = deadlineFrom(T0, 30);
const refreshes = [T0 + 60_000, T0 + 10 * 60_000, T0 + 20 * 60_000];
const seen = refreshes.map((n) => remainingSeconds(deadline, n));
check("deadline identical across refreshes",
  refreshes.every(() => deadlineFrom(T0, 30) === deadline));
check("remaining time strictly decreases", seen[0] > seen[1] && seen[1] > seen[2], JSON.stringify(seen));
check("no refresh restores the full clock", seen.every((s) => s < 1800), JSON.stringify(seen));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
