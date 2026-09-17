import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchLatestAttemptResult } from "@/lib/mockTests";
import { Trophy, Clock, TrendingUp, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import MistakeReview, { type Mistake } from "@/components/MistakeReview";
import { rankWeakestTopics, type PerTopicResult } from "@/lib/diagnostic";
import TestimonialPrompt from "@/components/TestimonialPrompt";
import ShareCard from "@/components/ShareCard";

/**
 * MOCK TEST RESULTS  (Phase 3.1)
 * ==============================
 * Score, percentile, per-topic breakdown, and the mistakes worth reviewing.
 *
 * The percentile is shown ONLY when the database returned one. It is null below
 * a minimum sample, because a "92nd percentile" computed from three attempts is
 * noise dressed as a statistic — and this figure is exactly the kind that ends
 * up in an outcome claim, so it has to refuse to exist rather than mislead.
 */

interface ResultState {
  title: string;
  score: number;
  percentile: number | null;
  correct: number;
  total: number;
  durationSeconds: number;
  perTopic: PerTopicResult[];
  mistakes: Mistake[];
  expired: boolean;
}

/**
 * Only offer the share card for a result worth boasting about. The colour
 * bands below treat anything under 60 as needing work; asking a student to
 * broadcast a weak score to WhatsApp would be tone-deaf, so the prompt starts
 * comfortably clear of that line rather than appearing on every result.
 */
const SHAREABLE_SCORE = 70;

const scoreColour = (s: number) =>
  s < 35 ? "text-destructive" : s < 60 ? "text-cta" : s < 80 ? "text-foreground" : "text-success";

const barColour = (s: number) =>
  s < 35 ? "bg-destructive" : s < 60 ? "bg-cta" : s < 80 ? "bg-primary" : "bg-success";

const MockTestResults = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { testId } = useParams();
  const { user } = useAuth();
  const routerState = location.state as ResultState | null;

  /**
   * Router state carries the full result straight after submitting, but it does
   * not survive a reload or a revisit from history — which used to leave a
   * student staring at "No result to show" for a test they had just finished
   * and which was already saved. When it is missing, read the attempt back from
   * the database instead.
   *
   * The recovered view has no `mistakes`: rebuilding those needs the answer key
   * in question_answers, which is server-side only by design, so the review
   * section below hides itself and says where it went rather than rendering
   * empty.
   */
  const { data: recovered, isLoading: recovering } = useQuery({
    queryKey: ["mock-result", user?.uid, testId],
    queryFn: () => fetchLatestAttemptResult(user!.uid, testId!),
    enabled: !routerState && !!user && !!testId,
    staleTime: 1000 * 60 * 5,
  });

  const state: ResultState | null = routerState ?? (recovered
    ? { ...recovered, mistakes: [], expired: false }
    : null);

  // Recovered results are the only ones missing the question-by-question
  // review, so the note below is shown for exactly those.
  const isRecovered = !routerState && !!recovered;

  if (!state && recovering) {
    return (
      <div className="max-w-lg mx-auto py-16 flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading your result…</p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <h1 className="text-xl font-bold text-foreground">No result to show</h1>
        <p className="text-sm text-muted-foreground">
          We couldn&rsquo;t find a finished attempt for this test on your account.
        </p>
        <Button onClick={() => navigate("/mock")}>Back to tests</Button>
      </div>
    );
  }

  const ranked = rankWeakestTopics(state.perTopic);
  const mins = Math.floor(state.durationSeconds / 60);
  const secs = state.durationSeconds % 60;

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-8">
      <div className="text-center space-y-3">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Trophy className="h-7 w-7 text-primary" />
        </div>
        <h1 className="font-display text-2xl font-bold text-foreground">{state.title}</h1>
        <div className={`text-4xl font-bold tabular-nums ${scoreColour(state.score)}`}>
          {state.score}%
        </div>
        <p className="text-sm text-muted-foreground">
          {state.correct} of {state.total} correct
          <span className="mx-2">·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {mins}m {secs}s
          </span>
        </p>

        {state.expired && (
          <p className="text-xs text-cta inline-flex items-center gap-1.5 justify-center">
            <AlertTriangle className="h-3.5 w-3.5" />
            Time ran out — your answers so far were submitted automatically.
          </p>
        )}

        {state.percentile !== null ? (
          <div className="inline-flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-1.5 text-sm font-medium text-success">
            <TrendingUp className="h-4 w-4" />
            Ahead of {state.percentile}% of attempts on this test
          </div>
        ) : (
          // Explain the absence rather than hiding the row — a missing
          // percentile looks like a bug otherwise.
          <p className="text-xs text-muted-foreground">
            Percentile appears once enough students have attempted this test.
          </p>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Topic breakdown
        </h2>
        <div className="space-y-2">
          {ranked.map((t) => (
            <div key={t.syllabusNodeId} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{t.name}</div>
                  {t.subject && <div className="text-xs text-muted-foreground">{t.subject}</div>}
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
      </section>

      {isRecovered ? (
        <p className="text-xs text-muted-foreground text-center">
          Your score and topic breakdown were restored from this attempt. The
          question-by-question review is only shown immediately after
          submitting.
        </p>
      ) : (
        <MistakeReview mistakes={state.mistakes ?? []} sessionId={null} />
      )}

      {/* Milestone-triggered testimonial capture (Phase 3.5) — self-hiding. */}
      <TestimonialPrompt latestScore={state.score} />

      {/* Growth loop (Phase 4.3): a strong result is the moment a student is
          most willing to tell a friend. The card's default link points at the
          free test, so the share lands somewhere a non-user can act on. */}
      {state.score >= SHAREABLE_SCORE && (
        <ShareCard
          headline={`${state.score}% on ${state.title}`}
          subline={
            state.percentile !== null
              ? `Ahead of ${state.percentile}% of attempts`
              : `${state.correct} of ${state.total} correct`
          }
        />
      )}

      <div className="flex gap-2">
        <Button onClick={() => navigate("/progress")} className="h-11">See your progress</Button>
        <Button variant="outline" onClick={() => navigate("/mock")} className="h-11">
          More tests
        </Button>
      </div>
    </div>
  );
};

export default MockTestResults;
