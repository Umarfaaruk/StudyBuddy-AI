import { createClient } from "@supabase/supabase-js";

/**
 * SUPABASE CLIENT — single browser instance
 * ==========================================
 * Replaces src/lib/firebase.ts as the app's backend.
 *   • Auth      → Supabase Auth (email/password + Google OAuth)
 *   • Database  → Postgres (was Firestore); access is governed by RLS, so the
 *                 anon key below is safe to ship to the browser.
 *   • Storage   → Supabase Storage (avatars bucket)
 *   • Realtime  → Postgres change subscriptions (was Firestore onSnapshot)
 *
 * The `service_role` key is NEVER used here — it lives only in /api server
 * functions and bypasses RLS.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Missing Supabase environment variables:\n" +
      (!supabaseUrl ? "VITE_SUPABASE_URL\n" : "") +
      (!supabaseAnonKey ? "VITE_SUPABASE_ANON_KEY\n" : "") +
      "\nAdd these to your .env.local file. See README.md for details."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // needed for the Google OAuth redirect callback
  },
});
