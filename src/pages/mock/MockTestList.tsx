import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Clock, FileText, Loader2, Database, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useStudentExamContext } from "@/lib/examTracks";
import { fetchMockTests, fetchAttemptSeries } from "@/lib/mockTests";

/**
 * MOCK TEST LIST  (Phase 3.1)
 * ===========================
 * Available tests plus the student's own score trend, which is the payoff of
 * the whole phase: a single score means little, two or more show a direction.
 */
const MockTestList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: examCtx, isLoading: examLoading } = useStudentExamContext();
  const trackId = examCtx?.examTrackId ?? null;

  const { data: tests, isLoading } = useQuery({
    queryKey: ["mock-tests", trackId],
    queryFn: () => (trackId ? fetchMockTests(trackId) : Promise.resolve([])),
    enabled: !!trackId,
  });

  const { data: attempts } = useQuery({
    queryKey: ["mock-attempts", user?.uid],
    queryFn: () => (user ? fetchAttemptSeries(user.uid) : Promise.resolve([])),
    enabled: !!user,
  });

  if (examLoading || isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!trackId) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <h1 className="text-xl font-bold text-foreground">Pick your exam first</h1>
        <p className="text-sm text-muted-foreground">
          Mock tests are drawn from your exam&rsquo;s syllabus.
        </p>
        <Button onClick={() => navigate("/onboarding")}>Choose exam</Button>
      </div>
    );
  }

  const completed = attempts ?? [];
  const first = completed[0];
  const latest = completed[completed.length - 1];
  const delta =
    completed.length >= 2 && first?.score != null && latest?.score != null
      ? Number(latest.score) - Number(first.score)
      : null;

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">
          Mock tests
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Timed, exam-condition tests. Scores are comparable across attempts.
        </p>
      </div>

      {/* Trend first: it is the reason to sit another one. */}
      {delta !== null && (
        <div className="rounded-2xl border border-border bg-card p-5 flex items-center gap-4">
          <div className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
            delta >= 0 ? "bg-success/10" : "bg-cta/10"
          }`}>
            <TrendingUp className={`h-5 w-5 ${delta >= 0 ? "text-success" : "text-cta"}`} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">
              {delta >= 0 ? "+" : ""}{Math.round(delta * 10) / 10} points since your first mock
            </div>
            <div className="text-xs text-muted-foreground">
              {Math.round(Number(first.score))}% → {Math.round(Number(latest.score))}%
              {" "}across {completed.length} attempts
            </div>
          </div>
          <Link to="/progress" className="ml-auto text-xs font-medium text-primary hover:underline flex-shrink-0">
            Full progress
          </Link>
        </div>
      )}

      {!tests?.length ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <Database className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">No mock tests yet</h2>
          <p className="text-xs text-muted-foreground">
            An administrator can create them under Admin → Mock Tests.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tests.map((t) => (
            <Link
              key={t.id}
              to={`/mock/${t.id}`}
              className="block rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                    <span>{t.question_count} questions</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {t.duration_minutes} min
                    </span>
                    <span className="capitalize">{t.scope.replace("_", " ")}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default MockTestList;
