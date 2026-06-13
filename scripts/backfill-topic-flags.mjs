/**
 * ONE-TIME BACKFILL — normalize `is_custom` on every topic
 * ========================================================
 * After this runs, LessonList / ProgressDashboard can query topics server-side:
 *   • public/official topics → is_custom == false
 *   • custom topics          → is_custom == true (already set at creation)
 *
 * This is SAFE to run BEFORE deploying the new frontend: the old frontend
 * ignores the added is_custom:false on public topics, so nothing breaks.
 * It is idempotent — re-running it changes nothing once everything is normalized.
 *
 * USAGE (PowerShell):
 *   $env:FIREBASE_SERVICE_ACCOUNT_KEY = Get-Content service-account.json -Raw
 *   node scripts/backfill-topic-flags.mjs
 *
 * Or point at a key file instead:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\service-account.json"
 *   node scripts/backfill-topic-flags.mjs
 *
 * Add --dry-run to preview without writing.
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const DRY_RUN = process.argv.includes("--dry-run");

function initAdmin() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    return initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return initializeApp({ credential: applicationDefault() });
  }
  throw new Error(
    "Set FIREBASE_SERVICE_ACCOUNT_KEY (JSON string) or GOOGLE_APPLICATION_CREDENTIALS (file path)."
  );
}

async function main() {
  initAdmin();
  const db = getFirestore();

  const snap = await db.collection("topics").get();
  console.log(`Found ${snap.size} topics. Dry run: ${DRY_RUN}`);

  let toFix = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    // Custom topics are anything explicitly flagged true OR owned by a user.
    const isCustom = data.is_custom === true || (!!data.user_id && data.is_custom !== false);
    const desired = isCustom ? true : false;
    if (data.is_custom !== desired) {
      toFix.push({ ref: doc.ref, id: doc.id, from: data.is_custom, to: desired });
    }
  }

  console.log(`${toFix.length} topic(s) need normalization.`);
  for (const f of toFix) {
    console.log(`  ${f.id}: is_custom ${JSON.stringify(f.from)} -> ${f.to}`);
  }

  if (DRY_RUN || toFix.length === 0) {
    console.log(DRY_RUN ? "Dry run — no writes performed." : "Nothing to do.");
    return;
  }

  // Commit in batches of 450 (Firestore limit is 500).
  for (let i = 0; i < toFix.length; i += 450) {
    const batch = db.batch();
    for (const f of toFix.slice(i, i + 450)) {
      batch.set(f.ref, { is_custom: f.to }, { merge: true });
    }
    await batch.commit();
  }
  console.log(`Done. Normalized ${toFix.length} topic(s).`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
