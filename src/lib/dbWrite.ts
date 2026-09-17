/**
 * MAKING SUPABASE WRITES FAIL LOUDLY
 * ==================================
 * supabase-js does NOT throw when the database rejects a statement. It
 * resolves with `{ data, error }` and leaves the decision to the caller. So
 * this, which appears throughout the app, catches nothing:
 *
 *     try {
 *       await supabase.from("profiles").update({ ... }).eq("id", uid);
 *       toast.success("Saved!");          // runs even when the write failed
 *     } catch (err) {
 *       toast.error("Could not save");    // unreachable for DB errors
 *     }
 *
 * The visible symptom is the worst kind: the app says "Saved!", the row was
 * never written, and the change is gone on the next reload. An RLS policy that
 * does not match, a column that no longer exists, or an expired token all look
 * like success. That is what "the upload button doesn't work" turns out to be.
 *
 * Wrapping a write in `must()` converts the returned error into a real thrown
 * Error, so the `catch` that was already written around it starts doing its
 * job, and the success line is only reached when the write actually landed.
 *
 *     await must(
 *       supabase.from("profiles").update({ ... }).eq("id", uid),
 *       "save your profile picture"
 *     );
 *
 * `what` is phrased as the user-facing action ("save your progress") so the
 * thrown message reads sensibly if it ever reaches a toast, while the original
 * Postgres detail is kept on `.cause` for the console and Sentry.
 */

interface SupabaseResultLike<T> {
  data: T;
  error: { message?: string; code?: string; details?: string } | null;
}

export class DbWriteError extends Error {
  readonly code?: string;
  /** Declared explicitly: the TS lib target here predates Error.cause. */
  readonly cause?: unknown;

  constructor(action: string, error: NonNullable<SupabaseResultLike<unknown>["error"]>) {
    super(`Could not ${action}.`);
    this.name = "DbWriteError";
    this.code = error.code;
    // Keep the real reason attached rather than in the message: the message may
    // be shown to a student, and "new row violates row-level security policy"
    // is not for them. The console and Sentry still get the whole thing.
    this.cause = error;
  }
}

/**
 * Await a Supabase query and throw if it reported an error.
 *
 * @param op     The query builder or promise, e.g. `supabase.from(…).insert(…)`.
 * @param action What the user was trying to do, lower-case and without a full
 *               stop — "save your notes", "mark the lesson complete".
 * @returns      The `data` the query returned, so it can still be chained.
 */
export async function must<T>(
  op: PromiseLike<SupabaseResultLike<T>>,
  action: string
): Promise<T> {
  const { data, error } = await op;
  if (error) {
    const wrapped = new DbWriteError(action, error);
    // Logged here as well as wherever it is caught, because the detail on
    // .cause is what makes these diagnosable and callers often only show the
    // friendly message.
    console.error(`[db] failed to ${action}:`, error);
    throw wrapped;
  }
  return data;
}

export default must;
