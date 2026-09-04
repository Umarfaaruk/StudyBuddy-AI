import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  useOnboardingFlow, buildSchemaForQuestions, emptyAnswersFor, isQuestionVisible,
  type FlowType, type OnboardingQuestion,
} from "@/lib/onboardingFlows";

/**
 * QUESTIONNAIRE RENDERER
 * ======================
 * Renders the questionnaire for a `flowType` by fetching that flow's definition
 * and mapping each field type to a control. Adding a question — or a whole new
 * flow — needs no change here, only a registry entry on the server.
 *
 * SWITCHING FLOW CLEARS ALL ANSWERS. This is the requirement that matters most:
 * NEET and GENERAL share field ids (`studyHoursPerDay` appears in both) with
 * DIFFERENT option sets. Carrying answers across would leave "6-8" — a valid
 * NEET option — selected in a GENERAL form whose enum does not contain it, and
 * the mismatch only surfaces at submit as a validation error the student cannot
 * see the cause of. The reset is keyed on flowType so it cannot be forgotten.
 */

interface Props {
  flowType: FlowType;
  /** Lifted so a parent can submit; called on every change. */
  onChange?: (answers: Record<string, unknown>, isValid: boolean) => void;
  /** Server-side validation issues, keyed by field path. */
  serverIssues?: { path: string; message: string }[];
}

const QuestionnaireRenderer = ({ flowType, onChange, serverIssues }: Props) => {
  const { data: flow, isLoading, isError, error } = useOnboardingFlow(flowType);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Tracks which flow the current answers belong to, so a switch is detected
  // even when both flows finish loading out of order.
  const answersFlowRef = useRef<FlowType | null>(null);

  useEffect(() => {
    if (!flow) return;
    if (answersFlowRef.current === flow.flowType) return;
    // Flow changed (or first load): discard everything from the previous flow.
    answersFlowRef.current = flow.flowType;
    setAnswers(emptyAnswersFor(flow.questions));
    setTouched({});
  }, [flow]);

  // Only the questions that currently apply. Recomputed on every answer change
  // so a conditional question appears the moment its trigger is selected.
  const visible = useMemo(
    () => (flow ? flow.questions.filter((q) => isQuestionVisible(q, answers)) : []),
    [flow, answers]
  );

  // Schema is derived from the VISIBLE set, so a hidden conditional field can
  // never block submission with an error the student cannot see.
  const schema = useMemo(
    () => (flow ? buildSchemaForQuestions(flow.questions, answers) : null),
    [flow, answers]
  );

  const clientIssues = useMemo(() => {
    if (!schema) return {} as Record<string, string>;
    const parsed = schema.safeParse(answers);
    if (parsed.success) return {} as Record<string, string>;
    const map: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (!map[key]) map[key] = issue.message;
    }
    return map;
  }, [schema, answers]);

  // Report upward whenever answers change.
  useEffect(() => {
    if (!schema) return;
    onChange?.(answers, schema.safeParse(answers).success);
    // `onChange` is intentionally excluded: parents commonly pass an inline
    // arrow, and depending on it would fire this effect on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, schema]);

  const serverIssueMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const i of serverIssues ?? []) if (!map[i.path]) map[i.path] = i.message;
    return map;
  }, [serverIssues]);

  const setValue = (id: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setTouched((prev) => ({ ...prev, [id]: true }));
  };

  // Loading skeletons, matching the eventual field heights so the layout does
  // not jump when the real questions arrive.
  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading questions">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-2/5 rounded bg-muted animate-pulse" />
            <div className="h-11 w-full rounded-lg bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (isError || !flow) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">Couldn&rsquo;t load these questions</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {(error as Error)?.message ?? "Please try again in a moment."}
          </p>
        </div>
      </div>
    );
  }

  const errorFor = (q: OnboardingQuestion) =>
    serverIssueMap[q.id] ?? (touched[q.id] ? clientIssues[q.id] : undefined);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">{flow.title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{flow.description}</p>
      </div>

      {visible.map((q) => {
        const err = errorFor(q);
        const value = answers[q.id];

        return (
          <div key={q.id} className="space-y-2">
            <label htmlFor={q.id} className="text-sm font-medium text-foreground block">
              {q.label}
              {!q.required && (
                <span className="text-muted-foreground font-normal ml-1.5">(optional)</span>
              )}
            </label>
            {q.help && <p className="text-xs text-muted-foreground">{q.help}</p>}

            {q.type === "single_select" && (
              <div className="flex flex-wrap gap-2">
                {q.options?.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setValue(q.id, opt)}
                    aria-pressed={value === opt}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                      value === opt
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border text-foreground hover:border-primary/40"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {q.type === "multi_select" && (
              <div className="flex flex-wrap gap-2">
                {q.options?.map((opt) => {
                  const list = Array.isArray(value) ? (value as string[]) : [];
                  const on = list.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setValue(q.id, on ? list.filter((v) => v !== opt) : [...list, opt])
                      }
                      className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                        on
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card border-border text-foreground hover:border-primary/40"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === "number" && (
              <input
                id={q.id}
                type="number"
                inputMode="numeric"
                min={q.min}
                max={q.max}
                value={value === null || value === undefined ? "" : String(value)}
                onChange={(e) =>
                  // Empty input is null, not NaN — NaN fails the schema with a
                  // type error that reads as a bug rather than a blank field.
                  setValue(q.id, e.target.value === "" ? null : Number(e.target.value))
                }
                className="w-full h-11 rounded-lg border border-border bg-background px-3 text-sm"
              />
            )}

            {(q.type === "text" || q.type === "textarea") && (
              q.type === "textarea" ? (
                <Textarea
                  id={q.id}
                  rows={3}
                  maxLength={q.maxLength}
                  value={typeof value === "string" ? value : ""}
                  onChange={(e) => setValue(q.id, e.target.value)}
                  className="text-sm bg-background"
                />
              ) : (
                <input
                  id={q.id}
                  type="text"
                  maxLength={q.maxLength}
                  value={typeof value === "string" ? value : ""}
                  onChange={(e) => setValue(q.id, e.target.value)}
                  className="w-full h-11 rounded-lg border border-border bg-background px-3 text-sm"
                />
              )
            )}

            {err && (
              <p role="alert" className="text-xs text-destructive">{err}</p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default QuestionnaireRenderer;
export { Loader2 };
