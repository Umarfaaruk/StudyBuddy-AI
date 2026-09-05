import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Loader2, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import BrandMark from "@/components/BrandMark";
import QuestionnaireRenderer from "@/components/onboarding/QuestionnaireRenderer";
import DeploymentHealthNotice from "@/components/onboarding/DeploymentHealthNotice";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthHeaders } from "@/lib/authHeaders";
import { useExamTracks } from "@/lib/examTracks";
import { onboardingCopy } from "@/content/examPrepCopy";
import {
  submitOnboarding, flowTypeForExamTrack, stripHiddenAnswers,
  useOnboardingFlow, type FlowType,
} from "@/lib/onboardingFlows";
import {
  isMinor, dateOfBirthIssue, guardianIssues, consentStepComplete,
  emptyGuardian, GUARDIAN_RELATIONSHIPS, type GuardianDetails,
} from "@/lib/guardianConsent";

/**
 * ONBOARDING  (exam-aware, registry-driven)
 * =========================================
 * Three steps: pick the exam, give a target date, answer questions chosen FOR
 * that exam.
 *
 * The questions adapt to the student on two axes:
 *   • WHICH FLOW — derived from the exam track, so a JEE candidate is asked
 *     about percentiles and IITs while a NEET candidate is asked about a score
 *     out of 720. A student with no track gets the GENERAL profile flow.
 *   • WHICH QUESTIONS — `showIf` rules hide what cannot apply. A first-time
 *     candidate is never asked for a previous score; asking would invite an
 *     invented answer.
 *
 * EXAM TRACK IS CAPTURED HERE, FIRST, AND DELIBERATELY. The diagnostic, exam
 * countdown, RAG grounding, practice sets and mock tests all key off
 * profiles.exam_track_id. A student finishing onboarding without one reaches a
 * dashboard where every exam feature says "pick your exam" — so this replaced
 * the legacy flow only once it captured the same thing.
 */

type Step = "exam" | "date" | "age" | "questions";

