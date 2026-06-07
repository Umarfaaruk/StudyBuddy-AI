import { addDoc, collection, doc, getDoc, increment, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
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
 * Wraps any Firestore promise with a timeout.
 * Prevents the UI from freezing if security rules block the request
 * or the network is unavailable.
 */
function withTimeout<T>(promise: Promise<T>, ms = 15_000, label = "Firestore"): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms / 1000}s — check Firestore security rules in Firebase Console`)),
        ms
      )
    ),
  ]);
}

/**
 * Try a Firestore operation silently — log errors but don't throw.
 * Used for non-critical writes (XP, streak, profile) that shouldn't
 * block the session save.
 */
async function tryQuietly<T>(promise: Promise<T>, label: string): Promise<T | null> {
  try {
    return await withTimeout(promise, 15_000, label);
  } catch (e) {
    console.warn(`[StudySession] ⚠️ ${label} failed (non-critical):`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Local storage queue for failed saves.
 * Sessions that fail to save to Firestore are queued for retry.
 */
const RETRY_QUEUE_KEY = "eduonx_save_retry_queue";

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
    const filtered = queue.filter(s => s.queuedAt > sevenDaysAgo);
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
  const queue = getRetryQueue().filter(s => s.userId === userId);
  if (queue.length === 0) return 0;

  let saved = 0;
  const remaining: QueuedSession[] = [];

  for (const session of queue) {
    try {
      await withTimeout(
        addDoc(collection(db, "study_sessions"), {
          user_id: session.userId,
          started_at: session.startedAt,
          ended_at: session.endedAt,
          duration_seconds: session.durationSeconds,
          topic_id: session.topicId || null,
          created_at: serverTimestamp(),
          recovered: true,
        }),
        15_000, "retry write study_sessions"
      );
      saved++;
    } catch {
      remaining.push(session);
    }
  }

  // Update queue with only the still-failing items
  try {
    const otherUsers = getRetryQueue().filter(s => s.userId !== userId);
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

  // ── CRITICAL: Save the study session (this is the most important write) ──
  try {
    await withTimeout(
      addDoc(collection(db, "study_sessions"), {
        user_id: userId,
        started_at: startedAt,
        ended_at: now.toISOString(),
        duration_seconds: durationSeconds,
        topic_id: topicId || null,
        created_at: serverTimestamp(),
      }),
      15_000, "write study_sessions"
    );
    console.log(`[StudySession] ✅ Session saved: ${durationSeconds}s, topic_id: ${topicId}`);
  } catch (sessionErr) {
    // Session write failed — queue for retry and throw
    console.error("[StudySession] ❌ Failed to save session to Firestore:", sessionErr);
    addToRetryQueue({
      userId,
      startedAt,
      endedAt: now.toISOString(),
      durationSeconds,
      queuedAt: Date.now(),
      topicId: topicId || null,
    });
    // Re-throw with a clearer message
    throw new Error(
      `Session saved locally (will retry). Firestore write failed — ` +
      `please check that your Firestore security rules allow writes to the "study_sessions" collection. ` +
      `See FIRESTORE_SECURITY_RULES.md for the required rules configuration.`
    );
  }

  // ── NON-CRITICAL: XP, Streak, Profile updates (fire-and-forget) ──
  // These run in parallel and don't block the save result.
  // If any fail, the session is already saved.

  let newStreak = 1;

  const [, streakResult] = await Promise.allSettled([
    // Write XP log
    xp > 0
      ? tryQuietly(
          addDoc(collection(db, "xp_logs"), {
            user_id: userId,
            xp_amount: xp,
            source_type: "study_session",
            created_at: serverTimestamp(),
          }),
          "write xp_logs"
        )
      : Promise.resolve(null),

    // Read + update streak
    (async () => {
      const streakRef = doc(db, "user_streaks", userId);
      const streakSnap = await tryQuietly(getDoc(streakRef), "read user_streaks");

      // CRITICAL: If the read failed entirely, do NOT overwrite the streak with a default 0.
      if (!streakSnap) {
        console.warn("[StudySession] ⚠️ Skipping streak update to avoid data loss");
        return null;
      }

      const streakData = (streakSnap.exists()
        ? (streakSnap.data() as StreakData)
        : currentStreak) ?? {
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
        if (diff === 0) {
          calculatedStreak = streakData.current_streak;
        } else if (diff === 1) {
          calculatedStreak = streakData.current_streak + 1;
        } else {
          calculatedStreak = 1;
        }
      }

      await tryQuietly(
        setDoc(
          streakRef,
          {
            current_streak: calculatedStreak,
            longest_streak: Math.max(streakData.longest_streak ?? 0, calculatedStreak),
            last_study_date: todayKey,
            updated_at: serverTimestamp(),
          },
          { merge: true }
        ),
        "write user_streaks"
      );

      return calculatedStreak;
    })(),

    // Update profile XP
    tryQuietly(
      setDoc(
        doc(db, "profiles", userId),
        { total_xp: increment(xp), updated_at: serverTimestamp() },
        { merge: true }
      ),
      "write profiles"
    ),
  ]);

  // Extract streak value if available
  if (streakResult.status === "fulfilled" && typeof streakResult.value === "number") {
    newStreak = streakResult.value;
  } else if (currentStreak) {
    // Fallback to UI's known streak if write failed
    newStreak = currentStreak.current_streak;
  }

  return { xp, newStreak };
}

/**
 * awardXP — non-blocking XP award
 */
export async function awardXP(
  userId: string,
  amount: number,
  sourceType: "quiz" | "lesson" | "study_session" | "achievement" | "daily_login"
): Promise<void> {
  await Promise.allSettled([
    tryQuietly(
      addDoc(collection(db, "xp_logs"), {
        user_id: userId,
        xp_amount: amount,
        source_type: sourceType,
        created_at: serverTimestamp(),
      }),
      "write xp_logs"
    ),
    tryQuietly(
      setDoc(
        doc(db, "profiles", userId),
        { total_xp: increment(amount), updated_at: serverTimestamp() },
        { merge: true }
      ),
      "write profiles"
    ),
  ]);
}
