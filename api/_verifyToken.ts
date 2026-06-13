/**
 * LIGHTWEIGHT FIREBASE ID-TOKEN VERIFICATION
 * ==========================================
 * Verifies a Firebase ID token on the public read endpoints (groq,
 * youtube-transcript, ndli) WITHOUT pulling in the heavy firebase-admin SDK.
 *
 * Why not firebase-admin here?
 *   firebase-admin drags in grpc/protobuf native deps that Vercel's bundler
 *   frequently fails to trace into per-route functions, crashing them at module
 *   load (HTTP 500 before the handler even runs). For simple token *verification*
 *   we only need to check the JWT signature + claims against Google's public
 *   keys — which `jose` does in a few KB with zero native deps. (admin-delete-user
 *   keeps firebase-admin because it genuinely needs the Admin SDK to delete data.)
 *
 * What it checks (per Firebase ID-token spec):
 *   • RS256 signature against Google's securetoken JWKS
 *   • iss === https://securetoken.google.com/<projectId>
 *   • aud === <projectId>
 *   • exp / iat are valid (handled by jose)
 *   • a non-empty subject (the user's uid)
 *
 * Requires the project id in env: FIREBASE_PROJECT_ID or VITE_FIREBASE_PROJECT_ID.
 */
import { jwtVerify, createRemoteJWKSet } from "jose";

// Google's public keys for Firebase ID tokens (JWK format). createRemoteJWKSet
// caches keys per Cache-Control and refreshes automatically, so this is cheap
// across warm invocations.
const JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  )
);

function getProjectId(): string {
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

export interface VerifiedUser {
  uid: string;
  email?: string;
}

/**
 * Verify the `Authorization: Bearer <idToken>` header. Returns the user on
 * success; throws on any failure (missing header, bad signature, wrong
 * project, expired token).
 */
export async function verifyAuthToken(req: any): Promise<VerifiedUser> {
  const header: string | undefined =
    req.headers?.authorization || req.headers?.Authorization;

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

  return { uid: String(payload.sub), email: payload.email as string | undefined };
}

/**
 * Handler guard: verifies the caller and, on failure, writes a 401 and returns
 * null. Returns the verified user on success.
 */
export async function requireAuth(req: any, res: any): Promise<VerifiedUser | null> {
  try {
    return await verifyAuthToken(req);
  } catch {
    res.status(401).json({ error: "Unauthorized: a valid sign-in is required." });
    return null;
  }
}
