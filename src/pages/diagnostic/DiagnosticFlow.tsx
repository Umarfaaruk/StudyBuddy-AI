import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Loader2, Database, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useStudentExamContext } from "@/lib/examTracks";
import { getAuthHeaders } from "@/lib/authHeaders";
import {
  fetchDiagnosticPool, buildAdaptiveSequence, nextDifficultyIndex,
  startDiagnosticSession, completeDiagnosticSession,
  DIAGNOSTIC_LENGTH, DIAGNOSTIC_MIN_QUESTIONS,
  type DiagnosticQuestion, type PerTopicResult,
} from "@/lib/diagnostic";

/**
 * ADAPTIVE DIAGNOSTIC
 * ===================
 * One question at a time, difficulty tracking performance, submitted for
 * SERVER-SIDE grading because the client has no access to the answer key.
 *
 * Answers are collected locally and graded in ONE batch at the end rather than
 * per question. Two reasons: grading per question would reveal correctness
 * mid-test and change how the student answers the rest (defeating the point of
 * a diagnostic), and it would also let them infer answers by watching results.
 */

type Phase = "loading" | "ready" | "running" | "submitting" | "insufficient" | "error";

interface RecordedAnswer {
  questionId: string;
  selectedAnswer: string | null;
  timeTakenMs: number;
  question: DiagnosticQuestion;
}

const DiagnosticFlow = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: examCtx, isLoading: examLoading } = useStudentExamContext();

  const [phase, setPhase] = useState<Phase>("loading");
  const [sequence, setSequence] = useState<DiagnosticQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState<RecordedAnswer[]>([]);
  const [availableCount, setAvailableCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const sessionIdRef = useRef<string | null>(null);
  const questionStartRef = useRef<number>(Date.now());
  const difficultyIdxRef = useRef(1);
  // Guards against a double-submit producing two graded sessions.
  const submittingRef = useRef(false);

  const examTrackId = examCtx?.examTrackId ?? null;

  useEffect(() => {
    if (examLoading) return;
    if (!examTrackId) {
      // Cannot diagnose against a syllabus the student hasn't chosen.
      navigate("/onboarding", { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const pool = await fetchDiagnosticPool(examTrackId);
        if (cancelled) return;
        setAvailableCount(pool.availableCount);
        if (pool.insufficient) {
          setPhase("insufficient");
          return;
        }
        const seq = buildAdaptiveSequence(pool.questions, DIAGNOSTIC_LENGTH);
        setSequence(seq);
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
        user.uid, examTrackId, sequence.length
      );
      questionStartRef.current = Date.now();
      setPhase("running");
    } catch (err) {
      console.error("[diagnostic] could not start session:", err);
      toast.error("Could not start the diagnostic. Please try again.");
    }
  }, [user, examTrackId, sequence.length]);

  const current = sequence[index];

  const submitAll = useCallback(async (finalAnswers: RecordedAnswer[]) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPhase("submitting");

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          sessionType: "diagnostic",
          sessionId: sessionIdRef.current,
          answers: finalAnswers.map((a) => ({
            questionId: a.questionId,
            selectedAnswer: a.selectedAnswer,
            timeTakenMs: a.timeTakenMs,
          })),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Grading failed (${res.status})`);
      }
      const graded = await res.json();

      // Roll the graded results up per chapter for the snapshot + plan.
      const correctById = new Map<string, boolean>(
        (graded.results ?? []).map((r: any) => [r.questionId, !!r.isCorrect])
      );
      const rollup = new Map<string, PerTopicResult>();
      for (const a of finalAnswers) {
        const nodeId = a.question.syllabus_node_id;
        if (!nodeId) continue;
        const entry = rollup.get(nodeId) ?? {
          syllabusNodeId: nodeId,
          name: a.question.syllabusName ?? "Unknown topic",
          subject: a.question.subjectName,
          correct: 0, total: 0, score: 0,
        };
        entry.total += 1;
        if (correctById.get(a.questionId)) entry.correct += 1;
        rollup.set(nodeId, entry);
      }
      const perTopic = [...rollup.values()].map((t) => ({
        ...t,
        score: t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0,
      }));

      if (sessionIdRef.current) {
        await completeDiagnosticSession(
          sessionIdRef.current, perTopic, graded.correct ?? 0
        );
      }

      navigate("/diagnostic/results", {
        replace: true,
        state: { sessionId: sessionIdRef.current, perTopic, correct: graded.correct, total: finalAnswers.length },
      });
    } catch (err) {
      console.error("[diagnostic] submit failed:", err);
      submittingRef.current = false;
      setErrorMsg((err as Error).message || "Could not submit your answers.");
      setPhase("error");
    }
  }, [navigate]);

  const answerCurrent = useCallback(() => {
    if (!current) return;
    const recorded: RecordedAnswer = {
      questionId: current.id,
      selectedAnswer: selected,
      timeTakenMs: Date.now() - questionStartRef.current,
      question: current,
    };
    const nextAnswers = [...answers, recorded];
    setAnswers(nextAnswers);
    setSelected(null);

    // Difficulty steps on the student's own sense of the answer being right is
    // not available (no client-side key), so step on whether they committed to
    // an option at all — a skip is treated as a miss.
    difficultyIdxRef.current = nextDifficultyIndex(
      difficultyIdxRef.current, selected !== null
    );

    if (index + 1 >= sequence.length) {
      void submitAll(nextAnswers);
    } else {
      setIndex(index + 1);
      questionStartRef.current = Date.now();
    }
  }, [current, selected, answers, index, sequence.length, submitAll]);

  const progressPct = useMemo(
    () => (sequence.length === 0 ? 0 : Math.round((index / sequence.length) * 100)),
    [index, sequence.length]
  );

  /* ── States ────────────────────────────────────────────────────────────── */

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
          {sequence.length}-question diagnostic
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

  if (!current) return null;

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Question {index + 1} of {sequence.length}</span>
          {current.subjectName && (
            <span>{current.subjectName}{current.syllabusName ? ` › ${current.syllabusName}` : ""}</span>
          )}
        </div>
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <p className="text-base text-foreground leading-relaxed whitespace-pre-wrap">
          {current.question_text}
        </p>

        <div className="space-y-2">
          {current.options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSelected(opt.id)}
              aria-pressed={selected === opt.id}
              className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                selected === opt.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-foreground hover:border-primary/40"
              }`}
            >
              <span className="font-semibold mr-2 uppercase">{opt.id}.</span>
              {opt.text}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        {/* Skipping is allowed and recorded as unanswered — forcing a guess
            would pollute the mastery signal we are trying to measure. */}
        <button
          type="button"
          onClick={answerCurrent}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Skip
        </button>
        <Button onClick={answerCurrent} disabled={selected === null} className="gap-2 h-11">
          {index + 1 >= sequence.length ? "Finish" : "Next"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default DiagnosticFlow;
