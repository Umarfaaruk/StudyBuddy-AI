import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { toDateKey } from "./utils";
import {
  UserStatsRow,
  computeAvgQuizScore,
  parseFirestoreDate,
  formatLastActive,
  pickLatestIso,
} from "./userStats";

async function safeFetchCollection(collectionName: string) {
  try {
    const snap = await getDocs(collection(db, collectionName));
    return snap.docs;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Admin] Could not fetch "${collectionName}":`, msg);
    return [];
  }
}

export interface PlatformStats {
  users: UserStatsRow[];
  totalUsers: number;
  activeToday: number;
  totalStudyHours: number;
  avgStreak: number;
}

/** Load all users and stats using the same formulas as the user-facing dashboard. */
export async function fetchAdminPlatformStats(): Promise<PlatformStats> {
  const profileDocs = await safeFetchCollection("profiles");
  const userDocs = await safeFetchCollection("users");

  const profileByUid: Record<string, Record<string, unknown>> = {};
  for (const d of profileDocs) {
    profileByUid[d.id] = { ...d.data(), uid: d.id };
  }
  for (const d of userDocs) {
    if (!profileByUid[d.id]) {
      profileByUid[d.id] = { ...d.data(), uid: d.id };
    }
  }

  const xpDocs = await safeFetchCollection("xp_logs");
  const xpByUser: Record<string, number> = {};
  for (const d of xpDocs) {
    const data = d.data();
    const uid = data.user_id as string;
    if (!uid) continue;
    xpByUser[uid] = (xpByUser[uid] || 0) + (Number(data.xp_amount) || 0);
  }

  const streakDocs = await safeFetchCollection("user_streaks");
  const streakByUser: Record<string, { current: number; longest: number }> = {};
  for (const d of streakDocs) {
    const data = d.data();
    streakByUser[d.id] = {
      current: Number(data.current_streak) || 0,
      longest: Number(data.longest_streak) || 0,
    };
  }

  const sessionDocs = await safeFetchCollection("study_sessions");
  const studyByUser: Record<string, { seconds: number; lastActive: string }> = {};
  const todayKey = toDateKey(new Date());
  const activeTodayUsers = new Set<string>();

  for (const d of sessionDocs) {
    const data = d.data();
    const uid = data.user_id as string;
    if (!uid) continue;
    const duration = Number(data.duration_seconds) || 0;
    const date = parseFirestoreDate(data);
    const endedAt = date ? toDateKey(date) : "";

    if (!studyByUser[uid]) studyByUser[uid] = { seconds: 0, lastActive: "" };
    studyByUser[uid].seconds += duration;
    studyByUser[uid].lastActive = pickLatestIso(studyByUser[uid].lastActive, endedAt);

    if (endedAt === todayKey) activeTodayUsers.add(uid);
  }

  const quizDocs = await safeFetchCollection("quiz_attempts");
  const quizByUser: Record<string, { score?: number; total_questions?: number }[]> = {};
  for (const d of quizDocs) {
    const data = d.data();
    const uid = data.user_id as string;
    if (!uid) continue;
    if (!quizByUser[uid]) quizByUser[uid] = [];
    quizByUser[uid].push({
      score: Number(data.score) || 0,
      total_questions: Number(data.total_questions) || 0,
    });
    const date = parseFirestoreDate(data);
    if (date) {
      const endedAt = toDateKey(date);
      if (!studyByUser[uid]) studyByUser[uid] = { seconds: 0, lastActive: "" };
      studyByUser[uid].lastActive = pickLatestIso(
        studyByUser[uid].lastActive,
        endedAt
      );
    }
  }

  const materialDocs = await safeFetchCollection("materials");
  const matsByUser: Record<string, number> = {};
  for (const d of materialDocs) {
    const uid = d.data().user_id as string;
    if (!uid) continue;
    matsByUser[uid] = (matsByUser[uid] || 0) + 1;
  }

  const doubtDocs = await safeFetchCollection("doubt_sessions");
  const doubtsByUser: Record<string, number> = {};
  for (const d of doubtDocs) {
    const data = d.data();
    const uid = data.user_id as string;
    if (!uid) continue;
    doubtsByUser[uid] = (doubtsByUser[uid] || 0) + 1;
    const date = parseFirestoreDate(data);
    if (date) {
      const endedAt = toDateKey(date);
      if (!studyByUser[uid]) studyByUser[uid] = { seconds: 0, lastActive: "" };
      studyByUser[uid].lastActive = pickLatestIso(
        studyByUser[uid].lastActive,
        endedAt
      );
    }
  }

  const flashcardDocs = await safeFetchCollection("flashcards");
  const flashcardsByUser: Record<string, number> = {};
  for (const d of flashcardDocs) {
    const uid = d.data().user_id as string;
    if (!uid) continue;
    flashcardsByUser[uid] = (flashcardsByUser[uid] || 0) + 1;
  }

  const studyPlanDocs = await safeFetchCollection("study_plans");
  const studyPlansByUser: Record<string, number> = {};
  for (const d of studyPlanDocs) {
    const uid = d.data().user_id as string;
    if (!uid) continue;
    studyPlansByUser[uid] = (studyPlansByUser[uid] || 0) + 1;
  }

  const users: UserStatsRow[] = Object.entries(profileByUid).map(([uid, p]) => {
    const attempts = quizByUser[uid] || [];
    return {
      uid,
      name: (p.full_name as string) || (p.displayName as string) || "Unknown",
      email: (p.email as string) || "—",
      avatar_url: p.avatar_url as string | undefined,
      grade_level: p.grade_level as string | undefined,
      joined: (p.created_at as string) || (p.updated_at as string) || "—",
      xp: xpByUser[uid] || 0,
      streak: streakByUser[uid]?.current || 0,
      longestStreak: streakByUser[uid]?.longest || 0,
      studyHours: parseFloat(((studyByUser[uid]?.seconds || 0) / 3600).toFixed(1)),
      quizCount: attempts.length,
      avgQuizScore: computeAvgQuizScore(attempts),
      materialsCount: matsByUser[uid] || 0,
      doubtCount: doubtsByUser[uid] || 0,
      flashcardCount: flashcardsByUser[uid] || 0,
      studyPlanCount: studyPlansByUser[uid] || 0,
      lastActive: formatLastActive(studyByUser[uid]?.lastActive),
    };
  });

  users.sort((a, b) => b.xp - a.xp);

  // Compute metrics using only registered active users to keep data accurate
  const activeToday = users.filter(u => activeTodayUsers.has(u.uid)).length;
  const totalStudySeconds = users.reduce((sum, u) => sum + (studyByUser[u.uid]?.seconds || 0), 0);
  const totalStudyHours = parseFloat((totalStudySeconds / 3600).toFixed(1));

  const avgStreak =
    users.length > 0
      ? parseFloat(
          (users.reduce((sum, u) => sum + u.streak, 0) / users.length).toFixed(1)
        )
      : 0;

  return {
    users,
    totalUsers: users.length,
    activeToday,
    totalStudyHours,
    avgStreak,
  };
}
