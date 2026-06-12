import { Clock, TrendingUp, TrendingDown, AlertTriangle, Lightbulb, Calendar, FileText, Flame, BarChart3, Target, Share2, Send, BookOpen, MessageCircleQuestion, Gamepad2, ChevronDown, ChevronUp, Copy, Check, ArrowUpRight, ArrowDownRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useRef } from "react";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { toDateKey } from "@/lib/utils";


const ProgressDashboard = () => {
  const { user } = useAuth();
  const { streak, avgScore, progressAnalytics, weakTopics, totalXp, isLoading } = useDashboardData();
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [dayDetails, setDayDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});

  // Subject-wise progress from quiz attempts, study sessions, and lesson progress
  const { data: subjectProgress = [] } = useQuery({
    queryKey: ["detailed-subject-progress", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      
      // 1. Fetch topics mapping
      const topicsSnap = await getDocs(collection(db, "topics"));
      const topicMap = new Map<string, { subject: string; title: string }>();
      topicsSnap.forEach(d => {
        const data = d.data();
        topicMap.set(d.id, {
          subject: data.subject || data.subjectName || "General",
          title: data.title || "General",
        });
      });

      // 2. Fetch quiz attempts
      const quizSnap = await getDocs(query(collection(db, "quiz_attempts"), where("user_id", "==", user.uid)));
      
      // 3. Fetch study sessions
      const sessionsSnap = await getDocs(query(collection(db, "study_sessions"), where("user_id", "==", user.uid)));
      
      // 4. Fetch lesson progress
      const progressSnap = await getDocs(query(collection(db, "lesson_progress"), where("user_id", "==", user.uid)));

      const subjectMap: Record<string, { 
        totalScore: number; 
        totalQuestions: number; 
        attempts: number; 
        scores: number[];
        timeSeconds: number;
        completedLessons: number;
      }> = {};

      // Initialize unique subjects from topics if any
      const uniqueSubjects = new Set<string>();
      topicMap.forEach(t => uniqueSubjects.add(t.subject));

      uniqueSubjects.forEach(s => {
        subjectMap[s] = {
          totalScore: 0,
          totalQuestions: 0,
          attempts: 0,
          scores: [],
          timeSeconds: 0,
          completedLessons: 0,
        };
      });

      // Support default "General" if not already there
      if (!subjectMap["General"]) {
        subjectMap["General"] = {
          totalScore: 0,
          totalQuestions: 0,
          attempts: 0,
          scores: [],
          timeSeconds: 0,
          completedLessons: 0,
        };
      }

      // Group quizzes
      quizSnap.forEach((d) => {
        const data = d.data();
        let subject = "General";
        if (data.topic_id && topicMap.has(data.topic_id)) {
          subject = topicMap.get(data.topic_id)!.subject;
        } else if (data.topic_title || data.topic) {
          subject = data.topic_title || data.topic;
        }

        if (!subjectMap[subject]) {
          subjectMap[subject] = { totalScore: 0, totalQuestions: 0, attempts: 0, scores: [], timeSeconds: 0, completedLessons: 0 };
        }
        subjectMap[subject].totalScore += data.score || 0;
        subjectMap[subject].totalQuestions += data.total_questions || 0;
        subjectMap[subject].attempts += 1;
        const pct = data.total_questions > 0 ? Math.round((data.score / data.total_questions) * 100) : 0;
        subjectMap[subject].scores.push(pct);
      });

      // Group study sessions time
      sessionsSnap.forEach((d) => {
        const data = d.data();
        const dur = data.duration_seconds || 0;
        const topicId = data.topic_id;
        const subject = topicId && topicMap.has(topicId) ? topicMap.get(topicId)!.subject : "General";

        if (!subjectMap[subject]) {
          subjectMap[subject] = { totalScore: 0, totalQuestions: 0, attempts: 0, scores: [], timeSeconds: 0, completedLessons: 0 };
        }
        subjectMap[subject].timeSeconds += dur;
      });

      // Group completed lessons
      progressSnap.forEach((d) => {
        const data = d.data();
        const completedCount = data.completed_lessons?.length || 0;
        const topicId = data.topic_id || d.id.split("_")[1];
        const subject = topicId && topicMap.has(topicId) ? topicMap.get(topicId)!.subject : "General";

        if (!subjectMap[subject]) {
          subjectMap[subject] = { totalScore: 0, totalQuestions: 0, attempts: 0, scores: [], timeSeconds: 0, completedLessons: 0 };
        }
        subjectMap[subject].completedLessons += completedCount;
      });

      return Object.entries(subjectMap).map(([subject, data]) => {
        const avgPct = data.totalQuestions > 0 ? Math.round((data.totalScore / data.totalQuestions) * 100) : 0;
        const mid = Math.floor(data.scores.length / 2);
        const firstHalf = data.scores.slice(0, Math.max(1, mid));
        const secondHalf = data.scores.slice(Math.max(1, mid));
        const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : 0;
        const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : 0;
        const trend = data.scores.length >= 2 ? secondAvg - firstAvg : 0;

        return { 
          subject, 
          avgPct, 
          attempts: data.attempts, 
          trend,
          studyMinutes: Math.round(data.timeSeconds / 60),
          completedLessons: data.completedLessons,
        };
      })
      .filter(s => s.attempts > 0 || s.studyMinutes > 0 || s.completedLessons > 0)
      .sort((a, b) => b.studyMinutes - a.studyMinutes);
    },
    enabled: !!user,
  });

  // Performance insights: strong and weak areas
  const strongTopics = subjectProgress.filter(s => s.avgPct >= 80);
  const strugglingTopics = subjectProgress.filter(s => s.avgPct < 50);
  const improvingTopics = subjectProgress.filter(s => s.trend > 10);

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

  const retentionPct = avgScore ?? 0;
  const completionPct = Math.min(100, Math.round((sessionCount / Math.max(sessionCount, 30)) * 100));
  // ACCURACY FIX: real XP from xp_logs/aggregate (same number the
  // Dashboard and Admin panel show) — was previously a made-up formula
  // that never matched the rest of the app.
  const totalXP = totalXp ?? 0;
  const weekBarData = (chartData ?? Array.from({ length: 7 }, (_, i) => ({ day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i], hours: 0 })));

  const handleShare = async () => {
    const summary = `📊 My EduOnx Progress\n\n🔥 Streak: ${currentStreak} days\n📚 Study Time: ${totalHours}h this month\n🎯 Avg Score: ${retentionPct}%\n⚡ Total XP: ${totalXP.toLocaleString()}\n📈 Week Growth: ${weekChange >= 0 ? "+" : ""}${weekChange}%\n\n${strongTopics.length > 0 ? `💪 Strong Areas: ${strongTopics.map(s => s.subject).join(", ")}\n` : ""}${strugglingTopics.length > 0 ? `📝 Working on: ${strugglingTopics.map(s => s.subject).join(", ")}\n` : ""}\n#EduOnx #Learning`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "My EduOnx Progress", text: summary });
        toast.success("Shared successfully!");
        return;
      } catch { /* fallback to copy */ }
    }

    await navigator.clipboard.writeText(summary);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
    toast.success("Progress summary copied to clipboard!");
  };

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
            className="gap-2 rounded-xl border-gray-200 text-gray-500 hover:border-[#1D4ED8] hover:text-[#1D4ED8]"
            onClick={handleShare}
          >
            {copiedShare ? <Check className="h-4 w-4 text-green-500" /> : <Share2 className="h-4 w-4" />}
            {copiedShare ? "Copied!" : "Share Progress"}
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
                <div key={d.day} className="flex-1 flex flex-col justify-end items-center h-full group">
                  <span className="text-[10px] font-semibold text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity mb-1.5">
                    {d.hours > 0 ? `${d.hours}h` : "–"}
                  </span>
                  <div className="w-full h-32 flex items-end">
                    <div
                      className="w-full rounded-xl transition-all duration-500 group-hover:scale-105"
                      style={{
                        height: `${pct}%`,
                        background: d.hours > 0
                          ? `linear-gradient(180deg, #1D4ED8 0%, #2563EB 100%)`
                          : '#E5E7EB',
                        opacity: d.hours > 0 ? 0.85 + (idx * 0.02) : 1,
                      }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-400 font-medium mt-2">{d.day}</span>
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

      {/* ───── Performance Insights Section ───── */}
      <div className="space-y-4">
        <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-[#1D4ED8]" /> Performance Insights
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Strong Areas Card */}
          <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-2 text-emerald-700 font-semibold mb-3">
              <TrendingUp className="h-4.5 w-4.5 text-emerald-500" />
              <span>Strong Areas (Score &ge; 80%)</span>
            </div>
            {strongTopics.length > 0 ? (
              <div className="space-y-2">
                {strongTopics.map((s: any) => (
                  <div key={s.subject} className="flex justify-between items-center bg-white px-3 py-2 rounded-xl border border-emerald-100/50 shadow-sm">
                    <span className="text-sm font-medium text-gray-700">{s.subject}</span>
                    <span className="text-sm font-bold text-emerald-600">{s.avgPct}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">No strong subjects found yet. Keep studying!</p>
            )}
          </div>

          {/* Struggling Areas Card */}
          <div className="bg-rose-50/60 border border-rose-100 rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-2 text-rose-700 font-semibold mb-3">
              <AlertTriangle className="h-4.5 w-4.5 text-rose-500" />
              <span>Needs Attention (&lt; 50%)</span>
            </div>
            {strugglingTopics.length > 0 ? (
              <div className="space-y-2">
                {strugglingTopics.map((s: any) => (
                  <div key={s.subject} className="flex justify-between items-center bg-white px-3 py-2 rounded-xl border border-rose-100/50 shadow-sm">
                    <span className="text-sm font-medium text-gray-700">{s.subject}</span>
                    <span className="text-sm font-bold text-rose-600">{s.avgPct}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">Excellent! No struggling subjects found.</p>
            )}
          </div>

          {/* Improving Trajectory Card */}
          <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-2 text-blue-700 font-semibold mb-3">
              <TrendingUp className="h-4.5 w-4.5 text-blue-500" />
              <span>On the Rise (Trend &gt; 10%)</span>
            </div>
            {improvingTopics.length > 0 ? (
              <div className="space-y-2">
                {improvingTopics.map((s: any) => (
                  <div key={s.subject} className="flex justify-between items-center bg-white px-3 py-2 rounded-xl border border-blue-100/50 shadow-sm">
                    <span className="text-sm font-medium text-gray-700">{s.subject}</span>
                    <span className="text-xs font-semibold text-blue-600 flex items-center gap-0.5">
                      <ArrowUpRight className="h-3 w-3" /> +{Math.round(s.trend)}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">No significant improvement trends found recently.</p>
            )}
          </div>
        </div>

        {/* AI Recommendations */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <Sparkles className="h-4 w-4 text-[#1D4ED8]" />
            <span>AI Study Advisor Recommendations</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {strugglingTopics.length > 0 ? (
              strugglingTopics.map((s: any) => (
                <div key={s.subject} className="bg-rose-50/30 border border-rose-100/40 rounded-xl px-4 py-3 text-xs text-gray-600 leading-relaxed">
                  <span className="font-bold text-gray-800 block mb-1">Focus Plan: {s.subject}</span>
                  Review the concept summary in the materials section or ask the AI Tutor specifically about {s.subject} to build foundational understanding before retaking quizzes.
                </div>
              ))
            ) : (
              <div className="col-span-2 bg-emerald-50/20 border border-emerald-100/30 rounded-xl px-4 py-3 text-xs text-gray-600">
                🎉 Great job! You have no subjects in the danger zone. Continue reviewing your active subjects periodically to keep your knowledge fresh.
              </div>
            )}
            {improvingTopics.map((s: any) => (
              <div key={s.subject} className="bg-blue-50/30 border border-blue-100/40 rounded-xl px-4 py-3 text-xs text-gray-600 leading-relaxed">
                <span className="font-bold text-gray-800 block mb-1">Keep Momentum: {s.subject}</span>
                Your scores in {s.subject} are trending upwards (+{Math.round(s.trend)}%). Consolidate your gains by attempting a harder quiz or creating flashcards for final retention.
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ───── Subject Progress (Expandable Cards with Mini-Charts) ───── */}
      <div className="space-y-4">
        <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-[#1D4ED8]" /> Subject-wise Progress
        </h3>
        
        {subjectProgress.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-5">
            {subjectProgress.map((s: any) => {
              const isExpanded = !!expandedSubjects[s.subject];
              const studyHours = (s.studyMinutes / 60).toFixed(1);
              return (
                <div key={s.subject} className="bg-white border border-gray-150 rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-md transition-shadow">
                  {/* Header Row */}
                  <button
                    onClick={() => setExpandedSubjects(prev => ({ ...prev, [s.subject]: !isExpanded }))}
                    className="flex items-center justify-between w-full px-5 py-4 text-left hover:bg-gray-50/50 transition-colors"
                  >
                    <div>
                      <h4 className="font-bold text-gray-900 text-base">{s.subject}</h4>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {studyHours}h studied &bull; {s.completedLessons} lessons &bull; {s.attempts} quizzes
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-extrabold ${s.avgPct >= 80 ? "text-emerald-600" : s.avgPct >= 50 ? "text-amber-500" : "text-rose-500"}`}>
                        {s.avgPct}% Mastery
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {/* Main Progress Bar (Mastery) */}
                  <div className="px-5 pb-4">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${s.avgPct}%`,
                          background: s.avgPct >= 80 ? 'linear-gradient(90deg, #10b981, #34d399)' : s.avgPct >= 50 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #ef4444, #f87171)'
                        }}
                      />
                    </div>
                  </div>

                  {/* Expandable Mini Bar Chart Details */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-3 border-t border-gray-50 bg-gray-50/40 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                          <span className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Study Time</span>
                          <span className="text-sm font-extrabold text-gray-800">{s.studyMinutes} min</span>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                          <span className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Quiz Score</span>
                          <span className="text-sm font-extrabold text-gray-800">{s.avgPct}%</span>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                          <span className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Lessons</span>
                          <span className="text-sm font-extrabold text-gray-800">{s.completedLessons}</span>
                        </div>
                      </div>

                      {/* CSS Mini Bar Chart representing metric relative levels */}
                      <div className="space-y-2.5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Metric Distribution</span>
                        
                        {/* Study Time Bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold text-gray-600">
                            <span>Study Volume</span>
                            <span>{s.studyMinutes} mins</span>
                          </div>
                          <div className="h-3 bg-gray-100 rounded-lg overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-lg animate-all duration-300"
                              style={{ width: `${Math.min(100, (s.studyMinutes / 300) * 100)}%` }}
                            />
                          </div>
                        </div>

                        {/* Quiz Score Bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold text-gray-600">
                            <span>Quiz Performance</span>
                            <span>{s.avgPct}%</span>
                          </div>
                          <div className="h-3 bg-gray-100 rounded-lg overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-lg animate-all duration-300"
                              style={{ width: `${s.avgPct}%` }}
                            />
                          </div>
                        </div>

                        {/* Lesson Volume Bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold text-gray-600">
                            <span>Lessons Completed</span>
                            <span>{s.completedLessons} / 15</span>
                          </div>
                          <div className="h-3 bg-gray-100 rounded-lg overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-lg animate-all duration-300"
                              style={{ width: `${Math.min(100, (s.completedLessons / 15) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">No subject data available. Study or take quizzes to show progress.</p>
        )}
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
                          if (toDateKey(updatedDate) === entry.date) {
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
                        if (toDateKey(createdAt) === entry.date) {
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
                        if (createdAt && toDateKey(createdAt) === entry.date) {
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


    </div>
  );
};

export default ProgressDashboard;
