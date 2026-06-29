/**
 * Maps Supabase Auth errors to short, user-friendly messages.
 * Supabase returns a `message` (and sometimes a `status`/`code`); we normalise
 * the common cases and fall back to the raw message.
 */
export function getReadableAuthError(error: unknown): string {
  const msg =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: string }).message ?? "")
      : String(error ?? "");

  const m = msg.toLowerCase();

  if (m.includes("invalid login credentials")) return "Invalid email or password.";
  if (m.includes("email not confirmed")) return "Please confirm your email address first — check your inbox (and spam).";
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "An account with this email already exists. Try logging in instead.";
  if (m.includes("password should be at least")) return "Password is too short (minimum 6 characters).";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
  if (m.includes("network") || m.includes("fetch")) return "Network error. Check your internet connection and try again.";
  if (m.includes("provider is not enabled")) return "Google sign-in is not enabled yet. Enable it in Supabase → Auth → Providers.";

  return msg || "Authentication failed. Please try again.";
}
