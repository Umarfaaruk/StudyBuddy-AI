/**
 * Types for _spacedRepetition.js.
 *
 * Mirrors the _verifyToken.js / _verifyToken.d.ts pair: the implementation is
 * runtime-loadable ESM JavaScript, and this declaration gives TypeScript call
 * sites full checking without needing allowJs in tsconfig.node.json.
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

export interface ScheduleResult {
  state: ReviewState;
  nextDueAt: Date;
  /** The derived SM-2 quality, 0–5. */
  quality: number;
}

export declare const INITIAL_REVIEW_STATE: ReviewState;

export declare function deriveQuality(outcome: ReviewOutcome): number;

export declare function scheduleNextReview(
  state: ReviewState,
  outcome: ReviewOutcome,
  now?: Date
): ScheduleResult;

export declare function updateMastery(
  currentScore: number,
  isCorrect: boolean,
  quality: number,
  weight?: number
): number;
