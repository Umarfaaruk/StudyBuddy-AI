/**
 * SPACED REPETITION — simplified SM-2, driven by real performance
 * ===============================================================
 * Server-side only. Scheduling happens in the same request as grading (see
 * grade.ts), because grading is the only place an answer may be compared — so
 * the client never needs this and there is exactly one implementation.
 *
 * Plain .js with a sibling .d.ts, matching _verifyToken.js: package.json sets
 * "type": "module", so Node's ESM loader needs a real file with an explicit
 * extension at runtime. A .ts file imported from here fails with
 * ERR_MODULE_NOT_FOUND under the dev middleware.
 *
 * Classic SM-2 asks the learner to self-rate recall 0–5. We don't have that
 * signal, and asking on every question would wreck the flow of a practice set.
 * The grade is DERIVED instead: whether they were right, and how long they took
 * against a per-difficulty expectation. Speed is the fluency proxy — 90 seconds
 * on an easy kinematics question is not mastery even when the answer is right,
 * and a fixed "review in 3 days" cannot tell those two students apart.
 *
 * Pure: no I/O, no clock reads except the `now` argument.
 */

/** Expected solve time per difficulty — the calibration knobs. */
const EXPECTED_MS = { easy: 45000, medium: 90000, hard: 180000 };

/** SM-2's floor. Below this, intervals collapse and a concept never settles. */
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
/** Cap so a long-mastered concept still resurfaces before the exam. */
const MAX_INTERVAL_DAYS = 180;

export const INITIAL_REVIEW_STATE = {
  intervalDays: 0,
  ease: 2.5,
  repetitions: 0,
  lapses: 0,
};

/**
 * Map an outcome onto SM-2's 0–5 quality scale.
 *
 * Wrong answers land in 0–2 (which resets the interval), correct ones in 3–5 by
 * speed. The 2/3 split is SM-2's own "did they recall it at all" boundary, so
 * the standard interval maths applies unchanged.
 */
export function deriveQuality(outcome) {
  const { isCorrect, timeTakenMs, difficulty } = outcome;
  const expected = EXPECTED_MS[difficulty] ?? EXPECTED_MS.medium;

  if (!isCorrect) {
    // Fast AND wrong is usually a guess or a misread rather than a genuine
    // conceptual gap, so it is penalised less than a slow, laboured wrong
    // answer — the latter signals real confusion.
    if (timeTakenMs !== null && timeTakenMs < expected * 0.3) return 1;
    return 0;
  }

  if (timeTakenMs === null) return 4; // unmeasured: assume on pace

  const ratio = timeTakenMs / expected;
  if (ratio <= 0.6) return 5; // comfortably fluent
  if (ratio <= 1.2) return 4; // on pace
  return 3;                   // correct but laboured — bring the review forward
}

/** Advance SM-2 state by one review. */
export function scheduleNextReview(state, outcome, now = new Date()) {
  const quality = deriveQuality(outcome);

  // Standard SM-2 ease update, clamped at both ends: the lower bound is SM-2's
  // own, the upper stops a lucky streak pushing a concept years out.
  const easeDelta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  const ease = Math.min(MAX_EASE, Math.max(MIN_EASE, state.ease + easeDelta));

  let intervalDays;
  let repetitions;
  let lapses = state.lapses;

  if (quality < 3) {
    // Failed. Reset the ladder but keep the reduced ease, so a repeatedly
    // failed concept keeps returning faster than a fresh one.
    repetitions = 0;
    lapses += 1;
    intervalDays = 1;
  } else {
    repetitions = state.repetitions + 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 3;
    else intervalDays = Math.round(state.intervalDays * ease);
  }

  intervalDays = Math.min(MAX_INTERVAL_DAYS, Math.max(1, intervalDays));

  const nextDueAt = new Date(now);
  nextDueAt.setDate(nextDueAt.getDate() + intervalDays);

  return {
    state: { intervalDays, ease: Number(ease.toFixed(2)), repetitions, lapses },
    nextDueAt,
    quality,
  };
}

/**
 * Rolling per-topic mastery, 0–100.
 *
 * A plain correct/seen percentage lets a strong early run mask a recent
 * collapse, so recent answers weigh more via an exponential moving average.
 */
export function updateMastery(currentScore, isCorrect, quality, weight = 0.25) {
  // Quality already folds in speed, so slow-but-correct nudges the score up
  // less than fast-and-correct instead of counting the same.
  const sample = isCorrect ? 60 + quality * 8 : Math.max(0, quality * 10);
  const next = currentScore * (1 - weight) + sample * weight;
  return Math.round(Math.min(100, Math.max(0, next)));
}
