import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { computeAvgQuizScore } from "@/lib/userStats";

const DAY_MS = 24 * 60 * 60 * 1000;
const shortDay = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const toDateKey = (date: Date) => date.toISOString().slice(0, 10);

const startOfWeek = (date: Date) => {
  const current = new Date(date);
  const day = current.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  current.setDate(current.getDate() + diff);
  current.setHours(0, 0, 0, 0);
  return current;
};

export const useDashboardData = () => {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.uid],
    queryFn: async () => {
      if (!user) return null;
      const docRef = doc(db, "profiles", user.uid);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? docSnap.data() : null;
    },
    enabled: !!user,
  });

  const { data: streak } = useQuery({
    queryKey: ["streak", user?.uid],
    queryFn: async () => {
      if (!user) return null;
      const docRef = doc(db, "user_streaks", user.uid);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? docSnap.data() : { current_streak: 0 };
    },
    enabled: !!user,
  });

  const { data: totalXp } = useQuery({
    queryKey: ["totalXp", user?.uid],
    queryFn: async () => {
      if (!user) return 0;
      const q = query(collection(db, "xp_logs"), where("user_id", "==", user.uid));
      const querySnapshot = await getDocs(q);
      let total = 0;
      querySnapshot.forEach((doc) => {
        total += doc.data().xp_amount || 0;
      });
      return total;
    },
    enabled: !!user,
  });

  const { data: studyTime } = useQuery({
    queryKey: ["studyTime", user?.uid],
    queryFn: async () => {
      if (!user) return "0h";
      const q = query(collection(db, "study_sessions"), where("user_id", "==", user.uid));
      const querySnapshot = await getDocs(q);
      let totalSeconds = 0;
      querySnapshot.forEach((doc) => {
        totalSeconds += doc.data().duration_seconds || 0;
      });
      const hours = (totalSeconds / 3600).toFixed(1);
      return `${hours}h`;
    },
    enabled: !!user,
  });

  const { data: progressAnalytics } = useQuery({
    queryKey: ["progressAnalytics", user?.uid],
    queryFn: async () => {
      if (!user) {
        return {
          todaySeconds: 0,
          weekSeconds: 0,
          monthSeconds: 0,
          prevWeekSeconds: 0,
          chartData: shortDay.slice(1).concat(shortDay[0]).map((day) => ({ day, hours: 0 })),
          dayWiseRecords: [] as Array<{ date: string; minutes: number; sessions: number }>,
          sessionCount: 0,
          avgSessionMinutes: 0,
        };
      }

      const sessionsQuery = query(collection(db, "study_sessions"), where("user_id", "==", user.uid));
      const snapshot = await getDocs(sessionsQuery);
      const now = new Date();
      const todayKey = toDateKey(now);
      const weekStart = startOfWeek(now).getTime();
      const prevWeekStart = weekStart - 7 * DAY_MS;
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const sevenDaysAgo = now.getTime() - 6 * DAY_MS;

      let todaySeconds = 0;
      let weekSeconds = 0;
      let monthSeconds = 0;
      let prevWeekSeconds = 0;
      let totalSessions = 0;
      let totalDurationAll = 0;
      const byDate = new Map<string, { seconds: number; sessions: number }>();

      snapshot.forEach((item) => {
        const data = item.data();
        const duration = Number(data.duration_seconds ?? 0);
        const date = data.ended_at ? new Date(data.ended_at) : data.created_at?.toDate?.() ?? null;
        if (!date || Number.isNaN(date.getTime())) return;

        const key = toDateKey(date);
        const existing = byDate.get(key) || { seconds: 0, sessions: 0 };
        byDate.set(key, {
          seconds: existing.seconds + duration,
          sessions: existing.sessions + 1,
        });

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
        .map(([date, data]) => ({
          date,
          minutes: Math.round(data.seconds / 60),
          sessions: data.sessions,
        }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 30);

      const avgSessionMinutes = totalSessions > 0 ? Math.round(totalDurationAll / 60 / totalSessions) : 0;

      return {
        todaySeconds,
        weekSeconds,
        monthSeconds,
        prevWeekSeconds,
        chartData,
        dayWiseRecords,
        sessionCount: totalSessions,
        avgSessionMinutes,
      };
    },
    enabled: !!user,
  });

  const { data: avgScore } = useQuery({
    queryKey: ["avgScore", user?.uid],
    queryFn: async () => {
      if (!user) return 0;
      const q = query(collection(db, "quiz_attempts"), where("user_id", "==", user.uid));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) return 0;
      const attempts = querySnapshot.docs.map((d) => {
        const data = d.data();
        return { score: data.score, total_questions: data.total_questions };
      });
      return computeAvgQuizScore(attempts);
    },
    enabled: !!user,
  });

  // Get weak topics (quiz topics with below-average scores)
  const { data: weakTopics = [] } = useQuery({
    queryKey: ["weakTopics", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      try {
        const q = query(collection(db, "quiz_attempts"), where("user_id", "==", user.uid));
        const querySnapshot = await getDocs(q);
        const topicScores: Record<string, { total: number; count: number; totalQuestions: number }> = {};

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const topic = data.topic_title || "General";
          if (!topicScores[topic]) {
            topicScores[topic] = { total: 0, count: 0, totalQuestions: 0 };
          }
          topicScores[topic].total += data.score || 0;
          topicScores[topic].totalQuestions += data.total_questions || 0;
          topicScores[topic].count += 1;
        });

        const overallAvg = Object.values(topicScores).length > 0
          ? Object.values(topicScores).reduce((sum, t) => sum + (t.totalQuestions > 0 ? (t.total / t.totalQuestions) * 100 : 0), 0) /
            Object.keys(topicScores).length
          : 0;

        return Object.entries(topicScores)
          .map(([topic, scores]) => {
            const avgPct = scores.totalQuestions > 0 ? Math.round((scores.total / scores.totalQuestions) * 100) : 0;
            return { topic, avgScore: avgPct };
          })
          .filter((t) => t.avgScore < overallAvg)
          .sort((a, b) => a.avgScore - b.avgScore)
          .slice(0, 3);
      } catch (error) {
        console.error("[Dashboard] Weak topics query failed:", error);
        return [];
      }
    },
    enabled: !!user,
  });

  // Get continue learning (topics with lesson progress that are incomplete)
  const { data: continueLearning = [] } = useQuery({
    queryKey: ["continueLearning", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      try {
        // First try lesson_progress for accurate topic IDs
        const progressQ = query(
          collection(db, "lesson_progress"),
          where("user_id", "==", user.uid),
        );
        const progressSnap = await getDocs(progressQ);
        
        if (progressSnap.size > 0) {
          const items: { id: string; title: string; subject: string; pct: number }[] = [];
          
          for (const progressDoc of progressSnap.docs) {
            const data = progressDoc.data();
            const topicId = data.topic_id || progressDoc.id.split("_")[1];
            if (!topicId) continue;
            
            // Fetch the actual topic to get title/subject
            try {
              const topicSnap = await getDoc(doc(db, "topics", topicId));
              if (topicSnap.exists()) {
                const topicData = topicSnap.data();
                const completed = data.completed_lessons?.length ?? 0;
                const total = topicData.lesson_count ?? 0;
                const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                
                // Only show incomplete topics
                if (pct < 100) {
                  items.push({
                    id: topicId,
                    title: topicData.title || "Untitled",
                    subject: topicData.subject || topicData.subjectName || "General",
                    pct,
                  });
                }
              }
            } catch {
              // Skip if topic doesn't exist
            }
          }
          
          if (items.length > 0) {
            return items.sort((a, b) => b.pct - a.pct).slice(0, 3);
          }
        }
        
        // Fallback: use quiz_attempts but verify topic IDs exist
        const quizQ = query(
          collection(db, "quiz_attempts"),
          where("user_id", "==", user.uid),
        );
        const quizSnap = await getDocs(quizQ);
        const topicMap: Record<string, { id: string; title: string; subject: string; pct: number }> = {};

        quizSnap.forEach((quizDoc) => {
          const data = quizDoc.data();
          const topicTitle = data.topic_title || data.topic;
          const topicId = data.topic_id;
          if (topicTitle && topicId && !topicMap[topicTitle]) {
            const pct = data.total_questions > 0 ? Math.round((data.score / data.total_questions) * 100) : 0;
            topicMap[topicTitle] = {
              id: topicId,
              title: topicTitle,
              subject: topicTitle,
              pct,
            };
          }
        });

        return Object.values(topicMap).slice(0, 3);
      } catch (error) {
        console.error("[Dashboard] Continue learning query failed:", error);
        return [];
      }
    },
    enabled: !!user,
  });

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return {
    profile,
    streak,
    totalXp: totalXp ?? 0,
    studyTime: studyTime ?? "0h",
    avgScore: avgScore ?? null,
    progressAnalytics: progressAnalytics ?? {
      todaySeconds: 0,
      weekSeconds: 0,
      monthSeconds: 0,
      prevWeekSeconds: 0,
      chartData: shortDay.slice(1).concat(shortDay[0]).map((day) => ({ day, hours: 0 })),
      dayWiseRecords: [],
      sessionCount: 0,
      avgSessionMinutes: 0,
    },
    continueLearning: continueLearning ?? [],
    weakTopics: weakTopics ?? [],
    greeting: greeting(),
    isLoading: profile === undefined || totalXp === undefined || progressAnalytics === undefined,
  };
};