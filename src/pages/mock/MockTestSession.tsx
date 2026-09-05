import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Database, AlertTriangle, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import QuestionPlayer, { type CollectedAnswer } from "@/components/QuestionPlayer";
import { useAuth } from "@/contexts/AuthContext";
import { useStudentExamContext } from "@/lib/examTracks";
import { gradeAnswers, rollUpByTopic, buildMistakes } from "@/lib/grading";
import {
  fetchMockTests, buildMockQuestionSet, startMockAttempt,
  completeMockAttempt, captureMasterySnapshot,
  findOpenAttempt, saveMockProgress, loadMockProgress, clearMockProgress,
  type MockTest, type MockQuestionSet,
} from "@/lib/mockTests";
import { deadlineFrom, remainingSeconds, isExpired, resumeDecision } from "@/lib/mockTimer";

/**
 * MOCK TEST SESSION  (Phase 3.1)
 * ==============================
 * Exam conditions: fixed question set, a running clock, no feedback until
 * submission. Its score is the number outcome claims are built from, so it must
 * be produced identically every time.
 *
 * The clock is derived from a wall-clock DEADLINE, never from counting ticks. A
 * setInterval-based countdown drifts, and browsers throttle timers in background
 * tabs — so a student who switched tabs would be handed extra minutes, silently
 * corrupting the comparability the whole feature exists for.
 *
 * THE DEADLINE COMES FROM THE SERVER. It is mock_test_attempts.started_at plus
 * the test duration, never Date.now() at the moment Start was pressed. That
 * distinction is what makes a refresh survivable: reloading resumes the SAME
 * attempt with the SAME deadline, instead of minting a second attempt row and
 * a full fresh clock, which is what this component used to do.
 *
 * Answers are cached in localStorage against the attempt id, together with the
 * QUESTION SET - buildMockQuestionSet reshuffles on every call, so restoring
 * answers without the set they were collected against would attach them to the
 * wrong questions. The cache is a convenience: losing it costs answers, never
 * time, and never affects grading, which re-reads the key server-side.
 */

type Phase = "loading" | "ready" | "resuming" | "running" | "submitting" | "empty" | "error";

