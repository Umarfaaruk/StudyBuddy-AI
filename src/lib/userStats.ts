/**
 * Shared user statistics — same formulas as useDashboardData / Progress pages.
 * Used by AdminPanel so admin metrics match what users see.
 */

export interface UserStatsRow {
  uid: string;
  name: string;
  email: string;
  avatar_url?: string;
  grade_level?: string;
  joined: string;
  xp: number;
  streak: number;
  longestStreak: number;
  studyHours: number;
  quizCount: number;
  avgQuizScore: number;
  materialsCount: number;
  doubtCount: number;
  flashcardCount: number;
  studyPlanCount: number;
  lastActive: string;
}

export function computeAvgQuizScore(
  attempts: { score?: number; total_questions?: number }[]
): number {
  let totalPct = 0;
  let count = 0;
  for (const a of attempts) {
    const total = a.total_questions ?? 0;
    if (total > 0) {
      totalPct += (a.score ?? 0) / total;
      count++;
    }
  }
  return count > 0 ? Math.round((totalPct / count) * 100) : 0;
}

export function parseFirestoreDate(data: {
  ended_at?: string;
  created_at?: { toDate?: () => Date };
  updated_at?: { toDate?: () => Date };
  createdAt?: { toDate?: () => Date };
}): Date | null {
  if (data.ended_at) {
    const d = new Date(data.ended_at);
    if (!isNaN(d.getTime())) return d;
  }
  if (data.updated_at?.toDate) {
    const d = data.updated_at.toDate();
    if (!isNaN(d.getTime())) return d;
  }
  if (data.created_at?.toDate) {
    const d = data.created_at.toDate();
    if (!isNaN(d.getTime())) return d;
  }
  if (data.createdAt?.toDate) {
    const d = data.createdAt.toDate();
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

export function formatLastActive(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Never";
  return d.toLocaleDateString();
}

export function pickLatestIso(existing: string, candidate: string): string {
  if (!candidate) return existing;
  if (!existing) return candidate;
  return candidate > existing ? candidate : existing;
}
