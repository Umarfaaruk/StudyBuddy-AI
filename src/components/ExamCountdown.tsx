import { Link } from "react-router-dom";
import { CalendarClock, GraduationCap } from "lucide-react";
import { useStudentExamContext } from "@/lib/examTracks";
import { dashboardCopy, fillCopy } from "@/content/examPrepCopy";

/**
 * EXAM COUNTDOWN
 * ==============
 * The single strongest piece of exam-prep framing on the dashboard: it replaces
 * a generic "welcome back" with the one number the student actually cares about.
 *
 * Three states, all handled — a countdown that silently renders nothing when
 * data is missing is worse than one that prompts the student to fix it:
 *   • no track chosen      → prompt to pick one (links to onboarding)
 *   • track, but no date   → show the track alone, no fake number
 *   • track + date         → days remaining, styled urgent under the threshold
 */
const ExamCountdown = () => {
  const { data, isLoading } = useStudentExamContext();

  if (isLoading) {
    return <div className="h-9 w-44 rounded-lg bg-muted animate-pulse" aria-hidden />;
  }

  // No track yet — invite the student to set one rather than rendering nothing.
  if (!data?.track) {
    return (
      <Link
        to="/onboarding"
        className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
      >
        <GraduationCap className="h-4 w-4" />
        {dashboardCopy.noExamSet}
      </Link>
    );
  }

  const { track, daysRemaining } = data;

  // Track chosen but no date: show the exam, omit any number.
  if (daysRemaining === null) {
    return (
      <span className="inline-flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
        <GraduationCap className="h-4 w-4" />
        {track.name}
      </span>
    );
  }

  const urgent = daysRemaining >= 0 && daysRemaining <= dashboardCopy.countdownUrgent;
  const label = fillCopy(dashboardCopy.countdownLabel(daysRemaining), { exam: track.name });

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
        urgent ? "bg-cta/15 text-cta" : "bg-primary/10 text-primary"
      }`}
      // The visual styling carries urgency; give assistive tech the same signal.
      title={`Target exam date: ${data.targetExamDate}`}
    >
      <CalendarClock className="h-4 w-4" />
      {label}
    </span>
  );
};

export default ExamCountdown;