const fmt = (totalSeconds: number) => {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

const MockTestSession = () => {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: examCtx, isLoading: examLoading } = useStudentExamContext();

  const [phase, setPhase] = useState<Phase>("loading");
  const [test, setTest] = useState<MockTest | null>(null);
  const [set, setSet] = useState<MockQuestionSet | null>(null);
  const [remaining, setRemaining] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [resumed, setResumed] = useState(false);
  // Set when submission failed but the answers are still in hand, so the
  // student can retry instead of losing a finished test to a dropped network.
  const [canRetrySubmit, setCanRetrySubmit] = useState(false);

  const attemptIdRef = useRef<string | null>(null);
  const deadlineRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);
  const submittingRef = useRef(false);
  // Answers collected so far, so an expiry can submit what exists.
  const answersRef = useRef<CollectedAnswer[]>([]);

  const examTrackId = examCtx?.examTrackId ?? null;

  useEffect(() => {
    if (examLoading) return;
    if (!examTrackId) { navigate("/onboarding", { replace: true }); return; }
    if (!testId) { navigate("/mock", { replace: true }); return; }

    let cancelled = false;
    (async () => {
      try {
        const tests = await fetchMockTests(examTrackId);
        const found = tests.find((t) => t.id === testId);
        if (!found) throw new Error("That mock test is no longer available.");
        if (cancelled) return;
        setTest(found);

        const built = await buildMockQuestionSet(found);
        if (cancelled) return;
        if (built.questions.length === 0) { setSet(built); setPhase("empty"); return; }

        // Is an attempt already running? A refresh, a crashed tab and a closed
        // laptop all land here.
        const open = user ? await findOpenAttempt(user.uid, found.id) : null;
        if (cancelled) return;

        if (open) {
          attemptIdRef.current = open.id;
          startedAtRef.current = open.startedAt;
          deadlineRef.current = deadlineFrom(open.startedAt, found.duration_minutes);

          // Prefer the cached set: it is the one the student actually saw.
          const cached = loadMockProgress(open.id);
          if (cached) {
            answersRef.current = cached.answers;
            setSet({ ...built, questions: cached.questions });
          } else {
            // Cache gone (storage cleared, different browser). Resume with a
            // fresh set but the ORIGINAL deadline: answers are lost, time is
            // not quietly refunded.
            answersRef.current = [];
            setSet(built);
          }
          setResumed(true);
          setPhase("resuming");
          return;
        }

        setSet(built);
        setPhase("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("[mock] load failed:", err);
        setErrorMsg((err as Error).message || "Could not load the test.");
        setPhase("error");
      }
    })();
    return () => { cancelled = true; };
  }, [examLoading, examTrackId, testId, navigate, user]);

  const submit = useCallback(async (answers: CollectedAnswer[], expired = false) => {
    if (submittingRef.current || !test) return;

    // Fail fast while offline rather than firing a grade request that cannot
    // arrive. The answers stay in hand and in localStorage, so retrying once
    // the connection returns submits the real test.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setErrorMsg("You appear to be offline. Your answers are saved - reconnect and try again.");
      setCanRetrySubmit(true);
      setPhase("error");
      return;
    }

    submittingRef.current = true;
    setPhase("submitting");

    try {
      const graded = await gradeAnswers(answers, "mock", attemptIdRef.current);
      const perTopic = rollUpByTopic(answers, graded.results);
      const mistakes = buildMistakes(answers, graded.results);
      const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);

      const { score, percentile } = await completeMockAttempt({
        attemptId: attemptIdRef.current!,
        mockTestId: test.id,
        correctCount: graded.correct,
        totalQuestions: answers.length,
        durationSeconds,
        perTopic,
      });

      // Snapshot AFTER grading, so the captured mastery includes this attempt.
      if (user) await captureMasterySnapshot(user.uid);

      // Submitted; the cache would now only be a stale resume point.
      if (attemptIdRef.current) clearMockProgress(attemptIdRef.current);

      queryClient.invalidateQueries({ queryKey: ["due-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["mock-attempts"] });

      navigate(`/mock/${test.id}/results`, {
        replace: true,
        state: {
          title: test.title, score, percentile, expired,
          correct: graded.correct, total: answers.length,
          durationSeconds, perTopic, mistakes,
        },
      });
    } catch (err) {
      console.error("[mock] submit failed:", err);
      submittingRef.current = false;
      setErrorMsg((err as Error).message || "Could not submit your test.");
      setCanRetrySubmit(true);
      setPhase("error");
    }
  }, [test, user, queryClient, navigate]);

  /**
   * Settle a resumed attempt.
   *
   * Its own effect because the decision needs `submit`, which needs `test` -
   * both of which only exist once the load effect has finished.
   *
   * If the deadline passed while the tab was shut, the test is submitted with
   * whatever was answered. Handing back a fresh clock would make the score
   * incomparable with every other attempt, which is the one thing a mock test
   * cannot afford.
   */
  useEffect(() => {
    if (phase !== "resuming" || !test || !set) return;
    if (resumeDecision(startedAtRef.current, test.duration_minutes, Date.now()) === "submit") {
      void submit(answersRef.current, true);
    } else {
      setPhase("running");
    }
  }, [phase, test, set, submit]);

  // Countdown. Recomputed from the deadline on every tick, so drift and
  // background-tab throttling cannot extend the allotted time.
  useEffect(() => {
    if (phase !== "running" || !test) return;

    const tick = () => {
      const now = Date.now();
      setRemaining(remainingSeconds(deadlineRef.current, now));
      if (isExpired(deadlineRef.current, now)) void submit(answersRef.current, true);
    };
    tick();
    const id = setInterval(tick, 1000);

    // A throttled tab can skip ticks entirely; re-check the moment it is
    // visible again so an expired test submits immediately rather than on the
    // next scheduled tick.
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [phase, test, submit]);

  const begin = useCallback(async () => {
    if (!user || !test || !set) return;
    try {
      const attemptId = await startMockAttempt(user.uid, test, set.questions.length);
      attemptIdRef.current = attemptId;

      // Read the clock back from the row just written, so the deadline is
      // anchored to the same server timestamp a later resume will read.
      const open = await findOpenAttempt(user.uid, test.id);
      startedAtRef.current = open?.startedAt ?? Date.now();
      deadlineRef.current = deadlineFrom(startedAtRef.current, test.duration_minutes);

      answersRef.current = [];
      // Persist the set NOW: a refresh one second later must resume this exact
      // set, not a fresh shuffle.
      saveMockProgress(attemptId, { questions: set.questions, answers: [] });
      setPhase("running");
    } catch (err) {
      console.error("[mock] could not start:", err);
      setErrorMsg((err as Error).message || "Could not start the test.");
      setPhase("error");
    }
  }, [user, test, set]);

  if (phase === "loading" || phase === "resuming" || examLoading) {
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
        <h1 className="text-xl font-bold text-foreground">No questions in scope</h1>
        <p className="text-sm text-muted-foreground">
          Nothing is published for this test&rsquo;s syllabus scope yet, so there is
          nothing to sit.
        </p>
        <Button variant="outline" onClick={() => navigate("/mock")}>Back to tests</Button>
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
        {/* Leaving only a "Back to tests" button here would throw away a
            finished test because a request failed once. */}
        <div className="flex items-center justify-center gap-2">
          {canRetrySubmit && (
            <Button
              onClick={() => {
                setCanRetrySubmit(false);
                submittingRef.current = false;
                void submit(answersRef.current, false);
              }}
            >
              Try submitting again
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate("/mock")}>Back to tests</Button>
        </div>
      </div>
    );
  }

  if (phase === "submitting") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Scoring your test&hellip;</p>
      </div>
    );
  }

  if (phase === "ready" && test && set) {
    return (
      <div className="max-w-lg mx-auto py-16 space-y-6 text-center">
        <h1 className="text-2xl font-bold text-foreground">{test.title}</h1>
        <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
          <span>{set.questions.length} questions</span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> {test.duration_minutes} minutes
          </span>
        </div>
        {/* Say so plainly rather than quietly serving a shorter test — the score
            is comparable across attempts only if the student knows the length. */}
        {set.short && (
          <p className="text-xs text-cta">
            Only {set.questions.length} of {set.requested} questions are published
            for this scope, so this attempt is shorter than the full test.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          The clock starts when you begin and does not pause. You will not see
          whether an answer was right until you submit.
        </p>
        <Button onClick={begin} className="gap-2 h-11">
          Start test <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (!set) return null;

  const urgent = remaining <= 60;

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-lg font-bold text-foreground truncate">
          {test?.title}
        </h1>
        <span
          role="timer"
          aria-live={urgent ? "assertive" : "off"}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold tabular-nums ${
            urgent ? "bg-destructive/15 text-destructive" : "bg-muted text-foreground"
          }`}
        >
          <Clock className="h-4 w-4" />
          {fmt(remaining)}
        </span>
      </div>

      {resumed && (
        <p className="text-xs text-muted-foreground rounded-lg bg-muted px-3 py-2">
          Resumed from where you left off. The clock has kept running since you
          started, so the time left reflects that.
        </p>
      )}

      <QuestionPlayer
        questions={set.questions}
        initialAnswers={answersRef.current}
        onAnswered={(a) => {
          answersRef.current = [...answersRef.current, a];
          // Written after every answer, so an interruption loses at most the
          // question currently on screen.
          if (attemptIdRef.current) {
            saveMockProgress(attemptIdRef.current, {
              questions: set.questions,
              answers: answersRef.current,
            });
          }
        }}
        onComplete={(answers) => void submit(answers)}
        finishLabel="Submit test"
      />
    </div>
  );
};

export default MockTestSession;
