 
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

/**
 * Initialize Firebase Admin SDK (singleton).
 * Requires FIREBASE_SERVICE_ACCOUNT_KEY env variable set in Vercel.
 * The value should be the full JSON string of your Firebase service account key.
 */
function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable");
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountKey);
    return initializeApp({
      credential: cert(serviceAccount),
    });
  } catch (e: any) {
    throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY: ${e.message}`);
  }
}

/**
 * API endpoint: DELETE /api/admin-delete-user
 * Body: { uid: string }
 * 
 * Deletes a user's Firebase Authentication account.
 * Must be called by an admin user (verified via Firebase ID token).
 */
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

    // Verify the calling user is actually an admin
    const decodedToken = await auth.verifyIdToken(adminToken);
    const callerUid = decodedToken.uid;

    // Check if caller is admin by looking up their custom claims or Firestore doc
    // We'll use Firestore to check since that's how the app stores admin status
    const { getFirestore } = await import("firebase-admin/firestore");
    const db = getFirestore(app);
    const callerDoc = await db.collection("users").doc(callerUid).get();
    const callerData = callerDoc.data();
    let isCallerAdmin =
      callerData?.is_admin === true || callerData?.role === "admin";

    if (!isCallerAdmin) {
      const profileDoc = await db.collection("profiles").doc(callerUid).get();
      const profileData = profileDoc.data();
      isCallerAdmin =
        profileData?.is_admin === true || profileData?.role === "admin";
    }

    if (!isCallerAdmin) {
      return res.status(403).json({ error: "Forbidden: caller is not an admin" });
    }

    // Prevent admin from deleting themselves
    if (uid === callerUid) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    // Delete the user's auth account
    await auth.deleteUser(uid);

    return res.status(200).json({ 
      success: true, 
      message: `User ${uid} authentication account deleted successfully` 
    });
  } catch (error: any) {
    console.error("[admin-delete-user] Error:", error);

    if (error.code === "auth/user-not-found") {
      // User auth already deleted, still return success
      return res.status(200).json({ 
        success: true, 
        message: "User auth account was already deleted" 
      });
    }

    return res.status(500).json({ 
      error: error?.message || "Internal server error" 
    });
  }
}
