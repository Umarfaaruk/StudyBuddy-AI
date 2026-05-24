import { useState } from "react";
import {
  ShieldCheck, Users, Clock, Flame, BookOpen, Search, ChevronDown, ChevronUp,
  Trophy, Upload, BarChart3, Zap, Loader2, MessageSquare, Star
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, doc, getDoc, orderBy } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";

interface UserRow {
  uid: string;
  name: string;
  email: string;
  avatar_url?: string;
  grade_level?: string;
  joined: string;
  xp: number;
  streak: number;
  studyHours: number;
  quizCount: number;
  materialsCount: number;
  lastActive: string;
}

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
  const [activeTab, setActiveTab] = useState<"users" | "feedback">("users");

  // Fetch all users and their stats
  const { data: platformStats, isLoading } = useQuery({
    queryKey: ["admin-platform-stats"],
    queryFn: async () => {
      const profilesSnap = await getDocs(collection(db, "profiles"));
      const profiles = profilesSnap.docs.map(d => ({ uid: d.id, ...d.data() })) as any[];

      const xpSnap = await getDocs(collection(db, "xp_logs"));
      const xpByUser: Record<string, number> = {};
      xpSnap.docs.forEach(d => {
        const data = d.data();
        xpByUser[data.user_id] = (xpByUser[data.user_id] || 0) + (data.xp_amount || 0);
      });

      const streakSnap = await getDocs(collection(db, "user_streaks"));
      const streakByUser: Record<string, number> = {};
      streakSnap.docs.forEach(d => {
        streakByUser[d.id] = d.data()?.current_streak || 0;
      });

      const sessionsSnap = await getDocs(collection(db, "study_sessions"));
      const studyByUser: Record<string, { seconds: number; lastActive: string }> = {};
      const todayKey = new Date().toISOString().slice(0, 10);
      let activeToday = 0;
      let totalStudySeconds = 0;

      sessionsSnap.docs.forEach(d => {
        const data = d.data();
        const uid = data.user_id;
        const duration = data.duration_seconds || 0;
        const endedAt = data.ended_at || data.created_at?.toDate?.()?.toISOString() || "";

        if (!studyByUser[uid]) studyByUser[uid] = { seconds: 0, lastActive: "" };
        studyByUser[uid].seconds += duration;
        totalStudySeconds += duration;

        if (endedAt > studyByUser[uid].lastActive) {
          studyByUser[uid].lastActive = endedAt;
        }

        if (endedAt.slice(0, 10) === todayKey) {
          activeToday++;
        }
      });

      const quizSnap = await getDocs(collection(db, "quiz_attempts"));
      const quizByUser: Record<string, number> = {};
      quizSnap.docs.forEach(d => {
        const uid = d.data().user_id;
        quizByUser[uid] = (quizByUser[uid] || 0) + 1;
      });

      const materialsSnap = await getDocs(collection(db, "materials"));
      const matsByUser: Record<string, number> = {};
      materialsSnap.docs.forEach(d => {
        const uid = d.data().user_id;
        matsByUser[uid] = (matsByUser[uid] || 0) + 1;
      });

      const users: UserRow[] = profiles.map((p: any) => ({
        uid: p.uid,
        name: p.full_name || "Unknown",
        email: p.email || "—",
        avatar_url: p.avatar_url,
        grade_level: p.grade_level,
        joined: p.created_at || "—",
        xp: xpByUser[p.uid] || 0,
        streak: streakByUser[p.uid] || 0,
        studyHours: parseFloat(((studyByUser[p.uid]?.seconds || 0) / 3600).toFixed(1)),
        quizCount: quizByUser[p.uid] || 0,
        materialsCount: matsByUser[p.uid] || 0,
        lastActive: studyByUser[p.uid]?.lastActive
          ? new Date(studyByUser[p.uid].lastActive).toLocaleDateString()
          : "Never",
      }));

      users.sort((a, b) => b.xp - a.xp);

      const totalUsers = profiles.length;
      const totalStudyHours = parseFloat((totalStudySeconds / 3600).toFixed(1));
      const avgStreak = profiles.length > 0
        ? parseFloat((Object.values(streakByUser).reduce((a, b) => a + b, 0) / profiles.length).toFixed(1))
        : 0;

      return { users, totalUsers, activeToday, totalStudyHours, avgStreak };
    },
    enabled: !!user,
  });

  // Fetch all feedback
  const { data: feedbackList = [], isLoading: feedbackLoading } = useQuery({
    queryKey: ["admin-feedback"],
    queryFn: async () => {
      const feedbackSnap = await getDocs(collection(db, "feedback"));
      const items: FeedbackItem[] = feedbackSnap.docs.map(d => {
        const data = d.data();
        const createdAt = data.createdAt?.toDate?.()
          ? data.createdAt.toDate().toISOString()
          : data.createdAt || "";
        return {
          id: d.id,
          userId: data.userId || "anonymous",
          userName: data.name || "Anonymous",
          userEmail: data.email || "—",
          rating: data.rating || 0,
          comment: data.comment || "",
          createdAt,
          source: data.source || "manual",
        };
      });
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return items;
    },
    enabled: !!user,
  });

  const filteredUsers = (platformStats?.users || []).filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const filteredFeedback = feedbackList.filter((f) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return f.userName.toLowerCase().includes(q) || f.comment.toLowerCase().includes(q) || f.userEmail.toLowerCase().includes(q);
  });

  const avgRating = feedbackList.length > 0
    ? parseFloat((feedbackList.reduce((sum, f) => sum + f.rating, 0) / feedbackList.length).toFixed(1))
    : 0;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-[#1D4ED8]/10 flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-[#1D4ED8]" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Admin Panel</h1>
          <p className="text-sm text-gray-500">Monitor user activity, study analytics & feedback</p>
        </div>
      </div>

      {/* Platform Stats Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <Skeleton className="h-4 w-20 mb-3" />
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Total Users", value: platformStats?.totalUsers || 0, icon: Users, color: "text-[#1D4ED8]", bgColor: "bg-[#1D4ED8]/10" },
            { label: "Active Today", value: platformStats?.activeToday || 0, icon: Zap, color: "text-emerald-500", bgColor: "bg-emerald-500/10" },
            { label: "Study Hours", value: `${platformStats?.totalStudyHours || 0}h`, icon: Clock, color: "text-amber-500", bgColor: "bg-amber-500/10" },
            { label: "Avg Streak", value: `${platformStats?.avgStreak || 0}d`, icon: Flame, color: "text-red-500", bgColor: "bg-red-500/10" },
            { label: "Avg Rating", value: `${avgRating}★`, icon: Star, color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 relative overflow-hidden group hover:shadow-md transition-shadow">
              <div className={`absolute top-0 right-0 w-20 h-20 ${stat.bgColor} rounded-full -translate-y-8 translate-x-8 opacity-50`} />
              <div className={`h-9 w-9 rounded-lg ${stat.bgColor} flex items-center justify-center mb-3`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div className="text-2xl font-extrabold text-gray-900">{stat.value}</div>
              <div className="text-xs text-gray-400 mt-0.5 font-medium">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "users" ? "bg-[#0F172A] text-white shadow-md" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
          }`}
        >
          <Users className="h-4 w-4 inline mr-1.5" />
          Users ({platformStats?.totalUsers || 0})
        </button>
        <button
          onClick={() => setActiveTab("feedback")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "feedback" ? "bg-[#0F172A] text-white shadow-md" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
          }`}
        >
          <MessageSquare className="h-4 w-4 inline mr-1.5" />
          Feedback ({feedbackList.length})
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder={activeTab === "users" ? "Search users by name or email..." : "Search feedback by name or content..."}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-11 pl-10 pr-4 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:border-[#1D4ED8]/40 focus:ring-2 focus:ring-[#1D4ED8]/10 text-gray-900 transition-all shadow-sm"
        />
      </div>

      {/* ── USERS TAB ───────────────────────────────────── */}
      {activeTab === "users" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100">
            {["User", "XP", "Streak", "Study Hours", "Quizzes", "Materials", "Last Active"].map((h) => (
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
                  onClick={() => setExpandedUserId(expandedUserId === u.uid ? null : u.uid)}
                  className={`w-full grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-4 px-6 py-4 text-left hover:bg-gray-50 transition-colors items-center ${
                    idx !== filteredUsers.length - 1 ? "border-b border-gray-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt={u.name} className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-[#1D4ED8]/10 flex items-center justify-center">
                        <span className="text-sm font-bold text-[#1D4ED8]">{u.name.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{u.name}</div>
                      <div className="text-[11px] text-gray-400">{u.email}</div>
                    </div>
                    {expandedUserId === u.uid ? (
                      <ChevronUp className="h-4 w-4 text-gray-300 ml-auto md:hidden" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-300 ml-auto md:hidden" />
                    )}
                  </div>
                  <div className="hidden md:flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-amber-400" /><span className="text-sm font-semibold text-gray-900">{u.xp.toLocaleString()}</span></div>
                  <div className="hidden md:flex items-center gap-1"><Flame className="h-3.5 w-3.5 text-red-400" /><span className="text-sm font-semibold text-gray-900">{u.streak}d</span></div>
                  <div className="hidden md:flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-green-500" /><span className="text-sm font-semibold text-gray-900">{u.studyHours}h</span></div>
                  <div className="hidden md:flex items-center gap-1"><Trophy className="h-3.5 w-3.5 text-[#1D4ED8]" /><span className="text-sm font-semibold text-gray-900">{u.quizCount}</span></div>
                  <div className="hidden md:flex items-center gap-1"><Upload className="h-3.5 w-3.5 text-purple-500" /><span className="text-sm font-semibold text-gray-900">{u.materialsCount}</span></div>
                  <div className="hidden md:block text-xs text-gray-400">{u.lastActive}</div>
                </button>

                {expandedUserId === u.uid && (
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-white rounded-xl p-4 border border-gray-100">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Total XP</div>
                        <div className="text-xl font-bold text-gray-900">{u.xp.toLocaleString()}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">Level {Math.floor(u.xp / 200) + 1}</div>
                      </div>
                      <div className="bg-white rounded-xl p-4 border border-gray-100">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Study Time</div>
                        <div className="text-xl font-bold text-gray-900">{u.studyHours}h</div>
                      </div>
                      <div className="bg-white rounded-xl p-4 border border-gray-100">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Quizzes</div>
                        <div className="text-xl font-bold text-gray-900">{u.quizCount}</div>
                      </div>
                      <div className="bg-white rounded-xl p-4 border border-gray-100">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Materials</div>
                        <div className="text-xl font-bold text-gray-900">{u.materialsCount}</div>
                      </div>
                    </div>
                    {u.grade_level && (
                      <div className="mt-3 text-xs text-gray-400">
                        <span className="font-semibold text-gray-500">Grade:</span> {u.grade_level}
                        {u.joined !== "—" && (
                          <> · <span className="font-semibold text-gray-500">Joined:</span> {new Date(u.joined).toLocaleDateString()}</>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── FEEDBACK TAB ────────────────────────────────── */}
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
              <div key={f.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-[#1D4ED8]/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-[#1D4ED8]">{f.userName.charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{f.userName}</div>
                      <div className="text-[11px] text-gray-400">{f.userEmail}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Star rating */}
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} className={`h-3.5 w-3.5 ${star <= f.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200"}`} />
                      ))}
                    </div>
                    {/* Source badge */}
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
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

      {/* Footer */}
      <div className="text-center text-xs text-gray-300 py-2">
        {activeTab === "users"
          ? `Showing ${filteredUsers.length} of ${platformStats?.totalUsers || 0} users`
          : `Showing ${filteredFeedback.length} of ${feedbackList.length} feedback entries`
        }
      </div>
    </div>
  );
};

export default AdminPanel;
