import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard, GraduationCap, Activity, Brain, Loader2,
  Users, Clock, TrendingUp, TrendingDown, Target, BookOpen,
  Bell, Trophy, AlertTriangle, Flame, Zap, Award,
} from "lucide-react";

/**
 * ADMIN INSIGHTS — operations-oriented analytics
 * ==============================================
 * Self-contained analytics surface that turns raw activity into decisions.
 * Loads the tables it needs once and computes everything client-side, so it
 * doesn't touch the existing AdminPanel data flow.
 *
 * Sections: Overview · Learning · Engagement · Learning Intelligence Center.
 * Every metric here is derived from data the app already collects.
 */

type Section = "overview" | "learning" | "engagement" | "intelligence";

const DAY = 24 * 60 * 60 * 1000;
const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ms = (t: unknown) => (t ? new Date(t as string).getTime() : 0);
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

const AdminInsights = () => {
  const [section, setSection] = useState<Section>("overview");
  const [loading, setLoading] = useState(true);
  const [raw, setRaw] = useState<Record<string, any[]>>({});

  useEffect(() => {
    let active = true;
    const tables = [
      "profiles", "xp_logs", "study_sessions", "quiz_attempts", "lesson_progress",
      "topic_progress", "materials", "notifications", "topics", "doubt_sessions",
      "flashcards", "user_streaks",
    ];
    (async () => {
      const out: Record<string, any[]> = {};
      await Promise.all(
        tables.map(async (t) => {
          const { data } = await supabase.from(t).select("*");
          out[t] = data ?? [];
        })
      );
      if (active) { setRaw(out); setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const m = useMemo(() => computeMetrics(raw), [raw]);

  if (loading) {
    return (
      <div className="min-h-[300px] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#29ABE2]" />
      </div>
    );
  }

  const sections: { id: Section; label: string; icon: any }[] = [
    { id: "overview", label: "Dashboard", icon: LayoutDashboard },
    { id: "learning", label: "Learning", icon: GraduationCap },
    { id: "engagement", label: "Engagement", icon: Activity },
    { id: "intelligence", label: "Intelligence Center", icon: Brain },
  ];

  return (
    <div className="space-y-6">
      {/* Section nav */}
      <div className="flex flex-wrap gap-2">
        {sections.map((s) => {
          const Icon = s.icon;
          const on = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                on ? "bg-[#29ABE2] text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <Icon className="h-4 w-4" /> {s.label}
            </button>
          );
        })}
      </div>

      {section === "overview" && <Overview m={m} />}
      {section === "learning" && <Learning m={m} />}
      {section === "engagement" && <Engagement m={m} />}
      {section === "intelligence" && <Intelligence m={m} />}
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
 * METRIC COMPUTATION
 * ────────────────────────────────────────────────────────────────────────── */
function computeMetrics(raw: Record<string, any[]>) {
  const profiles = raw.profiles ?? [];
  const xpLogs = raw.xp_logs ?? [];
  const sessions = raw.study_sessions ?? [];
  const quizzes = raw.quiz_attempts ?? [];
  const lessonProg = raw.lesson_progress ?? [];
  const topicProg = raw.topic_progress ?? [];
  const materials = raw.materials ?? [];
  const notifications = raw.notifications ?? [];
  const topics = raw.topics ?? [];
  const doubts = raw.doubt_sessions ?? [];
  const flashcards = raw.flashcards ?? [];

  const now = Date.now();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  // Activity dates per user (from xp + sessions)
  const lastActiveByUser = new Map<string, number>();
  const recordActivity = (uid: string, t: number) => {
    if (!uid || !t) return;
    lastActiveByUser.set(uid, Math.max(lastActiveByUser.get(uid) ?? 0, t));
  };
  const activeUsersIn = (sinceMs: number) => {
    const set = new Set<string>();
    for (const r of xpLogs) if (ms(r.created_at) >= sinceMs && r.user_id) set.add(r.user_id);
    for (const r of sessions) if (ms(r.created_at) >= sinceMs && r.user_id) set.add(r.user_id);
    return set.size;
  };
  for (const r of xpLogs) recordActivity(r.user_id, ms(r.created_at));
  for (const r of sessions) recordActivity(r.user_id, ms(r.created_at));

  // Overview
  const totalUsers = profiles.length;
  const newUsers7d = profiles.filter((p) => ms(p.created_at) >= now - 7 * DAY).length;
  const dau = activeUsersIn(todayMs);
  const wau = activeUsersIn(now - 7 * DAY);
  const mau = activeUsersIn(now - 30 * DAY);
  const totalSeconds = sessions.reduce((s, r) => s + (r.duration_seconds || 0), 0);
  const totalLearningHours = +(totalSeconds / 3600).toFixed(1);
  const avgSessionMin = sessions.length ? Math.round(totalSeconds / 60 / sessions.length) : 0;
  const totalQ = quizzes.reduce((s, r) => s + (r.total_questions || 0), 0);
  const totalCorrect = quizzes.reduce((s, r) => s + (r.score || 0), 0);
  const practiceAccuracy = pct(totalCorrect, totalQ);

  // Course completion (lesson_progress vs topic.lesson_count)
  const topicById = new Map(topics.map((t) => [t.id, t]));
  let started = 0, completed = 0, progressSum = 0;
  for (const lp of lessonProg) {
    const topic = topicById.get(lp.topic_id);
    const total = topic?.lesson_count ?? 0;
    const done = lp.completed_lessons?.length ?? 0;
    if (total > 0) {
      started++;
      const p = Math.min(100, Math.round((done / total) * 100));
      progressSum += p;
      if (p >= 100) completed++;
    }
  }
  const completionRate = pct(completed, started);
  const avgCourseProgress = started ? Math.round(progressSum / started) : 0;

  // Subjects: group quizzes by topic_title → accuracy
  const subjAgg = new Map<string, { correct: number; total: number; attempts: number }>();
  for (const q of quizzes) {
    const key = q.topic_title || "General";
    const a = subjAgg.get(key) ?? { correct: 0, total: 0, attempts: 0 };
    a.correct += q.score || 0; a.total += q.total_questions || 0; a.attempts += 1;
    subjAgg.set(key, a);
  }
  const subjects = [...subjAgg.entries()]
    .map(([name, a]) => ({ name, accuracy: pct(a.correct, a.total), attempts: a.attempts }))
    .filter((s) => s.attempts >= 1);
  const strongest = [...subjects].sort((a, b) => b.accuracy - a.accuracy).slice(0, 5);
  const weakest = [...subjects].sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);
  const avgMastery = topicProg.length
    ? Math.round(topicProg.reduce((s, r) => s + (r.mastery_score || 0), 0) / topicProg.length)
    : 0;

  // Engagement
  const readNotifs = notifications.filter((n) => n.read).length;
  const notifOpenRate = pct(readNotifs, notifications.length);
  const participants = new Set(xpLogs.filter((x) => (x.xp_amount || 0) > 0).map((x) => x.user_id)).size;
  const leaderboardParticipation = pct(participants, totalUsers);

  // Materials by type
  const matByType = { pdf: 0, video: 0, note: 0, other: 0 };
  for (const mt of materials) {
    const ct = (mt.content_type || "").toLowerCase();
    if (ct.includes("pdf")) matByType.pdf++;
    else if (ct.includes("video")) matByType.video++;
    else if (ct.includes("text") || ct.includes("md") || ct.includes("plain")) matByType.note++;
    else matByType.other++;
  }

  // Best study time (hour histogram) + day×hour heatmap
  const hourHist = Array(24).fill(0);
  const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const s of sessions) {
    const d = s.started_at ? new Date(s.started_at) : (s.created_at ? new Date(s.created_at) : null);
    if (!d || isNaN(d.getTime())) continue;
    hourHist[d.getHours()]++;
    heat[d.getDay()][d.getHours()]++;
  }
  const bestHour = hourHist.indexOf(Math.max(...hourHist, 0));
  const heatMax = Math.max(1, ...heat.flat());

  // Dropout risk: users with prior activity but inactive 7–30d (or >30d = churned)
  let atRisk = 0, churned = 0, healthy = 0;
  const riskList: { uid: string; name: string; daysInactive: number }[] = [];
  const nameByUid = new Map(profiles.map((p) => [p.id, p.full_name || p.email || "Student"]));
  for (const [uid, last] of lastActiveByUser) {
    const days = Math.floor((now - last) / DAY);
    if (days >= 30) { churned++; }
    else if (days >= 7) { atRisk++; riskList.push({ uid, name: nameByUid.get(uid) || "Student", daysInactive: days }); }
    else healthy++;
  }
  riskList.sort((a, b) => b.daysInactive - a.daysInactive);

  // Doubts
  const doubtsSolved = doubts.filter((d) => d.status === "solved").length;
  const doubtsPending = doubts.length - doubtsSolved;

  return {
    totalUsers, newUsers7d, dau, wau, mau, totalLearningHours, avgSessionMin,
    practiceAccuracy, completionRate, avgCourseProgress, avgMastery,
    strongest, weakest, notifOpenRate, leaderboardParticipation, matByType,
    hourHist, heat, heatMax, bestHour, atRisk, churned, healthy, riskList,
    totalMaterials: materials.length, totalQuizzes: quizzes.length,
    totalFlashcards: flashcards.length, totalDoubts: doubts.length,
    doubtsSolved, doubtsPending, totalTopics: topics.length,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * SHARED UI
 * ────────────────────────────────────────────────────────────────────────── */
type M = ReturnType<typeof computeMetrics>;

const Stat = ({ label, value, icon: Icon, sub, tone = "blue" }: { label: string; value: string | number; icon: any; sub?: string; tone?: string }) => {
  const tones: Record<string, string> = {
    blue: "text-[#29ABE2] bg-[#29ABE2]/10", green: "text-emerald-500 bg-emerald-500/10",
    amber: "text-amber-500 bg-amber-500/10", red: "text-red-500 bg-red-500/10",
    violet: "text-violet-500 bg-violet-500/10",
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${tones[tone]}`}><Icon className="h-4 w-4" /></div>
      </div>
      <div className="text-2xl font-extrabold text-gray-900 mt-2 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
};

const Panel = ({ title, children, icon: Icon }: { title: string; children: any; icon?: any }) => (
  <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
    <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 text-[#29ABE2]" />} {title}
    </h3>
    {children}
  </div>
);

const BarRow = ({ label, value, max, suffix = "%", tone = "#29ABE2" }: { label: string; value: number; max: number; suffix?: string; tone?: string }) => (
  <div className="flex items-center gap-3">
    <span className="text-xs text-gray-600 w-36 truncate">{label}</span>
    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, background: tone }} />
    </div>
    <span className="text-xs font-bold text-gray-900 w-12 text-right tabular-nums">{value}{suffix}</span>
  </div>
);

const Empty = ({ text }: { text: string }) => (
  <p className="text-xs text-gray-400 py-6 text-center">{text}</p>
);

/* ── Overview ─────────────────────────────────────────────────────────────── */
const Overview = ({ m }: { m: M }) => (
  <div className="space-y-5">
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      <Stat label="Total Users" value={m.totalUsers.toLocaleString()} icon={Users} sub={`+${m.newUsers7d} this week`} />
      <Stat label="Active Today (DAU)" value={m.dau} icon={Zap} tone="green" sub={`${m.wau} weekly · ${m.mau} monthly`} />
      <Stat label="Learning Hours" value={`${m.totalLearningHours}h`} icon={Clock} tone="amber" sub={`${m.avgSessionMin}m avg session`} />
      <Stat label="Practice Accuracy" value={`${m.practiceAccuracy}%`} icon={Target} tone="violet" sub={`${m.totalQuizzes} quiz attempts`} />
      <Stat label="Course Completion" value={`${m.completionRate}%`} icon={GraduationCap} tone="green" sub={`${m.avgCourseProgress}% avg progress`} />
      <Stat label="Concept Mastery" value={`${m.avgMastery}%`} icon={Award} sub="avg across topics" />
      <Stat label="Materials" value={m.totalMaterials} icon={BookOpen} tone="amber" sub={`${m.totalFlashcards} flashcards`} />
      <Stat label="Doubts" value={m.totalDoubts} icon={AlertTriangle} tone="red" sub={`${m.doubtsPending} pending`} />
    </div>
    <div className="grid md:grid-cols-2 gap-4">
      <Panel title="Active Users" icon={Activity}>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[["Daily", m.dau], ["Weekly", m.wau], ["Monthly", m.mau]].map(([l, v]) => (
            <div key={l as string} className="bg-gray-50 rounded-xl py-4">
              <div className="text-2xl font-extrabold text-[#29ABE2]">{v as number}</div>
              <div className="text-[11px] text-gray-500 mt-1">{l as string}</div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Materials by Type" icon={BookOpen}>
        <div className="space-y-2">
          <BarRow label="PDFs" value={m.matByType.pdf} max={m.totalMaterials} suffix="" tone="#29ABE2" />
          <BarRow label="Videos" value={m.matByType.video} max={m.totalMaterials} suffix="" tone="#8b5cf6" />
          <BarRow label="Notes / Text" value={m.matByType.note} max={m.totalMaterials} suffix="" tone="#f59e0b" />
          <BarRow label="Other" value={m.matByType.other} max={m.totalMaterials} suffix="" tone="#94a3b8" />
        </div>
      </Panel>
    </div>
  </div>
);

/* ── Learning ─────────────────────────────────────────────────────────────── */
const Learning = ({ m }: { m: M }) => (
  <div className="space-y-5">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat label="Total Learning Hours" value={`${m.totalLearningHours}h`} icon={Clock} tone="amber" />
      <Stat label="Avg Session" value={`${m.avgSessionMin}m`} icon={Activity} />
      <Stat label="Concept Mastery" value={`${m.avgMastery}%`} icon={Award} tone="green" />
      <Stat label="Course Completion" value={`${m.completionRate}%`} icon={GraduationCap} tone="violet" />
    </div>
    <div className="grid md:grid-cols-2 gap-4">
      <Panel title="Strongest Subjects" icon={TrendingUp}>
        {m.strongest.length ? (
          <div className="space-y-2.5">
            {m.strongest.map((s) => <BarRow key={s.name} label={s.name} value={s.accuracy} max={100} tone="#10b981" />)}
          </div>
        ) : <Empty text="No quiz data yet." />}
      </Panel>
      <Panel title="Weakest Subjects (need attention)" icon={TrendingDown}>
        {m.weakest.length ? (
          <div className="space-y-2.5">
            {m.weakest.map((s) => <BarRow key={s.name} label={s.name} value={s.accuracy} max={100} tone="#ef4444" />)}
          </div>
        ) : <Empty text="No quiz data yet." />}
      </Panel>
    </div>
  </div>
);

/* ── Engagement ───────────────────────────────────────────────────────────── */
const Engagement = ({ m }: { m: M }) => (
  <div className="space-y-5">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat label="DAU" value={m.dau} icon={Zap} tone="green" />
      <Stat label="WAU" value={m.wau} icon={Activity} tone="blue" />
      <Stat label="MAU" value={m.mau} icon={Users} tone="violet" />
      <Stat label="Avg Session" value={`${m.avgSessionMin}m`} icon={Clock} tone="amber" />
    </div>
    <div className="grid md:grid-cols-2 gap-4">
      <Panel title="Notification Open Rate" icon={Bell}>
        <div className="flex items-center gap-4">
          <div className="relative h-24 w-24 shrink-0">
            <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#29ABE2" strokeWidth="3"
                strokeDasharray={`${m.notifOpenRate} 100`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-lg font-extrabold text-gray-900">{m.notifOpenRate}%</div>
          </div>
          <p className="text-xs text-gray-500">Share of notifications students actually open. Higher = your nudges are landing.</p>
        </div>
      </Panel>
      <Panel title="Leaderboard Participation" icon={Trophy}>
        <div className="flex items-center gap-4">
          <div className="text-4xl font-extrabold text-[#29ABE2]">{m.leaderboardParticipation}%</div>
          <p className="text-xs text-gray-500">Of all users who have earned XP and appear on the leaderboard.</p>
        </div>
      </Panel>
    </div>
  </div>
);

/* ── Learning Intelligence Center ─────────────────────────────────────────── */
const Intelligence = ({ m }: { m: M }) => {
  const heatColor = (v: number) => {
    if (v === 0) return "#f3f4f6";
    const a = 0.15 + 0.85 * (v / m.heatMax);
    return `rgba(41,171,226,${a.toFixed(2)})`;
  };
  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-[#29ABE2] to-[#1E96CC] rounded-2xl p-5 text-white">
        <div className="flex items-center gap-2 text-sm font-bold"><Brain className="h-5 w-5" /> Learning Intelligence Center</div>
        <p className="text-xs text-white/80 mt-1">AI-derived patterns across all learners — your control room.</p>
      </div>

      {/* Risk distribution */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Healthy (active <7d)" value={m.healthy} icon={Flame} tone="green" />
        <Stat label="At Risk (7–30d idle)" value={m.atRisk} icon={AlertTriangle} tone="amber" />
        <Stat label="Churned (>30d idle)" value={m.churned} icon={TrendingDown} tone="red" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="Top Weak Concepts (platform-wide)" icon={TrendingDown}>
          {m.weakest.length ? (
            <div className="space-y-2.5">{m.weakest.map((s) => <BarRow key={s.name} label={s.name} value={s.accuracy} max={100} tone="#ef4444" />)}</div>
          ) : <Empty text="No quiz data yet." />}
        </Panel>
        <Panel title="Top Mastered Concepts" icon={TrendingUp}>
          {m.strongest.length ? (
            <div className="space-y-2.5">{m.strongest.map((s) => <BarRow key={s.name} label={s.name} value={s.accuracy} max={100} tone="#10b981" />)}</div>
          ) : <Empty text="No quiz data yet." />}
        </Panel>
      </div>

      {/* Behavior heatmap */}
      <Panel title={`Learning Behavior Heatmap — peak study hour: ${m.bestHour}:00`} icon={Activity}>
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            <div className="flex gap-1 mb-1 pl-10">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="w-4 text-[8px] text-gray-400 text-center">{h % 6 === 0 ? h : ""}</div>
              ))}
            </div>
            {m.heat.map((row, d) => (
              <div key={d} className="flex gap-1 items-center mb-1">
                <span className="w-9 text-[10px] text-gray-500 text-right pr-1">{dayNames[d]}</span>
                {row.map((v, h) => (
                  <div key={h} className="w-4 h-4 rounded-sm" style={{ background: heatColor(v) }} title={`${dayNames[d]} ${h}:00 — ${v} sessions`} />
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Darker = more study sessions. Reveals when your learners are most active.</p>
      </Panel>

      {/* At-risk list */}
      <Panel title="Students at Risk of Dropping Out" icon={AlertTriangle}>
        {m.riskList.length ? (
          <div className="divide-y divide-gray-100">
            {m.riskList.slice(0, 8).map((r) => (
              <div key={r.uid} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-gray-800">{r.name}</span>
                <span className="text-xs font-semibold text-amber-600">{r.daysInactive}d inactive</span>
              </div>
            ))}
          </div>
        ) : <Empty text="No at-risk students — everyone's active. 🎉" />}
        <p className="text-[11px] text-gray-400 mt-2">Re-engage these learners before they churn (e.g. a tailored nudge).</p>
      </Panel>
    </div>
  );
};

export default AdminInsights;
