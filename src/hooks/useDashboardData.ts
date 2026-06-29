import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { computeAvgQuizScore } from "@/lib/userStats";
import { toDateKey } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
 * DASHBOARD DATA (Supabase / Postgres)
 * ====================================
 * Each table is read exactly once per dashboard load:
 *   1 × profiles, 1 × user_streaks, 1 × xp_logs,
 *   1 × study_sessions → studyTime + full progressAnalytics,
 *   1 × quiz_attempts  → avgScore + weakTopics + continue-learning fallback,
 *   1 × lesson_progress + a single `in` query for topics.
 * Combined with the 5-minute staleTime in App.tsx, navigating away and back
 * re-reads nothing for 5 minutes.
 * ────────────────────────────────────────────────────────────────────────── */

const DAY_MS = 24 * 60 * 60 * 1000;
const shortDay = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const startOfWeek = (date: Date) => {
  const current = new Date(date);
  const day = current.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  current.setDate(current.getDate() + diff);
  current.setHours(0, 0, 0, 0);
  return current;
};

export type RetentionPoint = {
  label: string;
  day: string;
  /** Avg quiz accuracy that day (knowledge retention), null if no quiz taken. */
  accuracy: number | null;
  /** Minutes studied that day (habit retention / showing up). */
  minutes: number;
  active: boolean;
};

/**
 * Build a `days`-long retention trajectory combining two signals:
 *   • accuracy — how well the user retains knowledge (avg quiz score %)
 *   • minutes  — whether the user keeps showing up (study time per day)
 */
const buildRetentionTrend = (
  minutesByDate: Map<string, number>,
  accByDate: Map<string, { correct: number; total: number }>,
  days = 14
): RetentionPoint[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = today.getTime() - (days - 1) * DAY_MS;

  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start + i * DAY_MS);
    const key = toDateKey(d);
    const minutes = minutesByDate.get(key) ?? 0;
    const acc = accByDate.get(key);
    const accuracy = acc && acc.total > 0 ? Math.round((acc.correct / acc.total) * 100) : null;
    return {
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      day: shortDay[d.getDay()],
      accuracy,
      minutes,
      active: minutes > 0,
    };
  });
};

const emptyAnalytics = () => ({
  todaySeconds: 0,
  weekSeconds: 0,
  monthSeconds: 0,
  prevWeekSeconds: 0,
  chartData: shortDay.slice(1).concat(shortDay[0]).map((day) => ({ day, hours: 0 })),
  dayWiseRecords: [] as Array<{ date: string; minutes: number; sessions: number }>,
  sessionCount: 0,
  avgSessionMinutes: 0,
});

