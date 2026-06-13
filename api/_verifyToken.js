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
 * Checks (per the Firebase ID-token spec):
 *   • RS256 signature against Google's securetoken JWKS
 *   • iss === https://securetoken.google.com/<projectId>
 *   • aud === <projectId>
 *   • exp / iat valid (handled by jose)
 *   • non-empty subject (uid)
 *
 * Requires the project id in env: FIREBASE_PROJECT_ID or VITE_FIREBASE_PROJECT_ID.
 */
import { jwtVerify, createRemoteJWKSet } from "jose";

// Google's public keys for Firebase ID tokens (JWK format). createRemoteJWKSet
// caches keys per Cache-Control and refreshes automatically.
const JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  )
);

function getProjectId() {
  const pid =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (!pid) {
    throw new Error(
      "Server missing FIREBASE_PROJECT_ID / VITE_FIREBASE_PROJECT_ID env var"
    );
  }
  return pid;
}

/**
 * Verify the `Authorization: Bearer <idToken>` header.
 * Returns { uid, email } on success; throws on any failure.
 */
export async function verifyAuthToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;

  if (!header || !header.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) throw new Error("Empty bearer token");

  const projectId = getProjectId();
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });

  if (!payload.sub) throw new Error("Token missing subject (uid)");

  return { uid: String(payload.sub), email: payload.email };
}

/**
 * Handler guard: verifies the caller and, on failure, writes a 401 and returns
 * null. Returns the verified user on success.
 */
export async function requireAuth(req, res) {
  try {
    return await verifyAuthToken(req);
  } catch {
    res.status(401).json({ error: "Unauthorized: a valid sign-in is required." });
    return null;
  }
}
