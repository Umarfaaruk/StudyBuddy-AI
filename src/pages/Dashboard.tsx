import { Link } from "react-router-dom";
import {
  BookOpen, MessageCircleQuestion, Gamepad2, Upload, BarChart3,
  Trophy, Flame, Lightbulb, AlertTriangle, CalendarDays, User
} from "lucide-react";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import NotificationPanel from "@/components/NotificationPanel";
import EduOnxAIChat from "@/components/EduOnxAIChat";
import FeedbackEnforcer from "@/components/FeedbackEnforcer";

const Dashboard = () => {
  const { user } = useAuth();
  const { profile, streak, totalXp, studyTime, avgScore, continueLearning, weakTopics, isLoading, greeting } =
    useDashboardData();

  const displayName = profile?.full_name?.split(" ")[0] ?? "there";
  const nextMilestone = Math.ceil(totalXp / 500) * 500 || 500;
  const currentStreak = streak?.current_streak ?? 0;

  // Fetch additional stats for badge computation
  const { data: badgeStats } = useQuery({
    queryKey: ["badge-stats", user?.uid],
    queryFn: async () => {
      if (!user) return { materialsCount: 0, quizCount: 0, studyHours: 0, doubtCount: 0, longestStreak: 0 };
      
      const [materialsSnap, quizSnap, sessionsSnap, doubtsSnap, streakSnap] = await Promise.all([
        getDocs(query(collection(db, "materials"), where("user_id", "==", user.uid))),
        getDocs(query(collection(db, "quiz_attempts"), where("user_id", "==", user.uid))),
        getDocs(query(collection(db, "study_sessions"), where("user_id", "==", user.uid))),
        getDocs(query(collection(db, "doubt_sessions"), where("user_id", "==", user.uid))),
        getDoc(doc(db, "user_streaks", user.uid)),
      ]);

      const totalSeconds = sessionsSnap.docs.reduce((sum, d) => sum + (d.data().duration_seconds || 0), 0);
      const streakData = streakSnap.exists() ? streakSnap.data() : {};

      return {
        materialsCount: materialsSnap.size,
        quizCount: quizSnap.size,
        studyHours: totalSeconds / 3600,
        doubtCount: doubtsSnap.size,
        longestStreak: streakData?.longest_streak ?? currentStreak,
      };
    },
    enabled: !!user,
  });

  // Compute earned badges from actual user activity
  const earnedBadges = (() => {
    if (!badgeStats) return [];
    const badges: { emoji: string; label: string }[] = [];
    
    if (currentStreak >= 7 || (badgeStats.longestStreak ?? 0) >= 7) badges.push({ emoji: "🔥", label: "On Fire" });
    if (badgeStats.materialsCount >= 5) badges.push({ emoji: "📚", label: "Bookworm" });
    if ((avgScore ?? 0) > 80) badges.push({ emoji: "⭐", label: "Star" });
    if (badgeStats.quizCount >= 10) badges.push({ emoji: "🎯", label: "Bullseye" });
    if (badgeStats.studyHours >= 10) badges.push({ emoji: "🚀", label: "Rocket" });
    if (badgeStats.doubtCount >= 20) badges.push({ emoji: "🧠", label: "Brain" });
    if (currentStreak >= 30 || (badgeStats.longestStreak ?? 0) >= 30) badges.push({ emoji: "💎", label: "Diamond" });
    
    // Champion = all of the above (excluding Diamond)
    if (badges.length >= 6) badges.unshift({ emoji: "🏆", label: "Champion" });
    
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

  // Mock retention data for bar chart
  const retentionData = [
    { label: "Mon", value: 65 },
    { label: "Tue", value: 80 },
    { label: "Wed", value: 45 },
    { label: "Thu", value: 90 },
    { label: "Fri", value: 70 },
    { label: "Sat", value: 55 },
    { label: "Sun", value: 85 },
  ];

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-[1400px] mx-auto pb-28 relative">

      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          {isLoading ? (
            <>
              <Skeleton className="h-8 w-40 mb-1" />
              <Skeleton className="h-4 w-32" />
            </>
          ) : (
            <>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                Home
              </h1>
              <p className="text-gray-500 text-sm mt-0.5">
                Welcome back, {displayName} 👋
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Notification bell */}
          <NotificationPanel />
          {/* Profile button (replaces search bar) */}
          <Link
            to="/profile"
            className="hidden md:flex items-center gap-3 bg-white rounded-xl shadow-sm px-4 py-2 hover:shadow-md transition-all duration-200 border border-gray-100"
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-[#1D4ED8] flex items-center justify-center">
                <User className="h-4 w-4 text-white" />
              </div>
            )}
            <div className="text-left">
              <div className="text-sm font-semibold text-gray-900 leading-tight">{displayName}</div>
              <div className="text-[10px] text-gray-400">View Profile</div>
            </div>
          </Link>
        </div>
      </div>



      {/* ── Action Cards + Chart Row ────────────────────────── */}
      <div className="grid lg:grid-cols-12 gap-5">
        {/* Left column: New Doc + Focus Timer */}
        <div className="lg:col-span-4 space-y-5">
          {/* New Doc card */}
          <Link
            to="/materials"
            className="block relative overflow-hidden rounded-2xl bg-[#F97316] p-5 text-white group hover:shadow-lg transition-all duration-300 min-h-[130px]"
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
            className="block relative overflow-hidden rounded-2xl bg-[#0F172A] p-5 text-white group hover:shadow-lg transition-all duration-300 min-h-[130px]"
          >
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold">Focus Timer</h3>
                <div className="h-9 w-9 rounded-full bg-[#1D4ED8] flex items-center justify-center group-hover:scale-110 transition-transform">
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

        {/* Center: Retention Trajectory */}
        <div className="lg:col-span-8 bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[#1D4ED8]" />
              Retention Trajectory
            </h3>
            <span className="text-xs text-gray-400 font-medium">This week</span>
          </div>
          {/* CSS Bar Chart */}
          <div className="flex items-end gap-2 h-36">
            {retentionData.map((d, idx) => (
              <div key={d.label} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full relative flex items-end justify-center" style={{ height: "120px" }}>
                  <div
                    className="w-full max-w-[32px] rounded-t-lg transition-all duration-500 ease-out"
                    style={{
                      height: `${d.value}%`,
                      background: idx === 3 ? "linear-gradient(to top, #1D4ED8, #93C5FD)" : "#e5e7eb",
                    }}
                  />
                </div>
                <span className="text-[11px] text-gray-400 font-medium">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Streak Bar + Earned Badges ──────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Flame className="h-5 w-5 text-orange-500" />
            <span className="font-bold text-gray-900">{currentStreak}-Day Streak</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-0.5 rounded-full font-medium">
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
                      ? "bg-gradient-to-br from-[#1D4ED8] to-[#2563EB] text-white shadow-md shadow-blue-200"
                      : "bg-gray-100 text-gray-400"
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
                <span className="text-xs font-semibold text-gray-400 mr-1">Badges</span>
                {earnedBadges.map((b) => (
                  <div
                    key={b.label}
                    className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#1D4ED8]/5 to-[#2563EB]/10 flex items-center justify-center text-lg hover:scale-110 transition-transform cursor-default border border-[#1D4ED8]/10"
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

      {/* ── Continue Learning ────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-[#1D4ED8]" />
            Continue Learning
          </h3>
          <Link to="/lessons" className="text-xs font-semibold text-[#1D4ED8] hover:underline">
            View all →
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
                className="flex items-center gap-4 rounded-xl hover:bg-gray-50 p-4 transition-all duration-200 group border border-gray-100"
              >
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[#1D4ED8] to-[#2563EB] flex items-center justify-center flex-shrink-0 text-white text-sm font-bold shadow-sm">
                  {String(idx + 1).padStart(2, "0")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate group-hover:text-[#1D4ED8] transition-colors">{t.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {t.subject} · {t.pct}% complete
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden max-w-xs">
                    <div className="h-full bg-gradient-to-r from-[#1D4ED8] to-[#93C5FD] rounded-full transition-all duration-500" style={{ width: `${t.pct}%` }} />
                  </div>
                </div>
                <div className="h-9 w-9 rounded-full bg-[#1D4ED8]/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <svg className="h-4 w-4 text-[#1D4ED8] ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">📖</div>
            <div className="text-sm text-gray-500">Start a lesson to track your progress</div>
            <Link to="/materials" className="inline-block mt-3 text-sm font-semibold text-[#1D4ED8] hover:underline">
              Browse materials →
            </Link>
          </div>
        )}
      </div>

      {/* ── Weak Topics / Recommendations ───────────────────── */}
      {weakTopics.length > 0 ? (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            <span className="font-bold text-sm text-gray-900">Recommended Focus Areas</span>
          </div>
          <p className="text-xs text-gray-500">
            Based on your quiz scores, these topics need more practice:
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {weakTopics.map((t: { topic: string; avgScore: number }) => (
              <Link
                key={t.topic}
                to="/quiz"
                className="bg-white rounded-xl px-4 py-3 hover:shadow-md transition-all duration-200 border border-amber-100"
              >
                <div className="text-sm font-semibold text-gray-900">{t.topic}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-400">Quiz topic</span>
                  <span className="text-xs font-bold text-red-500">{t.avgScore}% mastery</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 bg-[#1D4ED8]/5 border border-[#1D4ED8]/10 rounded-2xl px-6 py-5">
          <AlertTriangle className="h-5 w-5 text-[#1D4ED8] flex-shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-bold text-gray-900">
              Complete quizzes to identify weak topics
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Take a quiz to get personalized recommendations on where to focus.
            </div>
          </div>
          <Link to="/quiz" className="text-xs font-semibold text-[#1D4ED8] hover:underline whitespace-nowrap">
            Take quiz →
          </Link>
        </div>
      )}

      {/* ── Quick Actions Grid ──────────────────────────────── */}
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
            className="group bg-white rounded-2xl p-4 hover:shadow-md transition-all duration-200 text-center border border-gray-100 hover:border-[#1D4ED8]/30"
          >
            <a.icon className="h-5 w-5 text-[#1D4ED8] mx-auto mb-2 group-hover:scale-110 transition-transform" />
            <div className="text-xs font-semibold text-gray-600 group-hover:text-[#1D4ED8] transition-colors">{a.label}</div>
          </Link>
        ))}
      </div>

      {/* ── EduOnx AI Side Chat ──────────────────────────── */}
      <EduOnxAIChat />

      {/* ── Mandatory Feedback Check ────────────────────── */}
      <FeedbackEnforcer />
    </div>
  );
};

export default Dashboard;
