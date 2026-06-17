/**
 * Maps internal/API errors to safe, user-friendly messages.
 * Never expose raw upstream provider errors, env var names, or stack traces.
 */
export function toUserFacingAIError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);

  if (/rate limit|429|too many requests/i.test(msg)) {
    return "Our AI tutor is busy right now. Please wait 30–60 seconds and try again.";
  }
  if (/timed out|timeout|504/i.test(msg)) {
    return "The AI took too long to respond. Please try again with a shorter question.";
  }
  if (/unauthorized|401|403|authentication/i.test(msg)) {
    return "Your session expired. Please sign in again and retry.";
  }
  if (/network|fetch failed|failed to fetch/i.test(msg)) {
    return "Connection problem. Check your internet and try again.";
  }
  if (/abort/i.test(msg)) {
    return "Request cancelled.";
  }

  return "Something went wrong with the AI tutor. Please try again.";
}
