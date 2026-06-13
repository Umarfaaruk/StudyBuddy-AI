import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

/**
 * ADMIN DELETE USER — complete account erasure
 * =============================================
 * Deletes EVERYTHING belonging to a user, server-side via the Admin SDK.
 * The Admin SDK bypasses Firestore security rules, so cleanup cannot be
 * silently blocked by per-collection rule gaps (which is exactly what was
 * happening with the previous client-side cleanup: analytics, notifications,
 * analytics_snapshots, follows and friends_list were never actually removed).
 *
 * What gets deleted, in order:
 *   1. Firebase Auth account            (user can no longer log in)
 *   2. Firestore — query-based:         every doc in 18 collections that
 *                                       references the uid (incl. follows
 *                                       in BOTH directions and friend
 *                                       requests sent AND received)
 *   3. Firestore — doc-id-based:        profiles, users, user_streaks,
 *                                       user_preferences, analytics
 *   4. Storage:                         avatars/{uid}/ folder
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_KEY env variable set in Vercel.
 */

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable");
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountKey);
    // Normalize escaped newlines in the PEM private key. Service-account JSON is
    // commonly stored as a single line with literal "\n" sequences (in Vercel
    // env vars or a quoted .env value); without this, cert() throws
    // "Failed to parse private key: DECODER routines::unsupported".
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }
    return initializeApp({
      credential: cert(serviceAccount),
      storageBucket:
        process.env.VITE_FIREBASE_STORAGE_BUCKET ||
        `${serviceAccount.project_id}.appspot.com`,
    });
  } catch (e: any) {
    throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY: ${e.message}`);
  }
}

/** Collections where user docs are found by a field == uid query.
 *  Some collections reference the user under more than one field
 *  (follows: as follower AND as followed; friends_list: requests
 *  sent AND received) — every direction is listed explicitly. */
const QUERY_CLEANUP: Array<{ name: string; field: string }> = [
  { name: "xp_logs",             field: "user_id" },
  { name: "study_sessions",      field: "user_id" },
  { name: "quiz_attempts",       field: "user_id" },
  { name: "materials",           field: "user_id" },
  { name: "doubt_sessions",      field: "user_id" },
  { name: "doubt_messages",      field: "user_id" },
  { name: "flashcards",          field: "user_id" },
  { name: "study_plans",         field: "user_id" },
  { name: "saved_notes",         field: "user_id" },
  { name: "feedback",            field: "userId" },
  { name: "analytics_snapshots", field: "user_id" },
  { name: "lesson_progress",     field: "user_id" },
  { name: "topic_progress",      field: "user_id" },
  { name: "notifications",       field: "user_id" },
  // Social graph — both directions, so the deleted user disappears
  // from everyone else's followers/following/friends lists too.
  { name: "follows",             field: "follower_id" },
  { name: "follows",             field: "following_id" },
  { name: "friends_list",        field: "requester_id" },
  { name: "friends_list",        field: "addressee_id" },
];

/** Docs whose ID is the uid itself. */
const DOC_ID_CLEANUP = ["analytics", "user_streaks", "user_preferences", "profiles", "users"];

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { uid, adminToken } = body ?? {};

    if (!uid || typeof uid !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'uid' field" });
    }
    if (!adminToken || typeof adminToken !== "string") {
      return res.status(400).json({ error: "Missing admin authentication token" });
    }

    const app = getAdminApp();
    const auth = getAuth(app);

    // ── Verify the caller is an admin ─────────────────────────
    const decodedToken = await auth.verifyIdToken(adminToken);
    const callerUid = decodedToken.uid;

    const { getFirestore, FieldPath } = await import("firebase-admin/firestore");
    const db = getFirestore(app);

    const callerDoc = await db.collection("users").doc(callerUid).get();
    const callerData = callerDoc.data();
    let isCallerAdmin = callerData?.is_admin === true || callerData?.role === "admin";

    if (!isCallerAdmin) {
      const profileDoc = await db.collection("profiles").doc(callerUid).get();
      const profileData = profileDoc.data();
      isCallerAdmin = profileData?.is_admin === true || profileData?.role === "admin";
    }

    if (!isCallerAdmin) {
      return res.status(403).json({ error: "Forbidden: caller is not an admin" });
    }
    if (uid === callerUid) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    // ── STEP 1: Delete Auth account (locks the user out first) ──
    let authDeleted = false;
    try {
      await auth.deleteUser(uid);
      authDeleted = true;
    } catch (error: any) {
      if (error.code === "auth/user-not-found") {
        authDeleted = true; // already gone — continue with data cleanup
      } else {
        throw error;
      }
    }

    // ── STEP 2: Firestore query-based cleanup (Admin SDK = no rules) ──
    let deletedDocs = 0;
    const failures: string[] = [];

    /** Delete a list of document refs in batches of 450 (limit is 500). */
    const deleteRefs = async (refs: FirebaseFirestore.DocumentReference[]) => {
      for (let i = 0; i < refs.length; i += 450) {
        const batch = db.batch();
        for (const ref of refs.slice(i, i + 450)) batch.delete(ref);
        await batch.commit();
      }
      deletedDocs += refs.length;
    };

    await Promise.all(
      QUERY_CLEANUP.map(async ({ name, field }) => {
        try {
          const snap = await db.collection(name).where(field, "==", uid).get();
          if (!snap.empty) await deleteRefs(snap.docs.map((d) => d.ref));
        } catch (err: any) {
          failures.push(`${name}(${field}): ${err?.message}`);
        }
      })
    );

    // Some lesson_progress docs use `${uid}_${topicId}` IDs without a
    // user_id field — catch those by document ID prefix as a safety net.
    try {
      const snap = await db
        .collection("lesson_progress")
        .where(FieldPath.documentId(), ">=", `${uid}_`)
        .where(FieldPath.documentId(), "<", `${uid}_\uf8ff`)
        .get();
      if (!snap.empty) await deleteRefs(snap.docs.map((d) => d.ref));
    } catch (err: any) {
      failures.push(`lesson_progress(id-prefix): ${err?.message}`);
    }

    // ── STEP 3: Doc-ID-based cleanup ──────────────────────────
    await Promise.all(
      DOC_ID_CLEANUP.map(async (name) => {
        try {
          await db.collection(name).doc(uid).delete();
          deletedDocs += 1;
        } catch (err: any) {
          failures.push(`${name}: ${err?.message}`);
        }
      })
    );

    // ── STEP 4: Storage cleanup (avatar files) ────────────────
    try {
      const { getStorage } = await import("firebase-admin/storage");
      await getStorage(app).bucket().deleteFiles({ prefix: `avatars/${uid}/` });
    } catch (err: any) {
      // Best effort — bucket may not exist or have no files
      failures.push(`storage: ${err?.message}`);
    }

    console.log(
      `[admin-delete-user] uid=${uid} authDeleted=${authDeleted} docs=${deletedDocs} failures=${failures.length}`,
      failures.length ? failures : ""
    );

    return res.status(200).json({
      success: true,
      message: `User ${uid} fully deleted`,
      deletedDocs,
      failures, // empty array when everything succeeded
    });
  } catch (error: any) {
    console.error("[admin-delete-user] Error:", error);
    return res.status(500).json({ error: error?.message || "Internal server error" });
  }
}
