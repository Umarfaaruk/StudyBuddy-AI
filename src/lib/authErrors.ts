/**
 * Maps Supabase Auth errors to short, user-friendly messages.
 * Supabase returns a `message` (and sometimes a `status`/`code`); we normalise
 * the common cases and fall back to the raw message.
 *
 * WHY THE FLOW MATTERS
 * ====================
 * One mapper serves four different flows, and several Supabase errors are
 * ambiguous without knowing which one you were in. `unexpected_failure` is the
 * clearest case: on signup it means the account could not be created, but on a
 * password reset it means the *email* could not be sent — completely different
 * advice for the user.
 *
 * This bit us in production. A reset failed with a 500 (`unexpected_failure`,
 * an SMTP `535 Invalid username` behind it) and the user was shown
 * "Authentication failed. Please try again." They had not been authenticating
 * at all — they had clicked "Forgot password?" — so the message sent them
 * checking their password while the real fault was server-side mail config.
 *
 * Passing the flow keeps the fallbacks honest. It defaults to "login" so no
 * call site is silently wrong if one is added without thinking about it, but
 * every existing caller passes its flow explicitly.
 */

/** Which auth operation produced the error. */
export type AuthFlow = "login" | "signup" | "reset" | "oauth";

/** Last-resort wording when Supabase gives us nothing usable to show. */
const FALLBACK: Record<AuthFlow, string> = {
  login: "Could not sign you in. Please try again.",
  signup: "Could not create your account. Please try again.",
  reset: "Could not send the reset link. Please try again in a moment.",
  oauth: "Google sign-in did not complete. Please try again.",
};

/**
 * A 500 from Supabase Auth. What actually broke depends entirely on the flow,
 * so say what failed rather than guessing at a cause.
 */
const SERVER_ERROR: Record<AuthFlow, string> = {
  login: "Something went wrong signing you in. Please try again in a moment.",
  signup: "Something went wrong creating your account. Please try again in a moment.",
  // In practice this is nearly always the mail service refusing the send, which
  // no amount of retrying by the user will fix.
  reset:
    "We couldn't send the reset email — the mail service rejected it. " +
    "That's a server-side setting rather than anything you did; please contact support.",
  oauth: "Something went wrong during Google sign-in. Please try again in a moment.",
};

export function getReadableAuthError(error: unknown, flow: AuthFlow = "login"): string {
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
  // Deliberately no number here. The minimum is a project setting that can be
  // raised at any time, and a hardcoded one silently becomes a lie — this said
  // "minimum 6 characters" for a while after the project moved to 12.
  if (m.includes("password should be at least")) return "That password is too short.";
  // Raised once character-class requirements are switched on. Supabase's own
  // message lists which classes are missing, which is more useful than anything
  // we could restate, so pass it through.
  if (m.includes("weak_password") || m.includes("password is too weak") || m.includes("does not meet"))
    return msg || "That password does not meet the requirements. Try a longer one with numbers, capitals and a symbol.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
  // Confirmation email couldn't be sent (misconfigured SMTP, 5xx from mailer, etc.)
  if (m.includes("sending confirmation") || m.includes("error sending") || m.includes("confirmation email"))
    return flow === "reset"
      ? SERVER_ERROR.reset
      : "We couldn't send the confirmation email right now. Please try again in a moment — if it keeps happening, contact support.";
  if (m.includes("unexpected_failure") || m.includes("unexpected failure") || m.includes("database error"))
    return SERVER_ERROR[flow];
  // A bad header value makes fetch() throw before the request is sent. Blaming
  // the user's connection sends them chasing a fault that isn't there — this is
  // always a malformed key/URL in the build (classically, an anon key copied
  // while still masked, so it is full of • characters).
  if (m.includes("iso-8859-1") || m.includes("requestinit") || m.includes("headers"))
    return "This app is misconfigured — its API key is invalid, so the request was never sent. (Not your connection.) Please contact support.";
  if (m.includes("network") || m.includes("fetch")) return "Network error. Check your internet connection and try again.";
  if (m.includes("provider is not enabled")) return "Google sign-in is not enabled yet. Enable it in Supabase → Auth → Providers.";
  // An OAuth redirect the project has not allow-listed. Supabase discards the
  // requested redirectTo and falls back to the Site URL, so the user lands
  // somewhere unexpected rather than seeing an error at all — but when it does
  // surface, name the actual cause.
  if (m.includes("redirect") && (m.includes("not allowed") || m.includes("invalid")))
    return "This sign-in link isn't allow-listed for this site. Add it under Supabase → Auth → URL Configuration.";

  return msg || FALLBACK[flow];
}
