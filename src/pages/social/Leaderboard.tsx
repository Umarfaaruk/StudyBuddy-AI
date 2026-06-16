import { Trophy, Zap, Flame, Users, Crown, Award, Star, UserPlus, UserCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit, addDoc, deleteDoc } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const Leaderboard = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<"global" | "friends">("global");
  const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'all'>('today');
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());

  // Fetch who the user follows
  const { data: followsData } = useQuery({
    queryKey: ["follows", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      const q = query(collection(db, "follows"), where("follower_id", "==", user.uid));
      const snap = await getDocs(q);
      const follows = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setFollowingSet(new Set(follows.map((f: any) => f.following_id)));
      return follows;
    },
    enabled: !!user,
  });

  const handleFollow = async (targetUserId: string, targetName: string) => {
    if (!user || targetUserId === user.uid) return;
    try {
      if (followingSet.has(targetUserId)) {
        // Unfollow: find and delete the follow doc
        const q = query(
          collection(db, "follows"),
          where("follower_id", "==", user.uid),
          where("following_id", "==", targetUserId)
        );
        const snap = await getDocs(q);
        for (const d of snap.docs) await deleteDoc(d.ref);
        setFollowingSet(prev => { const n = new Set(prev); n.delete(targetUserId); return n; });
        toast.success(`Unfollowed ${targetName}`);
      } else {
        await addDoc(collection(db, "follows"), {
          follower_id: user.uid,
          following_id: targetUserId,
          created_at: new Date().toISOString(),
        });
        setFollowingSet(prev => new Set([...prev, targetUserId]));
        toast.success(`Now following ${targetName}`);
      }
    } catch {
      toast.error("Failed to update follow status");
    }
  };

  const { data: myProfile } = useQuery({
    queryKey: ["my-profile", user?.uid],
    queryFn: async () => {
      if (!user) return null;
      const docRef = doc(db, "profiles", user.uid);
      const snap = await getDoc(docRef);
      return snap.exists() ? snap.data() : null;
    },
    enabled: !!user,
  });

  const { data: streak } = useQuery({
    queryKey: ["streak-lb", user?.uid],
    queryFn: async () => {
      if (!user) return null;
      const docRef = doc(db, "user_streaks", user.uid);
      const snap = await getDoc(docRef);
      return snap.exists() ? snap.data() : { current_streak: 0 };
    },
    enabled: !!user,
  });

  // Global leaderboard: top XP users
  const { data: globalUsers } = useQuery({
    queryKey: ["leaderboard-global"],
    queryFn: async () => {
      try {
        const q = query(collection(db, "profiles"), orderBy("total_xp", "desc"), limit(20));
        const snap = await getDocs(q);
        return snap.docs.map((d, i) => {
          const data = d.data();
          const name = data.full_name || "Student";
          return {
            uid: d.id,
            name,
            avatar: name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase(),
            xp: data.total_xp || 0,
            isYou: d.id === user?.uid,
            subject: "Student",
            rank: i + 1,
          };
        });
      } catch {
        return [];
      }
    },
    enabled: !!user,
  });

  const myName = myProfile?.full_name || user?.displayName || "You";
  const myInitials = myName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
  // Use the precomputed total_xp aggregate already loaded on the profile,
  // instead of scanning and summing the entire xp_logs history (N reads/click).
  const xp = (myProfile?.total_xp as number) ?? 0;
  const nextMilestone = Math.ceil(xp / 500) * 500 || 500;

  // If user not in global list, add them
  const displayUsers = tab === "global"
    ? (() => {
        const list = globalUsers ?? [];
        if (list.length > 0 && !list.find((u) => u.isYou)) {
          const withMe = [...list, { uid: user?.uid || "", name: myName, avatar: myInitials, xp, isYou: true, subject: "Student", rank: list.length + 1 }];
          return withMe.sort((a, b) => b.xp - a.xp).map((u, i) => ({ ...u, rank: i + 1 }));
        }
        return list;
      })()
    : [{ uid: user?.uid || "", name: myName, avatar: myInitials, xp, isYou: true, subject: "Student", rank: 1 }];

  const myRank = displayUsers.find((u) => u.isYou)?.rank ?? 0;

  /* Podium helpers */
  const top3 = displayUsers.slice(0, 3);
  const rest = displayUsers.slice(3);
  const podiumOrder = [top3[1], top3[0], top3[2]]; // 2nd, 1st, 3rd

  const medalColors: Record<number, { bg: string; ring: string; text: string; gradient: string }> = {
    1: { bg: "from-yellow-400/20 to-amber-100/40", ring: "ring-yellow-400", text: "text-yellow-500", gradient: "from-yellow-400 to-amber-500" },
    2: { bg: "from-slate-300/20 to-gray-100/40", ring: "ring-slate-400", text: "text-slate-400", gradient: "from-slate-300 to-gray-400" },
    3: { bg: "from-orange-400/20 to-amber-100/40", ring: "ring-orange-400", text: "text-orange-400", gradient: "from-orange-400 to-amber-600" },
  };

  const completionPercent = 75;
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (completionPercent / 100) * circumference;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header area with title, time filters, and scope toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">Leaderboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Compete, climb the ranks, and earn glory.</p>
        </div>

        {/* Center: Time filter pills */}
        <div className="flex items-center gap-1.5 bg-gray-100 rounded-full p-1">
          {([
            { key: 'today' as const, label: 'Today' },
            { key: 'week' as const, label: 'This week' },
            { key: 'all' as const, label: 'All time' },
          ]).map(f => (
            <button
              key={f.key}
              onClick={() => setTimeFilter(f.key)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                timeFilter === f.key
                  ? "bg-[#29ABE2] text-white shadow-lg shadow-blue-200"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/60"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Right: Global / Friends toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
          <button
            onClick={() => setTab("global")}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              tab === "global"
                ? "bg-white text-gray-900 shadow-md"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Trophy className="h-3.5 w-3.5" />
            Global
          </button>
          <button
            onClick={() => setTab("friends")}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              tab === "friends"
                ? "bg-white text-gray-900 shadow-md"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Friends
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6">
        {/* Main leaderboard area */}
        <div className="space-y-6 min-w-0">

          {/* ───── Podium Section ───── */}
          {top3.length >= 3 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 pt-10 pb-8">
              <div className="flex items-end justify-center gap-4 md:gap-6">
                {podiumOrder.map((u, i) => {
                  if (!u) return null;
                  const isFirst = u.rank === 1;
                  const colors = medalColors[u.rank] || medalColors[3];
                  return (
                    <div
                      key={`podium-${u.rank}`}
                      className={`flex flex-col items-center transition-all duration-500 ${
                        isFirst
                          ? "scale-110 -translate-y-4 z-10 min-w-[96px] md:min-w-[160px]"
                          : "scale-100 min-w-[80px] md:min-w-[130px]"
                      }`}
                    >
                      {/* Crown for #1 */}
                      {isFirst && (
                        <div className="mb-2 animate-bounce" style={{ animationDuration: "2s" }}>
                          <Crown className="h-8 w-8 text-yellow-400 drop-shadow-lg fill-yellow-400" />
                        </div>
                      )}

                      {/* Avatar */}
                      <div className={`relative mb-3`}>
                        <div className={`${isFirst ? "h-20 w-20" : "h-16 w-16"} rounded-full bg-gradient-to-br ${colors.bg} ring-4 ${colors.ring} flex items-center justify-center text-lg font-extrabold text-gray-800 shadow-xl`}>
                          {u.avatar}
                        </div>
                        {/* Rank badge */}
                        <div className={`absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-gradient-to-br ${colors.gradient} flex items-center justify-center text-white text-xs font-black shadow-lg ring-2 ring-white`}>
                          {u.rank}
                        </div>
                      </div>

                      {/* Name */}
                      <span className={`font-bold text-gray-900 ${isFirst ? "text-base" : "text-sm"} text-center truncate max-w-[120px]`}>
                        {u.isYou ? "You" : u.name}
                      </span>

                      {/* XP */}
                      <div className="flex items-center gap-1 mt-1">
                        <Zap className={`h-3.5 w-3.5 ${colors.text}`} />
                        <span className={`text-sm font-bold ${colors.text}`}>{u.xp.toLocaleString()} XP</span>
                      </div>

                      {/* Podium bar */}
                      <div className={`mt-3 w-full rounded-t-xl bg-gradient-to-b ${colors.bg} border border-gray-200/50 flex items-end justify-center`}
                        style={{ height: isFirst ? 80 : u.rank === 2 ? 56 : 40 }}
                      >
                        <span className={`text-2xl mb-2`}>
                          {u.rank === 1 ? "🥇" : u.rank === 2 ? "🥈" : "🥉"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ───── Ranked List (4+) ───── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[28px_minmax(0,1fr)_auto_auto] lg:grid-cols-[50px_minmax(0,1fr)_140px_100px] gap-2 md:gap-4 px-3 md:px-5 py-3 bg-gray-50/80 border-b border-gray-100">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Rank</span>
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Student</span>
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider text-right">XP Points</span>
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider text-right">Action</span>
            </div>

            <div className="divide-y divide-gray-50">
              {displayUsers.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-12">
                  <Trophy className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                  <p className="font-medium">No data yet</p>
                  <p className="text-xs mt-1">Start studying to appear on the leaderboard!</p>
                </div>
              ) : (
                (rest.length > 0 ? rest : displayUsers).map((u) => (
                  <div
                    key={`row-${u.name}-${u.rank}`}
                    className={`grid grid-cols-[28px_minmax(0,1fr)_auto_auto] lg:grid-cols-[50px_minmax(0,1fr)_140px_100px] gap-2 md:gap-4 items-center px-3 md:px-5 py-3.5 transition-all duration-200 group ${
                      u.isYou
                        ? "bg-[#29ABE2]/5 border-l-4 border-l-[#29ABE2]"
                        : "hover:bg-gray-50/80 border-l-4 border-l-transparent"
                    }`}
                  >
                    {/* Rank */}
                    <div className="flex items-center">
                      <span className={`text-sm font-extrabold ${u.rank <= 3 ? "text-[#29ABE2]" : "text-gray-400"}`}>
                        #{u.rank}
                      </span>
                    </div>

                    {/* Student */}
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                        u.isYou
                          ? "bg-gradient-to-br from-[#29ABE2] to-[#1E96CC] text-white shadow-md shadow-blue-200"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {u.avatar}
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-gray-900 truncate block">
                          {u.isYou ? "You" : u.name}
                        </span>
                        {u.isYou && (
                          <span className="text-[10px] text-[#29ABE2] font-medium">Your position</span>
                        )}
                      </div>
                    </div>

                    {/* XP */}
                    <div className="text-right">
                      <span className={`text-sm font-bold ${u.isYou ? "text-[#29ABE2]" : "text-gray-700"}`}>
                        {u.xp.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">XP</span>
                    </div>

                    {/* Follow/Friends Button */}
                    <div className="text-right">
                      {!u.isYou && u.uid && (
                        <button
                          onClick={() => handleFollow(u.uid, u.name)}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                            followingSet.has(u.uid)
                              ? "bg-[#29ABE2]/10 text-[#29ABE2] hover:bg-red-50 hover:text-red-500"
                              : "bg-[#29ABE2] text-white hover:bg-[#1E96CC] shadow-sm"
                          }`}
                        >
                          {followingSet.has(u.uid) ? (
                            <><UserCheck className="h-3 w-3" /> Following</>
                          ) : (
                            <><UserPlus className="h-3 w-3" /> Follow</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ───── Right Sidebar ───── */}
        <div className="space-y-5 min-w-0">

          {/* Academy Completion */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col items-center">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 self-start">Academy Completion</h4>
            <div className="relative w-32 h-32">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                {/* Background circle */}
                <circle cx="60" cy="60" r="54" fill="none" stroke="#F3F4F6" strokeWidth="8" />
                {/* Progress arc */}
                <circle
                  cx="60" cy="60" r="54"
                  fill="none"
                  stroke="url(#progressGradient)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-1000 ease-out"
                />
                <defs>
                  <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#29ABE2" />
                    <stop offset="100%" stopColor="#1E96CC" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-gray-900">{completionPercent}%</span>
                <span className="text-[10px] font-medium text-gray-400 mt-0.5">Complete</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4 text-center leading-relaxed">
              You've completed {completionPercent}% of your academy goals. Keep pushing!
            </p>
          </div>

          {/* Apex Architect Award */}
          <div className="bg-gradient-to-br from-[#29ABE2] to-[#1A7BA8] rounded-2xl shadow-lg shadow-blue-200/50 p-6 text-white relative overflow-hidden">
            {/* Decorative background circles */}
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10" />
            <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5" />

            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <Award className="h-5 w-5 text-yellow-300" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">Apex Architect</h4>
                  <p className="text-[10px] text-blue-200">Top Achievement</p>
                </div>
              </div>

              {/* Laurel decoration */}
              <div className="flex items-center justify-center my-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🏆</span>
                  <div className="text-center">
                    <p className="text-xs font-semibold text-blue-100">Rank #{myRank}</p>
                    <p className="text-lg font-black">{xp.toLocaleString()} XP</p>
                  </div>
                  <span className="text-2xl">🏆</span>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/20">
                <Flame className="h-4 w-4 text-orange-300" />
                <span className="text-xs font-semibold text-blue-100">
                  {streak?.current_streak ?? 0} day streak
                </span>
                <Star className="h-3 w-3 text-yellow-300 ml-auto" />
                <Star className="h-3 w-3 text-yellow-300" />
                <Star className="h-3 w-3 text-yellow-300" />
              </div>
            </div>
          </div>

          {/* Your Stats card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-7 w-7 rounded-lg bg-[#29ABE2]/10 flex items-center justify-center">
                <Zap className="h-3.5 w-3.5 text-[#29ABE2]" />
              </div>
              <h4 className="font-bold text-gray-900 text-sm">Your Stats</h4>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Total XP</span>
                <span className="text-sm font-bold text-gray-900">{xp.toLocaleString()}</span>
              </div>
              <div className="h-px bg-gray-100" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Current Rank</span>
                <span className="text-sm font-bold text-[#29ABE2]">#{myRank}</span>
              </div>
              <div className="h-px bg-gray-100" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Next Milestone</span>
                <span className="text-sm font-bold text-gray-900">{nextMilestone.toLocaleString()} XP</span>
              </div>
              <div className="h-px bg-gray-100" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Streak</span>
                <div className="flex items-center gap-1">
                  <Flame className="h-3.5 w-3.5 text-orange-400" />
                  <span className="text-sm font-bold text-gray-900">{streak?.current_streak ?? 0} days</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;

