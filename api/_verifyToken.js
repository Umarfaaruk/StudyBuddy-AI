/**
 * SUPABASE ACCESS-TOKEN VERIFICATION (shared by public read endpoints)
 * ====================================================================
 * Verifies a Supabase access token on groq / youtube-transcript / ndli using a
 * server-side Supabase client — `auth.getUser(token)` validates the JWT against
 * the project and returns the user. See getConfig for why the anon key is a
 * sufficient credential for that check.
 *
 * RELIABILITY POSTURE:
 *   These endpoints expose no private user data — auth here only protects our
 *   AI/function quota from anonymous abuse. So the guard is:
 *     • fail-CLOSED (401) when the server is configured and the token is
 *       missing/invalid — real protection in normal operation;
 *     • fail-OPEN when the SERVER itself is misconfigured (no Supabase env) —
 *       a server config gap must never take AI features down for every user.
 */
import { createClient } from "@supabase/supabase-js";

/**
 * Resolve credentials for the verification client.
 *
 * THE ANON KEY IS ENOUGH HERE, AND THAT MATTERS.
 * ==============================================
 * The only thing this module does with the client is `auth.getUser(token)`,
 * which asks Supabase to validate a JWT the caller already supplied. That needs
 * no elevated privilege: the token is the credential being checked. Service
 * role exists to bypass RLS and perform admin operations, and this file does
 * neither.
 *
 * Falling back to the anon key is not a weakening, it is what closed a real
 * hole. Production ran for a long time with no service-role key set, so
 * requireAuth took its fail-open path on EVERY request and /api/groq was
 * callable by anyone with no session at all — a free, unauthenticated route to
 * the project's AI quota. The anon key was sitting right there in the same
 * environment the whole time.
 *
 * Order is deliberate: a service-role key is still preferred when present, so
 * nothing changes for a correctly configured deployment or for the Vercel↔
 * Supabase integration (which injects SUPABASE_SECRET_KEY). The anon key is the
 * last resort that keeps the guard ARMED instead of open.
 *
 * Note this does not remove the need for a service-role key elsewhere:
 * api/send-weekly-emails.ts reads other users' rows and genuinely requires it.
 */
export function getConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;
  return { url, key };
}

let _client = null;
function getClient() {
  if (_client) return _client;
  const { url, key } = getConfig();
  if (!url || !key) return null;
  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _client;
}

/**
 * Verify the `Authorization: Bearer <accessToken>` header.
 * Returns { uid, email } on success; throws on any failure.
 */
export async function verifyAuthToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) throw new Error("Empty bearer token");

  const sb = getClient();
  if (!sb) throw new Error("Server missing Supabase configuration");

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw new Error("Invalid or expired token");
  return { uid: data.user.id, email: data.user.email };
}

/**
 * Handler guard. Returns the caller (verified, or a fail-open sentinel when the
 * server lacks Supabase config) on success; writes 401 and returns null when the
 * server is configured but the token is missing/invalid.
 */
export async function requireAuth(req, res) {
  const { url, key } = getConfig();

  // Server misconfiguration must not break every user — fail OPEN with a warning.
  if (!url || !key) {
    console.warn(
      "[auth] No Supabase URL or key at all (tried SUPABASE_URL/VITE_SUPABASE_URL and " +
      "SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY/VITE_SUPABASE_ANON_KEY) — " +
      "skipping token verification. ANTI-ABUSE PROTECTION IS OFF and this endpoint " +
      "is open to anonymous callers. Set them in Vercel env."
    );
    return { uid: "unverified", unverified: true };
  }

  try {
    return await verifyAuthToken(req);
  } catch {
    res.status(401).json({ error: "Unauthorized: a valid sign-in is required." });
    return null;
  }
}
