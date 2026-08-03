import { Link } from "react-router-dom";
import { RotateCcw, ArrowRight, CheckCircle2 } from "lucide-react";
import { useDueReviews } from "@/lib/insights";
import { useStudentExamContext } from "@/lib/examTracks";

/**
 * DUE FOR REVIEW TODAY (Phase 2.2)
 * ================================
 * Reads `concept_reviews.next_due_at`, which SM-2 maintains server-side after
 * every graded answer. Nothing here computes intervals — the scheduler is the
 * single authority and this is purely a view of it.
 *
 * Overdue items are shown, and labelled as overdue, rather than being folded
 * silently into "today": SM-2 considers exactly those concepts the closest to
 * being forgotten, so hiding the backlog would bury the most urgent work.
 */
const ReviewQueue = () => {
  const { data: due, isLoading } = useDueReviews(8);
  const { data: examCtx } = useStudentExamContext();

  // Without a track there is no syllabus to review against; the countdown
  // already prompts for that, so stay silent instead of adding a second nag.
  if (!examCtx?.examTrackId) return null;

  if (isLoading) {
    return <div className="h-24 rounded-2xl bg-muted animate-pulse" aria-hidden />;
  }

  if (!due?.length) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-success/10 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="h-4 w-4 text-success" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">Nothing due for review</div>
          <div className="text-xs text-muted-foreground">
            Reviews appear here once you've practised — scheduled by how well you did,
            not on a fixed timer.
          </div>
        </div>
      </div>
    );
  }

  const overdueCount = due.filter((d) => d.daysOverdue > 0).length;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <RotateCcw className="h-4 w-4 text-primary flex-shrink-0" />
          <h2 className="text-sm font-bold text-foreground">
            Due for review
            <span className="ml-1.5 font-normal text-muted-foreground">({due.length})</span>
          </h2>
        </div>
        {overdueCount > 0 && (
          <span className="text-xs font-medium text-cta flex-shrink-0">
            {overdueCount} overdue
          </span>
        )}
      </div>

      <ul className="divide-y divide-border">
        {due.map((item) => (
          <li key={item.syllabusNodeId} className="px-4 py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground truncate">{item.name}</div>
              <div className="text-xs text-muted-foreground">
                {item.subject && <span>{item.subject} · </span>}
                {item.daysOverdue > 0
                  ? `${item.daysOverdue} day${item.daysOverdue === 1 ? "" : "s"} overdue`
                  : "due today"}
                {/* Repeated lapses are the signal worth surfacing — this concept
                    keeps slipping, so it deserves more than another quick pass. */}
                {item.lapses > 1 && (
                  <span className="text-cta"> · forgotten {item.lapses}×</span>
                )}
              </div>
            </div>
            {/* Intentionally not a link yet. Acting on a review needs a
                practice route that serves questions from the exam question
                bank for this syllabus node, which does not exist — the legacy
                /quiz engine keys off the old `topics` table and generates
                questions with the LLM, so it cannot practise this concept. A
                button that quietly went somewhere unrelated would be worse
                than none. */}
            <span className="text-xs text-muted-foreground flex-shrink-0 tabular-nums">
              {item.intervalDays}d
            </span>
          </li>
        ))}
      </ul>

      <Link
        to="/progress"
        className="px-4 py-3 border-t border-border flex items-center justify-between text-xs font-medium text-primary hover:bg-muted/40 transition-colors"
      >
        See all scheduled reviews
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
};

export default ReviewQueue;
