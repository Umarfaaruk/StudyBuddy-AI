import { useState } from "react";
import { toast } from "sonner";
import { XCircle, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { ERROR_TAG_LABELS, type ErrorTag } from "@/lib/insights";

/**
 * MISTAKE REVIEW + SELF-TAGGING (Phase 2.3 capture)
 * =================================================
 * Shows each wrong answer with the correct one and its explanation, and asks
 * "what went wrong?".
 *
 * The self-tag is the input to the pattern insight on the dashboard. Your spec
 * called for starting with a self-tag and evolving to automatic classification
 * later — the schema already stores whichever produced it, so swapping in a
 * classifier is a write-path change, not a migration.
 *
 * Tagging writes straight to `question_responses` from the client. That is safe
 * here where grading was not: RLS restricts the row to its owner, and an
 * error_tag is the student's own opinion about their mistake — nothing is
 * revealed and nothing can be gamed by setting it.
 *
 * Tagging is optional. A required question here would get clicked through
 * randomly to dismiss it, which is worse than no data at all.
 */

export interface Mistake {
  questionId: string;
  questionText: string;
  options: { id: string; text: string }[];
  topic?: string;
  selectedAnswer: string | null;
  correctAnswer: string | null;
  explanation: string | null;
}

const TAG_OPTIONS: ErrorTag[] = ["conceptual", "calculation", "misread", "rushed", "guessed"];

const MistakeReview = ({ mistakes, sessionId }: { mistakes: Mistake[]; sessionId: string | null }) => {
  const { user } = useAuth();
  const [tagged, setTagged] = useState<Record<string, ErrorTag>>({});
  const [saving, setSaving] = useState<string | null>(null);

  if (!mistakes.length) return null;

  const tag = async (questionId: string, value: ErrorTag) => {
    if (!user) return;
    setSaving(questionId);
    // Optimistic: the chip should respond instantly, and a failed write is
    // recoverable by tapping again.
    setTagged((prev) => ({ ...prev, [questionId]: value }));
    try {
      let q = supabase
        .from("question_responses")
        .update({ error_tag: value })
        .eq("user_id", user.uid)
        .eq("question_id", questionId);
      // Scope to this session so retaking the diagnostic doesn't relabel the
      // earlier attempt's rows for the same question.
      if (sessionId) q = q.eq("session_id", sessionId);
      const { error } = await q;
      if (error) throw error;
    } catch (err) {
      console.error("[MistakeReview] tag failed:", err);
      setTagged((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
      toast.error("Couldn't save that — tap to try again.");
    } finally {
      setSaving(null);
    }
  };

  const labelFor = (m: Mistake, id: string | null) =>
    m.options.find((o) => o.id === id)?.text ?? id ?? "—";

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        <XCircle className="h-4 w-4" /> Review your mistakes ({mistakes.length})
      </h2>
      <p className="text-xs text-muted-foreground">
        Tagging what went wrong is optional, but it's what turns a score into a
        pattern you can fix.
      </p>

      <div className="space-y-3">
        {mistakes.map((m) => (
          <div key={m.questionId} className="rounded-xl border border-border bg-card p-4 space-y-3">
            {m.topic && (
              <div className="text-xs text-muted-foreground">{m.topic}</div>
            )}
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {m.questionText}
            </p>

            <div className="text-xs space-y-1">
              <div className="text-destructive">
                Your answer: {m.selectedAnswer ? labelFor(m, m.selectedAnswer) : "skipped"}
              </div>
              <div className="text-success">
                Correct: {labelFor(m, m.correctAnswer)}
              </div>
            </div>

            {m.explanation && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 leading-relaxed">
                {m.explanation}
              </p>
            )}

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-foreground">What went wrong?</div>
              <div className="flex flex-wrap gap-1.5">
                {TAG_OPTIONS.map((t) => {
                  const active = tagged[m.questionId] === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={saving === m.questionId}
                      onClick={() => tag(m.questionId, t)}
                      aria-pressed={active}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-60 ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {active && <Check className="h-3 w-3 inline mr-1 -mt-0.5" />}
                      {ERROR_TAG_LABELS[t]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default MistakeReview;
