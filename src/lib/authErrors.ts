/**
 * Maps Supabase Auth errors to short, user-friendly messages.
 * Supabase returns a `message` (and sometimes a `status`/`code`); we normalise
 * the common cases and fall back to the raw message.
 */
export function getReadableAuthError(error: unknown): string {
  // Supabase's AuthError stores `message`/`code` as NON-enumerable props, so a
  // naive String(error) or JSON.stringify yields "[object Object]" / "{}". Pull
  // the fields out explicitly and treat those useless renderings as empty.
  const e = error as { message?: unknown; code?: unknown; error_code?: unknown } | null;
  let msg = "";
  if (typeof error === "string") {
    msg = error;
  } else if (e && typeof e === "object") {
    if (typeof e.message === "string") msg = e.message;
    if (!msg && typeof e.code === "string") msg = e.code;
    if (!msg && typeof e.error_code === "string") msg = e.error_code;
  }
  if (msg === "[object Object]" || msg === "{}") msg = "";

  const m = msg.toLowerCase();

  if (m.includes("invalid login credentials")) return "Invalid email or password.";
  if (m.includes("email not confirmed")) return "Please confirm your email address first — check your inbox (and spam).";
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "An account with this email already exists. Try logging in instead.";
  if (m.includes("password should be at least")) return "Password is too short (minimum 6 characters).";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
  // Confirmation email couldn't be sent (misconfigured SMTP, 5xx from mailer, etc.)
  if (m.includes("sending confirmation") || m.includes("error sending") || m.includes("confirmation email"))
    return "We couldn't send the confirmation email right now. Please try again in a moment — if it keeps happening, contact support.";
  if (m.includes("unexpected_failure") || m.includes("unexpected failure") || m.includes("database error"))
    return "Something went wrong creating your account. Please try again in a moment.";
  // A bad header value makes fetch() throw before the request is sent. Blaming
  // the user's connection sends them chasing a fault that isn't there — this is
  // always a malformed key/URL in the build (classically, an anon key copied
  // while still masked, so it is full of • characters).
  if (m.includes("iso-8859-1") || m.includes("requestinit") || m.includes("headers"))
    return "This app is misconfigured — its API key is invalid, so the request was never sent. (Not your connection.) Please contact support.";
  if (m.includes("network") || m.includes("fetch")) return "Network error. Check your internet connection and try again.";
  if (m.includes("provider is not enabled")) return "Google sign-in is not enabled yet. Enable it in Supabase → Auth → Providers.";

  return msg || "Authentication failed. Please try again.";
}
