import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DiagnosticQuestion } from "@/lib/diagnostic";

/**
 * QUESTION PLAYER
 * ===============
 * Presents one question at a time and collects answers. Shared by the
 * diagnostic and by practice sessions so there is a single implementation of
 * the answering experience — the two differ in how questions are *chosen* and
 * what happens *after*, not in how a question is shown.
 *
 * Purely presentational + local state. It never grades, never writes, and never
 * sees a correct answer: grading is server-side, so there is nothing here that
 * could leak a key even by accident.
 */

export interface CollectedAnswer {
  questionId: string;
  selectedAnswer: string | null;
  timeTakenMs: number;
  question: DiagnosticQuestion;
}

interface Props {
  questions: DiagnosticQuestion[];
  /** Called once, with every answer, when the last question is submitted. */
  onComplete: (answers: CollectedAnswer[]) => void;
  /** Notified after each answer so a parent can adapt difficulty. */
  onAnswered?: (answer: CollectedAnswer, index: number) => void;
  /**
   * How many questions this session will ask.
   *
   * Required by the adaptive diagnostic, which appends the next question only
   * AFTER seeing the current answer — its `questions` array is length 1 at the
   * start, so finishing on `questions.length` would end the test immediately.
   * Defaults to the array length for callers that know every question up front.
   */
  totalExpected?: number;
  /** Skipping records an unanswered response rather than forcing a guess. */
  allowSkip?: boolean;
  finishLabel?: string;
  /**
   * Answers already collected, for resuming an interrupted session.
   *
   * Read ONCE, as the initial state. Treating it as a controlled prop would
   * fight the component's own state on every answer. The player resumes at
   * index `initialAnswers.length`, so the caller must pass the SAME question
   * set these answers were collected against.
   */
  initialAnswers?: CollectedAnswer[];
}

const QuestionPlayer = ({
  questions,
  onComplete,
  onAnswered,
  totalExpected,
  allowSkip = true,
  finishLabel = "Finish",
  initialAnswers,
}: Props) => {
  // Lazy initialisers: `initialAnswers` seeds the first render only, so a
  // parent that rebuilds the array on each render cannot reset progress.
  const [index, setIndex] = useState(() => initialAnswers?.length ?? 0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState<CollectedAnswer[]>(() => initialAnswers ?? []);

  const questionStartRef = useRef<number>(Date.now());
  // Guards a double-click on the final question from completing twice.
  const completedRef = useRef(false);

  // Reset the timer whenever the visible question changes, so time-taken is
  // per question rather than cumulative — the scheduler reads it as a fluency
  // signal and a cumulative value would make every later answer look laboured.
  useEffect(() => {
    questionStartRef.current = Date.now();
  }, [index]);

  const current = questions[index];
  const total = totalExpected ?? questions.length;

  const commit = useCallback(() => {
    if (!current || completedRef.current) return;

    const answer: CollectedAnswer = {
      questionId: current.id,
      selectedAnswer: selected,
      timeTakenMs: Date.now() - questionStartRef.current,
      question: current,
    };
    const next = [...answers, answer];
    setAnswers(next);
    setSelected(null);
    // Fires first so a parent can append the next question in the same React
    // batch as the index change below — otherwise the new index would render
    // before its question exists.
    onAnswered?.(answer, index);

    if (index + 1 >= total) {
      completedRef.current = true;
      onComplete(next);
    } else {
      setIndex(index + 1);
    }
  }, [current, selected, answers, index, total, onComplete, onAnswered]);

  if (!current) return null;

  const progressPct = Math.round((index / total) * 100);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Question {index + 1} of {total}</span>
          {current.subjectName && (
            <span className="truncate max-w-[60%] text-right">
              {current.subjectName}
              {current.syllabusName ? ` › ${current.syllabusName}` : ""}
            </span>
          )}
        </div>
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
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
        {allowSkip ? (
          <button
            type="button"
            onClick={commit}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Skip
          </button>
        ) : <span />}
        <Button onClick={commit} disabled={selected === null} className="gap-2 h-11">
          {index + 1 >= total ? finishLabel : "Next"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default QuestionPlayer;
