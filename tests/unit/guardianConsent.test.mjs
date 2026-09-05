/**
 * Unit tests for guardian-consent rules.
 *   node tests/unit/guardianConsent.test.mjs
 *
 * Age arithmetic is where this kind of code quietly goes wrong: leap years, the
 * day before a birthday, and timezone drift each produce an off-by-one that
 * misclassifies a child as an adult. Every case here pins a fixed "as of" date
 * so none of it depends on when the suite runs.
 */
import { pathToFileURL } from "url";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const {
  ageOn, isMinor, dateOfBirthIssue, validateConsentBlock, MINOR_AGE,
} = await import(pathToFileURL(`${ROOT}/api/_guardianConsent.js`).href);

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

const NOW = "2026-09-05";

console.log("\n=== age arithmetic ===");
check("threshold is 18", MINOR_AGE === 18);
check("exact birthday counts as the new age", ageOn("2008-09-05", NOW) === 18, String(ageOn("2008-09-05", NOW)));
check("day before 18th is still 17", ageOn("2008-09-06", NOW) === 17, String(ageOn("2008-09-06", NOW)));
check("day after 18th is 18", ageOn("2008-09-04", NOW) === 18, String(ageOn("2008-09-04", NOW)));
check("earlier month in same year", ageOn("2008-01-01", NOW) === 18, String(ageOn("2008-01-01", NOW)));
check("later month in same year", ageOn("2008-12-31", NOW) === 17, String(ageOn("2008-12-31", NOW)));
// A leap-day birthday must not drift; ms-based arithmetic gets this wrong.
check("leap-day birth, before Feb 29 exists", ageOn("2008-02-29", "2026-02-28") === 17, String(ageOn("2008-02-29", "2026-02-28")));
check("leap-day birth, on Mar 1", ageOn("2008-02-29", "2026-03-01") === 18, String(ageOn("2008-02-29", "2026-03-01")));
check("invalid date returns null", ageOn("not-a-date", NOW) === null);

console.log("\n=== who needs consent ===");
check("17-year-old is a minor", isMinor("2008-09-06", NOW));
check("exactly 18 is NOT a minor", !isMinor("2008-09-05", NOW));
check("adult is not a minor", isMinor("1995-01-01", NOW) === false);
check("14-year-old is a minor", isMinor("2012-03-04", NOW));
// Fail closed: an unknown age must never be treated as an adult, or the whole
// protection is bypassed by omitting the field.
check("missing date of birth is treated as a minor", isMinor(undefined, NOW));
check("null date of birth is treated as a minor", isMinor(null, NOW));
check("garbage date of birth is treated as a minor", isMinor("banana", NOW));

console.log("\n=== date of birth sanity ===");
check("future date rejected", dateOfBirthIssue("2030-01-01", NOW) !== null);
check("implausibly old rejected", dateOfBirthIssue("1850-01-01", NOW) !== null);
check("ordinary date accepted", dateOfBirthIssue("2008-06-15", NOW) === null);

console.log("\n=== adults skip the guardian block ===");
const adult = validateConsentBlock({ dateOfBirth: "1995-01-01" }, NOW);
check("adult passes with no guardian", adult.ok === true, JSON.stringify(adult.issues));
check("adult marked not-minor", adult.data?.minor === false);
check("adult stores no guardian", adult.data?.guardian === null);

console.log("\n=== minors require a complete guardian block ===");
const goodGuardian = {
  guardianName: "Anita Sharma",
  guardianEmail: "anita.sharma@example.com",
  guardianRelationship: "Mother",
  guardianConsentConfirmed: true,
};
const minorOk = validateConsentBlock({ dateOfBirth: "2010-04-02", guardian: goodGuardian }, NOW);
check("complete block passes", minorOk.ok === true, JSON.stringify(minorOk.issues));
check("minor marked as minor", minorOk.data?.minor === true);

check("minor with NO guardian block is rejected",
  !validateConsentBlock({ dateOfBirth: "2010-04-02" }, NOW).ok);

const noTick = validateConsentBlock(
  { dateOfBirth: "2010-04-02", guardian: { ...goodGuardian, guardianConsentConfirmed: false } }, NOW);
check("unticked confirmation is rejected", !noTick.ok);
// The whole point: silence is not consent.
check("missing confirmation is rejected",
  !validateConsentBlock(
    { dateOfBirth: "2010-04-02", guardian: { ...goodGuardian, guardianConsentConfirmed: undefined } }, NOW).ok);

