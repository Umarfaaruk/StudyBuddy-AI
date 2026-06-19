import { Trophy, Zap, Flame, Users, Crown, Award, Star, UserPlus, UserCheck, Search, X, User as UserIcon, Loader2, Clock, Check } from "lucide-react";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc, limit, Timestamp, documentId } from "firebase/firestore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fetchFriendRecords, friendStatusFor, sendFriendRequest, acceptFriendRequest, type FriendRecord } from "@/lib/friends";

/* ── Profile preview modal (opened from the leaderboard / search) ───────── */
const ProfileModal = ({
  uid,
  currentUid,
  friendRecords,
  onAddFriend,
  onAccept,
  onClose,
}: {
  uid: string;
  currentUid: string;
  friendRecords: FriendRecord[];
  onAddFriend: (uid: string) => void;
  onAccept: (recordId: string, requesterUid: string) => void;
  onClose: () => void;
}) => {
  const { data, isLoading } = useQuery({
    queryKey: ["profile-modal", uid],
    queryFn: async () => {
      const [pSnap, sSnap] = await Promise.all([
        getDoc(doc(db, "profiles", uid)),
        getDoc(doc(db, "user_streaks", uid)),
      ]);
      return {
        profile: pSnap.exists() ? (pSnap.data() as any) : null,
        streak: sSnap.exists() ? (sSnap.data() as any) : null,
      };
    },
  });

  const name = data?.profile?.full_name || "Student";
  const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
  const fs = friendStatusFor(friendRecords, currentUid, uid);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />
      <div
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-[#29ABE2] to-[#29ABE2] px-6 pt-7 pb-10 text-center relative">
          <button onClick={onClose} className="absolute top-3 right-3 h-8 w-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
          <div className="h-20 w-20 rounded-full bg-white/20 ring-4 ring-white/30 flex items-center justify-center text-2xl font-extrabold text-white mx-auto">
            {initials}
          </div>
        </div>
        <div className="px-6 pb-6 -mt-5">
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-[#29ABE2]" /></div>
          ) : (
            <>
              <h3 className="text-center text-lg font-bold text-gray-900 mt-6">{name}</h3>
              {data?.profile?.email && <p className="text-center text-xs text-gray-400 truncate">{data.profile.email}</p>}
              <div className="grid grid-cols-2 gap-3 mt-5">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-[#29ABE2]"><Zap className="h-4 w-4" /><span className="text-lg font-extrabold">{(data?.profile?.total_xp ?? 0).toLocaleString()}</span></div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Total XP</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-orange-500"><Flame className="h-4 w-4" /><span className="text-lg font-extrabold">{data?.streak?.current_streak ?? 0}</span></div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Day streak</p>
                </div>
              </div>
              {currentUid !== uid && (
                <div className="mt-5">
                  {fs.status === "friends" ? (
                    <div className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#29ABE2]/10 text-[#29ABE2]"><UserCheck className="h-4 w-4" /> You're friends</div>
                  ) : fs.status === "pending_sent" ? (
                    <div className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-400"><Clock className="h-4 w-4" /> Request sent</div>
                  ) : fs.status === "pending_received" ? (
                    <button onClick={() => { onAccept(fs.recordId!, uid); onClose(); }} className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-green-500 text-white hover:bg-green-600 transition-all"><Check className="h-4 w-4" /> Accept friend request</button>
                  ) : (
                    <button onClick={() => { onAddFriend(uid); }} className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#29ABE2] text-white hover:bg-[#29ABE2] transition-all"><UserPlus className="h-4 w-4" /> Send friend request</button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const Leaderboard = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"global" | "friends">("global");
  const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'all'>('all');
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [profileUid, setProfileUid] = useState<string | null>(null);

  const { data: myProfile } = useQuery({
    queryKey: ["my-profile", user?.uid],
    queryFn: async () => {
      if (!user) return null;
      const snap = await getDoc(doc(db, "profiles", user.uid));
      return snap.exists() ? snap.data() : null;
    },
    enabled: !!user,
  });

  const { data: streak } = useQuery({
    queryKey: ["streak-lb", user?.uid],
    queryFn: async () => {
      if (!user) return null;
      const snap = await getDoc(doc(db, "user_streaks", user.uid));
      return snap.exists() ? snap.data() : { current_streak: 0 };
    },
    enabled: !!user,
  });

  // ── Friend graph (both directions) ──────────────────────────────────
  const { data: friendRecords = [] } = useQuery<FriendRecord[]>({
    queryKey: ["friend-records", user?.uid],
    queryFn: () => (user ? fetchFriendRecords(user.uid) : Promise.resolve([])),
    enabled: !!user,
  });
  const friendUids = useMemo(
    () =>
      new Set(
        friendRecords
          .filter((r) => r.status === "accepted")
          .map((r) => (r.requester_id === user?.uid ? r.addressee_id : r.requester_id))
      ),
    [friendRecords, user?.uid]
  );
  const refreshFriends = () =>
    queryClient.invalidateQueries({ queryKey: ["friend-records", user?.uid] });

  const myNameEarly = (myProfile as any)?.full_name || user?.displayName || "You";

  const handleAddFriend = async (toUid: string) => {
    if (!user) return;
    const res = await sendFriendRequest(user.uid, myNameEarly, toUid);
    if (res === "sent") toast.success("Friend request sent!");
    else if (res === "exists") toast.info("You're already connected or a request is pending.");
    refreshFriends();
  };
  const handleAccept = async (recordId: string, requesterUid: string) => {
    if (!user) return;
    await acceptFriendRequest(recordId, myNameEarly, requesterUid, user.uid);
    toast.success("You're now friends!");
    refreshFriends();
  };

  // ── Search users by name or email (#4) ──────────────────────────────
  const handleSearch = async () => {
    const term = search.trim();
    if (!term || !user) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const [byName, byEmail] = await Promise.all([
        getDocs(query(collection(db, "profiles"), where("full_name", ">=", term), where("full_name", "<=", term + ""), limit(10))),
        getDocs(query(collection(db, "profiles"), where("email", ">=", term.toLowerCase()), where("email", "<=", term.toLowerCase() + ""), limit(10))),
      ]);
      const map = new Map<string, any>();
      [...byName.docs, ...byEmail.docs].forEach((d) => {
        if (d.id !== user.uid) map.set(d.id, { uid: d.id, ...(d.data() as any) });
      });
      setSearchResults([...map.values()]);
    } catch {
      toast.error("Search failed — try a different term.");
    } finally {
      setSearching(false);
    }
  };

  // ── Leaderboard for the selected window (today / week / all) + scope ──
  const { data: lb } = useQuery({
    queryKey: ["leaderboard", timeFilter, tab, user?.uid, [...friendUids].sort().join(",")],
    queryFn: async () => {
      // Time threshold for the window
      let thr: Date | null = null;
      if (timeFilter === "today") {
        thr = new Date(); thr.setHours(0, 0, 0, 0);
      } else if (timeFilter === "week") {
        thr = new Date();
        const day = thr.getDay();
        thr.setDate(thr.getDate() - (day === 0 ? 6 : day - 1));
        thr.setHours(0, 0, 0, 0);
      }

      // Aggregate XP per user from the event log, DE-DUPLICATING identical
      // entries (same user + amount + source + timestamp = an accidental
      // double-write) so totals are exact.
      const snap = thr
        ? await getDocs(query(collection(db, "xp_logs"), where("created_at", ">=", Timestamp.fromDate(thr))))
        : await getDocs(collection(db, "xp_logs"));
      const seen = new Set<string>();
      const totals = new Map<string, number>();
      snap.forEach((d) => {
        const x = d.data() as any;
        if (!x.user_id || typeof x.xp_amount !== "number") return;
        const ms = x.created_at?.toMillis?.() ?? (x.created_at ? new Date(x.created_at).getTime() : 0);
        const sig = `${x.user_id}|${x.xp_amount}|${x.source_type}|${ms}`;
        if (seen.has(sig)) return;
        seen.add(sig);
        totals.set(x.user_id, (totals.get(x.user_id) || 0) + x.xp_amount);
      });

      const activeCount = totals.size; // distinct users with activity in the window

      let entries = [...totals.entries()].filter(([, v]) => v > 0);
      if (tab === "friends") {
        entries = entries.filter(([uid]) => uid === user?.uid || friendUids.has(uid));
      }
      entries.sort((a, b) => b[1] - a[1]);
      const top = entries.slice(0, 20);

      // Resolve names (profiles are public-read) in chunks of 10
      const uids = top.map(([uid]) => uid);
      const nameMap = new Map<string, string>();
      for (let i = 0; i < uids.length; i += 10) {
        const chunk = uids.slice(i, i + 10);
        if (!chunk.length) continue;
        const psnap = await getDocs(query(collection(db, "profiles"), where(documentId(), "in", chunk)));
        psnap.forEach((p) => nameMap.set(p.id, (p.data() as any).full_name || "Student"));
      }

      const users = top.map(([uid, xpVal], i) => {
        const name = nameMap.get(uid) || "Student";
        return {
          uid,
          name,
          avatar: name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase(),
          xp: xpVal,
          isYou: uid === user?.uid,
          rank: i + 1,
        };
      });
      return { users, activeCount };
    },
    enabled: !!user,
  });

  const xp = (myProfile?.total_xp as number) ?? 0; // all-time XP for the stats cards
  const nextMilestone = Math.ceil(xp / 500) * 500 || 500;

  const displayUsers = lb?.users ?? [];
  const activeCount = lb?.activeCount ?? 0;
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
                  ? "bg-[#29ABE2] text-white shadow-lg shadow-[#29ABE2]/25"
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

      {/* ───── Find & add friends (#4) ───── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 md:p-4">
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name or email to add friends…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              className="pl-9"
            />
          </div>
          <Button onClick={handleSearch} disabled={searching} className="bg-[#29ABE2] hover:bg-[#29ABE2] text-white gap-1.5 shrink-0">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="hidden sm:inline">Search</span>
          </Button>
        </div>

        {searchResults.length > 0 && (
          <div className="mt-3 space-y-1">
            {searchResults.map((p) => {
              const fs = friendStatusFor(friendRecords, user?.uid || "", p.uid);
              return (
                <div key={p.uid} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                    {(p.full_name || "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{p.full_name || "Student"}</p>
                    {p.email && <p className="text-[11px] text-gray-400 truncate">{p.email}</p>}
                  </div>
                  <button
                    onClick={() => setProfileUid(p.uid)}
                    className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-all"
                    title="View profile"
                  >
                    <UserIcon className="h-4 w-4" />
                  </button>
                  {fs.status === "friends" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#29ABE2]/10 text-[#29ABE2] shrink-0"><UserCheck className="h-3 w-3" /> Friends</span>
                  ) : fs.status === "pending_sent" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-gray-100 text-gray-400 shrink-0"><Clock className="h-3 w-3" /> Sent</span>
                  ) : fs.status === "pending_received" ? (
                    <button onClick={() => handleAccept(fs.recordId!, p.uid)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-green-500 text-white hover:bg-green-600 shrink-0"><Check className="h-3 w-3" /> Accept</button>
                  ) : (
                    <button onClick={() => handleAddFriend(p.uid)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#29ABE2] text-white hover:bg-[#29ABE2] shrink-0"><UserPlus className="h-3 w-3" /> Add</button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Active-users summary for the selected window (#6) */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500">
          <Users className="h-3.5 w-3.5 text-[#29ABE2]" />
          {timeFilter === "today" ? (
            <span><b className="text-gray-700">{activeCount}</b> student{activeCount === 1 ? "" : "s"} active today</span>
          ) : timeFilter === "week" ? (
            <span><b className="text-gray-700">{activeCount}</b> student{activeCount === 1 ? "" : "s"} active this week</span>
          ) : (
            <span><b className="text-gray-700">{activeCount}</b> student{activeCount === 1 ? "" : "s"} have earned XP</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6">
        {/* Main leaderboard area */}
        <div className="space-y-6 min-w-0">

          {/* ───── Podium Section ───── */}
          {top3.length >= 3 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 pt-10 pb-8">
              <div className="flex items-end justify-center gap-4 md:gap-6">
                {podiumOrder.map((u) => {
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
                          ? "bg-gradient-to-br from-[#29ABE2] to-[#29ABE2] text-white shadow-md shadow-[#29ABE2]/25"
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

                    {/* Action: Profile + friend status (#5) */}
                    <div className="flex items-center justify-end gap-1.5">
                      {u.isYou ? (
                        <span className="text-[10px] text-gray-400 font-medium">You</span>
                      ) : u.uid ? (
                        <>
                          <button
                            onClick={() => setProfileUid(u.uid)}
                            className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-all"
                            title="View profile"
                          >
                            <UserIcon className="h-3.5 w-3.5" />
                          </button>
                          {(() => {
                            const fs = friendStatusFor(friendRecords, user?.uid || "", u.uid);
                            if (fs.status === "friends")
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#29ABE2]/10 text-[#29ABE2]">
                                  <UserCheck className="h-3 w-3" /> Friends
                                </span>
                              );
                            if (fs.status === "pending_sent")
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-gray-100 text-gray-400">
                                  <Clock className="h-3 w-3" /> Sent
                                </span>
                              );
                            if (fs.status === "pending_received")
                              return (
                                <button
                                  onClick={() => handleAccept(fs.recordId!, u.uid)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-green-500 text-white hover:bg-green-600 shadow-sm transition-all"
                                >
                                  <Check className="h-3 w-3" /> Accept
                                </button>
                              );
                            return (
                              <button
                                onClick={() => handleAddFriend(u.uid)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#29ABE2] text-white hover:bg-[#29ABE2] shadow-sm transition-all"
                              >
                                <UserPlus className="h-3 w-3" /> Add
                              </button>
                            );
                          })()}
                        </>
                      ) : null}
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
                    <stop offset="100%" stopColor="#29ABE2" />
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
          <div className="bg-gradient-to-br from-[#29ABE2] to-[#29ABE2] rounded-2xl shadow-lg shadow-[#29ABE2]/25 p-6 text-white relative overflow-hidden">
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
                  <p className="text-[10px] text-[#29ABE2]">Top Achievement</p>
                </div>
              </div>

              {/* Laurel decoration */}
              <div className="flex items-center justify-center my-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🏆</span>
                  <div className="text-center">
                    <p className="text-xs font-semibold text-[#29ABE2]">Rank #{myRank}</p>
                    <p className="text-lg font-black">{xp.toLocaleString()} XP</p>
                  </div>
                  <span className="text-2xl">🏆</span>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/20">
                <Flame className="h-4 w-4 text-orange-300" />
                <span className="text-xs font-semibold text-[#29ABE2]">
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

      {profileUid && (
        <ProfileModal
          uid={profileUid}
          currentUid={user?.uid || ""}
          friendRecords={friendRecords}
          onAddFriend={handleAddFriend}
          onAccept={handleAccept}
          onClose={() => setProfileUid(null)}
        />
      )}
    </div>
  );
};

export default Leaderboard;

