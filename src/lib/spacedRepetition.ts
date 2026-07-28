/**
 * SPACED REPETITION — simplified SM-2, driven by real performance
 * ===============================================================
 * Classic SM-2 asks the learner to self-rate recall 0–5. We don't have that
 * signal and asking for it on every question would wreck the flow of a practice
 * session. Instead the grade is DERIVED from what actually happened: whether
 * they got it right, and how long they took relative to a per-difficulty
 * expectation.
 *
 * That is the point of your "correct + fast → longer interval, correct + slow
 * or incorrect → shorter interval" requirement: speed is a proxy for fluency.
 * A student who takes 90 seconds on an easy kinematics question has not
 * mastered it, even though they got it right, and a fixed "review in 3 days"
 * schedule cannot tell those two students apart.
 *
 * Everything here is PURE — no Supabase, no clock reads except the `now`
 * parameter — so it can be unit tested and reused server-side without change.
 */

export type Difficulty = "easy" | "medium" | "hard";

/** SM-2 state for one (student, concept) pair. */
export interface ReviewState {
  intervalDays: number;
  ease: number;
  repetitions: number;
  lapses: number;
}

export interface ReviewOutcome {
  isCorrect: boolean;
  /** Time actually taken. Null when unmeasured — treated as "on pace". */
  timeTakenMs: number | null;
  difficulty: Difficulty;
}

/**
 * Expected solve time per difficulty. These are the calibration knobs — if
 * intervals feel wrong, tune here rather than touching the algorithm.
 */
const EXPECTED_MS: Record<Difficulty, number> = {
  easy: 45_000,
  medium: 90_000,
  hard: 180_000,
};

/** SM-2's floor. Below this, intervals collapse and the concept never settles. */
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
/** Cap so a long-mastered concept still resurfaces before the exam. */
const MAX_INTERVAL_DAYS = 180;

export const INITIAL_REVIEW_STATE: ReviewState = {
  intervalDays: 0,
  ease: 2.5,
  repetitions: 0,
  lapses: 0,
};

/**
 * Map an outcome onto SM-2's 0–5 quality scale.
 *
 * Wrong answers land in 0–2 (which resets the interval); correct answers in
 * 3–5 depending on speed. The split at 2/3 is SM-2's own "did they recall it
 * at all" boundary, so keeping it means the standard interval maths applies
 * unchanged.
 */
export function deriveQuality(outcome: ReviewOutcome): number {
  const { isCorrect, timeTakenMs, difficulty } = outcome;
  const expected = EXPECTED_MS[difficulty];

  if (!isCorrect) {
    // Fast AND wrong usually means a guess or a misread rather than a genuine
    // conceptual gap, so it is penalised slightly less harshly than a slow,
    // laboured wrong answer — the latter signals real confusion.
    if (timeTakenMs !== null && timeTakenMs < expected * 0.3) return 1;
    return 0;
  }

  if (timeTakenMs === null) return 4; // unmeasured: assume on pace

  const ratio = timeTakenMs / expected;
  if (ratio <= 0.6) return 5; // comfortably fluent
  if (ratio <= 1.2) return 4; // on pace
  return 3;                   // correct but laboured — review sooner
}

/**
 * Advance SM-2 state by one review.
 * Returns the next state and when it falls due.
 */
export function scheduleNextReview(
  state: ReviewState,
  outcome: ReviewOutcome,
  now: Date = new Date()
): { state: ReviewState; nextDueAt: Date; quality: number } {
  const quality = deriveQuality(outcome);

  // Standard SM-2 ease update. Clamped at both ends: the lower bound is SM-2's
  // own, the upper stops a lucky streak from pushing a concept years out.
  const easeDelta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  const ease = Math.min(MAX_EASE, Math.max(MIN_EASE, state.ease + easeDelta));

  let intervalDays: number;
  let repetitions: number;
  let lapses = state.lapses;

  if (quality < 3) {
    // Failed. Reset the ladder but keep the (now reduced) ease, so a concept
    // the student repeatedly fails keeps coming back faster than a fresh one.
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
 * A plain correct/seen percentage would let a strong early run mask a recent
 * collapse, so recent answers are weighted more heavily via an exponential
 * moving average. `weight` is how much a single new answer moves the score.
 */
export function updateMastery(
  currentScore: number,
  isCorrect: boolean,
  quality: number,
  weight = 0.25
): number {
  // Quality already folds in speed, so a slow-but-correct answer nudges the
  // score up less than a fast one instead of counting the same.
  const sample = isCorrect ? 60 + quality * 8 : Math.max(0, quality * 10);
  const next = currentScore * (1 - weight) + sample * weight;
  return Math.round(Math.min(100, Math.max(0, next)));
}
