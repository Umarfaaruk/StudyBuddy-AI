import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Database, AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import QuestionPlayer, { type CollectedAnswer } from "@/components/QuestionPlayer";
import MistakeReview, { type Mistake } from "@/components/MistakeReview";
import { useStudentExamContext } from "@/lib/examTracks";
import { fetchPracticeSet, type PracticeSet } from "@/lib/practice";
import { gradeAnswers, buildMistakes, type GradeResponse } from "@/lib/grading";
import type { DiagnosticQuestion } from "@/lib/diagnostic";

/**
 * PRACTICE SESSION
 * ================
 * Drills one syllabus concept and feeds the result back into SM-2, closing the
 * loop the review queue depends on: without this the scheduler runs once at the
 * diagnostic and never again.
 *
 * Submitted as sessionType 'review' so the server records these responses
 * distinctly from a diagnostic — later cohort analytics needs to tell "what
 * they knew on arrival" apart from "what they practised since".
 */

type Phase = "loading" | "running" | "submitting" | "done" | "empty" | "error";

const PracticeSession = () => {
  const { nodeId } = useParams<{ nodeId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: examCtx, isLoading: examLoading } = useStudentExamContext();

  const [phase, setPhase] = useState<Phase>("loading");
  const [set, setSet] = useState<PracticeSet | null>(null);
  const [graded, setGraded] = useState<GradeResponse | null>(null);
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const examTrackId = examCtx?.examTrackId ?? null;

  useEffect(() => {
    if (examLoading) return;
    if (!examTrackId) { navigate("/onboarding", { replace: true }); return; }
    if (!nodeId) { navigate("/dashboard", { replace: true }); return; }

    let cancelled = false;
    (async () => {
      try {
        const result = await fetchPracticeSet(examTrackId, nodeId);
        if (cancelled) return;
        setSet(result);
        setPhase(result.empty ? "empty" : "running");
      } catch (err) {
        if (cancelled) return;
        console.error("[practice] fetch failed:", err);
        setErrorMsg((err as Error).message || "Could not load questions.");
        setPhase("error");
      }
    })();
    return () => { cancelled = true; };
  }, [examLoading, examTrackId, nodeId, navigate]);

  const handleComplete = useCallback(async (answers: CollectedAnswer[]) => {
    setPhase("submitting");
    try {
      // 'review' rather than 'practice': this is a scheduled revisit, and the
      // distinction is what lets Phase 3 separate baseline from improvement.
      const response = await gradeAnswers(answers, "review", null);
      setGraded(response);
      setMistakes(buildMistakes(answers, response.results));
      setPhase("done");

      // SM-2 just moved next_due_at and mastery server-side; drop the caches
      // that render them so the dashboard reflects this session immediately.
      queryClient.invalidateQueries({ queryKey: ["due-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["error-patterns"] });
    } catch (err) {
      console.error("[practice] grading failed:", err);
      setErrorMsg((err as Error).message || "Could not submit your answers.");
      setPhase("error");
    }
  }, [queryClient]);

  if (phase === "loading" || examLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
          <Database className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold text-foreground">
          No questions for {set?.nodeName ?? "this topic"} yet
        </h1>
        <p className="text-sm text-muted-foreground">
          Nothing has been published for this chapter, so there's nothing to
          practise. This review stays scheduled until questions exist.
        </p>
        <Button variant="outline" onClick={() => navigate("/dashboard")}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">{errorMsg}</p>
        <Button variant="outline" onClick={() => navigate("/dashboard")}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  if (phase === "submitting") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Scoring your answers…</p>
      </div>
    );
  }

  if (phase === "done" && graded) {
    const pct = graded.total > 0 ? Math.round((graded.correct / graded.total) * 100) : 0;
    return (
      <div className="max-w-2xl mx-auto py-8 space-y-8">
        <div className="text-center space-y-2">
          <div className="h-14 w-14 rounded-2xl bg-success/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-7 w-7 text-success" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {graded.correct} of {graded.total} correct
          </h1>
          <p className="text-sm text-muted-foreground">
            {set?.nodeName} · {pct}%. Your next review has been rescheduled based
            on how you did, not on a fixed timer.
          </p>
        </div>

        <MistakeReview mistakes={mistakes} sessionId={null} />

        <div className="flex gap-2 justify-center">
          <Button onClick={() => navigate("/dashboard")} className="h-11">
            Back to dashboard
          </Button>
          <Button
            variant="outline"
            className="h-11 gap-2"
            onClick={() => window.location.reload()}
          >
            <RotateCcw className="h-4 w-4" /> Practise again
          </Button>
        </div>
      </div>
    );
  }

  if (!set) return null;

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <div className="space-y-1">
        <Link to="/dashboard" className="text-xs text-muted-foreground hover:text-foreground">
          ← Dashboard
        </Link>
        <h1 className="font-display text-xl font-bold text-foreground tracking-tight">
          {set.nodeName}
        </h1>
        {set.subjectName && (
          <p className="text-xs text-muted-foreground">{set.subjectName}</p>
        )}
      </div>

      <QuestionPlayer
        questions={set.questions as DiagnosticQuestion[]}
        onComplete={handleComplete}
        finishLabel="Submit"
      />
    </div>
  );
};

export default PracticeSession;
