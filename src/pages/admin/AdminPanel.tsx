import { useState, useEffect, useMemo } from "react";
import {
  ShieldCheck, Users, Clock, Flame, BookOpen, Search, ChevronDown, ChevronUp,
  Trophy, Upload, BarChart3, Zap, Loader2, MessageSquare, MessageCircleQuestion,
  Star, AlertTriangle, Target, Trash2
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  computeAvgQuizScore,
  parseFirestoreDate,
  formatLastActive,
  pickLatestIso
} from "@/lib/userStats";
import type { UserStatsRow } from "@/lib/userStats";
import { toDateKey } from "@/lib/utils";

interface FeedbackItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  rating: number;
  comment: string;
  createdAt: string;
  source: string;
}

const AdminPanel = () => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"users" | "feedback" | "analytics">("users");
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Real-time collections state
  const [profiles, setProfiles] = useState<any[]>([]);
  const [usersData, setUsersData] = useState<any[]>([]);
  const [xpLogs, setXpLogs] = useState<any[]>([]);
  const [userStreaks, setUserStreaks] = useState<any[]>([]);
  const [studySessions, setStudySessions] = useState<any[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [doubtSessions, setDoubtSessions] = useState<any[]>([]);
  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [studyPlans, setStudyPlans] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any[]>([]);

  // Track which listeners have reported at least once
  const [loadedListeners, setLoadedListeners] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;

    const collectionsToListen = [
      { name: "profiles",       setter: setProfiles },
      { name: "users",          setter: setUsersData },
      { name: "xp_logs",        setter: setXpLogs },
      { name: "user_streaks",   setter: setUserStreaks },
      { name: "study_sessions", setter: setStudySessions },
      { name: "quiz_attempts",  setter: setQuizAttempts },
      { name: "materials",      setter: setMaterials },
      { name: "doubt_sessions", setter: setDoubtSessions },
      { name: "flashcards",     setter: setFlashcards },
      { name: "study_plans",    setter: setStudyPlans },
      { name: "feedback",       setter: setFeedback },
    ];

    const unsubs = collectionsToListen.map(({ name, setter }) => {
      return onSnapshot(
        collection(db, name),
        (snapshot) => {
          setter(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
          setLoadedListeners((prev) => ({ ...prev, [name]: true }));
        },
        (err) => {
          console.warn(`[Admin Realtime] Error listening to "${name}":`, err.message);
          // Mark as loaded even on error so isLoading resolves
          setLoadedListeners((prev) => ({ ...prev, [name]: true }));
        }
      );
    });

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [user]);

  // FIX: Check against named required keys, not a raw count,
  // so adding/removing collections doesn't silently break the loading state.
  const isLoading = useMemo(() => {
    const required = [
      "profiles", "users", "xp_logs", "user_streaks", "study_sessions",
      "quiz_attempts", "materials", "doubt_sessions", "flashcards",
      "study_plans", "feedback",
    ];
    return required.some((key) => !loadedListeners[key]);
  }, [loadedListeners]);

  const platformStats = useMemo(() => {
    // FIX: Deep merge profiles + users docs so neither source silently wins.
    // Previously, if a profiles doc existed (even partially), the users doc was
    // ignored entirely — causing Google sign-in users to show "Unknown" / "—".
    const profileByUid: Record<string, any> = {};

    for (const p of profiles) {
      profileByUid[p.id] = { ...p, uid: p.id };
    }
    for (const u of usersData) {
      if (!profileByUid[u.id]) {
        // No profiles doc at all — use users doc as base
        profileByUid[u.id] = { ...u, uid: u.id };
      } else {
        // profiles doc exists but may have empty fields — fill gaps from users doc
        profileByUid[u.id] = { ...u, ...profileByUid[u.id], uid: u.id };
      }
    }

    const xpByUser: Record<string, number> = {};
    for (const d of xpLogs) {
      const uid = d.user_id;
      if (!uid) continue;
      xpByUser[uid] = (xpByUser[uid] || 0) + (Number(d.xp_amount) || 0);
    }

    const streakByUser: Record<string, { current: number; longest: number }> = {};
    for (const d of userStreaks) {
      streakByUser[d.id] = {
        current: Number(d.current_streak) || 0,
        longest: Number(d.longest_streak) || 0,
      };
    }

    const studyByUser: Record<string, { seconds: number; lastActive: string }> = {};
    const todayKey = toDateKey(new Date());
    const activeTodayUsers = new Set<string>();

    for (const d of studySessions) {
      const uid = d.user_id;
      if (!uid) continue;
      const duration = Number(d.duration_seconds) || 0;
      const date = parseFirestoreDate(d);
      const endedAt = date ? toDateKey(date) : "";

      if (!studyByUser[uid]) studyByUser[uid] = { seconds: 0, lastActive: "" };
      studyByUser[uid].seconds += duration;
      studyByUser[uid].lastActive = pickLatestIso(studyByUser[uid].lastActive, endedAt);

      if (endedAt === todayKey) activeTodayUsers.add(uid);
    }

    const quizByUser: Record<string, { score?: number; total_questions?: number }[]> = {};
    for (const d of quizAttempts) {
      const uid = d.user_id;
      if (!uid) continue;
      if (!quizByUser[uid]) quizByUser[uid] = [];
      quizByUser[uid].push({
        score: Number(d.score) || 0,
        total_questions: Number(d.total_questions) || 0,
      });
      const date = parseFirestoreDate(d);
      if (date) {
        const endedAt = toDateKey(date);
        if (!studyByUser[uid]) studyByUser[uid] = { seconds: 0, lastActive: "" };
        studyByUser[uid].lastActive = pickLatestIso(studyByUser[uid].lastActive, endedAt);
      }
    }

    const matsByUser: Record<string, number> = {};
    for (const d of materials) {
      const uid = d.user_id;
      if (!uid) continue;
      matsByUser[uid] = (matsByUser[uid] || 0) + 1;
    }

    const doubtsByUser: Record<string, number> = {};
    for (const d of doubtSessions) {
      const uid = d.user_id;
      if (!uid) continue;
      doubtsByUser[uid] = (doubtsByUser[uid] || 0) + 1;
      const date = parseFirestoreDate(d);
      if (date) {
        const endedAt = toDateKey(date);
        if (!studyByUser[uid]) studyByUser[uid] = { seconds: 0, lastActive: "" };
        studyByUser[uid].lastActive = pickLatestIso(studyByUser[uid].lastActive, endedAt);
      }
    }

    const flashcardsByUser: Record<string, number> = {};
    for (const d of flashcards) {
      const uid = d.user_id;
      if (!uid) continue;
      flashcardsByUser[uid] = (flashcardsByUser[uid] || 0) + 1;
    }

    const studyPlansByUser: Record<string, number> = {};
    for (const d of studyPlans) {
      const uid = d.user_id;
      if (!uid) continue;
      studyPlansByUser[uid] = (studyPlansByUser[uid] || 0) + 1;
    }

    const users: UserStatsRow[] = Object.entries(profileByUid).map(([uid, p]) => {
      const attempts = quizByUser[uid] || [];
      return {
        uid,
        name: (p.full_name as string) || (p.displayName as string) || "Unknown",
        email: (p.email as string) || "—",
        avatar_url: p.avatar_url as string | undefined,
        grade_level: p.grade_level as string | undefined,
        // ACCURACY FIX: normalize through parseFirestoreDate so the join date
        // renders correctly whether stored as an ISO string or a Firestore
        // Timestamp (prevents "Invalid Date" in the admin user list).
        joined:
          (parseFirestoreDate({ created_at: p.created_at }) ??
            parseFirestoreDate({ updated_at: p.updated_at }))?.toISOString() ?? "—",
        xp: xpByUser[uid] || 0,
        streak: streakByUser[uid]?.current || 0,
        longestStreak: streakByUser[uid]?.longest || 0,
        studyHours: parseFloat(((studyByUser[uid]?.seconds || 0) / 3600).toFixed(1)),
        quizCount: attempts.length,
        avgQuizScore: computeAvgQuizScore(attempts),
        materialsCount: matsByUser[uid] || 0,
        doubtCount: doubtsByUser[uid] || 0,
        flashcardCount: flashcardsByUser[uid] || 0,
        studyPlanCount: studyPlansByUser[uid] || 0,
        lastActive: formatLastActive(studyByUser[uid]?.lastActive),
      };
    });

    users.sort((a, b) => b.xp - a.xp);

    const activeToday = users.filter((u) => activeTodayUsers.has(u.uid)).length;
    const totalStudySeconds = users.reduce((sum, u) => sum + (studyByUser[u.uid]?.seconds || 0), 0);
    const totalStudyHours = parseFloat((totalStudySeconds / 3600).toFixed(1));
    const avgStreak =
      users.length > 0
        ? parseFloat(
            (users.reduce((sum, u) => sum + u.streak, 0) / users.length).toFixed(1)
          )
        : 0;

    return { users, totalUsers: users.length, activeToday, totalStudyHours, avgStreak };
  }, [profiles, usersData, xpLogs, userStreaks, studySessions, quizAttempts, materials, doubtSessions, flashcards, studyPlans]);

  const feedbackList = useMemo(() => {
    const items: FeedbackItem[] = feedback.map((d) => {
      const createdAt = d.createdAt?.toDate?.()
        ? d.createdAt.toDate().toISOString()
        : d.createdAt || "";
      return {
        id: d.id,
        userId: d.userId || "anonymous",
        userName: d.name || "Anonymous",
        userEmail: d.email || "—",
        rating: d.rating || 0,
        comment: d.comment || "",
        createdAt,
        source: d.source || "manual",
      };
    });
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return items;
  }, [feedback]);

  const feedbackLoading = isLoading;
  const statsError = null;

  // COMPLETE-DELETION FIX: all data cleanup now happens SERVER-SIDE in
  // /api/admin-delete-user via the Firebase Admin SDK, which bypasses
  // Firestore security rules. The previous client-side cleanup was being
  // silently blocked by rules for several collections (analytics,
  // notifications, analytics_snapshots) and missed follows/friends_list
  // and Storage avatars entirely. The server now deletes: the Auth
  // account, every Firestore doc across 18 collection queries (including
  // the social graph in both directions), 5 doc-id collections, and the
  // user's Storage files — and reports exactly what was removed.
  const handleDeleteUser = async (uid: string) => {
    // Guard: prevent double-fire if a delete is already in progress
    if (deletingUserId) return;
    setDeletingUserId(uid);

    try {
      const { getAuth: getClientAuth } = await import("firebase/auth");
      const currentUser = getClientAuth().currentUser;
      if (!currentUser) {
        toast.error("Admin session expired. Please log in again.");
        return;
      }

      const adminToken = await currentUser.getIdToken();
      const resp = await fetch("/api/admin-delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, adminToken }),
      });
      const result = await resp.json();

      if (!resp.ok) {
        toast.error(`Could not delete user: ${result.error || "Unknown error"}`);
        return;
      }

      if (Array.isArray(result.failures) && result.failures.length > 0) {
        // Auth + most data removed, but some cleanup steps reported errors —
        // surface it instead of pretending everything succeeded.
        toast.warning(
          `User deleted (${result.deletedDocs ?? 0} records removed), but ${result.failures.length} cleanup step(s) reported issues. Check Vercel logs.`
        );
      } else {
        toast.success(`User fully deleted — ${result.deletedDocs ?? 0} records removed.`);
      }
    } catch (err: any) {
      console.error("[Admin] Delete user error:", err);
      toast.error("Failed to delete user. Check console for details.");
    } finally {
      setDeletingUserId(null);
      setConfirmDeleteUserId(null);
      setExpandedUserId(null);
    }
  };

  const filteredUsers = (platformStats?.users || []).filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const filteredFeedback = feedbackList.filter((f) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      f.userName.toLowerCase().includes(q) ||
      f.comment.toLowerCase().includes(q) ||
      f.userEmail.toLowerCase().includes(q)
    );
  });

  const avgRating =
    feedbackList.length > 0
      ? parseFloat(
          (feedbackList.reduce((sum, f) => sum + f.rating, 0) / feedbackList.length).toFixed(1)
        )
      : 0;

  const totalUsers = platformStats?.totalUsers || 0;
  const featureUsageData = totalUsers > 0
    ? [
        {
          feature: "Study Sessions",
          activeUsers: platformStats?.users.filter((u) => u.studyHours > 0).length || 0,
          color: "from-emerald-400 to-emerald-600",
          bgColor: "bg-emerald-500",
          icon: "📚",
        },
        {
          feature: "Quizzes",
          activeUsers: platformStats?.users.filter((u) => u.quizCount > 0).length || 0,
          color: "from-blue-400 to-blue-600",
          bgColor: "bg-blue-500",
          icon: "🎯",
        },
        {
          feature: "Doubt Sessions",
          activeUsers: platformStats?.users.filter((u) => u.doubtCount > 0).length || 0,
          color: "from-violet-400 to-violet-600",
          bgColor: "bg-violet-500",
          icon: "❓",
        },
        {
          feature: "Materials Upload",
          activeUsers: platformStats?.users.filter((u) => u.materialsCount > 0).length || 0,
          color: "from-amber-400 to-amber-600",
          bgColor: "bg-amber-500",
          icon: "📄",
        },
        {
          feature: "Flashcards",
          activeUsers: platformStats?.users.filter((u) => u.flashcardCount > 0).length || 0,
          color: "from-pink-400 to-pink-600",
          bgColor: "bg-pink-500",
          icon: "🗂️",
        },
        {
          feature: "Study Plans",
          activeUsers: platformStats?.users.filter((u) => u.studyPlanCount > 0).length || 0,
          color: "from-cyan-400 to-cyan-600",
          bgColor: "bg-cyan-500",
          icon: "📋",
        },
      ]
    : [];

  const lowUsageFeatures = featureUsageData.filter(
    (f) => totalUsers > 0 && f.activeUsers / totalUsers < 0.3
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[#1D4ED8] to-[#3B82F6] flex items-center justify-center shadow-lg shadow-[#1D4ED8]/20">
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Admin Panel</h1>
          <p className="text-sm text-gray-400">Monitor user activity, study analytics & feedback</p>
        </div>
      </div>

      {/* Error Banner */}
      {statsError && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Some data may be unavailable</p>
            <p className="text-xs text-amber-600 mt-0.5">
              There was an error loading platform data. Ensure your Firestore rules allow admin reads.
            </p>
          </div>
        </div>
      )}

      {/* Platform Stats Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <Skeleton className="h-4 w-20 mb-3" />
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
          {[
            { label: "Total Users",  value: platformStats?.totalUsers || 0,          icon: Users,  color: "text-[#1D4ED8]",   bgColor: "bg-[#1D4ED8]/10" },
            { label: "Active Today", value: platformStats?.activeToday || 0,          icon: Zap,    color: "text-emerald-500", bgColor: "bg-emerald-500/10" },
            { label: "Study Hours",  value: `${platformStats?.totalStudyHours || 0}h`, icon: Clock,  color: "text-amber-500",   bgColor: "bg-amber-500/10" },
            { label: "Avg Streak",   value: `${platformStats?.avgStreak || 0}d`,       icon: Flame,  color: "text-red-500",     bgColor: "bg-red-500/10" },
            { label: "Avg Rating",   value: `${avgRating}★`,                           icon: Star,   color: "text-yellow-500",  bgColor: "bg-yellow-500/10" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-gray-100 relative overflow-hidden group hover:shadow-md transition-all duration-200">
              <div className={`absolute top-0 right-0 w-20 h-20 ${stat.bgColor} rounded-full -translate-y-8 translate-x-8 opacity-40 group-hover:opacity-60 transition-opacity`} />
              <div className={`h-8 w-8 md:h-9 md:w-9 rounded-lg ${stat.bgColor} flex items-center justify-center mb-2 md:mb-3`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div className="text-xl md:text-2xl font-extrabold text-gray-900">{stat.value}</div>
              <div className="text-[10px] md:text-xs text-gray-400 mt-0.5 font-medium">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200/60 pb-3">
        <button
          onClick={() => { setActiveTab("users"); setSearchQuery(""); }}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "users" ? "bg-[#0F172A] text-white shadow-md" : "text-gray-400 hover:text-gray-900 hover:bg-gray-100"
          }`}
        >
          <Users className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Users ({platformStats?.totalUsers || 0})
        </button>
        <button
          onClick={() => { setActiveTab("feedback"); setSearchQuery(""); }}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "feedback" ? "bg-[#0F172A] text-white shadow-md" : "text-gray-400 hover:text-gray-900 hover:bg-gray-100"
          }`}
        >
          <MessageSquare className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Feedback ({feedbackList.length})
        </button>
        <button
          onClick={() => { setActiveTab("analytics"); setSearchQuery(""); }}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "analytics" ? "bg-[#0F172A] text-white shadow-md" : "text-gray-400 hover:text-gray-900 hover:bg-gray-100"
          }`}
        >
          <BarChart3 className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Analytics
        </button>
      </div>

      {/* Search */}
      {activeTab !== "analytics" && (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder={activeTab === "users" ? "Search users by name or email..." : "Search feedback by name or content..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:border-[#1D4ED8]/40 focus:ring-2 focus:ring-[#1D4ED8]/10 text-gray-900 transition-all shadow-sm placeholder:text-gray-300"
          />
        </div>
      )}

      {/* ── USERS TAB ─────────────────────────────────────── */}
      {activeTab === "users" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Desktop Table Header */}
          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-4 px-6 py-3.5 bg-gray-50/80 border-b border-gray-100">
            {["User", "XP", "Streak", "Study Hours", "Avg Score", "Quizzes", "Doubts", "Materials", "Last Active"].map((h) => (
              <div key={h} className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{h}</div>
            ))}
          </div>

          {isLoading ? (
            <div className="p-8 flex items-center justify-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-[#1D4ED8]" />
              <span className="text-sm text-gray-400">Loading user data...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="h-10 w-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">{searchQuery ? "No users match your search" : "No registered users yet"}</p>
            </div>
          ) : (
            filteredUsers.map((u, idx) => (
              <div key={u.uid}>
                <button
                  // FIX: Clear stale confirmDeleteUserId when switching rows
                  onClick={() => {
                    setExpandedUserId(expandedUserId === u.uid ? null : u.uid);
                    setConfirmDeleteUserId(null);
                  }}
                  className={`w-full grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-2 md:gap-4 px-4 md:px-6 py-3.5 md:py-4 text-left hover:bg-gray-50/80 transition-colors items-center ${
                    idx !== filteredUsers.length - 1 ? "border-b border-gray-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt={u.name} className="h-9 w-9 rounded-full object-cover ring-2 ring-gray-100" />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#1D4ED8]/20 to-[#3B82F6]/10 flex items-center justify-center ring-2 ring-[#1D4ED8]/10">
                        <span className="text-sm font-bold text-[#1D4ED8]">{u.name.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900 truncate">{u.name}</div>
                      <div className="text-[11px] text-gray-400 truncate">{u.email}</div>
                    </div>
                    {expandedUserId === u.uid ? (
                      <ChevronUp className="h-4 w-4 text-gray-300 ml-auto md:hidden flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-300 ml-auto md:hidden flex-shrink-0" />
                    )}
                  </div>

                  {/* Mobile compact stats row */}
                  <div className="flex items-center gap-3 md:hidden text-xs text-gray-500 pl-12 flex-wrap">
                    <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-amber-400" />{u.xp.toLocaleString()}</span>
                    <span className="flex items-center gap-1"><Flame className="h-3 w-3 text-red-400" />{u.streak}d</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-green-500" />{u.studyHours}h</span>
                    <span className="flex items-center gap-1"><Target className="h-3 w-3 text-emerald-500" />{u.avgQuizScore > 0 ? `${u.avgQuizScore}%` : "—"}</span>
                    <span className="flex items-center gap-1"><Trophy className="h-3 w-3 text-[#1D4ED8]" />{u.quizCount}</span>
                    <span className="flex items-center gap-1"><MessageCircleQuestion className="h-3 w-3 text-violet-500" />{u.doubtCount}</span>
                  </div>

                  {/* Desktop columns */}
                  <div className="hidden md:flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-amber-400" /><span className="text-sm font-semibold text-gray-900">{u.xp.toLocaleString()}</span></div>
                  <div className="hidden md:flex items-center gap-1"><Flame className="h-3.5 w-3.5 text-red-400" /><span className="text-sm font-semibold text-gray-900">{u.streak}d</span></div>
                  <div className="hidden md:flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-green-500" /><span className="text-sm font-semibold text-gray-900">{u.studyHours}h</span></div>
                  <div className="hidden md:flex items-center gap-1"><Target className="h-3.5 w-3.5 text-emerald-500" /><span className={`text-sm font-semibold ${u.avgQuizScore >= 80 ? "text-emerald-600" : u.avgQuizScore >= 50 ? "text-amber-600" : u.avgQuizScore > 0 ? "text-red-500" : "text-gray-400"}`}>{u.avgQuizScore > 0 ? `${u.avgQuizScore}%` : "—"}</span></div>
                  <div className="hidden md:flex items-center gap-1"><Trophy className="h-3.5 w-3.5 text-[#1D4ED8]" /><span className="text-sm font-semibold text-gray-900">{u.quizCount}</span></div>
                  <div className="hidden md:flex items-center gap-1"><MessageCircleQuestion className="h-3.5 w-3.5 text-violet-500" /><span className="text-sm font-semibold text-gray-900">{u.doubtCount}</span></div>
                  <div className="hidden md:flex items-center gap-1"><Upload className="h-3.5 w-3.5 text-purple-500" /><span className="text-sm font-semibold text-gray-900">{u.materialsCount}</span></div>
                  <div className="hidden md:block text-xs text-gray-400">{u.lastActive}</div>
                </button>

                {/* Expanded User Details */}
                {expandedUserId === u.uid && (
                  <div className="px-4 md:px-6 py-4 bg-gray-50/60 border-b border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
                      <div className="bg-white rounded-xl p-3.5 md:p-4 border border-gray-100 shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Total XP</div>
                        <div className="text-lg md:text-xl font-bold text-gray-900">{u.xp.toLocaleString()}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">Level {Math.floor(u.xp / 200) + 1}</div>
                      </div>
                      <div className="bg-white rounded-xl p-3.5 md:p-4 border border-gray-100 shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Study Time</div>
                        <div className="text-lg md:text-xl font-bold text-gray-900">{u.studyHours}h</div>
                      </div>
                      <div className="bg-white rounded-xl p-3.5 md:p-4 border border-gray-100 shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Streak</div>
                        <div className="text-lg md:text-xl font-bold text-gray-900">{u.streak}d 🔥</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">Best: {u.longestStreak}d</div>
                      </div>
                      <div className="bg-white rounded-xl p-3.5 md:p-4 border border-gray-100 shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Avg Quiz Score</div>
                        <div className={`text-lg md:text-xl font-bold ${u.avgQuizScore >= 80 ? "text-emerald-600" : u.avgQuizScore >= 50 ? "text-amber-600" : u.avgQuizScore > 0 ? "text-red-500" : "text-gray-400"}`}>
                          {u.avgQuizScore > 0 ? `${u.avgQuizScore}%` : "—"}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{u.quizCount} quiz{u.quizCount !== 1 ? "zes" : ""}</div>
                      </div>
                      <div className="bg-white rounded-xl p-3.5 md:p-4 border border-gray-100 shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Doubts Asked</div>
                        <div className="text-lg md:text-xl font-bold text-gray-900">{u.doubtCount}</div>
                      </div>
                      <div className="bg-white rounded-xl p-3.5 md:p-4 border border-gray-100 shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Materials</div>
                        <div className="text-lg md:text-xl font-bold text-gray-900">{u.materialsCount}</div>
                      </div>
                    </div>

                    {(u.grade_level || u.joined !== "—") && (
                      <div className="mt-3 text-xs text-gray-400">
                        {u.grade_level && (
                          <><span className="font-semibold text-gray-500">Grade:</span> {u.grade_level}</>
                        )}
                        {u.grade_level && u.joined !== "—" && " · "}
                        {u.joined !== "—" && (
                          <><span className="font-semibold text-gray-500">Joined:</span> {new Date(u.joined).toLocaleDateString()}</>
                        )}
                      </div>
                    )}

                    {/* Delete User */}
                    <div className="mt-4 pt-3 border-t border-gray-200/60">
                      {confirmDeleteUserId === u.uid ? (
                        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-3 animate-in fade-in zoom-in-95 duration-200">
                          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-red-800">Delete all data for "{u.name}"?</p>
                            <p className="text-xs text-red-600 mt-0.5">
                              This permanently removes their profile, sessions, quizzes, materials, and all other data. Cannot be undone.
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteUserId(null); }}
                              className="px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteUser(u.uid); }}
                              disabled={!!deletingUserId}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors flex items-center gap-1.5 disabled:opacity-60"
                            >
                              {deletingUserId === u.uid ? (
                                <><Loader2 className="h-3 w-3 animate-spin" /> Deleting...</>
                              ) : (
                                <><Trash2 className="h-3 w-3" /> Delete All Data</>
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteUserId(u.uid); }}
                          className="flex items-center gap-2 text-xs font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete User Data
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── FEEDBACK TAB ──────────────────────────────────── */}
      {activeTab === "feedback" && (
        <div className="space-y-3">
          {feedbackLoading ? (
            <div className="bg-white rounded-2xl p-8 flex items-center justify-center gap-3 shadow-sm border border-gray-100">
              <Loader2 className="h-5 w-5 animate-spin text-[#1D4ED8]" />
              <span className="text-sm text-gray-400">Loading feedback...</span>
            </div>
          ) : filteredFeedback.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
              <MessageSquare className="h-10 w-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">{searchQuery ? "No feedback matches your search" : "No feedback submitted yet"}</p>
            </div>
          ) : (
            filteredFeedback.map((f) => (
              <div key={f.id} className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200">
                <div className="flex items-start justify-between gap-3 md:gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#1D4ED8]/20 to-[#3B82F6]/10 flex items-center justify-center flex-shrink-0 ring-2 ring-[#1D4ED8]/10">
                      <span className="text-sm font-bold text-[#1D4ED8]">{f.userName.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{f.userName}</div>
                      <div className="text-[11px] text-gray-400 truncate">{f.userEmail}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} className={`h-3.5 w-3.5 ${star <= f.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200"}`} />
                      ))}
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                      f.source === "ai_chat"
                        ? "bg-purple-50 text-purple-600"
                        : f.source === "enforced_modal"
                        ? "bg-blue-50 text-blue-600"
                        : "bg-gray-50 text-gray-500"
                    }`}>
                      {f.source === "ai_chat" ? "AI Chat" : f.source === "enforced_modal" ? "Weekly" : "Manual"}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-3 leading-relaxed">{f.comment}</p>
                <div className="text-[10px] text-gray-300 mt-2 font-medium">
                  {f.createdAt ? new Date(f.createdAt).toLocaleString() : "—"}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── ANALYTICS TAB ─────────────────────────────────── */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-9 w-9 rounded-lg bg-[#1D4ED8]/10 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-[#1D4ED8]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Feature Adoption</h3>
                <p className="text-xs text-gray-400">How many users are actively using each feature</p>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-8 flex-1 rounded-lg" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : totalUsers === 0 ? (
              <div className="text-center py-12">
                <BarChart3 className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">No user data available yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {featureUsageData
                  .sort((a, b) => b.activeUsers - a.activeUsers)
                  .map((feature) => {
                    const pct = Math.round((feature.activeUsers / totalUsers) * 100);
                    const barColor =
                      pct >= 60
                        ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                        : pct >= 30
                        ? "bg-gradient-to-r from-amber-400 to-amber-500"
                        : "bg-gradient-to-r from-red-400 to-red-500";
                    return (
                      <div key={feature.feature} className="group">
                        <div className="flex items-center gap-4">
                          <div className="w-36 flex items-center gap-2 flex-shrink-0">
                            <span className="text-base">{feature.icon}</span>
                            <span className="text-sm font-medium text-gray-700 truncate">{feature.feature}</span>
                          </div>
                          <div className="flex-1 h-9 bg-gray-100 rounded-lg overflow-hidden relative">
                            <div
                              className={`h-full ${barColor} rounded-lg transition-all duration-700 ease-out relative`}
                              style={{ width: `${Math.max(pct, 3)}%` }}
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            {pct >= 15 && (
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-white drop-shadow-sm">
                                {pct}%
                              </span>
                            )}
                          </div>
                          <div className="w-24 text-right flex-shrink-0">
                            <span className="text-sm font-bold text-gray-900">{feature.activeUsers}</span>
                            <span className="text-xs text-gray-400">/{totalUsers}</span>
                            {pct < 15 && (
                              <span className="text-[10px] text-gray-400 ml-1">({pct}%)</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {lowUsageFeatures.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 md:p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <h3 className="text-sm font-bold text-amber-800">Low Usage Insights</h3>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {lowUsageFeatures.map((feature) => {
                  const pct = totalUsers > 0 ? Math.round((feature.activeUsers / totalUsers) * 100) : 0;
                  const unusedCount = totalUsers - feature.activeUsers;
                  const reasons: Record<string, string> = {
                    "Study Sessions": "Users may not be aware of the study timer or find manual session tracking cumbersome.",
                    "Quizzes": "Quiz feature might need more topic variety or users haven't completed enough lessons to take quizzes.",
                    "Doubt Sessions": "Users may not know they can ask AI for help, or prefer searching online instead.",
                    "Materials Upload": "File upload limit, supported formats, or the value proposition of uploading materials may be unclear.",
                    "Flashcards": "Users might not realize flashcards are available, or prefer other study methods.",
                    "Study Plans": "Creating study plans may feel too structured for casual learners. Consider auto-generating plans.",
                  };
                  return (
                    <div key={feature.feature} className="bg-white rounded-xl p-4 border border-amber-200/50 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{feature.icon}</span>
                        <span className="text-sm font-semibold text-gray-900">{feature.feature}</span>
                      </div>
                      <div className="text-xs text-gray-500 mb-2">
                        Only <span className="font-bold text-amber-600">{pct}%</span> of users ({feature.activeUsers}/{totalUsers}) are using this.{" "}
                        <span className="font-semibold text-gray-700">{unusedCount} user{unusedCount !== 1 ? "s" : ""}</span> haven't tried it.
                      </div>
                      <p className="text-[11px] text-gray-400 leading-relaxed italic">
                        💡 {reasons[feature.feature] || "Consider improving discoverability and onboarding for this feature."}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-xs text-gray-300 py-2">
        {activeTab === "users"
          ? `Showing ${filteredUsers.length} of ${platformStats?.totalUsers || 0} users`
          : activeTab === "feedback"
          ? `Showing ${filteredFeedback.length} of ${feedbackList.length} feedback entries`
          : `Analyzing ${totalUsers} users across 6 features`}
      </div>
    </div>
  );
};

export default AdminPanel;
