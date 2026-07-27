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
export const isSupabaseConfigured = Boolean(envUrl && envAnonKey);

/** Names of the env vars that are missing, for error messages. */
export const missingSupabaseEnvVars: string[] = [
  ...(envUrl ? [] : ["VITE_SUPABASE_URL"]),
  ...(envAnonKey ? [] : ["VITE_SUPABASE_ANON_KEY"]),
];

const supabaseUrl = envUrl || "https://placeholder-project.supabase.co";
const supabaseAnonKey = envAnonKey || "placeholder-anon-key";

if (!isSupabaseConfigured) {
  console.error(
    "Missing Supabase environment variables:\n" +
      missingSupabaseEnvVars.join("\n") +
      "\n\nLocal dev: add them to .env.local (see README.md).\n" +
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