const DynamicOnboarding = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: tracks, isLoading: tracksLoading } = useExamTracks();

  const [step, setStep] = useState<Step>("exam");
  const [examTrackId, setExamTrackId] = useState<string | null>(null);
  const [targetDate, setTargetDate] = useState("");
  const [dateUnknown, setDateUnknown] = useState(false);

  // Age and, for a minor, guardian consent. Collected BEFORE the questionnaire
  // because the questionnaire is where the bulk of personal data is gathered,
  // and a child's data should not be collected before consent exists for it.
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [guardian, setGuardian] = useState<GuardianDetails>(emptyGuardian);
  const [consentTouched, setConsentTouched] = useState(false);

  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [isValid, setIsValid] = useState(false);
  const [serverIssues, setServerIssues] = useState<{ path: string; message: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Tracks grouped by category, preserving sort_order within each group and
   * ordering the groups by their first member. With JEE, NEET and two GATE
   * papers the flat list stopped reading as a set of choices; a GATE candidate
   * should see "GATE" once and pick a paper under it.
   *
   * Rows predating the category column fall into "Other exams" rather than
   * vanishing — an unlabelled exam must still be selectable.
   */
  const groupedTracks = useMemo(() => {
    const groups = new Map<string, typeof tracks>();
    for (const t of tracks ?? []) {
      const key = t.category?.trim() || "Other exams";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    return [...groups.entries()];
  }, [tracks]);

  // The flow follows the exam. Changing exam therefore changes the questions.
  const flowType: FlowType = useMemo(
    () => flowTypeForExamTrack(examTrackId),
    [examTrackId]
  );

  // Needed at submit time to strip answers to questions no longer visible.
  const { data: flow } = useOnboardingFlow(step === "questions" ? flowType : null);

  /**
   * Changing exam discards answers.
   *
   * Flows share field ids (`weakSubjects` exists in both JEE and NEET) with
   * DIFFERENT option sets — "Mathematics" is valid for JEE and rejected by
   * NEET. Carrying answers across would surface only at submit, as an error
   * whose cause is off-screen.
   */
  const selectExam = useCallback((id: string) => {
    setExamTrackId((prev) => {
      if (prev !== id) {
        setAnswers({});
        setIsValid(false);
        setServerIssues([]);
      }
      return id;
    });
  }, []);

  const handleChange = useCallback((next: Record<string, unknown>, valid: boolean) => {
    setAnswers(next);
    setIsValid(valid);
    setServerIssues((prev) => (prev.length ? [] : prev));
  }, []);

  // Recomputed on every render so the guardian block appears the moment a
  // date of birth under 18 is entered.
  const dobIssue = dateOfBirth ? dateOfBirthIssue(dateOfBirth) : null;
  const minorNow = isMinor(dateOfBirth);
  const gIssues = guardianIssues(guardian);
  const consentReady = consentStepComplete(dateOfBirth, guardian);

  const handleSubmit = useCallback(async () => {
    if (!user || !flow) return;
    setSubmitting(true);
    setServerIssues([]);
    try {
      const headers = await getAuthHeaders();
      const result = await submitOnboarding(
        {
          flowType,
          dateOfBirth: dateOfBirth || null,
          // Only sent when it applies. The server decides who is a minor from
          // the date of birth, so sending a guardian block for an adult would
          // simply be ignored.
          guardian: minorNow ? guardian : null,
          // Hidden answers are stripped: the server rejects a value for a
          // question that does not apply, which is what a stale conditional
          // answer looks like.
          answers: stripHiddenAnswers(flow.questions, answers),
          examTrackId,
          targetExamDate: dateUnknown ? null : targetDate || null,
        },
        headers
      );

      if (!result.ok) {
        if (result.issues?.length) {
          setServerIssues(result.issues);
          toast.error("Please check the highlighted answers.");
        } else {
          toast.error(result.error ?? "Could not save your answers.");
        }
        return;
      }

      // The dashboard, countdown and diagnostic all read these immediately.
      queryClient.invalidateQueries({ queryKey: ["profile-onboarding-check", user.uid] });
      queryClient.invalidateQueries({ queryKey: ["profile", user.uid] });
      queryClient.invalidateQueries({ queryKey: ["student-exam-context", user.uid] });

      toast.success("You're all set.");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("[Onboarding] submit failed:", err);
      toast.error("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [user, flow, flowType, answers, examTrackId, targetDate, dateUnknown,
      dateOfBirth, guardian, minorNow, queryClient, navigate]);

  const stepIndex = step === "exam" ? 0 : step === "date" ? 1 : step === "age" ? 2 : 3;
  const TOTAL_STEPS = 4;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <BrandMark size="md" />
        </div>
      </header>

      <div className="w-full bg-muted h-1.5">
        <div
          className="bg-primary h-1.5 rounded-r-full transition-all duration-500"
          style={{ width: `${((stepIndex + 1) / TOTAL_STEPS) * 100}%` }}
        />
      </div>

      <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-8 space-y-6">
        {/* Advisory only — never gates the flow beneath it. */}
        <DeploymentHealthNotice />

        {/* ── Step 1: exam ───────────────────────────────────────── */}
        {step === "exam" && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex h-12 w-12 rounded-2xl bg-primary/10 items-center justify-center">
                <GraduationCap className="h-6 w-6 text-primary" />
              </div>
              <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">
                {onboardingCopy.examPickerLabel}
              </h1>
              <p className="text-sm text-muted-foreground">{onboardingCopy.examPickerHelp}</p>
            </div>

            {tracksLoading ? (
              <div className="grid gap-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-[72px] rounded-xl border border-border bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid gap-2">
                {groupedTracks.map(([category, group]) => (
                  <div key={category} className="grid gap-2">
                    {/* Only worth a heading once a category holds more than one
                        paper — a lone "NEET" under a "Medical Entrance" label is
                        a heading that says nothing. */}
                    {(group?.length ?? 0) > 1 && (
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-2">
                        {category}
                      </div>
                    )}
                    {(group ?? []).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => selectExam(t.id)}
                        aria-pressed={examTrackId === t.id}
                        className={`text-left px-4 py-3.5 rounded-xl border transition-colors ${
                          examTrackId === t.id
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card border-border text-foreground hover:border-primary/40"
                        }`}
                      >
                        <div className="text-sm font-semibold">{t.name}</div>
                        {t.description && (
                          <div className={`text-xs mt-0.5 ${
                            examTrackId === t.id ? "text-primary-foreground/80" : "text-muted-foreground"
                          }`}>
                            {t.description}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                ))}

                {/* Never a dead end: someone preparing for something we do not
                    yet support still gets a profile and a working account. */}
                <button
                  type="button"
                  onClick={() => selectExam("")}
                  aria-pressed={examTrackId === ""}
                  className={`text-left px-4 py-3.5 rounded-xl border transition-colors ${
                    examTrackId === ""
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border text-foreground hover:border-primary/40"
                  }`}
                >
                  <div className="text-sm font-semibold">Something else</div>
                  <div className={`text-xs mt-0.5 ${
                    examTrackId === "" ? "text-primary-foreground/80" : "text-muted-foreground"
                  }`}>
                    General study profile
                  </div>
                </button>
              </div>
            )}

            <Button
              onClick={() => setStep("date")}
              disabled={examTrackId === null}
              className="w-full h-11 gap-2"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* ── Step 2: exam date ──────────────────────────────────── */}
        {step === "date" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">
                {onboardingCopy.examDateLabel}
              </h1>
              <p className="text-sm text-muted-foreground">{onboardingCopy.examDateHelp}</p>
            </div>

            <input
              type="date"
              value={targetDate}
              disabled={dateUnknown}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full h-11 rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-50"
            />

            {/* A Class 11 student genuinely may not know. Blocking here would
                cost the signup for information they cannot supply. */}
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={dateUnknown}
                onChange={(e) => {
                  setDateUnknown(e.target.checked);
                  if (e.target.checked) setTargetDate("");
                }}
                className="h-4 w-4 rounded border-border"
              />
              {onboardingCopy.examDateMissing}
            </label>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("exam")} className="h-11 gap-2">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                onClick={() => setStep("age")}
                disabled={!dateUnknown && !targetDate}
                className="flex-1 h-11 gap-2"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: age, and guardian consent for minors ────────── */}
        {step === "age" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">
                How old are you?
              </h1>
              <p className="text-sm text-muted-foreground">
                We ask because Indian law requires a parent or guardian to agree
                before we can hold information about a student under 18.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="dob" className="text-sm font-medium text-foreground">
                Date of birth
              </label>
              <input
                id="dob"
                type="date"
                value={dateOfBirth}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => { setDateOfBirth(e.target.value); setConsentTouched(true); }}
                className="w-full h-11 rounded-lg border border-border bg-background px-3 text-sm"
              />
              {consentTouched && dobIssue && (
                <p className="text-xs text-destructive">{dobIssue}</p>
              )}
            </div>

            {/* Shown only when the date of birth says it is needed. This is a
                UI decision only — the server recomputes it and rejects a minor
                submitted without these details. */}
            {minorNow && !dobIssue && (
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-bold text-foreground">
                    Your parent or guardian needs to agree
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Please fill this in together with them. We will contact them
                    to confirm.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="gname" className="text-xs font-medium text-foreground">
                    Their full name
                  </label>
                  <input
                    id="gname"
                    type="text"
                    value={guardian.guardianName}
                    onChange={(e) => setGuardian((g) => ({ ...g, guardianName: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
                  />
                  {consentTouched && gIssues.guardianName && (
                    <p className="text-xs text-destructive">{gIssues.guardianName}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="gemail" className="text-xs font-medium text-foreground">
                    Their email address
                  </label>
                  <input
                    id="gemail"
                    type="email"
                    value={guardian.guardianEmail}
                    onChange={(e) => setGuardian((g) => ({ ...g, guardianEmail: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
                  />
                  {consentTouched && gIssues.guardianEmail && (
                    <p className="text-xs text-destructive">{gIssues.guardianEmail}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-foreground">
                    They are my
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {GUARDIAN_RELATIONSHIPS.map((rel) => (
                      <button
                        key={rel}
                        type="button"
                        onClick={() => setGuardian((g) => ({ ...g, guardianRelationship: rel }))}
                        aria-pressed={guardian.guardianRelationship === rel}
                        className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                          guardian.guardianRelationship === rel
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border text-foreground hover:border-primary/40"
                        }`}
                      >
                        {rel}
                      </button>
                    ))}
                  </div>
                  {consentTouched && gIssues.guardianRelationship && (
                    <p className="text-xs text-destructive">{gIssues.guardianRelationship}</p>
                  )}
                </div>

                {/* Unticked by default, always. A pre-ticked box is not consent. */}
                <label className="flex items-start gap-2.5 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={guardian.guardianConsentConfirmed}
                    onChange={(e) => {
                      setConsentTouched(true);
                      setGuardian((g) => ({ ...g, guardianConsentConfirmed: e.target.checked }));
                    }}
                    className="h-4 w-4 mt-0.5 rounded border-border flex-shrink-0"
                  />
                  <span>
                    My parent or guardian has read the{" "}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Privacy Policy
                    </a>{" "}
                    and{" "}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Terms of Service
                    </a>
                    , and agrees to me using StudyBuddy AI.
                  </span>
                </label>
                {consentTouched && gIssues.guardianConsentConfirmed && (
                  <p className="text-xs text-destructive">{gIssues.guardianConsentConfirmed}</p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("date")} className="h-11 gap-2">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                onClick={() => { setConsentTouched(true); if (consentReady) setStep("questions"); }}
                disabled={!consentReady}
                className="flex-1 h-11 gap-2"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: exam-specific questions ────────────────────── */}
        {step === "questions" && (
          <div className="space-y-6">
            {/* Keyed on flowType so React remounts on an exam change, alongside
                the renderer's own reset. */}
            <QuestionnaireRenderer
              key={flowType}
              flowType={flowType}
              onChange={handleChange}
              serverIssues={serverIssues}
            />

            <div className="flex items-center gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep("age")} className="h-11 gap-2">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isValid || submitting}
                className="flex-1 h-11 gap-2"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                ) : (
                  <>Finish <ArrowRight className="h-4 w-4" /></>
                )}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default DynamicOnboarding;
