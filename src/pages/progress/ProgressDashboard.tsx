import { Clock, TrendingUp, TrendingDown, AlertTriangle, Lightbulb, Calendar, FileText, Flame, BarChart3, Target, Users, Send, BookOpen, MessageCircleQuestion, Gamepad2, ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, getDocs, addDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const ProgressDashboard = () => {
  const { user } = useAuth();
  const { streak, avgScore, progressAnalytics, weakTopics, isLoading } = useDashboardData();
  const [isParentMode, setIsParentMode] = useState(false);
  const [guidanceText, setGuidanceText] = useState("");
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [dayDetails, setDayDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const { data: guidanceNotes, refetch: refetchNotes } = useQuery({
    queryKey: ["parent-guidance", user?.uid],
    queryFn: async () => {
       if (!user) return [];
       const q = query(collection(db, "parent_guidance"), where("student_id", "==", user.uid), orderBy("created_at", "desc"));
       const snap = await getDocs(q);
       return snap.docs.map(d => ({id: d.id, ...d.data()} as any));
    },
    enabled: !!user
  });

  const handleAddGuidance = async () => {
    if (!guidanceText.trim() || !user) return;
    try {
      await addDoc(collection(db, "parent_guidance"), {
        student_id: user.uid,
        text: guidanceText.trim(),
        created_at: Date.now()
      });
      setGuidanceText("");
      refetchNotes();
      toast.success("Guidance note added successfully!");
    } catch (e) {
      toast.error("Failed to add guidance");
    }
  };

  const totalHours = (progressAnalytics.monthSeconds / 3600).toFixed(1);
  const weekHours = (progressAnalytics.weekSeconds / 3600).toFixed(1);
  const todayMinutes = Math.round(progressAnalytics.todaySeconds / 60);
  const currentStreak = streak?.current_streak ?? 0;
  const longestStreak = streak?.longest_streak ?? 0;
  const chartData = progressAnalytics.chartData;
  const dayWiseRecords = progressAnalytics.dayWiseRecords;
  const sessionCount = progressAnalytics.sessionCount ?? 0;
  const avgSessionMinutes = progressAnalytics.avgSessionMinutes ?? 0;

  // Week-over-week change
  const prevWeekHours = (progressAnalytics.prevWeekSeconds ?? 0) / 3600;
  const weekChange = prevWeekHours > 0
    ? Math.round(((progressAnalytics.weekSeconds / 3600 - prevWeekHours) / prevWeekHours) * 100)
    : 0;

  const maxHours = Math.max(...(chartData?.map((d: any) => d.hours) ?? [1]), 0.5);

  // Derived values for the new dashboard
  const retentionPct = avgScore ?? 0;
  const completionPct = Math.min(100, Math.round((sessionCount / Math.max(sessionCount, 30)) * 100));
  const totalXP = sessionCount * 50 + (avgScore ?? 0) * 10 + currentStreak * 25;
  const weekBarData = (chartData ?? Array.from({ length: 7 }, (_, i) => ({ day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i], hours: 0 })));

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">

      {/* ───── Page Header ───── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
            <Link to="/dashboard" className="hover:text-gray-700 transition-colors">Home</Link>
            <span>›</span>
            <span className="text-gray-700 font-medium">Dashboard</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight">
             Dashboard
          </h1>
          <p className="text-gray-400 text-sm mt-1.5">
            Performance analytics, retention metrics &amp; AI-powered recommendations.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className={`gap-2 rounded-xl border-gray-200 ${isParentMode ? 'border-[#1D4ED8] text-[#1D4ED8] bg-[#1D4ED8]/10' : 'text-gray-500'}`}
            onClick={() => setIsParentMode(!isParentMode)}
          >
            <Users className="h-4 w-4" />
            {isParentMode ? "Exit Parent Mode" : "Parent View"}
          </Button>
          <span className="text-[11px] text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full font-medium">Last 30 Days</span>
        </div>
      </div>

      {/* ───── Top Stats Row — 3 highlight cards ───── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-6 shadow-sm">
              <Skeleton className="h-3 w-20 mb-4" />
              <Skeleton className="h-10 w-24 mb-2" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* RETENTION card */}
          <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100 relative overflow-hidden group hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#1D4ED8]/5 rounded-full -translate-y-8 translate-x-8" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">Retention</p>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-extrabold text-gray-900">{retentionPct}%</span>
              <span className="text-xs text-[#1D4ED8] font-semibold pb-1.5">avg score</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full mt-4 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${retentionPct}%`, background: 'linear-gradient(90deg, #1D4ED8, #2563EB)' }}
              />
            </div>
          </div>

          {/* GROWTH card */}
          <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100 relative overflow-hidden group hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -translate-y-8 translate-x-8" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">Growth</p>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-extrabold text-gray-900">
                {weekChange >= 0 ? "+" : ""}{weekChange !== 0 ? `${weekChange}` : "0"}%
              </span>
              {weekChange >= 0 ? (
                <TrendingUp className="h-5 w-5 text-emerald-500 pb-0.5" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-400 pb-0.5" />
              )}
            </div>
            <p className="text-xs text-gray-400 mt-3">vs. previous week</p>
          </div>

          {/* STUDY TIME card */}
          <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100 relative overflow-hidden group hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-400/5 rounded-full -translate-y-8 translate-x-8" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">Study Time</p>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-extrabold text-gray-900">{totalHours}</span>
              <span className="text-lg font-bold text-gray-400 pb-0.5">hrs</span>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <span className="text-[11px] text-gray-400">Today <span className="font-semibold text-gray-600">{todayMinutes}m</span></span>
              <span className="text-gray-200">|</span>
              <span className="text-[11px] text-gray-400">Week <span className="font-semibold text-gray-600">{weekHours}h</span></span>
            </div>
          </div>
        </div>
      )}

      {/* ───── Two-Column Layout ───── */}
      <div className="grid lg:grid-cols-5 gap-6">

        {/* LEFT — Retention Trajectory (3/5 width) */}
        <div className="lg:col-span-3 bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="font-bold text-gray-900 text-lg">Retention Trajectory</h3>
              <p className="text-xs text-gray-400 mt-0.5">Weekly study hours breakdown</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'linear-gradient(135deg, #1D4ED8, #2563EB)' }} />
              <span className="text-[11px] text-gray-400 font-medium">This Week</span>
            </div>
          </div>
          <div className="flex items-end gap-3 h-48">
            {weekBarData.map((d: any, idx: number) => {
              const pct = Math.max((d.hours / maxHours) * 100, 6);
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-2 group">
                  <span className="text-[10px] font-semibold text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    {d.hours > 0 ? `${d.hours}h` : "–"}
                  </span>
                  <div className="w-full relative" style={{ height: `${pct}%` }}>
                    <div
                      className="absolute inset-0 rounded-xl transition-all duration-500 group-hover:scale-105"
                      style={{
                        background: d.hours > 0
                          ? `linear-gradient(180deg, #1D4ED8 0%, #2563EB 100%)`
                          : '#F3F4F6',
                        opacity: d.hours > 0 ? 0.85 + (idx * 0.02) : 1,
                      }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-400 font-medium">{d.day}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT column (2/5 width) — stacked cards */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* Academy Completion — dark card with SVG ring */}
          <div className="bg-[#0F172A] text-white rounded-2xl p-6 flex items-center gap-6">
            <div className="relative flex-shrink-0">
              <svg width="100" height="100" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="42"
                  fill="none"
                  stroke="url(#progressGradient)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  strokeDashoffset={`${2 * Math.PI * 42 * (1 - completionPct / 100)}`}
                  transform="rotate(-90 50 50)"
                  className="transition-all duration-700"
                />
                <defs>
                  <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#1D4ED8" />
                    <stop offset="100%" stopColor="#2563EB" />
                  </linearGradient>
                </defs>
                <text x="50" y="47" textAnchor="middle" className="fill-white text-xl font-extrabold" style={{ fontSize: '22px', fontWeight: 800 }}>
                  {completionPct}%
                </text>
                <text x="50" y="62" textAnchor="middle" className="fill-gray-400" style={{ fontSize: '8px' }}>
                  COMPLETE
                </text>
              </svg>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">Academy Completion</p>
              <p className="text-2xl font-extrabold">{sessionCount} <span className="text-sm font-medium text-gray-400">sessions</span></p>
              <p className="text-xs text-gray-500 mt-1">Avg. {avgSessionMinutes}m per session</p>
            </div>
          </div>

          {/* Total XP — dark card */}
          <div className="bg-[#0F172A] text-white rounded-2xl p-6 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">Total XP</p>
              <p className="text-3xl font-extrabold tracking-tight">{totalXP.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">{currentStreak}-day streak bonus active 🔥</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full">
                +{(currentStreak * 25) + (todayMinutes > 0 ? 50 : 0)}
              </span>
              <span className="text-[10px] text-gray-500">today</span>
            </div>
          </div>

        </div>
      </div>

      {/* ───── Bottom Row — 3 cards ───── */}
      <div className="grid md:grid-cols-3 gap-6">

        {/* Award Winning card */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-amber-50/50 to-transparent pointer-events-none" />
          <div className="relative">
            <p className="text-3xl mb-2">🏆</p>
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">Award Winning</p>
            <p className="text-6xl font-black text-gray-900 leading-none">
              {String(Math.max(1, Math.floor(currentStreak / 7))).padStart(2, "0")}
            </p>
            <p className="text-xs text-gray-400 mt-2">Weekly milestones achieved</p>
            <div className="flex items-center justify-center gap-1 mt-3">
              {[...Array(Math.min(5, Math.max(1, Math.floor(currentStreak / 7))))].map((_, i) => (
                <span key={i} className="text-amber-400 text-sm">★</span>
              ))}
            </div>
          </div>
        </div>

        {/* AI Smart Insights card */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-xl bg-[#1D4ED8]/10 flex items-center justify-center">
              <Lightbulb className="h-4 w-4 text-[#1D4ED8]" />
            </div>
            <h3 className="font-bold text-gray-900">AI Smart Insights</h3>
          </div>
          <div className="flex-1 space-y-3">
            {todayMinutes > 0 || sessionCount > 0 ? (
              <>
                <div className="bg-gray-50 rounded-xl px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#1D4ED8] mb-1">Productivity</p>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {todayMinutes >= 30
                      ? "Great focus today! You've studied for over 30 minutes. Keep up the momentum!"
                      : todayMinutes > 0
                      ? `You've studied ${todayMinutes} minutes today. Try to reach 30 minutes for optimal learning.`
                      : "Start a study session today to maintain your streak!"}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#1D4ED8] mb-1">Consistency</p>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {currentStreak >= 7
                      ? `🔥 Amazing ${currentStreak}-day streak! You're building a powerful learning habit.`
                      : currentStreak >= 3
                      ? `Good ${currentStreak}-day streak! Keep going to build long-term retention.`
                      : "Consistency is key to learning. Try to study every day, even just 10 minutes."}
                  </p>
                </div>
                {weekChange !== 0 && (
                  <div className="bg-gray-50 rounded-xl px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#1D4ED8] mb-1">Trend</p>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {weekChange > 0
                        ? `📈 You studied ${weekChange}% more this week compared to last week. Excellent progress!`
                        : `📉 Study time decreased by ${Math.abs(weekChange)}% this week. Consider setting a daily goal.`}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-400">Complete study sessions and quizzes to receive personalized insights.</p>
            )}
          </div>
          <Button asChild className="w-full mt-4 bg-[#1D4ED8] hover:bg-[#2563EB] text-white rounded-xl text-sm font-semibold h-10">
            <Link to="/timer">Start Study Session</Link>
          </Button>
        </div>

        {/* Next Unlock — purple gradient card */}
        <div
          className="rounded-2xl p-6 text-white relative overflow-hidden flex flex-col justify-between"
          style={{ background: 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 50%, #1E40AF 100%)' }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-12 translate-x-12" />
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-full translate-y-8 -translate-x-8" />
          <div className="relative">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/70 mb-2">Next Unlock</p>
            <p className="text-2xl font-extrabold leading-tight mb-1">
              {currentStreak >= 7 ? "🏅 Consistency Pro" : currentStreak >= 3 ? "🎯 Focus Master" : "⭐ First Streak"}
            </p>
            <p className="text-xs text-white/60 leading-relaxed">
              {currentStreak >= 7
                ? "Maintain a 14-day streak to unlock this badge"
                : currentStreak >= 3
                ? "Reach a 7-day streak to unlock this badge"
                : "Study 3 consecutive days to earn your first badge"}
            </p>
          </div>
          <div className="relative mt-5">
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, currentStreak >= 7 ? (currentStreak / 14) * 100 : currentStreak >= 3 ? (currentStreak / 7) * 100 : (currentStreak / 3) * 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-white/50 font-medium">{currentStreak} days</span>
              <span className="text-[10px] text-white/50 font-medium">
                {currentStreak >= 7 ? "14 days" : currentStreak >= 3 ? "7 days" : "3 days"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ───── Day-wise Records (expandable) ───── */}
      <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-gray-900 text-lg">Day-wise Study Records</h3>
          <span className="text-[11px] text-gray-400 bg-gray-50 px-3 py-1 rounded-full font-medium">Last 30 Days</span>
        </div>
        <p className="text-xs text-gray-400 mb-5">Click on a date to view concepts learned that day.</p>
        {(dayWiseRecords ?? []).length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {dayWiseRecords.map((entry: { date: string; minutes: number; sessions?: number }) => (
              <div key={entry.date}>
                <button
                  onClick={async () => {
                    if (expandedDate === entry.date) {
                      setExpandedDate(null);
                      setDayDetails(null);
                      return;
                    }
                    setExpandedDate(entry.date);
                    setLoadingDetails(true);
                    try {
                      const lessonsSnap = await getDocs(
                        query(collection(db, "lesson_progress"), where("user_id", "==", user?.uid))
                      );
                      const dayLessons: string[] = [];
                      lessonsSnap.forEach(d => {
                        const data = d.data();
                        if (data.updated_at) {
                          const updatedDate = data.updated_at?.toDate?.() ?? new Date(data.updated_at);
                          if (updatedDate.toISOString().slice(0, 10) === entry.date) {
                            dayLessons.push(...(data.completed_lessons || []));
                          }
                        }
                      });
                      const quizSnap = await getDocs(
                        query(collection(db, "quiz_attempts"), where("user_id", "==", user?.uid))
                      );
                      const dayQuizzes: { topic: string; score: number; total: number }[] = [];
                      quizSnap.forEach(d => {
                        const data = d.data();
                        const createdAt = data.created_at?.toDate?.() ?? new Date(data.created_at);
                        if (createdAt.toISOString().slice(0, 10) === entry.date) {
                          dayQuizzes.push({
                            topic: data.topic_title || "General",
                            score: data.score || 0,
                            total: data.total_questions || 0,
                          });
                        }
                      });
                      const doubtsSnap = await getDocs(
                        query(collection(db, "doubt_sessions"), where("user_id", "==", user?.uid))
                      );
                      const dayDoubts: string[] = [];
                      doubtsSnap.forEach(d => {
                        const data = d.data();
                        const createdAt = data.created_at ? new Date(data.created_at) : null;
                        if (createdAt && createdAt.toISOString().slice(0, 10) === entry.date) {
                          dayDoubts.push(data.question_preview || "Question");
                        }
                      });
                      setDayDetails({ lessons: dayLessons, quizzes: dayQuizzes, doubts: dayDoubts });
                    } catch (err) {
                      console.error("[Progress] Failed to load day details:", err);
                      setDayDetails({ lessons: [], quizzes: [], doubts: [] });
                    } finally {
                      setLoadingDetails(false);
                    }
                  }}
                  className={`rounded-xl border px-4 py-3 text-left w-full transition-all ${
                    expandedDate === entry.date
                      ? 'border-[#1D4ED8]/40 bg-[#1D4ED8]/5 shadow-sm'
                      : 'border-gray-100 bg-gray-50 hover:border-[#1D4ED8]/20 hover:bg-gray-100/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-900">{entry.date}</div>
                    <div className="flex items-center gap-2">
                      {entry.sessions && (
                        <span className="text-[10px] text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-100">
                          {entry.sessions} session{entry.sessions !== 1 ? "s" : ""}
                        </span>
                      )}
                      {expandedDate === entry.date ? (
                        <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{entry.minutes} minutes studied</div>
                  <div className="h-1.5 bg-gray-200 rounded-full mt-2.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, (entry.minutes / 60) * 100)}%`, background: 'linear-gradient(90deg, #1D4ED8, #2563EB)' }}
                    />
                  </div>
                </button>

                {expandedDate === entry.date && (
                  <div className="mt-2 rounded-xl border border-[#1D4ED8]/20 bg-white p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200 shadow-sm">
                    {loadingDetails ? (
                      <div className="text-xs text-gray-400 text-center py-4">Loading concepts…</div>
                    ) : dayDetails ? (
                      <>
                        {dayDetails.lessons.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-900">
                              <BookOpen className="h-3.5 w-3.5 text-[#1D4ED8]" /> Lessons Completed
                            </div>
                            {dayDetails.lessons.map((lessonId: string, i: number) => (
                              <div key={i} className="text-xs text-gray-500 pl-5">• Lesson: {lessonId}</div>
                            ))}
                          </div>
                        )}
                        {dayDetails.quizzes.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-900">
                              <Gamepad2 className="h-3.5 w-3.5 text-[#1D4ED8]" /> Quizzes Taken
                            </div>
                            {dayDetails.quizzes.map((q: any, i: number) => (
                              <div key={i} className="text-xs text-gray-500 pl-5">
                                • {q.topic} — Score: {q.score}/{q.total} ({q.total > 0 ? Math.round((q.score / q.total) * 100) : 0}%)
                              </div>
                            ))}
                          </div>
                        )}
                        {dayDetails.doubts.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-900">
                              <MessageCircleQuestion className="h-3.5 w-3.5 text-[#1D4ED8]" /> Doubts Asked
                            </div>
                            {dayDetails.doubts.map((d: string, i: number) => (
                              <div key={i} className="text-xs text-gray-500 pl-5 truncate">• {d}</div>
                            ))}
                          </div>
                        )}
                        {dayDetails.lessons.length === 0 && dayDetails.quizzes.length === 0 && dayDetails.doubts.length === 0 && (
                          <div className="text-xs text-gray-400 text-center py-2">
                            Study sessions recorded, but no specific lesson/quiz activity tracked for this date.
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No study records yet. Start the timer from dashboard.</p>
        )}
      </div>

      {/* ───── Subject Mastery ───── */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 text-lg">Subject Mastery</h3>
            <Link to="/lessons" className="text-xs text-[#1D4ED8] hover:underline font-medium">View All →</Link>
          </div>
          {(weakTopics ?? []).length > 0 ? (
            weakTopics.map((t: any) => (
              <div key={t.topic} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700 font-medium">{t.topic}</span>
                  <span className="text-[#1D4ED8] font-bold">{t.avgScore}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${t.avgScore}%`,
                      background: t.avgScore >= 80 ? 'linear-gradient(90deg, #1D4ED8, #2563EB)' : t.avgScore >= 50 ? 'linear-gradient(90deg, #f59e0b, #d97706)' : 'linear-gradient(90deg, #ef4444, #dc2626)'
                    }}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">Take quizzes to see your mastery levels.</p>
          )}
        </div>

        {/* Study Summary side card */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100 space-y-4">
          <h3 className="font-bold text-gray-900">Study Summary</h3>
          <div className="space-y-3">
            {[
              { label: "Total Study Time", value: `${totalHours}h` },
              { label: "This Week", value: `${weekHours}h` },
              { label: "Sessions", value: `${sessionCount}` },
              { label: "Avg Session", value: `${avgSessionMinutes}m` },
              { label: "Current Streak", value: `${currentStreak} days 🔥` },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between text-sm">
                <span className="text-gray-400">{item.label}</span>
                <span className="font-semibold text-gray-900">{item.value}</span>
              </div>
            ))}
          </div>
          <Link to="/timer" className="text-xs text-[#1D4ED8] hover:underline font-medium block mt-4">Start New Session →</Link>
        </div>
      </div>

      {/* ───── Weak Topics Alert ───── */}
      {(weakTopics?.length ?? 0) > 0 && (
        <div className="bg-amber-50/50 border border-amber-200/50 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="font-bold text-sm text-gray-900">Needs Attention</span>
            </div>
            {isParentMode && <span className="text-xs text-[#1D4ED8] font-semibold">Monitor & Guide</span>}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {weakTopics?.map((t: any) => (
              <div key={t.topic} className="bg-white border border-gray-100 rounded-xl px-4 py-3 text-sm text-gray-500">
                <span className="font-semibold text-gray-900">{t.topic}</span> — Average Score: {t.avgScore}%
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ───── Parent Guidance ───── */}
      <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-xl bg-[#1D4ED8]/10 flex items-center justify-center">
            <Users className="h-4 w-4 text-[#1D4ED8]" />
          </div>
          <h3 className="font-bold text-gray-900">Parental Guidance & Feedback</h3>
        </div>

        {isParentMode && (
          <div className="flex gap-2 mb-6">
            <Input
              placeholder="Add a note of encouragement or study advice for your child..."
              value={guidanceText}
              onChange={(e) => setGuidanceText(e.target.value)}
              className="flex-1 rounded-xl border-gray-200"
            />
            <Button onClick={handleAddGuidance} className="bg-[#1D4ED8] text-white hover:bg-[#2563EB] gap-2 rounded-xl">
              <Send className="h-4 w-4" /> Post Note
            </Button>
          </div>
        )}

        {guidanceNotes && guidanceNotes.length > 0 ? (
          <div className="space-y-3">
            {guidanceNotes.map((note: any) => (
              <div key={note.id} className="bg-gray-50 border border-gray-100 rounded-xl p-4 relative">
                <div className="text-sm text-gray-700 whitespace-pre-wrap">{note.text}</div>
                <div className="text-[10px] text-gray-400 mt-2">
                  {new Date(note.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
           <p className="text-sm text-gray-400 italic">
             No guidance notes added yet. {isParentMode ? "Use the input above to provide guidance." : "Parents can leave feedback and study tips here."}
           </p>
        )}
      </div>
    </div>
  );
};

export default ProgressDashboard;
