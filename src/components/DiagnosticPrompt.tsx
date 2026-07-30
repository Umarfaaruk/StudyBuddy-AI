import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Target, ArrowRight, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useStudentExamContext } from "@/lib/examTracks";

/**
 * DIAGNOSTIC PROMPT (dashboard)
 * =============================
 * Surfaces the diagnostic to students who haven't taken it, and gets out of the
 * way once they have.
 *
 * Renders nothing at all in three cases — no exam track, still loading, or a
 * completed diagnostic older than nothing to say. A permanent "take the
 * diagnostic" banner for someone who already did is the fastest way to make a
 * dashboard feel ignored.
 */
const DiagnosticPrompt = () => {
  const { user } = useAuth();
  const { data: examCtx } = useStudentExamContext();

  const { data: latest, isLoading } = useQuery({
    queryKey: ["latest-diagnostic", user?.uid],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("diagnostic_sessions")
        .select("id, status, correct_count, total_questions, completed_at")
        .eq("user_id", user.uid)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  // Nothing useful to say without a chosen track — the exam countdown already
  // prompts for that, and two prompts for the same thing is noise.
  if (isLoading || !examCtx?.examTrackId) return null;

  if (latest) {
    const pct =
      latest.total_questions > 0
        ? Math.round((latest.correct_count / latest.total_questions) * 100)
        : 0;
    return (
      <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-success/10 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="h-4.5 w-4.5 text-success" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">Diagnostic complete</div>
          <div className="text-xs text-muted-foreground">
            Scored {pct}% overall. Your plan is built from the per-topic breakdown.
          </div>
        </div>
        <Link
          to="/diagnostic"
          className="text-xs font-medium text-primary hover:underline flex-shrink-0"
        >
          Retake
        </Link>
      </div>
    );
  }

  return (
    <Link
      to="/diagnostic"
      className="block rounded-2xl border border-primary/30 bg-primary/5 p-5 hover:border-primary/50 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
          <Target className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-foreground">
            Start with a diagnostic
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            A short adaptive test across the {examCtx.track?.name} syllabus finds the
            chapters costing you the most marks, then builds your study plan around them.
          </p>
        </div>
        <ArrowRight className="h-4 w-4 text-primary flex-shrink-0 mt-1" />
      </div>
    </Link>
  );
};

export default DiagnosticPrompt;
