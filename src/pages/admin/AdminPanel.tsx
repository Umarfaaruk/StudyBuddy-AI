import { useState, useEffect, useMemo } from "react";
import {
  ShieldCheck, Users, Clock, Flame, Search, ChevronDown, ChevronUp,
  Trophy, Upload, BarChart3, Zap, Loader2, MessageSquare, MessageCircleQuestion,
  Star, AlertTriangle, Target, Trash2, Eye, Image, CheckCircle, X
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { createNotification } from "@/contexts/NotificationContext";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  computeAvgQuizScore,
  parseDate,
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
  const [activeTab, setActiveTab] = useState<"users" | "feedback" | "analytics" | "complaints">("users");
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
  const [complaints, setComplaints] = useState<any[]>([]);

  // Complaints Filtering & Operations State
  const [priorityFilter, setPriorityFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [editAdminNotes, setEditAdminNotes] = useState<string>("");
  const [showResolutionModal, setShowResolutionModal] = useState<boolean>(false);
  const [resolutionNotes, setResolutionNotes] = useState<string>("");
  const [fixSummary, setFixSummary] = useState<string>("");
  const [showScreenshotUrl, setShowScreenshotUrl] = useState<string | null>(null);
  const [updatingComplaintId, setUpdatingComplaintId] = useState<string | null>(null);

  // Track which listeners have reported at least once
  const [loadedListeners, setLoadedListeners] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;

    // The `users` collection was merged into `profiles` during the Supabase
    // migration, so it is no longer fetched.
    const tablesToLoad: { name: string; setter: (rows: any[]) => void }[] = [
      { name: "profiles",       setter: setProfiles },
      { name: "xp_logs",        setter: setXpLogs },
      { name: "user_streaks",   setter: setUserStreaks },
      { name: "study_sessions", setter: setStudySessions },
      { name: "quiz_attempts",  setter: setQuizAttempts },
      { name: "materials",      setter: setMaterials },
      { name: "doubt_sessions", setter: setDoubtSessions },
      { name: "flashcards",     setter: setFlashcards },
      { name: "study_plans",    setter: setStudyPlans },
      { name: "feedback",       setter: setFeedback },
      { name: "complaints",     setter: setComplaints },
    ];

    let active = true;
    tablesToLoad.forEach(async ({ name, setter }) => {
      const { data, error } = await supabase.from(name).select("*");
      if (!active) return;
      if (error) console.warn(`[Admin] Error loading "${name}":`, error.message);
      // Ensure every row exposes an `id` (some tables are keyed by user_id).
      setter((data ?? []).map((r: any) => ({ id: r.id ?? r.user_id, ...r })));
      setLoadedListeners((prev) => ({ ...prev, [name]: true }));
    });

    return () => { active = false; };
  }, [user]);

  // FIX: Check against named required keys, not a raw count,
  // so adding/removing collections doesn't silently break the loading state.
  const isLoading = useMemo(() => {
    const required = [
      "profiles", "xp_logs", "user_streaks", "study_sessions",
      "quiz_attempts", "materials", "doubt_sessions", "flashcards",
      "study_plans", "feedback", "complaints",
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

    // ACCURACY: de-duplicate identical xp_logs (same user+amount+source+timestamp
    // = an accidental double-write) so admin XP matches the dashboard/leaderboard
    // and never shows inflated totals.
    const xpByUser: Record<string, number> = {};
    const seenXp = new Set<string>();
    for (const d of xpLogs) {
      const uid = d.user_id;
      if (!uid || typeof d.xp_amount !== "number") continue;
      const ms = d.created_at?.toMillis?.() ?? (d.created_at ? new Date(d.created_at).getTime() : 0);
      const sig = `${uid}|${d.xp_amount}|${d.source_type}|${ms}`;
      if (seenXp.has(sig)) continue;
      seenXp.add(sig);
      xpByUser[uid] = (xpByUser[uid] || 0) + d.xp_amount;
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
      const date = parseDate(d);
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
      const date = parseDate(d);
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
      const date = parseDate(d);
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
        // Normalize through parseDate so the join date renders correctly
        // (prevents "Invalid Date" in the admin user list).
        joined:
          (parseDate({ created_at: p.created_at }) ??
            parseDate({ updated_at: p.updated_at }))?.toISOString() ?? "—",
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

    const totalXp = users.reduce((sum, u) => sum + (u.xp || 0), 0);
    return { users, totalUsers: users.length, activeToday, totalStudyHours, avgStreak, totalXp };
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

  const complaintsList = useMemo(() => {
    const items = complaints.map((c) => {
      const userProfile = profiles.find((p) => p.id === c.user_id) || usersData.find((u) => u.id === c.user_id);
      return {
        ...c,
        userName: userProfile?.full_name || userProfile?.displayName || "Unknown User",
        userEmail: userProfile?.email || "—",
        userAvatar: userProfile?.avatar_url,
      };
    });
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return items;
  }, [complaints, profiles, usersData]);

  const filteredComplaints = useMemo(() => {
    return complaintsList.filter((c) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesQuery =
          c.title.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.userName.toLowerCase().includes(q) ||
          c.userEmail.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }
      if (statusFilter !== "All" && c.status !== statusFilter) return false;
      if (priorityFilter !== "All" && c.priority !== priorityFilter) return false;
      
      return true;
    });
  }, [complaintsList, searchQuery, statusFilter, priorityFilter]);

  const handleUpdateStatus = async (complaintId: string, newStatus: string) => {
    const complaint = complaintsList.find((c) => c.id === complaintId);
    if (!complaint) return;

    if (newStatus === "Resolved") {
      setResolutionNotes("");
      setFixSummary("");
      setShowResolutionModal(true);
      return;
    }

    setUpdatingComplaintId(complaintId);
    try {
      const nowStr = new Date().toISOString();
      const oldStatus = complaint.status;

      await supabase.from("complaints").update({
        status: newStatus,
        admin_notes: editAdminNotes,
        updated_at: nowStr,
      }).eq("id", complaintId);

      const historyId = `HST-${Math.floor(100000 + Math.random() * 900000)}`;
      await supabase.from("complaint_history").insert({
        id: historyId,
        complaint_id: complaintId,
        old_status: oldStatus,
        new_status: newStatus,
        changed_by: "admin",
        notes: editAdminNotes || `Status updated to ${newStatus}`,
        created_at: nowStr,
        user_id: complaint.user_id,
      });

      const statusMessages: Record<string, string> = {
        "Pending": "Your issue has been received.",
        "Under Review": "Our team is reviewing your issue.",
        "In Progress": "We are actively working on your issue.",
        "Testing": "A fix has been implemented and is being tested.",
        "Rejected": "Your issue has been reviewed and closed.",
      };

      const notificationMsg = statusMessages[newStatus] || `Status updated to ${newStatus}`;
      const notificationIcon = newStatus === "Rejected" ? "❌" : "⚠️";

      await createNotification(complaint.user_id, {
        title: "Complaint Status Updated",
        message: notificationMsg,
        type: "system",
        icon: notificationIcon,
      });

      toast.success(`Complaint status updated to ${newStatus}`);
      setSelectedComplaintId(null);
      setEditAdminNotes("");
    } catch (error: any) {
      console.error("Error updating complaint status:", error);
      toast.error(error.message || "Failed to update complaint status");
    } finally {
      setUpdatingComplaintId(null);
    }
  };

  const handleResolveComplaint = async () => {
    if (!selectedComplaintId) return;
    const complaint = complaintsList.find((c) => c.id === selectedComplaintId);
    if (!complaint) return;

    if (!fixSummary.trim()) {
      toast.error("Fix Summary is required");
      return;
    }
    if (!resolutionNotes.trim()) {
      toast.error("Resolution Notes are required");
      return;
    }

    setUpdatingComplaintId(selectedComplaintId);
    const refToast = toast.loading("Resolving complaint...");
    try {
      const nowStr = new Date().toISOString();
      const oldStatus = complaint.status;

      await supabase.from("complaints").update({
        status: "Resolved",
        admin_notes: editAdminNotes,
        resolution_notes: resolutionNotes.trim(),
        fix_summary: fixSummary.trim(),
        resolved_at: nowStr,
        updated_at: nowStr,
      }).eq("id", selectedComplaintId);

      const historyId = `HST-${Math.floor(100000 + Math.random() * 900000)}`;
      await supabase.from("complaint_history").insert({
        id: historyId,
        complaint_id: selectedComplaintId,
        old_status: oldStatus,
        new_status: "Resolved",
        changed_by: "admin",
        notes: `Resolved: ${fixSummary.trim()}`,
        created_at: nowStr,
        user_id: complaint.user_id,
      });

      await createNotification(complaint.user_id, {
        title: "Complaint Resolved",
        message: "Your issue has been fixed successfully.",
        type: "system",
        icon: "✅",
      });

      toast.dismiss(refToast);
      toast.success("Complaint successfully resolved!");
      setShowResolutionModal(false);
      setSelectedComplaintId(null);
      setEditAdminNotes("");
      setResolutionNotes("");
      setFixSummary("");
    } catch (error: any) {
      toast.dismiss(refToast);
      console.error("Error resolving complaint:", error);
      toast.error(error.message || "Failed to resolve complaint");
    } finally {
      setUpdatingComplaintId(null);
    }
  };

  const feedbackLoading = isLoading;
  const statsError = null;

  // All data cleanup happens SERVER-SIDE in /api/admin-delete-user using the
  // Supabase service role. Deleting the Supabase Auth account cascades (ON
  // DELETE CASCADE) to every user-owned table in one transaction; the server
  // also best-effort removes the user's avatar from Storage.
  const handleDeleteUser = async (uid: string) => {
    // Guard: prevent double-fire if a delete is already in progress
    if (deletingUserId) return;
    setDeletingUserId(uid);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const adminToken = sessionData.session?.access_token;
      if (!adminToken) {
        toast.error("Admin session expired. Please log in again.");
        return;
      }

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
          color: "from-[#29ABE2] to-[#29ABE2]",
          bgColor: "bg-[#29ABE2]",
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
          color: "from-[#29ABE2] to-[#29ABE2]",
          bgColor: "bg-[#29ABE2]",
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
        <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[#29ABE2] to-[#29ABE2] flex items-center justify-center shadow-lg shadow-[#29ABE2]/20">
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
              There was an error loading platform data. Ensure your Supabase RLS policies allow admin reads.
            </p>
          </div>
        </div>
      )}

      {/* Platform Stats Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <Skeleton className="h-9 w-9 rounded-lg mb-3" />
              <Skeleton className="h-7 w-16 mb-1.5" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total Users",  value: (platformStats?.totalUsers || 0).toLocaleString(), icon: Users,  color: "text-[#29ABE2]",   bgColor: "bg-[#29ABE2]/10" },
            { label: "Active Today", value: (platformStats?.activeToday || 0).toLocaleString(), icon: Zap,    color: "text-emerald-500", bgColor: "bg-emerald-500/10" },
            { label: "Total XP",     value: (platformStats?.totalXp || 0).toLocaleString(),     icon: Trophy, color: "text-[#29ABE2]",   bgColor: "bg-[#29ABE2]/10" },
            { label: "Study Hours",  value: `${platformStats?.totalStudyHours || 0}h`,          icon: Clock,  color: "text-amber-500",   bgColor: "bg-amber-500/10" },
            { label: "Avg Streak",   value: `${platformStats?.avgStreak || 0}d`,                icon: Flame,  color: "text-red-500",     bgColor: "bg-red-500/10" },
            { label: "Avg Rating",   value: `${avgRating}★`,                                    icon: Star,   color: "text-yellow-500",  bgColor: "bg-yellow-500/10" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:border-[#29ABE2]/30 hover:shadow-md transition-all duration-200">
              <div className={`h-9 w-9 rounded-lg ${stat.bgColor} flex items-center justify-center mb-3`}>
                <stat.icon className={`h-[18px] w-[18px] ${stat.color}`} />
              </div>
              <div className="text-xl md:text-2xl font-extrabold text-gray-900 leading-none tabular-nums">{stat.value}</div>
              <div className="text-[11px] text-gray-400 mt-1.5 font-medium uppercase tracking-wide">{stat.label}</div>
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
          onClick={() => { setActiveTab("complaints"); setSearchQuery(""); }}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "complaints" ? "bg-[#0F172A] text-white shadow-md" : "text-gray-400 hover:text-gray-900 hover:bg-gray-100"
          }`}
        >
          <AlertTriangle className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Complaints ({complaintsList.length})
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
            placeholder={
              activeTab === "users" 
                ? "Search users by name or email..." 
                : activeTab === "complaints"
                ? "Search complaints by reference, title, description or user details..."
                : "Search feedback by name or content..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:border-[#29ABE2]/40 focus:ring-2 focus:ring-[#29ABE2]/10 text-gray-900 transition-all shadow-sm placeholder:text-gray-300"
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
              <Loader2 className="h-5 w-5 animate-spin text-[#29ABE2]" />
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
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#29ABE2]/20 to-[#29ABE2]/10 flex items-center justify-center ring-2 ring-[#29ABE2]/10">
                        <span className="text-sm font-bold text-[#29ABE2]">{u.name.charAt(0).toUpperCase()}</span>
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
                    <span className="flex items-center gap-1"><Trophy className="h-3 w-3 text-[#29ABE2]" />{u.quizCount}</span>
                    <span className="flex items-center gap-1"><MessageCircleQuestion className="h-3 w-3 text-violet-500" />{u.doubtCount}</span>
                  </div>

                  {/* Desktop columns */}
                  <div className="hidden md:flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-amber-400" /><span className="text-sm font-semibold text-gray-900">{u.xp.toLocaleString()}</span></div>
                  <div className="hidden md:flex items-center gap-1"><Flame className="h-3.5 w-3.5 text-red-400" /><span className="text-sm font-semibold text-gray-900">{u.streak}d</span></div>
                  <div className="hidden md:flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-green-500" /><span className="text-sm font-semibold text-gray-900">{u.studyHours}h</span></div>
                  <div className="hidden md:flex items-center gap-1"><Target className="h-3.5 w-3.5 text-emerald-500" /><span className={`text-sm font-semibold ${u.avgQuizScore >= 80 ? "text-emerald-600" : u.avgQuizScore >= 50 ? "text-amber-600" : u.avgQuizScore > 0 ? "text-red-500" : "text-gray-400"}`}>{u.avgQuizScore > 0 ? `${u.avgQuizScore}%` : "—"}</span></div>
                  <div className="hidden md:flex items-center gap-1"><Trophy className="h-3.5 w-3.5 text-[#29ABE2]" /><span className="text-sm font-semibold text-gray-900">{u.quizCount}</span></div>
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
              <Loader2 className="h-5 w-5 animate-spin text-[#29ABE2]" />
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
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#29ABE2]/20 to-[#29ABE2]/10 flex items-center justify-center flex-shrink-0 ring-2 ring-[#29ABE2]/10">
                      <span className="text-sm font-bold text-[#29ABE2]">{f.userName.charAt(0).toUpperCase()}</span>
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
                        ? "bg-[#29ABE2] text-[#29ABE2]"
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
              <div className="h-9 w-9 rounded-lg bg-[#29ABE2]/10 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-[#29ABE2]" />
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
      {/* ── COMPLAINTS TAB ────────────────────────────────── */}
      {activeTab === "complaints" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex gap-3 flex-wrap items-center bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500">Filter by Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2 font-medium text-gray-700 outline-none focus:border-[#29ABE2]"
              >
                {["All", "Pending", "Under Review", "In Progress", "Testing", "Resolved", "Rejected"].map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500">Filter by Priority:</span>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2 font-medium text-gray-700 outline-none focus:border-[#29ABE2]"
              >
                {["All", "Low", "Medium", "High", "Critical"].map((pr) => (
                  <option key={pr} value={pr}>{pr}</option>
                ))}
              </select>
            </div>

            <div className="text-xs font-medium text-gray-400 ml-auto">
              Found {filteredComplaints.length} complaint(s)
            </div>
          </div>

          {/* Complaints Grid/List */}
          <div className="grid lg:grid-cols-12 gap-5 items-start">
            {/* List */}
            <div className={`space-y-3 ${selectedComplaintId ? "lg:col-span-7" : "lg:col-span-12"}`}>
              {filteredComplaints.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
                  <AlertTriangle className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">No complaints found matching current filters/search</p>
                </div>
              ) : (
                filteredComplaints.map((c) => {
                  const statusColors: Record<string, string> = {
                    "Pending": "bg-yellow-50 text-yellow-600 border border-yellow-200",
                    "Under Review": "bg-blue-50 text-blue-600 border border-blue-200",
                    "In Progress": "bg-indigo-50 text-indigo-600 border border-indigo-200",
                    "Testing": "bg-purple-50 text-purple-600 border border-purple-200",
                    "Resolved": "bg-emerald-50 text-emerald-600 border border-emerald-200",
                    "Rejected": "bg-rose-50 text-rose-600 border border-rose-200",
                  };
                  const priorityColors: Record<string, string> = {
                    "Low": "bg-slate-50 text-slate-500 border border-slate-200",
                    "Medium": "bg-blue-50 text-blue-500 border border-blue-200",
                    "High": "bg-amber-50 text-amber-600 border border-amber-200",
                    "Critical": "bg-red-50 text-red-600 border border-red-200 animate-pulse",
                  };

                  const isSelected = selectedComplaintId === c.id;

                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        setSelectedComplaintId(c.id);
                        setEditAdminNotes(c.admin_notes || "");
                      }}
                      className={`bg-white rounded-2xl p-4 md:p-5 shadow-sm border transition-all duration-200 hover:shadow-md cursor-pointer text-left ${
                        isSelected ? "border-[#29ABE2] ring-2 ring-[#29ABE2]/10 bg-[#29ABE2]/[0.01]" : "border-gray-100"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3">
                          {c.userAvatar ? (
                            <img src={c.userAvatar} alt={c.userName} className="h-9 w-9 rounded-full object-cover ring-2 ring-gray-100" />
                          ) : (
                            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#29ABE2]/20 to-[#29ABE2]/10 flex items-center justify-center ring-2 ring-[#29ABE2]/10">
                              <span className="text-sm font-bold text-[#29ABE2]">{c.userName.charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-bold text-gray-900 leading-tight">{c.userName}</div>
                            <div className="text-[10px] text-gray-400 mt-0.5">{c.userEmail}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${priorityColors[c.priority] || ""}`}>
                            {c.priority} Priority
                          </span>
                          <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${statusColors[c.status] || ""}`}>
                            {c.status}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ref: {c.id}</div>
                        <h4 className="text-sm font-bold text-gray-900 mt-1">{c.title}</h4>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{c.description}</p>
                      </div>

                      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50 flex-wrap justify-between">
                        <div className="text-[10px] text-gray-400">
                          Category: <span className="font-semibold text-gray-700">{c.category}</span> · Reported: <span className="font-semibold">{new Date(c.created_at).toLocaleString()}</span>
                        </div>
                        {c.screenshot && (
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-[#29ABE2]">
                            <Image className="h-3 w-3" /> Has Attachment
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Detail Pane */}
            {selectedComplaintId && (() => {
              const activeComplaint = complaintsList.find((c) => c.id === selectedComplaintId);
              if (!activeComplaint) return null;

              return (
                <div className="lg:col-span-5 bg-white border border-gray-100 shadow-lg rounded-2xl p-5 md:p-6 space-y-5 sticky top-4 text-left animate-in fade-in slide-in-from-right-4 duration-200">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">Issue Details</h3>
                      <span className="text-[10px] text-gray-400 font-mono">{activeComplaint.id}</span>
                    </div>
                    <button
                      onClick={() => setSelectedComplaintId(null)}
                      className="text-gray-400 hover:text-gray-900 p-1.5 rounded-lg hover:bg-gray-100 transition-all text-xs font-semibold border border-gray-200 px-2.5 py-1"
                    >
                      Close Pane
                    </button>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Reporting User</h4>
                    <div className="flex items-center gap-3 mt-2 bg-gray-50 rounded-xl p-3 border border-gray-100">
                      {activeComplaint.userAvatar ? (
                        <img src={activeComplaint.userAvatar} alt={activeComplaint.userName} className="h-10 w-10 rounded-full object-cover border border-gray-200" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#29ABE2]/20 to-[#29ABE2]/10 flex items-center justify-center border border-[#29ABE2]/10">
                          <span className="text-base font-bold text-[#29ABE2]">{activeComplaint.userName.charAt(0).toUpperCase()}</span>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-900 truncate">{activeComplaint.userName}</div>
                        <div className="text-xs text-gray-400 truncate">{activeComplaint.userEmail}</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Title</h4>
                    <p className="text-sm text-gray-800 font-semibold mt-1 leading-tight">{activeComplaint.title}</p>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Description</h4>
                    <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap bg-gray-50 p-3 rounded-xl border border-gray-100 leading-relaxed max-h-32 overflow-y-auto">
                      {activeComplaint.description}
                    </p>
                  </div>

                  {activeComplaint.screenshot && (
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Screenshot Attachment</h4>
                      <div
                        onClick={() => setShowScreenshotUrl(activeComplaint.screenshot)}
                        className="relative group cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-gray-50 max-h-36 flex items-center justify-center"
                      >
                        <img src={activeComplaint.screenshot} alt="Screenshot" className="object-contain max-h-36 transition-transform duration-300 group-hover:scale-[1.02]" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs font-semibold text-white gap-1.5">
                          <Eye className="h-4 w-4" /> Click to enlarge
                        </div>
                      </div>
                    </div>
                  )}

                  {activeComplaint.status === "Resolved" && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs">
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                        Resolution Info
                      </div>
                      <div className="text-[10px] text-emerald-600 font-medium">
                        Resolved on {activeComplaint.resolved_at ? new Date(activeComplaint.resolved_at).toLocaleString() : "—"}
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider font-mono">Fix Summary</div>
                        <p className="text-xs text-gray-700 font-medium whitespace-pre-wrap mt-0.5">{activeComplaint.fix_summary}</p>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider font-mono">Resolution Notes</div>
                        <p className="text-xs text-gray-700 whitespace-pre-wrap mt-0.5">{activeComplaint.resolution_notes}</p>
                      </div>
                    </div>
                  )}

                  {/* Actions Section */}
                  <div className="border-t border-gray-100 pt-4 space-y-4">
                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Admin Notes (Response to User)</label>
                      <textarea
                        value={editAdminNotes}
                        onChange={(e) => setEditAdminNotes(e.target.value)}
                        placeholder="Add internal notes or responses for the user..."
                        rows={3}
                        className="w-full p-3 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#29ABE2] text-gray-800 transition-all resize-none placeholder:text-gray-300"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Change Status</label>
                      <div className="grid grid-cols-2 gap-2">
                        {["Pending", "Under Review", "In Progress", "Testing", "Resolved", "Rejected"].map((statusOption) => {
                          const isActive = activeComplaint.status === statusOption;
                          const colorClasses: Record<string, string> = {
                            "Pending": isActive ? "bg-yellow-500 text-white" : "hover:bg-yellow-50 text-yellow-600 border-yellow-100 bg-white border",
                            "Under Review": isActive ? "bg-blue-500 text-white" : "hover:bg-blue-50 text-blue-600 border-blue-100 bg-white border",
                            "In Progress": isActive ? "bg-indigo-500 text-white" : "hover:bg-indigo-50 text-indigo-600 border-indigo-100 bg-white border",
                            "Testing": isActive ? "bg-purple-500 text-white" : "hover:bg-purple-50 text-purple-600 border-purple-100 bg-white border",
                            "Resolved": isActive ? "bg-emerald-500 text-white" : "hover:bg-emerald-50 text-emerald-600 border-emerald-100 bg-white border",
                            "Rejected": isActive ? "bg-rose-500 text-white" : "hover:bg-rose-50 text-rose-600 border-rose-100 bg-white border",
                          };

                          return (
                            <button
                              key={statusOption}
                              onClick={() => handleUpdateStatus(activeComplaint.id, statusOption)}
                              disabled={updatingComplaintId === activeComplaint.id}
                              className={`py-2 px-2.5 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center ${colorClasses[statusOption] || ""}`}
                            >
                              {statusOption}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Resolution Overlay Modal */}
      {showResolutionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowResolutionModal(false)} />
          <div className="relative w-full max-w-md bg-white border border-gray-100 rounded-2xl shadow-2xl p-6 text-left animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Resolve Complaint</h3>
            <p className="text-xs text-gray-400 mb-4">Please provide the resolution details for the reporting user.</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1.5">Fix Summary <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. Fixed dashboard cache latency issue"
                  value={fixSummary}
                  onChange={(e) => setFixSummary(e.target.value)}
                  className="w-full h-10 px-3 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#29ABE2] text-gray-800 transition-all shadow-sm placeholder:text-gray-300"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1.5">Resolution Notes <span className="text-red-500">*</span></label>
                <textarea
                  placeholder="Provide technical fix details or steps taken to resolve..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={4}
                  className="w-full p-3 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#29ABE2] text-gray-800 transition-all resize-none placeholder:text-gray-300"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => setShowResolutionModal(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResolveComplaint}
                  disabled={updatingComplaintId !== null}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 rounded-lg text-xs font-bold text-white transition-all flex items-center gap-1.5"
                >
                  {updatingComplaintId ? "Resolving..." : "Complete Resolution"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enlarged Screenshot Modal */}
      {showScreenshotUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowScreenshotUrl(null)}>
          <button
            onClick={() => setShowScreenshotUrl(null)}
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 p-2 rounded-full text-white transition-all z-10"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={showScreenshotUrl}
            alt="Full screenshot"
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-xs text-gray-300 py-2">
        {activeTab === "users"
          ? `Showing ${filteredUsers.length} of ${platformStats?.totalUsers || 0} users`
          : activeTab === "feedback"
          ? `Showing ${filteredFeedback.length} of ${feedbackList.length} feedback entries`
          : activeTab === "complaints"
          ? `Showing ${filteredComplaints.length} of ${complaintsList.length} complaints`
          : `Analyzing ${totalUsers} users across 6 features`}
      </div>
    </div>
  );
};

export default AdminPanel;
