import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Loader2, Database, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useStudentExamContext } from "@/lib/examTracks";
import QuestionPlayer, { type CollectedAnswer } from "@/components/QuestionPlayer";
import { gradeAnswers, rollUpByTopic, buildMistakes } from "@/lib/grading";
import {
  fetchDiagnosticPool, groupPool, buildChapterOrder, pickQuestion,
  nextDifficultyIndex, startDiagnosticSession, completeDiagnosticSession,
  DIAGNOSTIC_LENGTH, DIAGNOSTIC_MIN_QUESTIONS,
  type DiagnosticQuestion, type GroupedPool,
} from "@/lib/diagnostic";

/**
 * ADAPTIVE DIAGNOSTIC
 * ===================
 * One question at a time, difficulty responding to performance, graded
 * SERVER-SIDE because the client has no access to the answer key.
 *
 * Questions are chosen ONE AT A TIME rather than as a fixed list. A pre-built
 * sequence cannot be adaptive by construction — every question would be picked
 * before a single answer existed. Chapter order is still fixed up front, since
 * coverage must not depend on how well the student is doing.
 *
 * Answers are graded in ONE batch at the end. Grading per question would reveal
 * correctness mid-test and change how the student answers the rest, defeating
 * the measurement, and would let them infer answers from the pattern.
 *
 * Adaptivity steps on whether the student ANSWERED, not whether they were
 * right: correctness is unknowable client-side by design. Committing to an
 * option is a usable confidence proxy; a skip reads as struggling.
 */

type Phase = "loading" | "ready" | "running" | "submitting" | "insufficient" | "error";

const DiagnosticFlow = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: examCtx, isLoading: examLoading } = useStudentExamContext();

  const [phase, setPhase] = useState<Phase>("loading");
  const [visible, setVisible] = useState<DiagnosticQuestion[]>([]);
  const [availableCount, setAvailableCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const groupedRef = useRef<GroupedPool>(new Map());
  const chapterOrderRef = useRef<string[]>([]);
  const usedRef = useRef<Set<string>>(new Set());
  const difficultyIdxRef = useRef(1); // start at medium — most informative probe
  const plannedLengthRef = useRef(DIAGNOSTIC_LENGTH);
  const sessionIdRef = useRef<string | null>(null);
  const submittingRef = useRef(false);

  const examTrackId = examCtx?.examTrackId ?? null;

  useEffect(() => {
    if (examLoading) return;
    if (!examTrackId) { navigate("/onboarding", { replace: true }); return; }

    let cancelled = false;
    (async () => {
      try {
        const pool = await fetchDiagnosticPool(examTrackId);
        if (cancelled) return;
        setAvailableCount(pool.availableCount);
        if (pool.insufficient) { setPhase("insufficient"); return; }

        groupedRef.current = groupPool(pool.questions);
        chapterOrderRef.current = buildChapterOrder(groupedRef.current);
        plannedLengthRef.current = Math.min(DIAGNOSTIC_LENGTH, pool.availableCount);
        setPhase("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("[diagnostic] pool fetch failed:", err);
        setErrorMsg((err as Error).message || "Could not load the diagnostic.");
        setPhase("error");
      }
    })();
    return () => { cancelled = true; };
  }, [examLoading, examTrackId, navigate]);

  const begin = useCallback(async () => {
    if (!user || !examTrackId) return;
    try {
      sessionIdRef.current = await startDiagnosticSession(
        user.uid, examTrackId, plannedLengthRef.current
      );
      const first = pickQuestion(
        groupedRef.current, chapterOrderRef.current, 0,
        difficultyIdxRef.current, usedRef.current
      );
      if (!first) { setPhase("insufficient"); return; }
      usedRef.current.add(first.id);
      setVisible([first]);
      setPhase("running");
    } catch (err) {
      console.error("[diagnostic] could not start session:", err);
      toast.error("Could not start the diagnostic. Please try again.");
    }
  }, [user, examTrackId]);

  /**
   * After each answer, step the difficulty and append the next question. The
   * player renders `visible`, so growing it drives the test forward.
   */
  const handleAnswered = useCallback((answer: CollectedAnswer, index: number) => {
    difficultyIdxRef.current = nextDifficultyIndex(
      difficultyIdxRef.current, answer.selectedAnswer !== null
    );
    if (index + 1 >= plannedLengthRef.current) return;

    const next = pickQuestion(
      groupedRef.current, chapterOrderRef.current, index + 1,
      difficultyIdxRef.current, usedRef.current
    );
    if (!next) {
      // Bank exhausted — end cleanly at what we have rather than stalling.
      plannedLengthRef.current = index + 1;
      return;
    }
    usedRef.current.add(next.id);
    setVisible((prev) => [...prev, next]);
  }, []);

  const handleComplete = useCallback(async (answers: CollectedAnswer[]) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPhase("submitting");

    try {
      const graded = await gradeAnswers(answers, "diagnostic", sessionIdRef.current);
      const perTopic = rollUpByTopic(answers, graded.results);
      const mistakes = buildMistakes(answers, graded.results);

      if (sessionIdRef.current) {
        await completeDiagnosticSession(sessionIdRef.current, perTopic, graded.correct);
      }

      navigate("/diagnostic/results", {
        replace: true,
        state: {
          sessionId: sessionIdRef.current,
          perTopic,
          correct: graded.correct,
          total: answers.length,
          mistakes,
        },
      });
    } catch (err) {
      console.error("[diagnostic] submit failed:", err);
      submittingRef.current = false;
      setErrorMsg((err as Error).message || "Could not submit your answers.");
      setPhase("error");
    }
  }, [navigate]);

  if (phase === "loading" || examLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (phase === "insufficient") {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
          <Database className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Diagnostic not ready yet</h1>
        <p className="text-sm text-muted-foreground">
          This exam track has {availableCount} published question
          {availableCount === 1 ? "" : "s"}. A diagnostic needs at least{" "}
          {DIAGNOSTIC_MIN_QUESTIONS} to say anything useful about your strengths.
        </p>
        <p className="text-xs text-muted-foreground">
          An administrator can add questions under Admin → Question Bank, then publish them.
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

  if (phase === "ready") {
    return (
      <div className="max-w-lg mx-auto py-16 space-y-6 text-center">
        <h1 className="text-2xl font-bold text-foreground">
          {plannedLengthRef.current}-question diagnostic
        </h1>
        <p className="text-sm text-muted-foreground">
          This spans your whole {examCtx?.track?.name} syllabus and adapts as you go.
          You won't see whether an answer was right until the end — that's deliberate,
          so the result reflects what you actually know.
        </p>
        <p className="text-xs text-muted-foreground">
          Answer honestly rather than guessing; a wrong answer here saves you weeks later.
        </p>
        <Button onClick={begin} className="gap-2 h-11">
          Start diagnostic <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (phase === "submitting") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Scoring your diagnostic…</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <QuestionPlayer
        questions={visible}
        totalExpected={plannedLengthRef.current}
        onAnswered={handleAnswered}
        onComplete={handleComplete}
        finishLabel="Finish"
      />
    </div>
  );
};

export default DiagnosticFlow;
