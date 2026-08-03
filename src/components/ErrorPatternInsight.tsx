import { Lightbulb } from "lucide-react";
import { useErrorPatterns, type ErrorTag } from "@/lib/insights";

/**
 * ERROR PATTERN INSIGHT (Phase 2.3)
 * =================================
 * Surfaces *how* a student is losing marks, not just how many.
 *
 * "You scored 60%" is a number they already feel. "4 sign errors in Kinematics
 * this week" is something they can act on tomorrow morning — that difference is
 * the whole point of the feature.
 *
 * Renders nothing until a pattern clears the threshold in `useErrorPatterns`.
 * An empty "no patterns yet" card every day trains students to ignore the slot,
 * and a "pattern" declared off one mistake would make the feature untrustworthy
 * the first time it was wrong.
 */

/** What to actually do about each kind of mistake. */
const REMEDY: Record<ErrorTag, string> = {
  conceptual: "Re-read the theory before attempting more problems here.",
  calculation: "Slow down on the algebra and check signs before selecting.",
  misread: "Underline what the question is asking before you start solving.",
  rushed: "These are marks you already know how to get — give them the extra 20 seconds.",
  guessed: "Worth studying properly rather than relying on elimination.",
  unknown: "Tag what went wrong next time so this gets more specific.",
};

const ErrorPatternInsight = () => {
  const { data: patterns, isLoading } = useErrorPatterns();

  if (isLoading || !patterns?.length) return null;

  const top = patterns.slice(0, 3);

  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-primary flex-shrink-0" />
        <h2 className="text-sm font-bold text-foreground">Patterns in your mistakes</h2>
      </div>

      <ul className="space-y-2.5">
        {top.map((p) => (
          <li key={`${p.tag}-${p.topic}`} className="space-y-0.5">
            <div className="text-sm font-medium text-foreground">{p.message}</div>
            <div className="text-xs text-muted-foreground">{REMEDY[p.tag]}</div>
          </li>
        ))}
      </ul>

      {patterns.length > top.length && (
        <p className="text-xs text-muted-foreground">
          +{patterns.length - top.length} more pattern
          {patterns.length - top.length === 1 ? "" : "s"} across other topics.
        </p>
      )}
    </div>
  );
};

export default ErrorPatternInsight;
