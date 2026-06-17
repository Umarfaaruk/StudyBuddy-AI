import { Link } from "react-router-dom";
import { ArrowLeft, History, MessageSquare } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";

const DoubtHistory = () => {
  const { user } = useAuth();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["doubt-history-full", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      try {
        // Equality-only query (no composite index needed); sorted client-side.
        const q = query(
          collection(db, "doubt_sessions"),
          where("user_id", "==", user.uid)
        );
        const snap = await getDocs(q);
        return snap.docs
          .map((d) => ({
            id: d.id,
            ...d.data()
          } as {
            id: string;
            user_id: string;
            created_at: string;
            title?: string;
            description?: string;
            [key: string]: any;
          }))
          .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
      } catch (error) {
        console.error("[DoubtHistory] Query error:", error);
        return [];
      }
    },
    enabled: !!user,
  });

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <Link to="/doubts" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Doubts
      </Link>

      <div className="flex items-center gap-3">
        <History className="h-6 w-6 text-accent" />
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Doubt History</h1>
          <p className="text-muted-foreground text-sm">Review your past questions and solutions</p>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5">
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))
        ) : sessions?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No doubts asked yet. Start by asking your first question!
          </div>
        ) : (
          sessions?.map((s: any) => (
            <Link
              key={s.id}
              to={`/doubts/session/${s.id}`}
              className="block bg-card border border-border rounded-xl p-5 hover:border-accent/50 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="h-4 w-4 text-navy" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{s.question_preview}</p>
                  <span className="text-xs text-muted-foreground mt-1 block">
                    {s.created_at ? new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : ""}
                  </span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default DoubtHistory;
