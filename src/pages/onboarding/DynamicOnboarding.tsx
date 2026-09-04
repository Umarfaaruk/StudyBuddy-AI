import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import BrandMark from "@/components/BrandMark";
import QuestionnaireRenderer from "@/components/onboarding/QuestionnaireRenderer";
import DeploymentHealthNotice from "@/components/onboarding/DeploymentHealthNotice";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthHeaders } from "@/lib/authHeaders";
import { submitOnboarding, FLOW_LABELS, type FlowType } from "@/lib/onboardingFlows";

/**
 * DYNAMIC ONBOARDING  (flow registry)
 * ===================================
 * Flow picker, then a questionnaire rendered entirely from server-supplied
 * definitions.
 *
 * DECOUPLED BY DESIGN: this page owns no questions, no validation rules and no
 * persistence schema. It selects a flow type and hands off. Adding, reordering
 * or revalidating questions — or adding a whole new flow — happens in the
 * server registry with no change here, which is the point of the requirement
 * that onboarding be updatable without touching core app logic.
 *
 * The deployment health notice is rendered ABOVE the form and never gates it. A
 * student cannot fix an unreachable third-party service, and blocking their
 * signup over one converts somebody else's outage into our lost registration.
 */

const FLOWS: FlowType[] = ["NEET", "GENERAL"];

const DynamicOnboarding = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [flowType, setFlowType] = useState<FlowType | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [isValid, setIsValid] = useState(false);
  const [serverIssues, setServerIssues] = useState<{ path: string; message: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Switching flow discards the previous answers.
   *
   * NEET and GENERAL share field ids with different option sets, so carrying
   * state across would leave a value that is valid in one flow and rejected by
   * the other — surfacing only at submit, as an error the student cannot trace.
   * QuestionnaireRenderer resets its own internal state on the same signal;
   * this clears the lifted copy so the two cannot disagree.
   */
  const selectFlow = useCallback((next: FlowType) => {
    setFlowType((prev) => {
      if (prev !== next) {
        setAnswers({});
        setIsValid(false);
        setServerIssues([]);
      }
      return next;
    });
  }, []);

  const handleChange = useCallback((next: Record<string, unknown>, valid: boolean) => {
    setAnswers(next);
    setIsValid(valid);
    // Stale server errors must not linger after the student edits the field
    // they were complaining about.
    setServerIssues((prev) => (prev.length ? [] : prev));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!flowType || !user) return;
    setSubmitting(true);
    setServerIssues([]);
    try {
      const headers = await getAuthHeaders();
      const result = await submitOnboarding(flowType, answers, headers);

      if (!result.ok) {
        // Field-level issues render inline; anything else gets a toast, so a
        // failure is never silent.
        if (result.issues?.length) {
          setServerIssues(result.issues);
          toast.error("Please check the highlighted answers.");
        } else {
          toast.error(result.error ?? "Could not save your answers.");
        }
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["profile-onboarding-check", user.uid] });
      queryClient.invalidateQueries({ queryKey: ["profile", user.uid] });
      toast.success("You're all set.");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("[DynamicOnboarding] submit failed:", err);
      toast.error("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [flowType, user, answers, queryClient, navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <BrandMark size="md" />
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-8 space-y-6">
        {/* Advisory only — never blocks the flow below it. */}
        <DeploymentHealthNotice />

        <div>
          <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">
            Let&rsquo;s set you up
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pick what you&rsquo;re preparing for and we&rsquo;ll tailor the questions.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {FLOWS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => selectFlow(f)}
              aria-pressed={flowType === f}
              className={`text-left px-4 py-3.5 rounded-xl border transition-colors ${
                flowType === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-foreground hover:border-primary/40"
              }`}
            >
              <div className="text-sm font-semibold">{FLOW_LABELS[f]}</div>
              <div
                className={`text-xs mt-0.5 ${
                  flowType === f ? "text-primary-foreground/80" : "text-muted-foreground"
                }`}
              >
                {f === "NEET"
                  ? "Academic background and exam preparation"
                  : "General profile and study preferences"}
              </div>
            </button>
          ))}
        </div>

        {flowType && (
          <>
            {/* Keyed on flowType so React remounts on a switch — belt and braces
                alongside the renderer's own reset. */}
            <QuestionnaireRenderer
              key={flowType}
              flowType={flowType}
              onChange={handleChange}
              serverIssues={serverIssues}
            />

            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                {isValid ? "Ready to submit" : "Answer the required questions to continue"}
              </p>
              <Button
                onClick={handleSubmit}
                disabled={!isValid || submitting}
                className="h-11 gap-2"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                ) : (
                  <>Finish <ArrowRight className="h-4 w-4" /></>
                )}
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default DynamicOnboarding;
