import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Target, Lock, ArrowRight, Database, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import BrandMark from "@/components/BrandMark";
import QuestionPlayer, { type CollectedAnswer } from "@/components/QuestionPlayer";
import { useExamTracks } from "@/lib/examTracks";
import { landingCopy } from "@/content/examPrepCopy";
import {
  fetchFreeTestQuestions, gradeFreeTest, captureLead, weakestFirst,
  FREE_TEST_LENGTH, PARTIAL_TOPIC_COUNT,
  type FreeTestResult,
} from "@/lib/freeTest";
import type { DiagnosticQuestion } from "@/lib/diagnostic";

/**
 * FREE DIAGNOSTIC  (Phase 4.2)
 * ============================
 * Public, no signup. Take a short test → see one or two weak topics
 * immediately → leave an email or phone to unlock the full breakdown.
 *
 * Deliberately shows a REAL partial result before the gate. A gate placed
 * before any value is just a signup wall with extra steps; showing the two
 * weakest topics first proves the thing works and makes the rest worth asking
 * for.
 *
 * Renders its own shell rather than AppLayout — there is no session here, and
 * the app chrome assumes one.
 */

type Phase = "picking" | "loading" | "testing" | "scoring" | "partial" | "full" | "empty" | "error";

const FreeTest = () => {
  const { data: tracks, isLoading: tracksLoading } = useExamTracks();
  const [trackId, setTrackId] = useState("");
  const [phase, setPhase] = useState<Phase>("picking");
  const [questions, setQuestions] = useState<DiagnosticQuestion[]>([]);
  const [result, setResult] = useState<FreeTestResult | null>(null);
  const [answers, setAnswers] = useState<CollectedAnswer[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // A single track needs no picker — auto-select and get straight to the test.
  useEffect(() => {
    if (!trackId && tracks?.length === 1) setTrackId(tracks[0].id);
  }, [tracks, trackId]);

  const start = useCallback(async () => {
    if (!trackId) return;
    setPhase("loading");
    try {
      const qs = await fetchFreeTestQuestions(trackId, FREE_TEST_LENGTH);
      if (qs.length === 0) { setPhase("empty"); return; }
      setQuestions(qs);
      setPhase("testing");
    } catch (err) {
      console.error("[FreeTest] load failed:", err);
      setErrorMsg((err as Error).message || "Could not load the test.");
      setPhase("error");
    }
  }, [trackId]);

  const handleComplete = useCallback(async (collected: CollectedAnswer[]) => {
    setAnswers(collected);
    setPhase("scoring");
    try {
      const scored = await gradeFreeTest(
        collected.map((a) => ({ questionId: a.questionId, selectedAnswer: a.selectedAnswer }))
      );
      setResult(scored);
      setPhase("partial");
    } catch (err) {
      console.error("[FreeTest] scoring failed:", err);
      setErrorMsg((err as Error).message || "Could not score your test.");
      setPhase("error");
    }
  }, []);

  const unlock = useCallback(async () => {
    if (!result) return;
    if (!email.trim() && !phone.trim()) {
      toast.error("Add an email or phone number so we can send your report.");
      return;
    }
    setSaving(true);
    try {
      await captureLead({
        email, phone, name, examTrackId: trackId,
        answers: answers.map((a) => ({ questionId: a.questionId, selectedAnswer: a.selectedAnswer })),
        result,
      });
      setPhase("full");
    } catch (err) {
      console.error("[FreeTest] lead capture failed:", err);
      toast.error("Couldn't save that — please try again.");
    } finally {
      setSaving(false);
    }
  }, [result, email, phone, name, trackId, answers]);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link to="/"><BrandMark size="md" /></Link>
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Log in
          </Link>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-10">{children}</main>
    </div>
  );

  if (phase === "empty") {
    return (
      <Shell>
        <div className="text-center space-y-4 py-12">
          <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <Database className="h-7 w-7 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">The free test isn&rsquo;t ready yet</h1>
          <p className="text-sm text-muted-foreground">
            No questions are published for this exam yet. Please check back shortly.
          </p>
        </div>
      </Shell>
    );
  }

  if (phase === "error") {
    return (
      <Shell>
        <div className="text-center space-y-4 py-12">
          <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
          <Button variant="outline" onClick={() => setPhase("picking")}>Try again</Button>
        </div>
      </Shell>
    );
  }

  if (phase === "loading" || phase === "scoring") {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {phase === "scoring" ? "Scoring your answers…" : "Building your test…"}
          </p>
        </div>
      </Shell>
    );
  }

  if (phase === "testing") {
    return (
      <Shell>
        <QuestionPlayer
          questions={questions}
          onComplete={handleComplete}
          finishLabel="See my result"
        />
      </Shell>
    );
  }

  if ((phase === "partial" || phase === "full") && result) {
    const ranked = weakestFirst(result.perTopic);
    const shown = phase === "full" ? ranked : ranked.slice(0, PARTIAL_TOPIC_COUNT);
    const hidden = ranked.length - shown.length;

    return (
      <Shell>
        <div className="space-y-8">
          <div className="text-center space-y-2">
            <h1 className="font-display text-2xl font-bold text-foreground">
              {phase === "full" ? "Your full report" : "Your weakest topics"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {result.correct} of {result.total} correct
            </p>
          </div>

          <div className="space-y-2">
            {shown.map((t) => (
              <div key={t.syllabusNodeId} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">{t.name}</div>
                    {t.subject && <div className="text-xs text-muted-foreground">{t.subject}</div>}
                  </div>
                  <div className="text-sm font-bold tabular-nums text-foreground">
                    {t.score}%
                    <span className="text-muted-foreground font-normal ml-1.5 text-xs">
                      {t.correct}/{t.total}
                    </span>
                  </div>
                </div>
                <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${t.score < 50 ? "bg-cta" : "bg-primary"}`}
                    style={{ width: `${t.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {phase === "partial" && hidden > 0 && (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary flex-shrink-0" />
                <h2 className="text-sm font-bold text-foreground">
                  {hidden} more topic{hidden === 1 ? "" : "s"} in your full report
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Get the complete breakdown and a study plan built around your exam date.
              </p>

              <div className="space-y-2">
                <input
                  value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Your name (optional)"
                  className="w-full h-11 rounded-lg border border-border bg-background px-3 text-sm"
                />
                <input
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  type="email" inputMode="email" placeholder="Email"
                  className="w-full h-11 rounded-lg border border-border bg-background px-3 text-sm"
                />
                <input
                  value={phone} onChange={(e) => setPhone(e.target.value)}
                  type="tel" inputMode="tel" placeholder="Phone (optional)"
                  className="w-full h-11 rounded-lg border border-border bg-background px-3 text-sm"
                />
              </div>

              <Button onClick={unlock} disabled={saving} className="w-full h-11 gap-2">
                {saving ? "Unlocking…" : "Show my full report"}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                We&rsquo;ll only use this to send your report and study plan.
              </p>
            </div>
          )}

          {phase === "full" && (
            <div className="rounded-2xl border border-border bg-card p-5 text-center space-y-3">
              <Target className="h-6 w-6 text-primary mx-auto" />
              <h2 className="text-sm font-bold text-foreground">Turn this into a study plan</h2>
              <p className="text-xs text-muted-foreground">
                Create a free account and we&rsquo;ll carry these results across — no need
                to sit the test again.
              </p>
              <Button asChild className="h-11">
                <Link to="/signup">{landingCopy.primaryCta}</Link>
              </Button>
            </div>
          )}
        </div>
      </Shell>
    );
  }

  // Track picker
  return (
    <Shell>
      <div className="space-y-6 py-6">
        <div className="text-center space-y-2">
          <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground tracking-tight">
            Find your weak topics in {FREE_TEST_LENGTH} questions
          </h1>
          <p className="text-sm text-muted-foreground">
            No signup, no card. Answer a few questions and see exactly where you&rsquo;re
            losing marks.
          </p>
        </div>

        {tracksLoading ? (
          <div className="grid gap-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-[72px] rounded-xl border border-border bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : !tracks?.length ? (
          <p className="text-sm text-muted-foreground text-center">
            No exams are available yet. Please check back shortly.
          </p>
        ) : (
          <>
            <div className="grid gap-2">
              {tracks.map((t) => (
                <button
                  key={t.id} type="button" onClick={() => setTrackId(t.id)}
                  aria-pressed={trackId === t.id}
                  className={`text-left px-4 py-3.5 rounded-xl border transition-colors ${
                    trackId === t.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border text-foreground hover:border-primary/40"
                  }`}
                >
                  <div className="text-sm font-semibold">{t.name}</div>
                  {t.description && (
                    <div className={`text-xs mt-0.5 ${
                      trackId === t.id ? "text-primary-foreground/80" : "text-muted-foreground"
                    }`}>
                      {t.description}
                    </div>
                  )}
                </button>
              ))}
            </div>
            <Button onClick={start} disabled={!trackId} className="w-full h-11 gap-2">
              Start free test <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </Shell>
  );
};

export default FreeTest;