check("bad guardian email rejected",
  !validateConsentBlock(
    { dateOfBirth: "2010-04-02", guardian: { ...goodGuardian, guardianEmail: "not-an-email" } }, NOW).ok);
check("empty guardian name rejected",
  !validateConsentBlock(
    { dateOfBirth: "2010-04-02", guardian: { ...goodGuardian, guardianName: "" } }, NOW).ok);
check("invented relationship rejected",
  !validateConsentBlock(
    { dateOfBirth: "2010-04-02", guardian: { ...goodGuardian, guardianRelationship: "Friend" } }, NOW).ok);

console.log("\n=== issues are reportable ===");
const bad = validateConsentBlock({ dateOfBirth: "2010-04-02", guardian: {} }, NOW);
check("reports every missing field", (bad.issues?.length ?? 0) >= 3, JSON.stringify(bad.issues));
check("paths are namespaced under guardian",
  bad.issues.every((i) => i.path.startsWith("guardian.")), JSON.stringify(bad.issues));
check("each issue has a message",
  bad.issues.every((i) => typeof i.message === "string" && i.message.length > 0));

console.log("\n=== the bypass a client-side check would allow ===");
// A student editing the bundle can hide the guardian fields. The server must
// still refuse, which is why isMinor() is recomputed here from the DOB.
const forged = validateConsentBlock({ dateOfBirth: "2011-01-01", guardian: null }, NOW);
check("minor claiming no guardian needed is still rejected", !forged.ok);
check("and the rejection explains why", (forged.issues?.length ?? 0) > 0);

/* ── Server/client parity ─────────────────────────────────────────────────── */
/**
 * src/lib/guardianConsent.ts duplicates ageOn() and isMinor() because api/ is
 * plain ESM .js that a .ts module cannot import at runtime. A divergence would
 * show a 17-year-old an adult form (or an adult a guardian form), so the two
 * implementations are compared directly rather than trusted to stay in step.
 *
 * Type annotations are stripped instead of adding a TypeScript runner; the
 * functions are plain date arithmetic and `npx tsc --noEmit` already checks the
 * real file.
 */
console.log("\n=== server/client parity ===");
const { readFileSync } = await import("fs");

// Transpiled with esbuild rather than by stripping types with regexes. The
// regex approach was tried first and was quietly wrong: ": string | null" lost
// only the ": string", leaving a stray "| null" that failed to parse. A real
// transpiler removes exactly the types and nothing else.
const esbuild = await import("esbuild");
const clientTs = readFileSync(resolve(ROOT, "src/lib/guardianConsent.ts"), "utf8");
const { code: clientJs } = await esbuild.transform(clientTs, {
  loader: "ts",
  format: "esm",
});

const client = await import(
  "data:text/javascript," + encodeURIComponent(clientJs)
);

check("thresholds agree", client.MINOR_AGE === MINOR_AGE,
  `client=${client.MINOR_AGE} server=${MINOR_AGE}`);

// Sweep a range that crosses the 18th birthday day by day, plus leap years.
const sweep = [];
for (let year = 2004; year <= 2014; year++) {
  for (const md of ["-01-01", "-02-28", "-02-29", "-06-15", "-09-05", "-09-04", "-09-06", "-12-31"]) {
    sweep.push(`${year}${md}`);
  }
}
const asOfDates = ["2026-09-05", "2026-02-28", "2026-03-01", "2027-01-01"];

let ageMismatches = [], minorMismatches = [];
for (const dob of sweep) {
  for (const asOf of asOfDates) {
    if (client.ageOn(dob, asOf) !== ageOn(dob, asOf)) ageMismatches.push(`${dob}@${asOf}`);
    if (client.isMinor(dob, asOf) !== isMinor(dob, asOf)) minorMismatches.push(`${dob}@${asOf}`);
  }
}
check(`ageOn agrees across ${sweep.length * asOfDates.length} date pairs`,
  ageMismatches.length === 0, ageMismatches.slice(0, 5).join(", "));
check("isMinor agrees across the same range",
  minorMismatches.length === 0, minorMismatches.slice(0, 5).join(", "));

// Both must fail CLOSED on an unusable date, or one side lets a child through.
for (const bad of [null, undefined, "", "banana", "0000-00-00"]) {
  check(`both treat ${JSON.stringify(bad)} as a minor`,
    client.isMinor(bad, "2026-09-05") === true && isMinor(bad, "2026-09-05") === true);
}


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
