/**
 * LIGHTWEIGHT FIREBASE ID-TOKEN VERIFICATION (shared by public read endpoints)
 * ============================================================================
 * Verifies a Firebase ID token on groq / youtube-transcript / ndli WITHOUT the
 * heavy firebase-admin SDK — we only need to check the JWT signature + claims
 * against Google's public keys, which `jose` does with zero native deps.
 *
 * Implemented as plain ESM JavaScript and imported with an explicit ".js"
 * extension so it resolves identically under:
 *   • Node's native ESM loader (the `vite dev` API middleware) — which REQUIRES
 *     file extensions on relative imports (extensionless = ERR_MODULE_NOT_FOUND),
 *   • Vercel's esbuild bundler (production serverless functions),
 *   • TypeScript (the .ts endpoints import this via _verifyToken.d.ts).
 *
 * RELIABILITY POSTURE:
 *   These endpoints expose no private user data — auth here only protects our
 *   AI/function quota from anonymous abuse. So the guard is:
 *     • fail-CLOSED (401) when the server is configured and the token is
 *       missing/invalid — real protection in normal operation;
 *     • fail-OPEN when the SERVER itself is misconfigured (no project id env) —
 *       a server config gap must never take AI features down for every user.
 *
 * Token checks (per the Firebase ID-token spec):
 *   • RS256 signature against Google's securetoken JWKS
 *   • iss === https://securetoken.google.com/<projectId>
 *   • aud === <projectId>
 *   • exp / iat valid (handled by jose)
 *   • non-empty subject (uid)
 */
import { jwtVerify, createRemoteJWKSet } from "jose";

// Google's public keys for Firebase ID tokens (JWK format). createRemoteJWKSet
// caches keys per Cache-Control and refreshes automatically.
const JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  )
);

function resolveProjectId() {
  return (
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.VITE_FIREBASE_PROJECT_ID?.trim() ||
    ""
  );
}

/**
 * Verify the `Authorization: Bearer <idToken>` header against the given project.
 * Returns { uid, email } on success; throws on any failure.
 */
export async function verifyAuthToken(req, projectId) {
  const pid = projectId || resolveProjectId();
  if (!pid) throw new Error("Server missing FIREBASE_PROJECT_ID");

  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) throw new Error("Empty bearer token");

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${pid}`,
    audience: pid,
  });

  if (!payload.sub) throw new Error("Token missing subject (uid)");
  return { uid: String(payload.sub), email: payload.email };
}

/**
 * Handler guard. Returns the caller (verified, or a fail-open sentinel when the
 * server lacks a project id) on success; writes 401 and returns null when the
 * server is configured but the token is missing/invalid.
 */
export async function requireAuth(req, res) {
  const projectId = resolveProjectId();

  // Server misconfiguration must not break every user — fail OPEN with a warning.
  if (!projectId) {
    console.warn(
      "[auth] No FIREBASE_PROJECT_ID / VITE_FIREBASE_PROJECT_ID configured — " +
      "skipping token verification (anti-abuse protection disabled). Set it in Vercel env."
    );
    return { uid: "unverified", unverified: true };
  }

  try {
    return await verifyAuthToken(req, projectId);
  } catch {
    res.status(401).json({ error: "Unauthorized: a valid sign-in is required." });
    return null;
  }
}
