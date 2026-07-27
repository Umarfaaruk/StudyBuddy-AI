import { supabase } from "@/lib/supabase";
import { toDateKey } from "@/lib/utils";

interface StreakData {
  current_streak: number;
  longest_streak: number;
  last_study_date: string | null;
}

interface SaveSessionResult {
  xp: number;
  newStreak: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const dayDiff = (a: string, b: string) => {
  const first = new Date(`${a}T00:00:00Z`).getTime();
  const second = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((first - second) / DAY_MS);
};

/**
 * Wraps any promise with a timeout, so a hung request can't freeze the UI
 * (e.g. blocked by RLS or an offline network).
 */
function withTimeout<T>(promise: PromiseLike<T>, ms = 15_000, label = "Supabase"): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms / 1000}s — check your Supabase RLS policies / network`)),
        ms
      )
    ),
  ]);
}

/**
 * Await a Supabase query quietly: returns { data, error } and never throws.
 * Used for non-critical writes (XP, streak) that shouldn't block the save.
 */
async function sbQuiet<T = unknown>(
  query: PromiseLike<{ data: T; error: { message?: string } | null }>,
  label: string
): Promise<{ data: T | null; error: unknown }> {
  try {
    const res = await withTimeout(query, 15_000, label);
    if (res.error) console.warn(`[StudySession] ⚠️ ${label} failed (non-critical):`, res.error.message);
    return res;
  } catch (e) {
    console.warn(`[StudySession] ⚠️ ${label} timed out (non-critical):`, e instanceof Error ? e.message : e);
    return { data: null, error: e };
  }
}

/**
 * Local storage queue for failed saves.
 * Sessions that fail to save to the backend are queued for retry.
 */
export const RETRY_QUEUE_KEY = "studybuddy_save_retry_queue";

interface QueuedSession {
  userId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  queuedAt: number;
  topicId?: string | null;
}

function getRetryQueue(): QueuedSession[] {
  try {
    const data = localStorage.getItem(RETRY_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function addToRetryQueue(session: QueuedSession): void {
  try {
    const queue = getRetryQueue();
    // Keep max 20 items, discard items older than 7 days
    const sevenDaysAgo = Date.now() - 7 * DAY_MS;
    const filtered = queue.filter((s) => s.queuedAt > sevenDaysAgo);
    filtered.push(session);
    localStorage.setItem(RETRY_QUEUE_KEY, JSON.stringify(filtered.slice(-20)));
  } catch {}
}

function clearRetryQueue(): void {
  try { localStorage.removeItem(RETRY_QUEUE_KEY); } catch {}
}

/**
 * Process any queued sessions that previously failed to save.
 * Called on app startup after successful auth.
 */
export async function processRetryQueue(userId: string): Promise<number> {
  const queue = getRetryQueue().filter((s) => s.userId === userId);
  if (queue.length === 0) return 0;

  let saved = 0;
  const remaining: QueuedSession[] = [];

  for (const session of queue) {
    const { error } = await sbQuiet(
      supabase.from("study_sessions").insert({
        user_id: session.userId,
        started_at: session.startedAt,
        ended_at: session.endedAt,
        duration_seconds: session.durationSeconds,
        topic_id: session.topicId || null,
        recovered: true,
      }),
      "retry write study_sessions"
    );
    if (error) remaining.push(session);
    else saved++;
  }

  // Update queue with only the still-failing items
  try {
    const otherUsers = getRetryQueue().filter((s) => s.userId !== userId);
    localStorage.setItem(RETRY_QUEUE_KEY, JSON.stringify([...otherUsers, ...remaining]));
    if (otherUsers.length === 0 && remaining.length === 0) {
      clearRetryQueue();
    }
  } catch {}

  return saved;
}

export async function saveStudySession(
  userId: string,
  startedAt: string,
  durationSeconds: number,
  currentStreak: StreakData | null,
  topicId?: string | null
): Promise<SaveSessionResult> {
  const xp = Math.floor(durationSeconds / 60) * 5;
  const now = new Date();
  const todayKey = toDateKey(now);

  // ── CRITICAL: Save the study session (the most important write) ──
  let sessionError: unknown = null;
  try {
    const res = await withTimeout(
      supabase.from("study_sessions").insert({
        user_id: userId,
        started_at: startedAt,
        ended_at: now.toISOString(),
        duration_seconds: durationSeconds,
        topic_id: topicId || null,
      }),
      15_000, "write study_sessions"
    );
    sessionError = res.error;
  } catch (e) {
    sessionError = e;
  }

  if (sessionError) {
    console.error("[StudySession] ❌ Failed to save session:", sessionError);
    addToRetryQueue({
      userId,
      startedAt,
      endedAt: now.toISOString(),
      durationSeconds,
      queuedAt: Date.now(),
      topicId: topicId || null,
    });
    throw new Error(
      `Session saved locally (will retry). The backend write failed — ` +
      `please check that your Supabase RLS policies allow inserts into "study_sessions".`
    );
  }
  console.log(`[StudySession] ✅ Session saved: ${durationSeconds}s, topic_id: ${topicId}`);

  // ── NON-CRITICAL: XP + Streak (run in parallel, never block the result) ──
  let newStreak = 1;

  const [, streakResult] = await Promise.allSettled([
    // add_xp() RPC inserts the xp_log AND bumps profiles.total_xp atomically,
    // de-duplicating via a unique index. Replaces the old two writes.
    xp > 0
      ? sbQuiet(supabase.rpc("add_xp", { p_amount: xp, p_source: "study_session" }), "rpc add_xp")
      : Promise.resolve({ data: null, error: null }),

    // Read + update streak
    (async () => {
      const { data: streakRow, error } = await sbQuiet<StreakData>(
        supabase.from("user_streaks").select("*").eq("user_id", userId).maybeSingle(),
        "read user_streaks"
      );

      // If the read failed entirely, do NOT overwrite the streak with a default 0.
      if (error) {
        console.warn("[StudySession] ⚠️ Skipping streak update to avoid data loss");
        return null;
      }

      const streakData: StreakData = streakRow ?? currentStreak ?? {
        current_streak: 0,
        longest_streak: 0,
        last_study_date: null,
      };

      let calculatedStreak = streakData.current_streak ?? 0;
      const lastDate = streakData.last_study_date;

      if (!lastDate) {
        calculatedStreak = 1;
      } else {
        const diff = dayDiff(todayKey, lastDate);
        if (diff === 0) calculatedStreak = streakData.current_streak ?? 0;
        else if (diff === 1) calculatedStreak = (streakData.current_streak ?? 0) + 1;
        else calculatedStreak = 1;
      }

      await sbQuiet(
        supabase.from("user_streaks").upsert(
          {
            user_id: userId,
            current_streak: calculatedStreak,
            longest_streak: Math.max(streakData.longest_streak ?? 0, calculatedStreak),
            last_study_date: todayKey,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        ),
        "write user_streaks"
      );

      return calculatedStreak;
    })(),
  ]);

  if (streakResult.status === "fulfilled" && typeof streakResult.value === "number") {
    newStreak = streakResult.value;
  } else if (currentStreak) {
    newStreak = currentStreak.current_streak;
  }

  return { xp, newStreak };
}

/**
 * awardXP — non-blocking XP award via the add_xp() RPC (xp_log + total_xp).
 */
export async function awardXP(
  userId: string,
  amount: number,
  sourceType: "quiz" | "lesson" | "study_session" | "achievement" | "daily_login"
): Promise<void> {
  // userId is accepted for API compatibility; add_xp() uses auth.uid() server-side.
  void userId;
  await sbQuiet(supabase.rpc("add_xp", { p_amount: amount, p_source: sourceType }), "rpc add_xp");
}
