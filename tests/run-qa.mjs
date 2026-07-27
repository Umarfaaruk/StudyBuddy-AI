/**
 * StudyBuddy AI — Deep QA report (Node, zero dependencies)
 * =================================================
 * Runs the full FREE static-analysis suite already available in this repo and
 * produces one consolidated bug/error report (Markdown + HTML). No new packages.
 *
 *   node tests/run-qa.mjs
 *
 * Checks:
 *   1. TypeScript    — real type errors (compile-breaking bugs)
 *   2. Dead code     — unused imports/vars/params (tsc --noUnusedLocals)
 *   3. ESLint        — lint errors incl. React hooks rules
 *   4. Production build — confirms the app actually bundles
 *
 * Exit code is non-zero if any compile-breaking check fails (CI-friendly).
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const REPORT_DIR = join(__dirname, "reports");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32" });
  return { out: ((r.stdout || "") + (r.stderr || "")).trim(), code: r.status ?? 1 };
}

function countLines(text, matcher) {
  return text.split("\n").filter((l) => matcher.test(l)).length;
}

console.log("StudyBuddy AI deep QA — running free static analysis suite...\n");

// 1. TypeScript type errors
console.log("  [1/4] TypeScript type-check ...");
const tsc = run("npx", ["tsc", "-p", "tsconfig.app.json", "--noEmit"]);
const tscErrors = countLines(tsc.out, /error TS\d+/);

// 2. Dead code
console.log("  [2/4] Dead-code scan ...");
const dead = run("npx", ["tsc", "-p", "tsconfig.app.json", "--noEmit", "--noUnusedLocals", "--noUnusedParameters"]);
const deadCount = countLines(dead.out, /error TS6\d{3}/);

// 3. ESLint
console.log("  [3/4] ESLint ...");
const lint = run("npx", ["eslint", "--config", "eslint.config.js", "src", "--format", "stylish"]);
const lintProblems = (lint.out.match(/(\d+) problems?/) || [])[1] || (lint.code === 0 ? "0" : "?");

// 4. Build
console.log("  [4/4] Production build ...");
const build = run("npm", ["run", "build"]);
const buildOk = build.code === 0 && /built in/.test(build.out);

// ── assemble ──────────────────────────────────────────────────────
const status = (ok) => (ok ? "✅ PASS" : "❌ FAIL");
const ts = new Date().toISOString();

const rows = [
  ["TypeScript type errors", tscErrors === 0 ? "✅ PASS" : "❌ FAIL", `${tscErrors} error(s)`],
  ["Dead code (unused imports/vars)", deadCount === 0 ? "✅ CLEAN" : "⚠️ FOUND", `${deadCount} item(s)`],
  ["ESLint", lint.code === 0 ? "✅ PASS" : "❌ FAIL", `${lintProblems} problem(s)`],
  ["Production build", status(buildOk), buildOk ? "bundled OK" : "build failed"],
];

let md = `# StudyBuddy AI — Deep QA Report\n\n_Generated: ${ts}_\n\n`;
md += `## Summary\n\n| Check | Status | Detail |\n|---|---|---|\n`;
for (const [name, st, detail] of rows) md += `| ${name} | ${st} | ${detail} |\n`;

md += `\n## Details\n\n`;
md += `### 1. TypeScript type errors (${tscErrors})\n\n`;
md += tscErrors ? "```\n" + tsc.out + "\n```\n" : "_No type errors — code compiles cleanly._\n";
md += `\n### 2. Dead code (${deadCount})\n\n`;
md += deadCount ? "```\n" + dead.out + "\n```\n" : "_No unused imports/variables/parameters._\n";
md += `\n### 3. ESLint\n\n`;
md += lint.code !== 0 ? "```\n" + lint.out + "\n```\n" : "_No lint problems._\n";
md += `\n### 4. Production build\n\n`;
md += buildOk ? "_Build succeeded._\n" : "```\n" + build.out.slice(-2000) + "\n```\n";

md += `\n## What this report does and does NOT cover\n\n`;
md += `- **Covers (free, static):** compile-breaking bugs, dead code, lint violations, build integrity.\n`;
md += `- **Does NOT cover:** runtime behaviour of live features (auth, AI answers, uploads). That needs\n`;
md += `  end-to-end browser tests (Playwright) which require installing dev dependencies.\n`;
md += `- **User capacity** is measured separately — see \`node tests/run-load.mjs\` and \`load-*.json\`.\n`;

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, "qa-report.md"), md);

const html = `<!doctype html><meta charset="utf-8"><title>StudyBuddy AI QA Report</title>
<style>body{font:15px/1.6 system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#0F172A}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #e2e8f0;padding:8px 12px;text-align:left}
th{background:#f1f5f9}pre{background:#0F172A;color:#e2e8f0;padding:14px;border-radius:8px;overflow:auto;font-size:13px}
h1{border-bottom:3px solid #29ABE2;padding-bottom:8px}code{background:#f1f5f9;padding:2px 5px;border-radius:4px}</style>
<body>${md
  .replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/```([\s\S]*?)```/g, (_, c) => `<pre>${c.trim()}</pre>`)
  .replace(/^### (.*)$/gm, "<h3>$1</h3>")
  .replace(/^## (.*)$/gm, "<h2>$1</h2>")
  .replace(/^# (.*)$/gm, "<h1>$1</h1>")
  .replace(/^\| (.*) \|$/gm, (line) => {
    const cells = line.split("|").map((s) => s.trim()).filter(Boolean);
    if (cells.every((c) => /^[-:]+$/.test(c))) return "";
    const tag = /Status|Check|Detail/.test(line) ? "th" : "td";
    return `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
  })
  .replace(/(<tr>[\s\S]*?<\/tr>)/g, "<table>$1</table>")
  .replace(/_([^_]+)_/g, "<em>$1</em>")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\n\n/g, "<br>")}</body>`;
writeFileSync(join(REPORT_DIR, "qa-report.html"), html);

console.log("\n" + "═".repeat(64));
for (const [name, st, detail] of rows) console.log(`  ${st}  ${name} — ${detail}`);
console.log("═".repeat(64));
console.log(`  Reports → tests/reports/qa-report.md  &  qa-report.html\n`);

// Fail CI only on compile-breaking issues (dead code is a warning, not a blocker).
process.exit(tscErrors === 0 && lint.code === 0 && buildOk ? 0 : 1);