export const useDashboardData = () => {
  const { user } = useAuth();

  /* ── 1 read: profile ─────────────────────────────────────── */
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.uid],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.uid).maybeSingle();
      return data ?? null;
    },
    enabled: !!user,
  });

  /* ── 1 read: streak ──────────────────────────────────────── */
  const { data: streak } = useQuery({
    queryKey: ["streak", user?.uid],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("user_streaks").select("*").eq("user_id", user.uid).maybeSingle();
      return data ?? { current_streak: 0 };
    },
    enabled: !!user,
  });

  /* ── totalXp: sum of xp_logs (de-dup enforced by a DB unique index) ──────
   * xp_logs is the single source of truth; we sum it on every load and write
   * the corrected value back to profiles.total_xp so any other read self-heals. */
  const { data: totalXp } = useQuery({
    queryKey: ["totalXp", user?.uid],
    queryFn: async () => {
      if (!user) return 0;
      const { data } = await supabase.from("xp_logs").select("xp_amount").eq("user_id", user.uid);
      const total = (data ?? []).reduce((sum, r) => sum + (r.xp_amount || 0), 0);
      try {
        await supabase.from("profiles").update({
          total_xp: total,
          xp_reconciled: true,
          updated_at: new Date().toISOString(),
        }).eq("id", user.uid);
      } catch {
        // Cache write failure is non-fatal — we still return the correct sum.
      }
      return total;
    },
    enabled: !!user,
    staleTime: 1000 * 30,
  });

  /* ── 1 read: study_sessions → studyTime AND progressAnalytics ── */
  const { data: sessionStats } = useQuery({
    queryKey: ["sessionStats", user?.uid],
    queryFn: async () => {
      if (!user) return { studyTime: "0h", analytics: emptyAnalytics() };

      const { data: rows } = await supabase
        .from("study_sessions")
        .select("duration_seconds, ended_at, created_at")
        .eq("user_id", user.uid);

      const now = new Date();
      const todayKey = toDateKey(now);
      const weekStart = startOfWeek(now).getTime();
      const prevWeekStart = weekStart - 7 * DAY_MS;
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

      let allTimeSeconds = 0;
      let todaySeconds = 0;
      let weekSeconds = 0;
      let monthSeconds = 0;
      let prevWeekSeconds = 0;
      let totalSessions = 0;
      let totalDurationAll = 0;
      const byDate = new Map<string, { seconds: number; sessions: number }>();

      (rows ?? []).forEach((data) => {
        const duration = Number(data.duration_seconds ?? 0);
        allTimeSeconds += duration;

        const raw = data.ended_at ?? data.created_at;
        const date = raw ? new Date(raw) : null;
        if (!date || Number.isNaN(date.getTime())) return;

        const key = toDateKey(date);
        const existing = byDate.get(key) || { seconds: 0, sessions: 0 };
        byDate.set(key, { seconds: existing.seconds + duration, sessions: existing.sessions + 1 });

        totalSessions++;
        totalDurationAll += duration;

        if (key === todayKey) todaySeconds += duration;
        if (date.getTime() >= weekStart) weekSeconds += duration;
        if (date.getTime() >= prevWeekStart && date.getTime() < weekStart) prevWeekSeconds += duration;
        if (date.getTime() >= monthStart) monthSeconds += duration;
      });

      const chartData = Array.from({ length: 7 }, (_, idx) => {
        const date = new Date(weekStart + idx * DAY_MS);
        const key = toDateKey(date);
        return {
          day: shortDay[date.getDay()],
          hours: Number(((byDate.get(key)?.seconds ?? 0) / 3600).toFixed(1)),
        };
      });

      const dayWiseRecords = Array.from(byDate.entries())
        .map(([date, data]) => ({ date, minutes: Math.round(data.seconds / 60), sessions: data.sessions }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 30);

      const avgSessionMinutes = totalSessions > 0 ? Math.round(totalDurationAll / 60 / totalSessions) : 0;

      return {
        studyTime: `${(allTimeSeconds / 3600).toFixed(1)}h`,
        analytics: {
          todaySeconds, weekSeconds, monthSeconds, prevWeekSeconds,
          chartData, dayWiseRecords, sessionCount: totalSessions, avgSessionMinutes,
        },
      };
    },
    enabled: !!user,
  });

  /* ── 1 read: quiz_attempts → avgScore AND weakTopics AND quiz fallback ── */
  const { data: quizStats } = useQuery({
    queryKey: ["quizStats", user?.uid],
    queryFn: async () => {
      if (!user) {
        return {
          avgScore: 0,
          weakTopics: [] as Array<{ topic: string; avgScore: number }>,
          quizTopics: [] as Array<{ id: string; title: string; subject: string; pct: number }>,
          dailyAccuracy: {} as Record<string, { correct: number; total: number }>,
        };
      }

      const { data: rows } = await supabase
        .from("quiz_attempts")
        .select("score, total_questions, topic_title, topic_id, created_at")
        .eq("user_id", user.uid);
      const attempts = rows ?? [];

      // a) average score
      const avgScore = attempts.length === 0 ? 0 : computeAvgQuizScore(attempts);

      // b) weak topics, c) continue-learning fallback, d) per-day accuracy
      const topicScores: Record<string, { total: number; count: number; totalQuestions: number }> = {};
      const topicMap: Record<string, { id: string; title: string; subject: string; pct: number }> = {};
      const dailyAccuracy: Record<string, { correct: number; total: number }> = {};

      attempts.forEach((data: any) => {
        const attemptDate = data.created_at ? new Date(data.created_at) : null;
        if (attemptDate && !Number.isNaN(attemptDate.getTime()) && data.total_questions > 0) {
          const key = toDateKey(attemptDate);
          const entry = dailyAccuracy[key] || { correct: 0, total: 0 };
          entry.correct += data.score || 0;
          entry.total += data.total_questions || 0;
          dailyAccuracy[key] = entry;
        }

        const topic = data.topic_title || "General";
        if (!topicScores[topic]) topicScores[topic] = { total: 0, count: 0, totalQuestions: 0 };
        topicScores[topic].total += data.score || 0;
        topicScores[topic].totalQuestions += data.total_questions || 0;
        topicScores[topic].count += 1;

        const topicTitle = data.topic_title;
        const topicId = data.topic_id;
        if (topicTitle && topicId && !topicMap[topicTitle]) {
          const pct = data.total_questions > 0 ? Math.round((data.score / data.total_questions) * 100) : 0;
          topicMap[topicTitle] = { id: topicId, title: topicTitle, subject: topicTitle, pct };
        }
      });

      const overallAvg = Object.values(topicScores).length > 0
        ? Object.values(topicScores).reduce(
            (sum, t) => sum + (t.totalQuestions > 0 ? (t.total / t.totalQuestions) * 100 : 0), 0
          ) / Object.keys(topicScores).length
        : 0;

      const weakTopics = Object.entries(topicScores)
        .map(([topic, scores]) => ({
          topic,
          avgScore: scores.totalQuestions > 0 ? Math.round((scores.total / scores.totalQuestions) * 100) : 0,
        }))
        .filter((t) => t.avgScore < overallAvg)
        .sort((a, b) => a.avgScore - b.avgScore)
        .slice(0, 3);

      return { avgScore, weakTopics, quizTopics: Object.values(topicMap).slice(0, 3), dailyAccuracy };
    },
    enabled: !!user,
  });

  /* ── 1 read lesson_progress + 1 read topics ──────────────── */
  const { data: continueLearning = [] } = useQuery({
    queryKey: ["continueLearning", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      try {
        const { data: progress } = await supabase
          .from("lesson_progress")
          .select("topic_id, completed_lessons")
          .eq("user_id", user.uid);

        if (progress && progress.length > 0) {
          const progressByTopic = new Map<string, { completed: number }>();
          progress.forEach((row: any) => {
            if (row.topic_id) {
              progressByTopic.set(row.topic_id, { completed: row.completed_lessons?.length ?? 0 });
            }
          });

          const topicIds = Array.from(progressByTopic.keys());
          // Postgres `in` has no 10-id limit, so a single query covers them all.
          const { data: topics } = await supabase
            .from("topics")
            .select("id, title, subject, lesson_count")
            .in("id", topicIds);

          const items: { id: string; title: string; subject: string; pct: number }[] = [];
          (topics ?? []).forEach((topicData: any) => {
            const progressForTopic = progressByTopic.get(topicData.id);
            if (!progressForTopic) return;
            const total = topicData.lesson_count ?? 0;
            const pct = total > 0 ? Math.round((progressForTopic.completed / total) * 100) : 0;
            if (pct < 100) {
              items.push({
                id: topicData.id,
                title: topicData.title || "Untitled",
                subject: topicData.subject || "General",
                pct,
              });
            }
          });

          if (items.length > 0) return items.sort((a, b) => b.pct - a.pct).slice(0, 3);
        }

        // Fallback: derived from the quiz_attempts already fetched above — zero extra reads
        return quizStats?.quizTopics ?? [];
      } catch (error) {
        console.error("[Dashboard] Continue learning query failed:", error);
        return [];
      }
    },
    enabled: !!user && quizStats !== undefined,
  });

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  /* ── retention trajectory — derived from data already fetched (zero extra reads). */
  const minutesByDate = new Map<string, number>();
  for (const r of sessionStats?.analytics?.dayWiseRecords ?? []) minutesByDate.set(r.date, r.minutes);
  const accByDate = new Map(Object.entries(quizStats?.dailyAccuracy ?? {}));
  const retentionTrend = buildRetentionTrend(minutesByDate, accByDate);

  return {
    profile,
    streak,
    totalXp: totalXp ?? 0,
    retentionTrend,
    studyTime: sessionStats?.studyTime ?? "0h",
    avgScore: quizStats?.avgScore ?? null,
    progressAnalytics: sessionStats?.analytics ?? emptyAnalytics(),
    continueLearning: continueLearning ?? [],
    weakTopics: quizStats?.weakTopics ?? [],
    greeting: greeting(),
    isLoading: profile === undefined || totalXp === undefined || sessionStats === undefined,
  };
};
