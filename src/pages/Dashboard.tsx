import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  BookOpen, Upload,
  Flame, Lightbulb, AlertTriangle, User, ArrowRight,
  X, CheckCircle, Loader2
} from "lucide-react";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
// FIX Bug 1 + 4 + 13: Removed the `badgeStats` useQuery that was re-fetching
// quiz_attempts, study_sessions, doubt_sessions, and user_streaks — all of which
// useDashboardData already fetches. Badge data is now derived from what the hook
// already returns: avgScore, totalXp, streak. This halves DB reads on every
// dashboard load.
import NotificationPanel from "@/components/NotificationPanel";
import FeedbackEnforcer from "@/components/FeedbackEnforcer";
import RetentionTrajectory from "@/components/RetentionTrajectory";
import ExamCountdown from "@/components/ExamCountdown";
import { StaggerContainer, StaggerItem } from "@/components/motion/FadeIn";

const Dashboard = () => {
  const { user } = useAuth();
  // Complaint details and tracking state
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [myComplaints, setMyComplaints] = useState<any[]>([]);
  const [complaintsLoading, setComplaintsLoading] = useState(true);
  const [selectedComplaint, setSelectedComplaint] = useState<any>(null);
  const [selectedComplaintHistory, setSelectedComplaintHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Fetch complaints
  useEffect(() => {
    if (!user) {
      setMyComplaints([]);
      setComplaintsLoading(false);
      return;
    }

    let active = true;
    const load = async () => {
      const { data, error } = await supabase
        .from("complaints")
        .select("*")
        .eq("user_id", user.uid)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error loading user complaints:", error);
        setComplaintsLoading(false);
        return;
      }
      if (active) {
        setMyComplaints(data ?? []);
        setComplaintsLoading(false);
      }
    };
    load();

    const channel = supabase
      .channel(`complaints:${user.uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "complaints", filter: `user_id=eq.${user.uid}` }, () => load())
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [user]);

  // Fetch history for selected complaint
  useEffect(() => {
    if (!selectedComplaint?.id || !isDetailModalOpen) {
      setSelectedComplaintHistory([]);
      return;
    }

    setHistoryLoading(true);
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("complaint_history")
        .select("*")
        .eq("complaint_id", selectedComplaint.id)
        .order("created_at", { ascending: true });
      if (active) {
        setSelectedComplaintHistory(data ?? []);
        setHistoryLoading(false);
      }
    };
    load();

    const channel = supabase
      .channel(`complaint_history:${selectedComplaint.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "complaint_history", filter: `complaint_id=eq.${selectedComplaint.id}` }, () => load())
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [selectedComplaint, isDetailModalOpen]);

  const activeDetailComplaint = myComplaints.find(c => c.id === selectedComplaint?.id) || selectedComplaint;

  const {
    profile, streak, totalXp, avgScore,
    continueLearning, weakTopics, isLoading,
    // FIX: consume the additional data useDashboardData already fetches
    progressAnalytics, retentionTrend,
  } = useDashboardData();

  const displayName = profile?.full_name?.split(" ")[0] ?? "there";
  const nextMilestone = Math.ceil(totalXp / 500) * 500 || 500;
  const currentStreak = streak?.current_streak ?? 0;
  const longestStreak = streak?.longest_streak ?? currentStreak;
  const studyHours = (progressAnalytics?.weekSeconds ?? 0) / 3600;

  // FIX Bug 1 + 4 + 13: Badges derived entirely from useDashboardData — no extra queries.
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
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="text-muted-foreground text-sm">
                    Welcome back, <span className="font-medium text-foreground">{displayName}</span>
                  </p>
                  <ExamCountdown />
                </div>
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

        <div className="lg:col-span-8">
          {isLoading ? (
            <div className="glass-card rounded-2xl p-6 h-full">
              <Skeleton className="h-5 w-48 mb-5" />
              <Skeleton className="h-[240px] w-full rounded-xl" />
            </div>
          ) : (
            <RetentionTrajectory data={retentionTrend} />
          )}
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
      <div className="glass-card rounded-2xl p-6 hover-glow">
        <h3 className="text-base font-bold text-foreground flex items-center gap-2 mb-5">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          My Reported Issues
        </h3>
        {complaintsLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 rounded-xl p-4 bg-white/5 border border-white/5">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48 animate-pulse" />
                  <Skeleton className="h-3 w-32 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : myComplaints.length > 0 ? (
          <div className="space-y-3">
            {myComplaints.map((c) => {
              const statusColors: Record<string, string> = {
                "Pending": "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20",
                "Under Review": "bg-blue-500/10 text-blue-400 border border-blue-500/20",
                "In Progress": "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
                "Testing": "bg-purple-500/10 text-purple-400 border border-purple-500/20",
                "Resolved": "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
                "Rejected": "bg-rose-500/10 text-rose-400 border border-rose-500/20",
              };
              const priorityColors: Record<string, string> = {
                "Low": "bg-slate-500/10 text-slate-400 border border-slate-500/20",
                "Medium": "bg-blue-500/10 text-blue-400 border border-blue-500/20",
                "High": "bg-amber-500/10 text-amber-500 border border-amber-500/20",
                "Critical": "bg-red-500/10 text-red-500 border border-red-500/20 animate-pulse",
              };
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedComplaint(c);
                    setIsDetailModalOpen(true);
                  }}
                  className="w-full flex items-center gap-4 rounded-xl hover:bg-white/5 p-4 transition-all duration-200 group border border-white/5 hover-lift text-left"
                >
                  <div className="h-11 w-11 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0 text-foreground text-sm font-bold shadow-sm border border-white/10 group-hover:border-primary/30">
                    <span className="text-xs text-muted-foreground">{c.id.split("-")[1] || c.id}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{c.title}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-muted-foreground">{c.category}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                      {c.description}
                    </div>
                    <div className="text-[10px] text-muted-foreground/60 mt-1">
                      Reported on {new Date(c.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${priorityColors[c.priority] || ""}`}>
                      {c.priority}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusColors[c.status] || ""}`}>
                      {c.status}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🛠️</div>
            <div className="text-sm text-muted-foreground">No issues reported yet. Thank you for helping us improve!</div>
          </div>
        )}
      </div>
      </StaggerItem>
 
       <FeedbackEnforcer />
 
       {/* Detail Modal */}
       {isDetailModalOpen && activeDetailComplaint && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsDetailModalOpen(false)} />
           <div className="relative w-full max-w-2xl bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto scrollbar-thin animate-in fade-in zoom-in-95 duration-200 text-left">
             <button
               onClick={() => setIsDetailModalOpen(false)}
               className="absolute top-4 right-4 text-white/40 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-all"
             >
               <X className="h-5 w-5" />
             </button>
 
             <div className="flex items-start gap-3 mb-4">
               <div className="h-10 w-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                 <AlertTriangle className="h-5 w-5 text-red-500" />
               </div>
               <div>
                 <span className="text-xs text-muted-foreground font-mono">Reference: {activeDetailComplaint.id}</span>
                 <h2 className="text-xl font-bold text-white mt-0.5">{activeDetailComplaint.title}</h2>
               </div>
             </div>
 
             <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
               <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                 <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide">Category</div>
                 <div className="text-sm font-semibold text-white mt-1">{activeDetailComplaint.category}</div>
               </div>
               <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                 <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide">Priority</div>
                 <div className="text-sm font-semibold text-white mt-1">{activeDetailComplaint.priority}</div>
               </div>
               <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                 <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide">Status</div>
                 <div className="text-sm font-semibold text-white mt-1">{activeDetailComplaint.status}</div>
               </div>
               <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                 <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide">Reported Date</div>
                 <div className="text-sm font-semibold text-white mt-1">
                   {new Date(activeDetailComplaint.created_at).toLocaleDateString()}
                 </div>
               </div>
             </div>
 
             <div className="space-y-4 mb-6">
               <div>
                 <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</h4>
                 <p className="text-sm text-white/80 mt-1 bg-white/5 p-4 rounded-xl border border-white/5 whitespace-pre-wrap">
                   {activeDetailComplaint.description}
                 </p>
               </div>
 
               {activeDetailComplaint.screenshot && (
                 <div>
                   <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Attached Screenshot</h4>
                   <a href={activeDetailComplaint.screenshot} target="_blank" rel="noreferrer" className="block relative group overflow-hidden rounded-xl border border-white/10 max-h-60 bg-black/45">
                     <img src={activeDetailComplaint.screenshot} alt="Screenshot" className="w-full object-contain max-h-60 transition-transform duration-300 group-hover:scale-[1.02]" />
                     <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs font-semibold text-white">
                       Click to open in new tab
                     </div>
                   </a>
                 </div>
               )}
 
               {activeDetailComplaint.status === "Resolved" && (
                 <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 space-y-2">
                   <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                     <CheckCircle className="h-5 w-5" />
                     Resolution Summary
                   </div>
                   {activeDetailComplaint.resolved_at && (
                     <div className="text-[10px] text-emerald-400/80">
                       Resolved on {new Date(activeDetailComplaint.resolved_at).toLocaleString()}
                     </div>
                   )}
                   {activeDetailComplaint.fix_summary && (
                     <div>
                       <div className="text-xs font-semibold text-emerald-400">Fix Summary:</div>
                       <p className="text-sm text-white/90 mt-1 whitespace-pre-wrap">{activeDetailComplaint.fix_summary}</p>
                     </div>
                   )}
                   {activeDetailComplaint.resolution_notes && (
                     <div>
                       <div className="text-xs font-semibold text-emerald-400">Resolution Notes:</div>
                       <p className="text-sm text-white/90 mt-1 whitespace-pre-wrap">{activeDetailComplaint.resolution_notes}</p>
                     </div>
                   )}
                 </div>
               )}
 
               {activeDetailComplaint.admin_notes && activeDetailComplaint.status !== "Resolved" && (
                 <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 space-y-1">
                   <div className="text-xs font-semibold text-blue-400">Admin Response:</div>
                   <p className="text-sm text-white/90 whitespace-pre-wrap">{activeDetailComplaint.admin_notes}</p>
                 </div>
               )}
             </div>
 
             {/* Timeline */}
             <div>
               <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Timeline of Updates</h4>
               {historyLoading ? (
                 <div className="flex items-center gap-2 text-xs text-muted-foreground">
                   <Loader2 className="h-3 w-3 animate-spin" /> Loading timeline...
                 </div>
               ) : selectedComplaintHistory.length > 0 ? (
                 <div className="space-y-4 pl-2 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-white/10">
                   {selectedComplaintHistory.map((h) => (
                     <div key={h.id} className="flex gap-4 relative">
                       <div className="h-3.5 w-3.5 rounded-full bg-[#0F172A] border-2 border-primary flex-shrink-0 mt-1 z-10 flex items-center justify-center">
                         <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                       </div>
                       <div className="flex-1 bg-white/5 border border-white/5 rounded-xl p-3">
                         <div className="flex justify-between items-start flex-wrap gap-1">
                           <span className="text-xs font-bold text-white">
                             Status Changed: {h.old_status ? h.old_status : "Created"} → {h.new_status}
                           </span>
                           <span className="text-[10px] text-muted-foreground">
                             {new Date(h.created_at).toLocaleString()}
                           </span>
                         </div>
                         {h.notes && <p className="text-xs text-muted-foreground mt-1">{h.notes}</p>}
                         <div className="text-[9px] text-muted-foreground/60 mt-1 capitalize">Updated by {h.changed_by}</div>
                       </div>
                     </div>
                   ))}
                 </div>
               ) : (
                 <div className="text-xs text-muted-foreground">No history logged.</div>
               )}
             </div>
           </div>
         </div>
       )}
     </StaggerContainer>
   );
 };
 
 export default Dashboard;
