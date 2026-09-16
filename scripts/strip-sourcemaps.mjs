/**
 * STRIP SOURCE MAPS FROM THE DEPLOY
 * =================================
 * vite.config.ts builds with `sourcemap: "hidden"`, which stops the
 * `//# sourceMappingURL=` line shipping — so a browser no longer fetches the
 * maps automatically. But the .map files are still written into dist/, and
 * Vercel serves dist/ as static assets, so anyone who guesses the filename
 * (trivial: it is the JS filename plus ".map") can still download the complete
 * original source, every file and every comment.
 *
 * The README declares this codebase proprietary, so that is worth closing.
 * This removes the maps as the last step of the build, after anything that
 * needs them has run.
 *
 * KEEPING THEM
 * ------------
 * Sentry needs maps to turn a minified stack trace back into real file and
 * line numbers. The correct order is: build → upload maps to Sentry → delete
 * them locally. There is no sentry-cli upload step in this project's build
 * today, and VITE_SENTRY_DSN is optional (unset = Sentry never initialises),
 * so the maps currently serve no purpose in the deployed output.
 *
 * When a Sentry upload IS added, run it BEFORE this script, or set
 * KEEP_SOURCEMAPS=1 to skip the strip entirely:
 *
 *     KEEP_SOURCEMAPS=1 npm run build
 *
 * Written in Node rather than as a shell `rm` so it behaves the same on
 * Windows, macOS and the Linux CI runner.
 */
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

if (process.env.KEEP_SOURCEMAPS === "1") {
  console.log("[sourcemaps] KEEP_SOURCEMAPS=1 — leaving .map files in place.");
  process.exit(0);
}

/** Every .map under dir, recursively. Missing dir is not an error. */
function findMaps(dir) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // dist/ absent — nothing built, nothing to strip
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue; // vanished mid-walk; not worth failing a build over
    }
    if (st.isDirectory()) out = out.concat(findMaps(full));
    else if (name.endsWith(".map")) out.push({ full, bytes: st.size });
  }
  return out;
}

const maps = findMaps(DIST);

if (maps.length === 0) {
  console.log("[sourcemaps] none found in dist/ — nothing to strip.");
  process.exit(0);
}

let freed = 0;
let failed = 0;
for (const m of maps) {
  try {
    unlinkSync(m.full);
    freed += m.bytes;
  } catch (err) {
    failed++;
    console.warn(`[sourcemaps] could not remove ${m.full}: ${err.message}`);
  }
}

console.log(
  `[sourcemaps] removed ${maps.length - failed}/${maps.length} map file(s), ` +
    `${(freed / 1024 / 1024).toFixed(1)}MB freed`
);

// A map left behind is the thing this script exists to prevent, so make it
// visible rather than letting a silent partial strip pass as success.
if (failed > 0) {
  console.error(
    `[sourcemaps] ${failed} map file(s) remain in dist/ and would be deployed.`
  );
  process.exit(1);
}
