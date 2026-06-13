/**
 * SHARED FIREBASE ADMIN HELPERS
 * =============================
 * Centralizes Admin SDK initialization and Firebase ID-token verification so
 * every public serverless endpoint (groq, youtube-transcript, ndli) can cheaply
 * confirm the caller is a real, logged-in EduOnx user before doing paid work.
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_KEY env variable (already used by
 * admin-delete-user). If it is missing, verifyAuthToken throws and the caller
 * should respond 401 — endpoints fail CLOSED, never open.
 */
import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

export function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0];

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable");
  }

  const serviceAccount = JSON.parse(serviceAccountKey);
  return initializeApp({
    credential: cert(serviceAccount),
    storageBucket:
      process.env.VITE_FIREBASE_STORAGE_BUCKET ||
      `${serviceAccount.project_id}.appspot.com`,
  });
}

/**
 * Verify the Firebase ID token in the `Authorization: Bearer <token>` header.
 * Returns the decoded token on success; throws on any failure (missing header,
 * malformed token, expired/invalid signature, or unconfigured admin app).
 */
export async function verifyAuthToken(req: any): Promise<DecodedIdToken> {
  const header: string | undefined =
    req.headers?.authorization || req.headers?.Authorization;

  if (!header || !header.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) throw new Error("Empty bearer token");

  const app = getAdminApp();
  return await getAuth(app).verifyIdToken(token);
}

/**
 * Convenience guard for handlers: verifies the caller and, on failure, writes a
 * 401 response and returns null. Returns the decoded token on success.
 */
export async function requireAuth(req: any, res: any): Promise<DecodedIdToken | null> {
  try {
    return await verifyAuthToken(req);
  } catch (err: any) {
    res.status(401).json({ error: "Unauthorized: a valid sign-in is required." });
    return null;
  }
}
