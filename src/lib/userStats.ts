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

/** Pick the first valid timestamp from a row's common date fields. */
export function parseDate(data: Record<string, any>): Date | null {
  const candidates = [data.ended_at, data.updated_at, data.created_at, data.createdAt];
  for (const val of candidates) {
    if (!val) continue;
    if (typeof val === "string" || typeof val === "number") {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d;
    }
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
