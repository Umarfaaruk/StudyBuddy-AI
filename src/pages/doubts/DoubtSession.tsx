import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Sparkles, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import ReactMarkdown from "react-markdown";

const DoubtSession = () => {
  const { id } = useParams();
  const { user } = useAuth();

  const { data: messages, isLoading } = useQuery({
    queryKey: ["doubt-session", id],
    queryFn: async () => {
      if (!user || !id) return [];
      try {
        // Equality-only query (no orderBy) avoids needing a composite index.
        // Messages are sorted client-side by created_at below.
        const q = query(
          collection(db, "doubt_messages"),
          where("user_id", "==", user.uid),
          where("doubt_session_id", "==", id)
        );
        const snap = await getDocs(q);
        return snap.docs
          .map((d) => ({
            id: d.id,
            ...d.data()
          } as {
            id: string;
            role: "user" | "assistant";
            message_text: string;
            created_at: string;
            doubt_session_id: string;
          }))
          .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
      } catch (error) {
        console.error("[DoubtSession] Query error:", error);
        return [];
      }
    },
    enabled: !!user && !!id,
  });

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <Link to="/doubts/history" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to History
      </Link>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : messages?.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-12">No messages found for this session.</p>
      ) : (
        messages?.map((msg: any) => (
          <div key={msg.id} className="bg-card border border-border rounded-xl p-5 space-y-2">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              {msg.role === "user" ? (
                <>
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">Your Question</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-accent" />
                  <span className="text-xs font-semibold text-foreground">AI Solution</span>
                </>
              )}
              {msg.created_at && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(msg.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
            {msg.role === "user" ? (
              <p className="text-sm text-foreground font-medium">{msg.message_text}</p>
            ) : (
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{msg.message_text}</ReactMarkdown>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};

export default DoubtSession;
