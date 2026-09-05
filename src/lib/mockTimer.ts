/**
 * MOCK TEST CLOCK
 * ===============
 * The rules governing a timed attempt, extracted from MockTestSession so they
 * can be tested without mounting React or faking a browser.
 *
 * Every function takes `now` explicitly rather than reading Date.now() itself.
 * That is what makes "the deadline passed while the tab was closed" a case a
 * test can state directly, instead of something only reproducible by waiting.
 *
 * The invariant these exist to protect: elapsed time is measured from the
 * SERVER's started_at, so no client-side action — refreshing, clearing storage,
 * closing the laptop, changing the system clock — can extend an attempt.
 */

/** Milliseconds in a minute, named so the arithmetic below reads plainly. */
const MINUTE_MS = 60_000;

/**
 * When an attempt must end.
 *
 * `startedAt` is mock_test_attempts.started_at, NOT the moment the student
 * pressed Start in this particular tab. Those differ by exactly the amount a
 * refresh used to hand back for free.
 */
export function deadlineFrom(startedAt: number, durationMinutes: number): number {
  return startedAt + durationMinutes * MINUTE_MS;
}

/** Whole seconds left, floored at zero so a lapsed clock never renders negative. */
export function remainingSeconds(deadline: number, now: number): number {
  return Math.max(0, Math.round((deadline - now) / 1000));
}

/**
 * Whether the attempt is over.
 *
 * Deliberately inclusive: at exactly the deadline the attempt has ended. Using
 * a strict comparison would leave a one-tick window in which the clock reads
 * 00:00 but answers are still accepted.
 */
export function isExpired(deadline: number, now: number): boolean {
  return now >= deadline;
}

/**
 * What to do with an attempt found already in progress.
 *
 *   "submit" - the deadline passed while the student was away. Grade what
 *              exists; silently restarting the clock would make the score
 *              incomparable with every other attempt, which is the only thing
 *              a mock test really sells.
 *   "resume" - there is time left, so continue.
 */
export function resumeDecision(
  startedAt: number, durationMinutes: number, now: number
): "submit" | "resume" {
  return isExpired(deadlineFrom(startedAt, durationMinutes), now) ? "submit" : "resume";
}
