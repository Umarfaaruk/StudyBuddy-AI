import { useState } from "react";
import {
  ShieldCheck, Users, Clock, Flame, BookOpen, Search, ChevronDown, ChevronUp,
  Trophy, Upload, BarChart3, Zap, Loader2
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
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

const AdminPanel = () => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Fetch all users and their stats
  const { data: platformStats, isLoading } = useQuery({
    queryKey: ["admin-platform-stats"],
    queryFn: async () => {
      // 1. Get all user profiles
      const profilesSnap = await getDocs(collection(db, "profiles"));
      const profiles = profilesSnap.docs.map(d => ({ uid: d.id, ...d.data() })) as any[];

      // 2. Get all XP logs
      const xpSnap = await getDocs(collection(db, "xp_logs"));
      const xpByUser: Record<string, number> = {};
      xpSnap.docs.forEach(d => {
        const data = d.data();
        xpByUser[data.user_id] = (xpByUser[data.user_id] || 0) + (data.xp_amount || 0);
      });

      // 3. Get all streaks
      const streakSnap = await getDocs(collection(db, "user_streaks"));
      const streakByUser: Record<string, number> = {};
      streakSnap.docs.forEach(d => {
        streakByUser[d.id] = d.data()?.current_streak || 0;
      });

      // 4. Get all study sessions
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

      // 5. Get all quiz attempts
      const quizSnap = await getDocs(collection(db, "quiz_attempts"));
      const quizByUser: Record<string, number> = {};
      quizSnap.docs.forEach(d => {
        const uid = d.data().user_id;
        quizByUser[uid] = (quizByUser[uid] || 0) + 1;
      });

      // 6. Get all materials
      const materialsSnap = await getDocs(collection(db, "materials"));
      const matsByUser: Record<string, number> = {};
      materialsSnap.docs.forEach(d => {
        const uid = d.data().user_id;
        matsByUser[uid] = (matsByUser[uid] || 0) + 1;
      });

      // Build user rows
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

      // Sort by XP descending
      users.sort((a, b) => b.xp - a.xp);

      // Platform-level stats
      const totalUsers = profiles.length;
      const totalStudyHours = parseFloat((totalStudySeconds / 3600).toFixed(1));
      const avgStreak = profiles.length > 0
        ? parseFloat((Object.values(streakByUser).reduce((a, b) => a + b, 0) / profiles.length).toFixed(1))
        : 0;

      return {
        users,
        totalUsers,
        activeToday,
        totalStudyHours,
        avgStreak,
      };
    },
    enabled: !!user,
  });

  const filteredUsers = (platformStats?.users || []).filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-[#1D4ED8]/10 flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-[#1D4ED8]" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Admin Panel</h1>
          <p className="text-sm text-gray-500">Monitor user learning activities and platform engagement</p>
        </div>
      </div>

      {/* Platform Stats Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <Skeleton className="h-4 w-20 mb-3" />
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "Total Users",
              value: platformStats?.totalUsers || 0,
              icon: Users,
              color: "text-[#1D4ED8]",
              bgColor: "bg-[#1D4ED8]/10",
            },
            {
              label: "Active Today",
              value: platformStats?.activeToday || 0,
              icon: Zap,
              color: "text-emerald-500",
              bgColor: "bg-emerald-500/10",
            },
            {
              label: "Total Study Hours",
              value: `${platformStats?.totalStudyHours || 0}h`,
              icon: Clock,
              color: "text-amber-500",
              bgColor: "bg-amber-500/10",
            },
            {
              label: "Avg Streak",
              value: `${platformStats?.avgStreak || 0}d`,
              icon: Flame,
              color: "text-red-500",
              bgColor: "bg-red-500/10",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 relative overflow-hidden group hover:shadow-md transition-shadow"
            >
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search users by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-11 pl-10 pr-4 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:border-[#1D4ED8]/40 focus:ring-2 focus:ring-[#1D4ED8]/10 text-gray-900 transition-all shadow-sm"
        />
      </div>

      {/* User Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Table Header */}
        <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100">
          {["User", "XP", "Streak", "Study Hours", "Quizzes", "Materials", "Last Active"].map((h) => (
            <div key={h} className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{h}</div>
          ))}
        </div>

        {/* Table Body */}
        {isLoading ? (
          <div className="p-8 flex items-center justify-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-[#1D4ED8]" />
            <span className="text-sm text-gray-400">Loading user data...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">
              {searchQuery ? "No users match your search" : "No registered users yet"}
            </p>
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
                {/* User info */}
                <div className="flex items-center gap-3">
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt={u.name} className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-[#1D4ED8]/10 flex items-center justify-center">
                      <span className="text-sm font-bold text-[#1D4ED8]">
                        {u.name.charAt(0).toUpperCase()}
                      </span>
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

                {/* Stats */}
                <div className="hidden md:flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-sm font-semibold text-gray-900">{u.xp.toLocaleString()}</span>
                </div>
                <div className="hidden md:flex items-center gap-1">
                  <Flame className="h-3.5 w-3.5 text-red-400" />
                  <span className="text-sm font-semibold text-gray-900">{u.streak}d</span>
                </div>
                <div className="hidden md:flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-sm font-semibold text-gray-900">{u.studyHours}h</span>
                </div>
                <div className="hidden md:flex items-center gap-1">
                  <Trophy className="h-3.5 w-3.5 text-[#1D4ED8]" />
                  <span className="text-sm font-semibold text-gray-900">{u.quizCount}</span>
                </div>
                <div className="hidden md:flex items-center gap-1">
                  <Upload className="h-3.5 w-3.5 text-purple-500" />
                  <span className="text-sm font-semibold text-gray-900">{u.materialsCount}</span>
                </div>
                <div className="hidden md:block text-xs text-gray-400">{u.lastActive}</div>
              </button>

              {/* Expanded Detail Row */}
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
                      <div className="text-[10px] text-gray-400 mt-0.5">Total study hours</div>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-gray-100">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Quizzes</div>
                      <div className="text-xl font-bold text-gray-900">{u.quizCount}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">Quizzes completed</div>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-gray-100">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Materials</div>
                      <div className="text-xl font-bold text-gray-900">{u.materialsCount}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">Files uploaded</div>
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

      {/* Footer */}
      <div className="text-center text-xs text-gray-300 py-2">
        Showing {filteredUsers.length} of {platformStats?.totalUsers || 0} users
      </div>
    </div>
  );
};

export default AdminPanel;
