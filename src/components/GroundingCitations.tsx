import { BookMarked } from "lucide-react";

/**
 * GROUNDING CITATIONS  (Phase 2.4)
 * ================================
 * Lists the syllabus entries and past questions an answer was grounded in.
 *
 * The point is verifiability. A prompt that merely *claims* to follow the
 * syllabus is indistinguishable from one that doesn't; naming the chapter and
 * the paper year lets a student check, and makes the difference between this and
 * a generic chatbot visible rather than asserted.
 *
 * Renders nothing when retrieval found no sources — an empty "Sources" heading
 * would imply grounding that did not happen, which is worse than staying quiet.
 */
const GroundingCitations = ({ labels }: { labels: string[] }) => {
  if (!labels.length) return null;

  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/40 px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <BookMarked className="h-3.5 w-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-semibold text-foreground">
          Grounded in your syllabus
        </span>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {labels.map((label) => (
          <li
            key={label}
            className="text-xs text-muted-foreground bg-background border border-border rounded-md px-2 py-0.5"
          >
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default GroundingCitations;
