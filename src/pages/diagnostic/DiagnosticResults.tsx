import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { Target, TrendingUp, CalendarDays, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useStudentExamContext } from "@/lib/examTracks";
import { rankWeakestTopics, type PerTopicResult } from "@/lib/diagnostic";
import MistakeReview, { type Mistake } from "@/components/MistakeReview";
import { generateStudyPlan, saveStudyPlan, DEFAULT_HORIZON_DAYS, type GeneratedPlan } from "@/lib/studyPlan";
import { captureMasterySnapshot } from "@/lib/mockTests";

/**
 * DIAGNOSTIC RESULTS
 * ==================
 * Shows the per-topic breakdown and generates the initial study plan.
 *
 * Reads the result from router state rather than re-querying: the numbers were
 * just computed and re-deriving them risks showing something subtly different
 * from what the student was told a second ago. A direct visit with no state
 * falls back to the dashboard instead of inventing a result.
 *
 * Per-topic scores are shown BEFORE the overall score. An aggregate percentage
 * is the least actionable number here — "58%" tells a student nothing, whereas
 * "Kinematics 20%, Thermodynamics 80%" tells them exactly what to do next.
 */

interface ResultState {
  sessionId: string | null;
  perTopic: PerTopicResult[];
  correct: number;
  total: number;
  mistakes?: Mistake[];
}

const scoreColour = (score: number) =>
  score < 25 ? "text-destructive" : score < 50 ? "text-cta" : score < 75 ? "text-foreground" : "text-success";

const barColour = (score: number) =>
  score < 25 ? "bg-destructive" : score < 50 ? "bg-cta" : score < 75 ? "bg-primary" : "bg-success";

const DiagnosticResults = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: examCtx } = useStudentExamContext();

  const state = location.state as ResultState | null;
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [saving, setSaving] = useState(true);

  const ranked = useMemo(
    () => (state?.perTopic ? rankWeakestTopics(state.perTopic) : []),
    [state]
  );

  // Generate and persist the plan once, on arrival.
  useEffect(() => {
    if (!state?.perTopic?.length || !user) {
      setSaving(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // No exam date means no real horizon; use a sane default rather than
        // refusing to plan, since the student can add the date later.
        const horizon =
          examCtx?.daysRemaining && examCtx.daysRemaining > 0
            ? examCtx.daysRemaining
            : DEFAULT_HORIZON_DAYS;

        // Baseline snapshot: without one the outcome series would start at the
        // first mock test, losing the "before" half of a before/after story.
        await captureMasterySnapshot(user.uid);

        const generated = generateStudyPlan(state.perTopic, horizon);
        if (cancelled) return;
        setPlan(generated);
        await saveStudyPlan(user.uid, generated, examCtx?.targetExamDate ?? null);
      } catch (err) {
        console.error("[diagnostic] plan generation failed:", err);
        // The results themselves are still valuable — don't blank the page.
        toast.error("Your results are saved, but the study plan couldn't be created.");
      } finally {
        if (!cancelled) setSaving(false);
      }
    })();
    return () => { cancelled = true; };
  }, [state, user, examCtx]);

  if (!state?.perTopic?.length) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <h1 className="text-xl font-bold text-foreground">No diagnostic result to show</h1>
        <p className="text-sm text-muted-foreground">
          Take the diagnostic to see your per-topic breakdown.
        </p>
        <div className="flex gap-2 justify-center">
          <Button onClick={() => navigate("/diagnostic")}>Take diagnostic</Button>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>Dashboard</Button>
        </div>
      </div>
    );
  }

  const overall = state.total > 0 ? Math.round((state.correct / state.total) * 100) : 0;
  const weakest = ranked.filter((t) => t.score < 50);

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-8">
      <div className="space-y-1">
        <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground tracking-tight">
          Your {examCtx?.track?.name ?? "exam"} diagnostic
        </h1>
        <p className="text-sm text-muted-foreground">
          {state.correct} of {state.total} correct ({overall}%) — but the per-topic
          breakdown below is what actually matters.
        </p>
      </div>

      {/* Per-topic breakdown, weakest first */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Target className="h-4 w-4" /> Topic breakdown
        </h2>
        <div className="space-y-2">
          {ranked.map((t) => (
            <div key={t.syllabusNodeId} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{t.name}</div>
                  {t.subject && (
                    <div className="text-xs text-muted-foreground">{t.subject}</div>
                  )}
                </div>
                <div className={`text-sm font-bold tabular-nums ${scoreColour(t.score)}`}>
                  {t.score}%
                  <span className="text-muted-foreground font-normal ml-1.5 text-xs">
                    {t.correct}/{t.total}
                  </span>
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div className={`h-full ${barColour(t.score)}`} style={{ width: `${t.score}%` }} />
              </div>
            </div>
          ))}
        </div>
        {/* Honesty about sample size: 2 questions on a chapter is a hint, not a verdict. */}
        <p className="text-xs text-muted-foreground">
          Scores from a short diagnostic are an early signal, not a final judgement —
          they sharpen as you practise.
        </p>
      </section>

      {/* Weak-topic callout */}
      {weakest.length > 0 && (
        <section className="rounded-2xl border border-cta/30 bg-cta/5 p-5 space-y-2">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-cta" />
            {weakest.length} topic{weakest.length === 1 ? "" : "s"} need attention first
          </h2>
          <p className="text-sm text-muted-foreground">
            {weakest.slice(0, 4).map((t) => t.name).join(", ")}
            {weakest.length > 4 ? `, and ${weakest.length - 4} more` : ""}.
          </p>
        </section>
      )}

      {/* Mistake review + self-tagging (Phase 2.3 capture) */}
      <MistakeReview mistakes={state.mistakes ?? []} sessionId={state.sessionId} />

      {/* Generated plan */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <CalendarDays className="h-4 w-4" /> Your study plan
        </h2>

        {saving ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Building your plan…
          </div>
        ) : !plan ? (
          <p className="text-sm text-muted-foreground">
            Couldn't build a plan automatically. Your results are saved — you can
            still practise weak topics from the dashboard.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Paced over {plan.horizonDays} days
              {examCtx?.targetExamDate ? " until your exam" : " (no exam date set)"}.
              Weakest topics scheduled first.
            </p>
            <div className="space-y-2">
              {plan.items.slice(0, 8).map((item) => (
                <div key={`${item.date}-${item.syllabusNodeId}`} className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
                  <div className="text-xs text-muted-foreground tabular-nums w-20 flex-shrink-0 pt-0.5">
                    {new Date(item.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground">{item.topic}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{item.reason}</div>
                  </div>
                  <div className="text-xs font-medium text-muted-foreground flex-shrink-0">
                    {item.minutes}m
                  </div>
                </div>
              ))}
            </div>
            {plan.items.length > 8 && (
              <Link to="/planner" className="text-sm text-primary hover:underline inline-block">
                View the full {plan.items.length}-day plan →
              </Link>
            )}
          </>
        )}
      </section>

      <div className="flex gap-2">
        <Button onClick={() => navigate("/dashboard")} className="h-11">Go to dashboard</Button>
        <Button variant="outline" onClick={() => navigate("/planner")} className="h-11">
          Open planner
        </Button>
      </div>
    </div>
  );
};

export default DiagnosticResults;
