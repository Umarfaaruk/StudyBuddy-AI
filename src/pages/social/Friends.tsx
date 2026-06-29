import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Users, UserPlus, Search, Check, X, Loader2, UserMinus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { sendFriendRequest, acceptFriendRequest, removeFriendRecord } from "@/lib/friends";

const Friends = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: myProfile } = useQuery({
    queryKey: ["friends-my-profile", user?.uid],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.uid).maybeSingle();
      return (data as any) ?? null;
    },
    enabled: !!user,
  });
  const myName = myProfile?.full_name || user?.displayName || "A student";
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Fetch friend records
  const { data: friendRecords = [] } = useQuery({
    queryKey: ["friendRecords", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      try {
        const { data, error } = await supabase
          .from("friendships")
          .select("id, requester_id, addressee_id, status, created_at")
          .or(`requester_id.eq.${user.uid},addressee_id.eq.${user.uid}`);
        if (error) throw error;
        return (data ?? []) as Array<{
          id: string;
          requester_id: string;
          addressee_id: string;
          status: "pending" | "accepted" | "declined";
          created_at?: any;
        }>;
      } catch (error) {
        console.error("[Friends] Fetch records error:", error);
        return [];
      }
    },
    enabled: !!user
  });

  // Fetch profiles for EVERYONE involved (pending + accepted, both directions)
  // so names show on pending requests too — not just accepted friends.
  const relevantIds = Array.from(
    new Set(
      friendRecords
        .flatMap((f) => [f.requester_id, f.addressee_id])
        .filter((id) => id && id !== user?.uid)
    )
  );

  const { data: friendProfiles = [] } = useQuery({
    queryKey: ["friendProfiles", relevantIds.slice().sort().join(",")],
    queryFn: async () => {
      if (relevantIds.length === 0) return [];
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", relevantIds);
        if (error) throw error;
        return (data ?? []).map((d: any) => ({ user_id: d.id, ...d }));
      } catch (error) {
        console.error("[Friends] Fetch profiles error:", error);
        return [];
      }
    },
    enabled: relevantIds.length > 0,
  });

  const profileMap = new Map((friendProfiles ?? []).map((p) => [p.user_id, p]));

  const accepted = (friendRecords ?? []).filter((f) => f.status === "accepted");
  const pendingReceived = (friendRecords ?? []).filter(
    (f) => f.status === "pending" && f.addressee_id === user?.uid
  );
  const pendingSent = (friendRecords ?? []).filter(
    (f) => f.status === "pending" && f.requester_id === user?.uid
  );

  const getInitials = (name: string | null) =>
    (name || "??").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const handleSearch = async () => {
    if (!search.trim() || !user) return;
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .ilike("full_name", `%${search}%`)
        .limit(10);
      if (error) throw error;
      setSearchResults((data ?? []).map((d: any) => ({ user_id: d.id, ...d })));
    } catch (error) {
      console.error("[Friends] Search error:", error);
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = useMutation({
    mutationFn: async (addresseeId: string) => {
      if (!user) return "self" as const;
      return sendFriendRequest(user.uid, myName, addresseeId);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["friendRecords", user?.uid] });
      if (res === "sent") toast.success("Friend request sent!");
      else if (res === "exists") toast.info("Already connected or request pending.");
    },
  });

  const acceptRequest = useMutation({
    mutationFn: async (record: { id: string; requester_id: string }) => {
      await acceptFriendRequest(record.id, myName, record.requester_id, user!.uid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friendRecords", user?.uid] });
      toast.success("You're now friends!");
    },
  });

  const removeFriend = useMutation({
    mutationFn: async (friendId: string) => {
      await removeFriendRecord(friendId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friendRecords", user?.uid] });
      toast.success("Removed");
    }
  });

  // Check if a user is already a friend or has pending request
  const existingIds = new Set((friendRecords ?? []).flatMap((f) => [f.requester_id, f.addressee_id]));

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-accent" />
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Friends</h1>
          <p className="text-muted-foreground text-sm">Study together, improve faster</p>
        </div>
      </div>

      {/* Search / Add friend */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-10 h-10"
          />
        </div>
        <Button onClick={() => handleSearch()} disabled={searching} className="bg-navy text-highlight hover:bg-navy/90 gap-2">
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Search
        </Button>
      </div>

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Search Results</h3>
          {searchResults.map((p) => (
            <div key={p.user_id} className="flex items-center gap-4 bg-card border border-border rounded-xl px-4 py-3">
              <div className="h-10 w-10 rounded-full bg-navy flex items-center justify-center text-highlight text-sm font-bold">
                {getInitials(p.full_name)}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">{p.full_name || "Unknown"}</div>
              </div>
              {existingIds.has(p.user_id) ? (
                <span className="text-xs text-muted-foreground">Already connected</span>
              ) : (
                <Button size="sm" onClick={() => sendRequest.mutate(p.user_id)} disabled={sendRequest.isPending} className="bg-accent text-accent-foreground text-xs gap-1">
                  <UserPlus className="h-3 w-3" /> Add
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pending received */}
      {pendingReceived.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Pending Requests</h3>
          {pendingReceived.map((f) => {
            const profile = profileMap.get(f.requester_id);
            return (
              <div key={f.id} className="flex items-center gap-4 bg-secondary/50 border border-accent/20 rounded-xl px-4 py-3">
                <div className="h-10 w-10 rounded-full bg-navy flex items-center justify-center text-highlight text-sm font-bold">
                  {getInitials(profile?.full_name ?? null)}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">{profile?.full_name || "Unknown"}</div>
                  <div className="text-xs text-muted-foreground">Wants to be friends</div>
                </div>
                <Button size="sm" onClick={() => acceptRequest.mutate({ id: f.id, requester_id: f.requester_id })} disabled={acceptRequest.isPending} className="bg-accent text-accent-foreground text-xs gap-1">
                  <Check className="h-3 w-3" /> Accept
                </Button>
                <button onClick={() => removeFriend.mutate(f.id)} disabled={removeFriend.isPending} className="text-muted-foreground hover:text-destructive disabled:opacity-50">
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Friend list */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">
          Friends {accepted.length > 0 && `(${accepted.length})`}
        </h3>
        {accepted.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center bg-card border border-border rounded-xl">
            No friends yet. Search for people to add!
          </div>
        ) : (
          accepted.map((f) => {
            const friendId = f.requester_id === user?.uid ? f.addressee_id : f.requester_id;
            const profile = profileMap.get(friendId);
            return (
              <div key={f.id} className="flex items-center gap-4 bg-card border border-border rounded-xl px-4 py-3">
                <div className="h-10 w-10 rounded-full bg-navy flex items-center justify-center text-highlight text-sm font-bold">
                  {getInitials(profile?.full_name ?? null)}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">{profile?.full_name || "Unknown"}</div>
                </div>
                <button onClick={() => removeFriend.mutate(f.id)} disabled={removeFriend.isPending} className="text-muted-foreground hover:text-destructive disabled:opacity-50" title="Remove friend">
                  <UserMinus className="h-4 w-4" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Pending sent */}
      {pendingSent.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Sent Requests</h3>
          {pendingSent.map((f) => {
            const profile = profileMap.get(f.addressee_id);
            return (
              <div key={f.id} className="flex items-center gap-4 bg-card border border-border rounded-xl px-4 py-3 opacity-60">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-sm font-bold">
                  {getInitials(profile?.full_name ?? null)}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">{profile?.full_name || "Unknown"}</div>
                  <div className="text-xs text-muted-foreground">Pending</div>
                </div>
                <button onClick={() => removeFriend.mutate(f.id)} disabled={removeFriend.isPending} className="text-muted-foreground hover:text-destructive text-xs disabled:opacity-50">
                  Cancel
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Friends;
