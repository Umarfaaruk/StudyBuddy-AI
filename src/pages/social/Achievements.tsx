import { Trophy, Star, Flame, Target, Zap, BookOpen, Medal, Award, Clock, MessageCircleQuestion } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Achievements page — stats sourced from Supabase.
 * Achievement definitions are hardcoded below; user progress is computed
 * from the user's real Supabase data.
 */

const iconMap: Record<string, React.ElementType> = {
  flame: Flame,
  trophy: Trophy,
  star: Star,
  target: Target,
  "book-open": BookOpen,
  zap: Zap,
  medal: Medal,
  award: Award,
  clock: Clock,
  "message-circle-question": MessageCircleQuestion,
};

// Hardcoded achievement definitions
const DEFAULT_ACHIEVEMENTS = [
  { id: "streak_7", key: "streak_7", name: "Week Warrior", description: "Maintain a 7-day study streak", icon: "flame", xp_reward: 50, threshold: 7, sort_order: 1 },
  { id: "streak_30", key: "streak_30", name: "Monthly Master", description: "Maintain a 30-day study streak", icon: "flame", xp_reward: 200, threshold: 30, sort_order: 2 },
  { id: "xp_hunter", key: "xp_hunter", name: "XP Hunter", description: "Earn 1,000 XP total", icon: "zap", xp_reward: 50, threshold: 1000, sort_order: 3 },
  { id: "xp_legend", key: "xp_legend", name: "XP Legend", description: "Earn 5,000 XP total", icon: "award", xp_reward: 200, threshold: 5000, sort_order: 4 },
  { id: "study_hour", key: "study_hour", name: "Focused Learner", description: "Study for 60 minutes total", icon: "clock", xp_reward: 30, threshold: 60, sort_order: 5 },
  { id: "bookworm", key: "bookworm", name: "Bookworm", description: "Complete 20 lessons", icon: "book-open", xp_reward: 100, threshold: 20, sort_order: 6 },
];

const Achievements = () => {
  const { user } = useAuth();

  // Fetch user stats from Supabase
  const { data: stats, isLoading } = useQuery({
    queryKey: ["achievement-stats", user?.uid],
    queryFn: async () => {
      if (!user) return null;

      try {
        const [xpRes, streakRes, quizRes, studyRes] = await Promise.all([
          supabase.from("xp_logs").select("xp_amount").eq("user_id", user.uid),
          supabase.from("user_streaks").select("*").eq("user_id", user.uid).maybeSingle(),
          supabase.from("quiz_attempts").select("score, total_questions").eq("user_id", user.uid),
          supabase.from("study_sessions").select("duration_seconds").eq("user_id", user.uid),
        ]);

        const totalXp = (xpRes.data ?? []).reduce((s, r) => s + (r.xp_amount || 0), 0);

        const streakData = streakRes.data ?? { current_streak: 0, longest_streak: 0 };

        const quizzes: any[] = quizRes.data ?? [];

        let totalStudySeconds = 0;
        (studyRes.data ?? []).forEach((d) => { totalStudySeconds += d.duration_seconds || 0; });

        const perfectQuizzes = quizzes.filter((q) => q.score === q.total_questions && q.total_questions > 0).length;
        const high90 = quizzes.filter((q) => q.total_questions > 0 && (q.score / q.total_questions) >= 0.9).length;

        return {
          totalXp,
          streak: streakData,
          quizCount: quizzes.length,
          perfectQuizzes,
          high90,
          lessonsCompleted: 0, // Would need lesson progress collection
          totalStudySeconds,
          doubtCount: 0, // Would need doubt_sessions collection
        };
      } catch (error) {
        console.error("[Achievements] Stats fetch error:", error);
        return {
          totalXp: 0, streak: { current_streak: 0, longest_streak: 0 },
          quizCount: 0, perfectQuizzes: 0, high90: 0,
          lessonsCompleted: 0, totalStudySeconds: 0, doubtCount: 0,
        };
      }
    },
    enabled: !!user,
  });

  const achievementDefs = DEFAULT_ACHIEVEMENTS;
  const totalXp = stats?.totalXp ?? 0;
  const nextMilestone = Math.ceil(totalXp / 500) * 500 || 500;
  const milestonePct = Math.round((totalXp / nextMilestone) * 100);
  const xpTitle =
    totalXp >= 5000 ? "Legend" : totalXp >= 3000 ? "Master" : totalXp >= 1500 ? "Scholar" : totalXp >= 500 ? "Rising Star" : "Beginner";

  const progressMap: Record<string, { current: number; total: number }> = stats
    ? {
        streak_7: { current: stats.streak?.current_streak ?? 0, total: 7 },
        streak_30: { current: stats.streak?.current_streak ?? 0, total: 30 },
        first_quiz: { current: stats.quizCount, total: 1 },
        quiz_master: { current: stats.quizCount, total: 50 },
        perfect_score: { current: stats.perfectQuizzes, total: 1 },
        sharp_shooter: { current: stats.high90, total: 10 },
        bookworm: { current: stats.lessonsCompleted, total: 20 },
        xp_hunter: { current: stats.totalXp, total: 1000 },
        xp_legend: { current: stats.totalXp, total: 5000 },
        first_doubt: { current: stats.doubtCount, total: 1 },
        study_hour: { current: Math.floor(stats.totalStudySeconds / 60), total: 60 },
        study_marathon: { current: Math.floor(stats.totalStudySeconds / 60), total: 600 },
      }
    : {};

  const earnedKeys = new Set(
    Object.entries(progressMap)
      .filter(([_, p]) => p.current >= p.total)
      .map(([key]) => key)
  );

  const earnedCount = earnedKeys.size;
  const totalCount = achievementDefs.length;

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Trophy className="h-6 w-6 text-accent" />
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Achievements</h1>
          <p className="text-muted-foreground text-sm">{earnedCount}/{totalCount} badges earned</p>
        </div>
      </div>

      {/* XP progress */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-foreground">{xpTitle} — {totalXp.toLocaleString()} XP</span>
          <span className="text-xs text-accent font-bold">Next: {nextMilestone.toLocaleString()} XP</span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${milestonePct}%` }} />
        </div>
        <div className="text-xs text-muted-foreground mt-2">{(nextMilestone - totalXp).toLocaleString()} XP to next milestone · Total: {totalXp.toLocaleString()} XP</div>
      </div>

      {/* Badge grid */}
      <div className="grid sm:grid-cols-2 gap-3">
        {achievementDefs.map((a) => {
          const earned = earnedKeys.has(a.key);
          const prog = progressMap[a.key];
          const IconComp = iconMap[a.icon] ?? Trophy;

          return (
            <div
              key={a.id}
              className={`bg-card border rounded-xl p-5 transition-colors ${
                earned ? "border-accent/30" : "border-border opacity-60"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  earned ? "bg-secondary" : "bg-muted"
                }`}>
                  <IconComp className={`h-6 w-6 ${earned ? "text-accent" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-foreground">{a.name}</div>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">+{a.xp_reward} XP</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{a.description}</div>
                  {!earned && prog && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-accent rounded-full" style={{ width: `${Math.min((prog.current / prog.total) * 100, 100)}%` }} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{Math.min(prog.current, prog.total)}/{prog.total}</div>
                    </div>
                  )}
                  {earned && (
                    <span className="inline-block mt-2 text-xs font-medium text-accent bg-accent/10 px-2 py-0.5 rounded-full">Earned ✓</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Achievements;
