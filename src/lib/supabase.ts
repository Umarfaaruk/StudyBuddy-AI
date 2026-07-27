import { createClient } from "@supabase/supabase-js";

/**
 * SUPABASE CLIENT — single browser instance
 * ==========================================
 * The app's single backend:
 *   • Auth      → Supabase Auth (email/password + Google OAuth)
 *   • Database  → Postgres; access is governed by RLS, so the anon key below
 *                 is safe to ship to the browser.
 *   • Storage   → Supabase Storage (avatars bucket)
 *   • Realtime  → Postgres change subscriptions
 *
 * The `service_role` key is NEVER used here — it lives only in /api server
 * functions and bypasses RLS.
 */

const envUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const envAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

/**
 * Whether real credentials were baked in at build time.
 *
 * When false the client below is built from inert placeholders. That is
 * deliberate: `createClient(undefined, undefined)` THROWS, and because this
 * module sits in the import graph of every page, that throw aborts the whole
 * bundle before React mounts — a blank white page with no error shown. Falling
 * back keeps the app bootable so `main.tsx` can render an explanatory screen
 * instead. Requests made with placeholders fail, which is the correct and
 * visible outcome.
 */
/**
 * A JWT is base64url segments separated by dots — strictly ASCII.
 *
 * This guards against a specific, badly-disguised mistake: copying the key
 * while the dashboard still has it MASKED, which yields "eyJhbGci••••••••".
 * That is a non-empty string, so every naive presence check passes and the app
 * boots looking healthy. The failure surfaces much later and in the wrong
 * place — a bullet (U+2022) cannot be encoded in an HTTP header, so fetch()
 * throws "String contains non ISO-8859-1 code point" before the request ever
 * leaves the browser, which reads to the user as a network outage.
 */
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** Modern Supabase publishable keys aren't JWTs; accept them too. */
const PUBLISHABLE_SHAPE = /^sb_publishable_[A-Za-z0-9_-]+$/;

const anonKeyLooksValid =
  JWT_SHAPE.test(envAnonKey) || PUBLISHABLE_SHAPE.test(envAnonKey);

export const isSupabaseConfigured = Boolean(
  envUrl && envAnonKey && anonKeyLooksValid
);

/** Human-readable reasons the config is unusable, for the boot error screen. */
export const missingSupabaseEnvVars: string[] = [
  ...(envUrl ? [] : ["VITE_SUPABASE_URL"]),
  ...(envAnonKey ? [] : ["VITE_SUPABASE_ANON_KEY"]),
  ...(envAnonKey && !anonKeyLooksValid
    ? [
        [...envAnonKey].some((c) => c.codePointAt(0)! > 127)
          ? "VITE_SUPABASE_ANON_KEY contains non-ASCII characters — you copied the key while it was still masked (the dots are literal • characters). Reveal it first, then copy."
          : "VITE_SUPABASE_ANON_KEY is malformed — expected a JWT (three dot-separated segments) or an sb_publishable_… key.",
      ]
    : []),
];

const supabaseUrl = envUrl || "https://placeholder-project.supabase.co";
// A malformed key is swapped for the placeholder too, so createClient never
// receives characters that would blow up inside fetch's header encoding.
const supabaseAnonKey = anonKeyLooksValid ? envAnonKey : "placeholder-anon-key";

if (!isSupabaseConfigured) {
  console.error(
    "Supabase is not configured correctly:\n" +
      missingSupabaseEnvVars.join("\n") +
      "\n\nLocal dev: fix them in .env.local (see README.md).\n" +
      "Production: Vercel → Project → Settings → Environment Variables, then redeploy."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // needed for the Google OAuth redirect callback
  },
});
