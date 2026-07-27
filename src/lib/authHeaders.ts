/**
 * AUTH HEADERS HELPER
 * ===================
 * Attaches the current user's Supabase access token as a Bearer token so our
 * serverless endpoints (/api/groq, /api/youtube-transcript, /api/ndli) can
 * verify the caller is a real, logged-in StudyBuddy AI user before doing paid work.
 *
 * Returns an empty object when no user is signed in or the token can't be
 * fetched — the server will then reject the request with 401, which is the
 * correct behavior (these endpoints require authentication).
 */
import { supabase } from "@/lib/supabase";

export async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}
