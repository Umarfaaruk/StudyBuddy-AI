import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowRight, ArrowLeft, Target, Brain, Lightbulb,
  BookOpen, Sparkles, Rocket, User2, Palette, Database, GraduationCap
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useExamTracks } from "@/lib/examTracks";
import { onboardingCopy } from "@/content/examPrepCopy";

import BrandMark from "@/components/BrandMark";

// ── Stage definitions ────────────────────────────────────────────
const TOTAL_STAGES = 9;

const stageInfo = [
  // Exam first: it decides the syllabus, the question bank and the voice of
  // every AI answer, so asking it before anything else keeps the rest of
  // onboarding coherent.
  { title: onboardingCopy.examStageTitle, subtitle: onboardingCopy.examStageSubtitle, icon: GraduationCap },
  { title: "User Segmentation", subtitle: "Help us understand who you are", icon: User2 },
  { title: "Goal Clarity", subtitle: "What are you trying to achieve?", icon: Target },
  { title: "Current Learning Behavior", subtitle: "How do you learn today?", icon: BookOpen },
  { title: "Pain Points", subtitle: "What frustrates you the most?", icon: Lightbulb },
  { title: "Learning Style", subtitle: "Personalizing your engine", icon: Palette },
  { title: "Resource Management", subtitle: "Where do you keep your materials?", icon: Database },
  { title: "AI Expectations", subtitle: "Setting product scope", icon: Brain },
  { title: "Commitment", subtitle: "Let's activate your journey", icon: Rocket },
];

const learnerTypes = [
  "School Student",
  "College Student",
  "Competitive Exam Aspirant",
  "Working Professional",
  "Self-Learner"
];

const mainPurposes = [
  "Exams",
  "Skill Development",
  "Career Growth",
  "Exploring Interests"
];

const goals = [
  "Crack an exam",
  "Learn a skill (e.g., coding, design)",
  "Improve academic performance",
  "Build discipline in learning"
];

const urgencies = [
  "Just exploring",
  "1–3 months",
  "3–6 months",
  "6+ months"
];

const learningMethodsList = [
  "YouTube",
  "Notes / PDFs",
  "Coaching / Classes",
  "Apps (like BYJU’S, Coursera, etc.)",
  "Random Google searches"
];

const appCounts = [
  "1–2",
  "3–5",
  "5+"
];

const painPointsList = [
  "Too many scattered resources",
  "Can't stay consistent",
  "Forget what I learned",
  "No proper guidance",
  "Distracted easily",
  "Don't know what to study next"
];

const learningPreferencesList = [
  "Watching videos",
  "Reading",
  "Practicing / solving",
  "Mixed"
];

const studyTimesList = [
  "< 1 hour",
  "1–2 hours",
  "2–4 hours",
  "4+ hours"
];

const storageLocationsList = [
  "Nowhere (I lose them)",
  "Notes app",
  "Google Drive",
  "WhatsApp / Telegram",
  "Multiple places"
];

const autoOrganizeList = [
  "Yes (auto-organize everything)",
  "Yes (but I want control)",
  "Not sure"
];

const aiExpectationsList = [
  "Explain concepts",
  "Create study plans",
  "Answer doubts instantly",
  "Track progress",
  "Recommend resources",
  "Test me & help revise"
];

const startTimesList = [
  "Today",
  "Tomorrow",
  "This week"
];

