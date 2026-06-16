import { Link } from "react-router-dom";
import {
  BookOpen, MessageCircleQuestion, Gamepad2, Upload, BarChart3,
  Trophy, Flame, Lightbulb, AlertTriangle, CalendarDays, User, ArrowRight, Wrench, Bot, Sparkles, Youtube
} from "lucide-react";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
// FIX Bug 1 + 4 + 13: Removed the `badgeStats` useQuery that was re-fetching
// quiz_attempts, study_sessions, doubt_sessions, and user_streaks — all of which
// useDashboardData already fetches. Badge data is now derived from what the hook
// already returns: avgScore, totalXp, streak. This halves Firestore reads on every
// dashboard load.
import NotificationPanel from "@/components/NotificationPanel";
import FeedbackEnforcer from "@/components/FeedbackEnforcer";
import { StaggerContainer, StaggerItem } from "@/components/motion/FadeIn";

const Dashboard = () => {
  const { user } = useAuth();
  const {
    profile, streak, totalXp, studyTime, avgScore,
    continueLearning, weakTopics, isLoading, greeting,
    // FIX: consume the additional data useDashboardData already fetches
    progressAnalytics,
  } = useDashboardData();

  const displayName = profile?.full_name?.split(" ")[0] ?? "there";
  const nextMilestone = Math.ceil(totalXp / 500) * 500 || 500;
  const currentStreak = streak?.current_streak ?? 0;
  const longestStreak = streak?.longest_streak ?? currentStreak;
  const studyHours = (progressAnalytics?.weekSeconds ?? 0) / 3600;

  // FIX Bug 1 + 4 + 13: Badges derived entirely from useDashboardData — no extra Firestore queries.
  // materialsCount and doubtCount are not in the hook, so those badge thresholds
  // are removed (they were minor cosmetic badges). Core badges still work correctly.
  const earnedBadges = (() => {
    const badges: { emoji: string; label: string }[] = [];

    if (currentStreak >= 7 || longestStreak >= 7) badges.push({ emoji: "🔥", label: "On Fire" });
    if ((avgScore ?? 0) > 80) badges.push({ emoji: "⭐", label: "Star" });
    if (studyHours >= 10) badges.push({ emoji: "🚀", label: "Rocket" });
    if (currentStreak >= 30 || longestStreak >= 30) badges.push({ emoji: "💎", label: "Diamond" });

    if (badges.length >= 3) badges.unshift({ emoji: "🏆", label: "Champion" });

    return badges;
  })();

  // Streak calendar — Current week (Mon-Sun)
  const streakDays = Array.from({ length: 7 }, (_, i) => {
    const todayDate = new Date();
    const currentDayOfWeek = todayDate.getDay();
    const todayIdx = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1; // Mon=0, Sun=6

    const dayNames = ["M", "T", "W", "T", "F", "S", "S"];
    const isActive = i <= todayIdx && i > todayIdx - currentStreak;

    return { label: dayNames[i], active: isActive };
  });

  return (
    <StaggerContainer className="p-5 md:p-8 space-y-6 max-w-[1400px] mx-auto pb-28 relative">
      <StaggerItem>
        <div className="flex items-center justify-between gap-4">
          <div>
            {isLoading ? (
              <>
                <Skeleton className="h-8 w-40 mb-1" />
                <Skeleton className="h-4 w-32" />
              </>
            ) : (
              <>
                <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                  Home
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                  Welcome back, <span className="font-medium text-foreground">{displayName}</span>
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <NotificationPanel />
            <Link
              to="/profile"
              className="hidden md:flex items-center gap-3 glass-card rounded-xl px-4 py-2 hover-lift"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="h-9 w-9 rounded-xl object-cover ring-2 ring-primary/10" />
              ) : (
                <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
              <div className="text-left">
                <div className="text-sm font-semibold text-foreground leading-tight">{displayName}</div>
                <div className="text-[10px] text-muted-foreground">View profile</div>
              </div>
            </Link>
          </div>
        </div>
      </StaggerItem>

      <StaggerItem>
      <div className="grid lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 space-y-5">
          <Link
            to="/materials"
            className="block relative overflow-hidden rounded-2xl bg-gradient-to-br from-cta to-cta/90 p-5 text-cta-foreground group hover-lift hover-glow min-h-[130px]"
          >
            <div className="absolute -bottom-4 -right-4 opacity-20 group-hover:opacity-30 transition-opacity">
              <Upload className="h-20 w-20" />
            </div>
            <div className="relative z-10">
              <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center mb-3">
                <Upload className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold">New Doc</h3>
              <p className="text-xs text-white/80 mt-1">Upload & learn</p>
            </div>
          </Link>

          {/* Focus Timer card */}
          <Link
            to="/timer"
            className="block relative overflow-hidden rounded-2xl bg-foreground p-5 text-white group hover-lift min-h-[130px]"
          >
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold">Focus Timer</h3>
                <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <svg className="h-4 w-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <div className="bg-white/10 rounded-lg px-3 py-1.5">
                  <span className="font-bold text-sm">25</span>
                  <span className="text-white/60 ml-1">min focus</span>
                </div>
                <div className="bg-white/10 rounded-lg px-3 py-1.5">
                  <span className="font-bold text-sm">6</span>
                  <span className="text-white/60 ml-1">min break</span>
                </div>
              </div>
            </div>
          </Link>
        </div>

        <div className="lg:col-span-8 glass-card rounded-2xl p-6 hover-glow">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              AI Tutor
            </h3>
            <Link to="/tools" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              Open <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Bot, label: "AI Document Tutor", desc: "Chat with your study AI", to: "/materials/tutor", color: "from-violet-500 to-violet-600" },
              { icon: MessageCircleQuestion, label: "Ask Doubt", desc: "Get instant answers", to: "/doubts", color: "from-[#29ABE2] to-[#29ABE2]" },
              { icon: Sparkles, label: "Flashcards", desc: "Generate study cards", to: "/materials/flashcards", color: "from-amber-500 to-orange-500" },
              { icon: Gamepad2, label: "Quick Quiz", desc: "Test your knowledge", to: "/quiz", color: "from-emerald-500 to-emerald-600" },
            ].map((tool) => (
              <Link
                key={tool.label}
                to={tool.to}
                className="group relative flex items-center gap-3 rounded-xl border border-border hover:border-primary/20 p-3.5 transition-all hover-lift bg-card"
              >
                <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${tool.color} flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow`}>
                  <tool.icon className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{tool.label}</div>
                  <div className="text-[11px] text-muted-foreground">{tool.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
      </StaggerItem>

      <StaggerItem>
      <div className="glass-card rounded-2xl p-5 hover-glow">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Flame className="h-5 w-5 text-cta" />
            <span className="font-bold text-foreground">{currentStreak}-Day Streak</span>
            <span className="text-xs text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full font-medium">
              {totalXp.toLocaleString()} XP · Next: {nextMilestone.toLocaleString()} XP
            </span>
          </div>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          {/* Streak calendar */}
          <div className="flex gap-2">
            {streakDays.map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div
                  className={`h-10 w-10 rounded-xl flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                    d.active
                      ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-md shadow-primary/20"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {d.label}
                </div>
              </div>
            ))}
          </div>

          {/* Earned Badges - beside streak */}
          {earnedBadges.length > 0 && (
            <>
              <div className="h-10 w-px bg-gray-200 hidden sm:block" />
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground mr-1">Badges</span>
                {earnedBadges.map((b) => (
                  <div
                    key={b.label}
                    className="h-10 w-10 rounded-xl bg-primary/5 flex items-center justify-center text-lg hover:scale-110 transition-transform duration-300 cursor-default border border-primary/10 hover-glow"
                    title={b.label}
                  >
                    {b.emoji}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      </StaggerItem>

      <StaggerItem>
      <div className="glass-card rounded-2xl p-6 hover-glow">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Continue Learning
          </h3>
          <Link to="/lessons" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 rounded-xl p-4 bg-gray-50">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : continueLearning.length > 0 ? (
          <div className="space-y-3">
            {continueLearning.map((t: { id: string; title: string; subject: string; pct: number }, idx: number) => (
              <Link
                key={t.id}
                to={`/lessons/${t.id}`}
                className="flex items-center gap-4 rounded-xl hover:bg-muted/60 p-4 transition-all duration-200 group border border-border hover-lift"
              >
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center flex-shrink-0 text-primary-foreground text-sm font-bold shadow-sm">
                  {String(idx + 1).padStart(2, "0")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{t.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t.subject} · {t.pct}% complete
                  </div>
                  <div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden max-w-xs">
                    <div className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full transition-all duration-500" style={{ width: `${t.pct}%` }} />
                  </div>
                </div>
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <svg className="h-4 w-4 text-primary ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">📖</div>
            <div className="text-sm text-muted-foreground">Start a lesson to track your progress</div>
            <Link to="/materials" className="inline-block mt-3 text-sm font-semibold text-primary hover:underline">
              Browse materials →
            </Link>
          </div>
        )}
      </div>
      </StaggerItem>

      <StaggerItem>
      {weakTopics.length > 0 ? (
        <div className="bg-gradient-to-r from-cta-light to-cta-light/50 border border-cta/20 rounded-2xl p-6 space-y-4 hover-glow">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-cta" />
            <span className="font-bold text-sm text-foreground">Recommended Focus Areas</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Based on your quiz scores, these topics need more practice:
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {weakTopics.map((t: { topic: string; avgScore: number }) => (
              <Link
                key={t.topic}
                to="/quiz"
                className="glass-card rounded-xl px-4 py-3 hover-lift"
              >
                <div className="text-sm font-semibold text-foreground">{t.topic}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted-foreground">Quiz topic</span>
                  <span className="text-xs font-bold text-destructive">{t.avgScore}% mastery</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 bg-primary/5 border border-primary/10 rounded-2xl px-6 py-5 hover-glow">
          <AlertTriangle className="h-5 w-5 text-primary flex-shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-bold text-foreground">
              Complete quizzes to identify weak topics
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Take a quiz to get personalized recommendations on where to focus.
            </div>
          </div>
          <Link to="/quiz" className="text-xs font-semibold text-primary hover:underline whitespace-nowrap">
            Take quiz →
          </Link>
        </div>
      )}
      </StaggerItem>

      <StaggerItem>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { icon: MessageCircleQuestion, label: "Doubts", to: "/doubts" },
          { icon: Gamepad2, label: "Practice", to: "/quiz" },
          { icon: BookOpen, label: "Lessons", to: "/lessons" },
          { icon: Upload, label: "Resources", to: "/materials" },
          { icon: CalendarDays, label: "Planner", to: "/planner" },
          { icon: Trophy, label: "Rewards", to: "/achievements" },
        ].map((a) => (
          <Link
            key={a.label}
            to={a.to}
            className="group glass-card rounded-2xl p-4 hover-lift text-center"
          >
            <a.icon className="h-5 w-5 text-primary mx-auto mb-2 group-hover:scale-110 transition-transform duration-300" />
            <div className="text-xs font-semibold text-muted-foreground group-hover:text-primary transition-colors">{a.label}</div>
          </Link>
        ))}
      </div>
      </StaggerItem>

      <FeedbackEnforcer />
    </StaggerContainer>
  );
};

export default Dashboard;
