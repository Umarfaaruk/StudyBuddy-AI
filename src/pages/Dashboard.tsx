import { Link } from "react-router-dom";
import {
  BookOpen, MessageCircleQuestion, Gamepad2, Upload, BarChart3,
  Trophy, Flame, Lightbulb, Bot, AlertTriangle, CalendarDays
} from "lucide-react";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Skeleton } from "@/components/ui/skeleton";

const Dashboard = () => {
  const { profile, streak, totalXp, studyTime, avgScore, continueLearning, weakTopics, isLoading, greeting } =
    useDashboardData();

  const displayName = profile?.full_name?.split(" ")[0] ?? "there";
  const nextMilestone = Math.ceil(totalXp / 500) * 500 || 500;
  const currentStreak = streak?.current_streak ?? 0;

  // Streak calendar — Current week (Mon-Sun)
  const streakDays = Array.from({ length: 7 }, (_, i) => {
    const todayDate = new Date();
    const currentDayOfWeek = todayDate.getDay();
    const todayIdx = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1; // Mon=0, Sun=6
    
    const dayNames = ["M", "T", "W", "T", "F", "S", "S"];
    const isActive = i <= todayIdx && i > todayIdx - currentStreak;
    
    return { label: dayNames[i], active: isActive };
  });

  // Mock leaderboard data
  const leaderboardUsers = [
    { name: "Xenon_77", xp: "+2.4k", avatar: "X", color: "bg-yellow-400" },
    { name: "Helios_42", xp: "+2.1k", avatar: "H", color: "bg-blue-400" },
    { name: "Neptune_19", xp: "+1.8k", avatar: "N", color: "bg-green-400" },
  ];

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

  // Badge emojis
  const badges = [
    { emoji: "🏆", label: "Champion" },
    { emoji: "🔥", label: "On Fire" },
    { emoji: "📚", label: "Bookworm" },
    { emoji: "⭐", label: "Star" },
    { emoji: "🎯", label: "Bullseye" },
    { emoji: "💎", label: "Diamond" },
    { emoji: "🚀", label: "Rocket" },
    { emoji: "🧠", label: "Brain" },
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
          <button className="relative h-10 w-10 rounded-xl bg-white shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors">
            <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-red-500 rounded-full border-2 border-white" />
          </button>
          {/* Search bar */}
          <div className="hidden md:flex items-center gap-2 bg-white rounded-xl shadow-sm px-4 py-2.5 w-64">
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search..."
              className="bg-transparent text-sm text-gray-600 placeholder-gray-400 outline-none flex-1"
            />
          </div>
        </div>
      </div>

      {/* ── Hero Row: Banner + Leaderboard ───────────────────── */}
      <div className="grid lg:grid-cols-5 gap-5">
        {/* Purple Gradient Banner */}
        <div className="lg:col-span-3 relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1D4ED8] to-[#2563EB] p-7 md:p-9 text-white min-h-[220px] flex flex-col justify-between">
          {/* Decorative circles */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-sm" />
          <div className="absolute bottom-4 right-16 w-24 h-24 bg-white/5 rounded-full" />
          <div className="absolute top-1/2 right-8 w-16 h-16 bg-white/10 rounded-full" />

          <div className="relative z-10">
            <span className="inline-block text-xs font-semibold tracking-widest uppercase bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full mb-4">
              Edu-Nox
            </span>
            <h2 className="text-xl md:text-2xl font-bold leading-snug max-w-md">
              "Failure is just feedback, adjust n try again"
            </h2>
            <p className="text-white/70 text-sm mt-1">— Piyush</p>
          </div>

          <div className="relative z-10 mt-6">
            <Link
              to="/materials"
              className="inline-flex items-center gap-2 border-2 border-white/60 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-white/10 transition-colors"
            >
              Get Started
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Leaderboard Widget */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm p-6 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-[#1D4ED8]" />
              Leaderboard
            </h3>
            <Link to="/leaderboard" className="text-xs font-semibold text-[#1D4ED8] hover:underline">
              See more
            </Link>
          </div>
          <div className="space-y-3 flex-1">
            {leaderboardUsers.map((u, idx) => (
              <div key={u.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50/80 hover:bg-gray-100/80 transition-colors">
                <span className="text-xs font-bold text-gray-400 w-5">#{idx + 1}</span>
                <div className={`h-9 w-9 rounded-full ${u.color} flex items-center justify-center text-white text-sm font-bold shadow-sm`}>
                  {u.avatar}
                </div>
                <span className="flex-1 text-sm font-medium text-gray-800">{u.name}</span>
                <span className="text-xs font-bold text-[#1D4ED8] bg-[#1D4ED8]/10 px-2.5 py-1 rounded-lg">{u.xp}</span>
              </div>
            ))}
            {/* Current user */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#1D4ED8]/5 border border-[#1D4ED8]/20">
              <span className="text-xs font-bold text-[#1D4ED8] w-5">You</span>
              <div className="h-9 w-9 rounded-full bg-[#1D4ED8] flex items-center justify-center text-white text-sm font-bold shadow-sm">
                {(displayName[0] ?? "Y").toUpperCase()}
              </div>
              <span className="flex-1 text-sm font-medium text-gray-800">{displayName}</span>
              <span className="text-xs font-bold text-[#1D4ED8] bg-[#1D4ED8]/10 px-2.5 py-1 rounded-lg">{totalXp.toLocaleString()} XP</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Action Cards + Chart Row ────────────────────────── */}
      <div className="grid lg:grid-cols-12 gap-5">
        {/* Left column: New Doc + Focus Timer */}
        <div className="lg:col-span-3 space-y-5">
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
        <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm p-6">
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

        {/* Right: Chat / Conversations preview */}
        <div className="lg:col-span-4 bg-[#0F172A] rounded-2xl p-5 text-white flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Bot className="h-4 w-4 text-[#1D4ED8]" />
              AI Tutor Chat
            </h3>
            <Link to="/materials/tutor" className="text-xs text-[#1D4ED8] hover:underline font-medium">
              Open →
            </Link>
          </div>
          <div className="flex-1 space-y-3 overflow-hidden">
            <div className="bg-white/10 rounded-xl px-4 py-3 text-xs text-white/80 leading-relaxed">
              💡 Hey {displayName}! Ready to learn something new today? Upload a document or ask me anything.
            </div>
            <div className="bg-[#1D4ED8]/20 rounded-xl px-4 py-3 text-xs text-white/90 leading-relaxed ml-6">
              What topics should I focus on this week?
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-3 text-xs text-white/80 leading-relaxed">
              Based on your progress, I'd recommend reviewing your weak areas. Keep that streak going! 🔥
            </div>
          </div>
        </div>
      </div>

      {/* ── Streak Bar ──────────────────────────────────────── */}
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

      {/* ── Your Badges ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-[#1D4ED8]" />
            Your Badges
          </h3>
          <Link to="/achievements" className="text-xs font-semibold text-[#1D4ED8] hover:underline">
            See all →
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto scrollbar-thin pb-2">
          {badges.map((b) => (
            <div
              key={b.label}
              className="flex flex-col items-center gap-2 min-w-[72px] group"
            >
              <div className="h-14 w-14 rounded-2xl bg-gray-50 group-hover:bg-[#1D4ED8]/10 flex items-center justify-center text-2xl transition-all duration-200 group-hover:scale-110 shadow-sm border border-gray-100">
                {b.emoji}
              </div>
              <span className="text-[10px] font-medium text-gray-400 group-hover:text-[#1D4ED8] transition-colors">{b.label}</span>
            </div>
          ))}
        </div>
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

      {/* ── Floating "Ask me anything" input ─────────────────── */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-xl z-50">
        <div className="flex items-center gap-3 bg-white rounded-2xl shadow-lg shadow-gray-200/60 border border-gray-100 px-5 py-3">
          <Bot className="h-5 w-5 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Ask me anything..."
            className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
          />
          <Link
            to="/materials/tutor"
            className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#1D4ED8] to-[#2563EB] flex items-center justify-center hover:shadow-md hover:shadow-blue-200 transition-all flex-shrink-0"
          >
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