// ── Onboarding component ────────────────────────────────────────
const OnboardingFlow = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Stage 0 — Exam track
  const { data: examTracks, isLoading: tracksLoading } = useExamTracks();
  const [examTrackId, setExamTrackId] = useState("");
  const [targetExamDate, setTargetExamDate] = useState("");
  // A student who genuinely doesn't know their date must still be able to
  // continue. Blocking onboarding on a date they can't know loses the signup;
  // Phase 2's planner falls back to a default horizon when the date is null.
  const [examDateUnknown, setExamDateUnknown] = useState(false);

  // Stage 1 — User Segmentation
  const [learnerType, setLearnerType] = useState("");
  const [mainPurpose, setMainPurpose] = useState("");

  // Stage 1 — Goal Clarity
  const [currentGoal, setCurrentGoal] = useState("");
  const [goalUrgency, setGoalUrgency] = useState("");

  // Stage 2 — Current Learning Behavior
  const [learningMethods, setLearningMethods] = useState<string[]>([]);
  const [appCount, setAppCount] = useState("");

  // Stage 3 — Pain Points
  const [selectedPainPoints, setSelectedPainPoints] = useState<string[]>([]);

  // Stage 4 — Learning Style
  const [learningPreference, setLearningPreference] = useState("");
  const [studyTime, setStudyTime] = useState("");

  // Stage 5 — Resource Management
  const [storageLocation, setStorageLocation] = useState("");
  const [autoOrganizePref, setAutoOrganizePref] = useState("");

  // Stage 6 — AI Expectations
  const [aiExpectations, setAiExpectations] = useState<string[]>([]);

  // Stage 7 — Commitment
  const [startTime, setStartTime] = useState("");
  const [biggestReason, setBiggestReason] = useState("");

  const toggleMulti = useCallback((arr: string[], val: string, setter: (v: string[]) => void) => {
    setter(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  }, []);

  const toggleMultiMax = useCallback((arr: string[], val: string, setter: (v: string[]) => void, max: number) => {
    if (arr.includes(val)) {
      setter(arr.filter((x) => x !== val));
    } else {
      if (arr.length < max) {
        setter([...arr, val]);
      } else {
        toast.error(`You can select up to ${max} options.`);
      }
    }
  }, []);

  const canProceed = (): boolean => {
    switch (stage) {
      case 0: return !!examTrackId && (examDateUnknown || !!targetExamDate);
      case 1: return !!learnerType && !!mainPurpose;
      case 2: return !!currentGoal && !!goalUrgency;
      case 3: return learningMethods.length > 0 && !!appCount;
      case 4: return selectedPainPoints.length > 0;
      case 5: return !!learningPreference && !!studyTime;
      case 6: return !!storageLocation && !!autoOrganizePref;
      case 7: return aiExpectations.length > 0;
      case 8: return !!startTime && !!biggestReason.trim();
      default: return false;
    }
  };

  const handleFinish = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // Save profile baseline (row already exists via the handle_new_user trigger).
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: user.uid,
        full_name: user.displayName || "Unknown",
        email: user.email || "—",
        onboarding_completed: true,
        // Exam identity lives on the profile, not user_preferences: it is read
        // on nearly every screen and by every AI call, not just the planner.
        exam_track_id: examTrackId || null,
        target_exam_date: targetExamDate || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (profileError) throw profileError;

      // Save comprehensive preferences
      const { error: prefsError } = await supabase.from("user_preferences").upsert({
        user_id: user.uid,
        learner_type: learnerType,
        main_purpose: mainPurpose,
        current_goal: currentGoal,
        goal_urgency: goalUrgency,
        learning_methods: learningMethods,
        app_count: appCount,
        pain_points: selectedPainPoints,
        learning_preference: learningPreference,
        study_time: studyTime,
        storage_location: storageLocation,
        auto_organize_pref: autoOrganizePref,
        ai_expectations: aiExpectations,
        start_time: startTime,
        biggest_reason: biggestReason.trim(),
        onboarding_version: 3,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (prefsError) throw prefsError;

      toast.success("Welcome to StudyBuddy AI! 🚀");
      // Update cache synchronously to prevent race conditions during navigation
      const newProfileData = {
        user_id: user.uid,
        onboarding_completed: true,
        learner_type: learnerType,
        main_purpose: mainPurpose,
        current_goal: currentGoal,
        updated_at: new Date().toISOString(),
      };
      queryClient.setQueryData(["profile-onboarding-check", user.uid], newProfileData);
      queryClient.setQueryData(["profile", user.uid], newProfileData);

      // Invalidate the profile cache so ProtectedRoute sees onboarding_completed: true
      queryClient.invalidateQueries({ queryKey: ["profile-onboarding-check", user.uid] });
      queryClient.invalidateQueries({ queryKey: ["profile", user.uid] });
      // The dashboard countdown reads this; without an invalidate it would show
      // "no exam set" until the 5-minute staleTime expired.
      queryClient.invalidateQueries({ queryKey: ["student-exam-context", user.uid] });
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      console.error("Onboarding Error:", err);
      toast.error(err.message || "Failed to save profile");
    } finally {
      setIsLoading(false);
    }
  };

  const info = stageInfo[stage];
  const StageIcon = info.icon;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center shrink-0 w-full justify-center lg:justify-start">
          <BrandMark size="lg" />
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-muted h-1.5">
        <div className="bg-primary h-1.5 rounded-r-full transition-all duration-500" style={{ width: `${((stage + 1) / TOTAL_STAGES) * 100}%` }} />
      </div>

      {/* Stage counter */}
      <div className="flex justify-center pt-3 gap-2">
        {Array.from({ length: TOTAL_STAGES }).map((_, i) => (
          <div
            key={i}
            className={`h-2 w-2 rounded-full transition-all ${
              i < stage ? "bg-primary" : i === stage ? "bg-primary scale-125" : "bg-muted"
            }`}
          />
        ))}
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300" key={stage}>
          {/* Stage header */}
          <div className="text-center space-y-2">
            <div className="inline-flex h-12 w-12 rounded-2xl bg-primary/10 items-center justify-center mb-2">
              <StageIcon className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">{info.title}</h2>
            <p className="text-muted-foreground text-sm">{info.subtitle}</p>
          </div>

          {/* ── Stage 0: Exam track ────────────────────────────── */}
          {stage === 0 && (
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">
                  {onboardingCopy.examPickerLabel}
                </label>
                <p className="text-xs text-muted-foreground">{onboardingCopy.examPickerHelp}</p>

                {tracksLoading ? (
                  <div className="grid gap-2">
                    {[0, 1].map((i) => (
                      <div key={i} className="h-[72px] rounded-xl border border-border bg-muted/40 animate-pulse" />
                    ))}
                  </div>
                ) : !examTracks?.length ? (
                  // Never dead-end onboarding on missing reference data.
                  <p className="text-sm text-muted-foreground rounded-lg border border-border p-4">
                    No exam tracks are configured yet. Ask an administrator to add
                    one, then reload this page.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {examTracks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setExamTrackId(t.id)}
                        aria-pressed={examTrackId === t.id}
                        className={`text-left px-4 py-3.5 rounded-xl border transition-colors ${
                          examTrackId === t.id
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card border-border text-foreground hover:border-primary/40"
                        }`}
                      >
                        <div className="text-sm font-semibold">{t.name}</div>
                        {t.description && (
                          <div
                            className={`text-xs mt-0.5 ${
                              examTrackId === t.id ? "text-primary-foreground/80" : "text-muted-foreground"
                            }`}
                          >
                            {t.description}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <label htmlFor="target-exam-date" className="text-sm font-medium text-foreground">
                  {onboardingCopy.examDateLabel}
                </label>
                <p className="text-xs text-muted-foreground">{onboardingCopy.examDateHelp}</p>
                <input
                  id="target-exam-date"
                  type="date"
                  value={targetExamDate}
                  disabled={examDateUnknown}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setTargetExamDate(e.target.value)}
                  className="w-full h-11 rounded-lg border border-border bg-card px-3 text-sm text-foreground disabled:opacity-50"
                />
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={examDateUnknown}
                    onChange={(e) => {
                      setExamDateUnknown(e.target.checked);
                      if (e.target.checked) setTargetExamDate("");
                    }}
                    className="h-4 w-4 rounded border-border"
                  />
                  {onboardingCopy.examDateMissing}
                </label>
              </div>
            </div>
          )}

          {/* ── Stage 1: User Segmentation ─────────────────────── */}
          {stage === 1 && (
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">1. Who are you?</label>
                <div className="flex flex-wrap gap-2">
                  {learnerTypes.map((t) => (
                    <button key={t} onClick={() => setLearnerType(t)}
                      className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                        learnerType === t ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground hover:border-primary/40"
                      }`}
                    >{t}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">2. What are you mainly here for?</label>
                <div className="grid grid-cols-2 gap-2">
                  {mainPurposes.map((p) => (
                    <button key={p} onClick={() => setMainPurpose(p)}
                      className={`px-4 py-3 rounded-lg text-sm font-medium border transition-colors ${
                        mainPurpose === p ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground hover:border-primary/40"
                      }`}
                    >{p}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Stage 1: Goal Clarity ─────────────────────── */}
          {stage === 2 && (
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">3. What are you currently trying to achieve?</label>
                <div className="grid grid-cols-1 gap-2">
                  {goals.map((g) => (
                    <button key={g} onClick={() => setCurrentGoal(g)}
                      className={`px-4 py-3 rounded-lg text-sm font-medium border transition-colors text-left ${
                        currentGoal === g ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground hover:border-primary/40"
                      }`}
                    >{g}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">4. How urgent is your goal?</label>
                <div className="grid grid-cols-2 gap-2">
                  {urgencies.map((u) => (
                    <button key={u} onClick={() => setGoalUrgency(u)}
                      className={`px-4 py-3 rounded-lg text-sm font-medium border transition-colors ${
                        goalUrgency === u ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground hover:border-primary/40"
                      }`}
                    >{u}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Stage 2: Current Learning Behavior ─────────────────── */}
          {stage === 3 && (
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">5. How do you currently learn? <span className="text-xs text-muted-foreground font-normal">(Select all)</span></label>
                <div className="flex flex-wrap gap-2">
                  {learningMethodsList.map((m) => (
                    <button key={m} onClick={() => toggleMulti(learningMethods, m, setLearningMethods)}
                      className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                        learningMethods.includes(m) ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground hover:border-primary/40"
                      }`}
                    >{m}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">6. How many apps/tools do you use for learning?</label>
                <div className="grid grid-cols-3 gap-2">
                  {appCounts.map((c) => (
                    <button key={c} onClick={() => setAppCount(c)}
                      className={`px-4 py-3 rounded-lg text-sm font-medium border transition-colors ${
                        appCount === c ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground hover:border-primary/40"
                      }`}
                    >{c}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Stage 3: Pain Points ──────────────────────── */}
          {stage === 4 && (
            <div className="space-y-4">
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">7. What frustrates you the most while learning? <span className="text-xs text-muted-foreground font-normal">(Select max 3)</span></label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {painPointsList.map((p) => (
                    <button key={p} onClick={() => toggleMultiMax(selectedPainPoints, p, setSelectedPainPoints, 3)}
                      className={`px-4 py-3 rounded-lg text-sm font-medium border transition-all text-left ${
                        selectedPainPoints.includes(p) ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground hover:border-primary/40"
                      }`}
                    >{p}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Stage 4: Learning Style ───────────────────── */}
          {stage === 5 && (
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">8. How do you prefer to learn?</label>
                <div className="grid grid-cols-2 gap-3">
                  {learningPreferencesList.map((p) => (
                    <button key={p} onClick={() => setLearningPreference(p)}
                      className={`px-4 py-3 rounded-lg text-sm font-medium border transition-all text-center ${
                        learningPreference === p ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground hover:border-primary/40"
                      }`}
                    >{p}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">9. How much time can you realistically study daily?</label>
                <div className="grid grid-cols-2 gap-3">
                  {studyTimesList.map((t) => (
                    <button key={t} onClick={() => setStudyTime(t)}
                      className={`px-4 py-3 rounded-lg text-sm font-medium border transition-colors text-center ${
                        studyTime === t ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground hover:border-primary/40"
                      }`}
                    >{t}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Stage 5: Resource Management ─────────────────── */}
          {stage === 6 && (
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">10. Where do you currently store your learning materials?</label>
                <div className="grid grid-cols-1 gap-2">
                  {storageLocationsList.map((l) => (
                    <button key={l} onClick={() => setStorageLocation(l)}
                      className={`px-4 py-3 rounded-lg text-sm font-medium border transition-colors text-left ${
                        storageLocation === l ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground hover:border-primary/40"
                      }`}
                    >{l}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">11. Do you want StudyBuddy AI to organize all your learning resources in one place?</label>
                <div className="grid grid-cols-1 gap-2">
                  {autoOrganizeList.map((o) => (
                    <button key={o} onClick={() => setAutoOrganizePref(o)}
                      className={`px-4 py-3 rounded-lg text-sm font-medium border transition-colors text-left ${
                        autoOrganizePref === o ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground hover:border-primary/40"
                      }`}
                    >{o}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Stage 6: AI Expectations ──────────────────── */}
          {stage === 7 && (
            <div className="space-y-4">
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">12. What do you want your AI assistant to do? <span className="text-xs text-muted-foreground font-normal">(Select max 3)</span></label>
                <div className="grid grid-cols-1 gap-2">
                  {aiExpectationsList.map((e) => (
                    <button key={e} onClick={() => toggleMultiMax(aiExpectations, e, setAiExpectations, 3)}
                      className={`px-4 py-3 rounded-lg text-sm font-medium border transition-all text-left ${
                        aiExpectations.includes(e) ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground hover:border-primary/40"
                      }`}
                    >{e}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Stage 7: Commitment Activation ────────────── */}
          {stage === 8 && (
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">13. When do you want to start?</label>
                <div className="grid grid-cols-3 gap-2">
                  {startTimesList.map((s) => (
                    <button key={s} onClick={() => setStartTime(s)}
                      className={`px-4 py-3 rounded-lg text-sm font-medium border transition-all text-center ${
                        startTime === s ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground hover:border-primary/40"
                      }`}
                    >{s}</button>
                  ))}
                </div>
              </div>
              
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">14. What's your biggest reason to learn this?</label>
                <Textarea 
                  placeholder="Share your motivation..." 
                  value={biggestReason} 
                  onChange={(e) => setBiggestReason(e.target.value)}
                  className="min-h-[100px] resize-none"
                />
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2 mt-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Sparkles className="h-4 w-4" />
                  Your personalized plan awaits!
                </div>
                <p className="text-xs text-muted-foreground">
                  Based on your answers, we'll create an AI-powered study plan, customize your dashboard,
                  set up smart reminders, and personalize your AI tutor experience.
                </p>
              </div>
            </div>
          )}

          {/* ── Navigation buttons ────────────────────────── */}
          <div className="flex items-center gap-3 mt-8">
            {stage > 0 && (
              <Button variant="outline" onClick={() => setStage(stage - 1)} className="h-11 gap-2">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            )}
            {stage < TOTAL_STAGES - 1 ? (
              <Button onClick={() => setStage(stage + 1)} className="flex-1 h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2"
                disabled={!canProceed()}
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleFinish} className="flex-1 h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2"
                disabled={isLoading || !canProceed()}
              >
                {isLoading ? "Setting up..." : "Launch My Learning Journey"} {!isLoading && <Rocket className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingFlow;
