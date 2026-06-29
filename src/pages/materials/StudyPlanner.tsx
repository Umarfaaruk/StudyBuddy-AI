import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { aiComplete, MODEL_SMALL } from "@/lib/aiService";
import { PLANNER_SYSTEM_PROMPT } from "@/lib/prompts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Calendar, RefreshCw, FileText, CheckCircle2, CalendarDays, Sparkles, Target, Clock, BookOpen, Zap, BrainCircuit } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface StudyPlanDay {
  day: number;
  title: string;
  tasks: string[];
  estimated_minutes: number;
  completed: boolean;
}

interface StudyPlan {
  id: string;
  user_id: string;
  plan_type: string;
  target_date: string;
  schedule: StudyPlanDay[];
  created_at: number;
  subjects?: string[];
  material_id?: string;
  file_name?: string;
  topic_id?: string;
}

export default function StudyPlanner() {
  const { user } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [examDateStr, setExamDateStr] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(2);
  const [planMode, setPlanMode] = useState<"smart" | "material">("smart");
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
  const [showCreationForm, setShowCreationForm] = useState(false);

  // Load user preferences from onboarding
  const { data: preferences } = useQuery({
    queryKey: ["user-preferences", user?.uid],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("user_preferences").select("*").eq("user_id", user.uid).maybeSingle();
      return data ?? null;
    },
    enabled: !!user,
  });

  // Load user profile
  const { data: profile } = useQuery({
    queryKey: ["profile-planner", user?.uid],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.uid).maybeSingle();
      return data ?? null;
    },
    enabled: !!user,
  });

  // Load materials for material-based planning
  const { data: materials, isLoading: materialsLoading } = useQuery({
    queryKey: ["user-materials", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("materials").select("*").eq("user_id", user.uid);
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  // Load all study plans
  const { data: plans, isLoading: plansLoading, refetch: refetchPlans } = useQuery({
    queryKey: ["study-plans-all", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("study_plans").select("*").eq("user_id", user.uid);
      return ((data ?? []) as StudyPlan[]).sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!user,
  });

  const activePlan = plans && plans.length > 0 ? plans[0] : null;
  const completedDays = activePlan?.schedule?.filter((d: any) => d.completed).length ?? 0;
  const totalDays = activePlan?.schedule?.length ?? 0;

  const handleGenerate = async () => {
    if (!user) return;
    if (!examDateStr) {
      toast.error("Please select a target date");
      return;
    }

    const examDate = new Date(examDateStr);
    const today = new Date();
    const daysDiff = Math.max(1, Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 3600 * 24)));

    setGenerating(true);
    let scheduleData = null;
    let attempt = 0;
    const maxRetries = 3;
    let lastError = null;

    // v3 onboarding fields
    const learnerType = preferences?.learner_type || profile?.learner_type || "Student";
    const mainPurpose = preferences?.main_purpose || "Exams";
    const currentGoal = preferences?.current_goal || "Improve academic performance";
    const goalUrgency = preferences?.goal_urgency || "3–6 months";
    const learningPreference = preferences?.learning_preference || "Mixed";
    const studyTimeLabel = preferences?.study_time || "1–2 hours";
    const painPoints = preferences?.pain_points?.join(", ") || "";
    const materialContent = planMode === "material" && selectedMaterial
      ? selectedMaterial.extracted_text?.substring(0, 6000) || selectedMaterial.summary || ""
      : "";

    while (attempt < maxRetries && !scheduleData) {
      try {
        attempt++;
        const maxDailyMinutes = hoursPerDay * 60;
        const prompt = `You are an expert study planner and curriculum developer. Create a ${daysDiff}-day personalized study roadmap.
Based on the student's profile and learning goal, generate BOTH a daily schedule and detailed lesson content (concepts, terminology, and explanations) for each day, so they can study the lesson directly on the platform.

## Student Profile
- Identity: ${learnerType}
- Purpose: ${mainPurpose}
- Current Goal: ${currentGoal}
- Goal Urgency: ${goalUrgency}
- Preferred Learning: ${learningPreference}
- Daily Study Budget: ${studyTimeLabel} (hard cap: ${maxDailyMinutes} minutes/day)
- Pain Points: ${painPoints || "None specified"}
- Days Available: ${daysDiff}
${materialContent ? `\n## Material to Cover (CRITICAL: write the lessons specifically covering the text below, do not make it generic)\n${materialContent}` : ""}

## Difficulty Curve (MANDATORY)
Follow this progression strictly:
- Days 1–2: **Introductory** — foundational concepts, orientation, easy wins
- Days 3–5: **Intermediate** — core concepts, moderate practice, pattern recognition
- Days 6–8: **Advanced** — complex problems, synthesis, application
- Every 3rd–4th day: **Revision & Consolidation** — spaced review, self-testing
- Final 1–2 days: **Mock Test / Final Review** — timed practice, gap analysis

## Time Block Rules
- Each day MUST have 2–5 specific, actionable tasks (not generic placeholders)
- estimated_minutes for each day MUST be between 15 and ${maxDailyMinutes}
- Tasks must be concrete (e.g., "Solve 10 quadratic equations" not "Practice math")
- Vary task types: reading, practice, note-making, revision, self-testing

Return ONLY a valid JSON object (no markdown wrappers, no commentary):
{
  "topic_title": "Course Title based on material",
  "subject": "e.g., Science, History, Mathematics",
  "description": "A brief overview of the course",
  "schedule": [
    {
      "day": 1,
      "title": "Orientation & Foundations",
      "tasks": ["Read Chapter 1 introduction (20 min)", "Create a mind-map of key terms (15 min)", "Attempt 5 basic practice problems (25 min)"],
      "estimated_minutes": 60
    }
  ],
  "lessons": [
    {
      "day": 1,
      "title": "Orientation & Foundations",
      "content": "## Introduction to [Day 1 Topic]\\nHere write the full detailed lesson content (150-300 words). Use **bold** key terms and bullet points. Make it extremely informative and educational."
    }
  ]
}

Limit the response to match the number of days (${daysDiff} days), max 14 entries. If the plan spans more than 14 days, group days into weekly milestone blocks. Each milestone/day must still contain specific tasks and a corresponding lesson content.`;

        const res = await aiComplete({
          messages: [
            { role: "system", content: PLANNER_SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          temperature: 0.4, // low = reliable JSON, fewer parse errors on retries
          maxTokens: 4000,
          model: MODEL_SMALL, // 8B instant — fine for structured planner JSON
        });

        let jsonString = res;
        const match = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) {
          jsonString = match[1];
        }

        const startIdx = jsonString.indexOf('{');
        const endIdx = jsonString.lastIndexOf('}');
        
        if (startIdx === -1 || endIdx === -1) {
          throw new Error("Failed to locate JSON object in AI output");
        }

        jsonString = jsonString.substring(startIdx, endIdx + 1);
        const parsed = JSON.parse(jsonString.trim());

        if (!parsed.topic_title || !parsed.schedule || !parsed.lessons) {
          throw new Error("Missing required fields in generated plan JSON");
        }

        scheduleData = parsed;
      } catch (err) {
        lastError = err;
        console.warn(`Retry ${attempt} failed:`, err);
      }
    }

    try {
      if (!scheduleData) throw lastError || new Error("Failed to generate study plan after multiple attempts.");

      const newTopicId = crypto.randomUUID();
      await supabase.from("topics").insert({
        id: newTopicId,
        title: scheduleData.topic_title,
        subject: scheduleData.subject || "General",
        description: scheduleData.description || "",
        lesson_count: scheduleData.lessons.length,
        is_custom: true,
        material_id: selectedMaterial?.id || null,
        user_id: user.uid,
      });
      await supabase.from("lessons").insert(
        scheduleData.lessons.map((lesson: any, i: number) => ({
          topic_id: newTopicId,
          title: lesson.title,
          content: lesson.content,
          position: lesson.day || i + 1,
        }))
      );

      const maxDailyMinutes = hoursPerDay * 60;
      const sanitizedSchedule = scheduleData.schedule.map((d: any, i: number) => ({
        day: d.day ?? i + 1,
        title: d.title || `Day ${i + 1}`,
        tasks: Array.isArray(d.tasks) && d.tasks.length > 0 ? d.tasks.slice(0, 5) : ["Review previous material", "Practice key concepts"],
        estimated_minutes: Math.max(15, Math.min(d.estimated_minutes ?? maxDailyMinutes, maxDailyMinutes)),
        completed: false,
      })).sort((a: any, b: any) => a.day - b.day).slice(0, 14);

      await supabase.from("study_plans").insert({
        user_id: user.uid,
        plan_type: planMode,
        material_id: selectedMaterial?.id || null,
        file_name: selectedMaterial?.file_name || null,
        target_date: examDate.toISOString(),
        subjects: preferences?.subjects || [],
        schedule: sanitizedSchedule,
        topic_id: newTopicId,
        created_at: Date.now(),
      });

      toast.success("🎯 Smart Study Plan generated!");
      setShowCreationForm(false);
      refetchPlans();
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate plan. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const toggleDayComplete = async (dayIndex: number) => {
    if (!activePlan) return;
    try {
      const newSchedule = [...activePlan.schedule];
      newSchedule[dayIndex].completed = !newSchedule[dayIndex].completed;
      await supabase.from("study_plans").update({ schedule: newSchedule }).eq("id", activePlan.id);
      refetchPlans();
    } catch (e) {
      toast.error("Failed to update progress");
    }
  };

  if (materialsLoading || plansLoading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <CalendarDays className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Study Planner</h1>
          <p className="text-muted-foreground text-sm">AI-powered personalized study roadmaps</p>
        </div>
      </div>

      {/* Active Plan Display */}
      {activePlan && !showCreationForm ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Plan summary card */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className="font-bold text-foreground">Active Study Plan</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Target: {new Date(activePlan.target_date).toLocaleDateString()}
                </span>
                <Button variant="outline" size="sm" onClick={() => { setPlanMode("smart"); setShowCreationForm(true); }}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> New Plan
                </Button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span className="font-semibold text-primary">{completedDays}/{totalDays} days completed</span>
              </div>
              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${totalDays > 0 ? (completedDays / totalDays) * 100 : 0}%` }} />
              </div>
            </div>
          </div>

          {/* Day-wise timeline */}
          <div className="relative border-l-2 border-border ml-3 space-y-6 py-4">
            {activePlan.schedule.map((dayObj: any, index: number) => (
              <div key={index} className="relative pl-6">
                {/* Timeline node */}
                <button
                  onClick={() => toggleDayComplete(index)}
                  className={`absolute -left-[11px] top-1 h-5 w-5 rounded-full border-2 bg-background flex items-center justify-center transition-all ${
                    dayObj.completed ? 'border-primary bg-primary' : 'border-muted-foreground hover:border-primary'
                  }`}
                >
                  {dayObj.completed && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                </button>

                <div className={`bg-card border rounded-xl p-4 transition-all ${
                  dayObj.completed ? 'border-primary/20 opacity-70' : 'border-border shadow-sm hover:shadow-md'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      dayObj.completed ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>
                      Day {dayObj.day || index + 1}
                    </span>
                    <h4 className={`font-semibold text-sm ${dayObj.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {dayObj.title}
                    </h4>
                    <span className="ml-auto text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Clock className="h-3 w-3" /> ~{dayObj.estimated_minutes || 60} min
                    </span>
                  </div>
                  <ul className={`text-sm space-y-1.5 pl-5 list-disc ${dayObj.completed ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                    {dayObj.tasks?.map((task: string, tIdx: number) => (
                      <li key={tIdx}>{task}</li>
                    ))}
                  </ul>
                  {activePlan.topic_id && (
                    <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-2">
                      <Link
                        to={`/lessons/${activePlan.topic_id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-all"
                      >
                        <BookOpen className="h-3.5 w-3.5" /> Study Day Lesson
                      </Link>
                      {activePlan.material_id && (
                        <Link
                          to="/materials/flashcards"
                          state={{ preselectedMaterial: { id: activePlan.material_id, file_name: activePlan.file_name } }}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-cta hover:text-cta/80 bg-cta/10 hover:bg-cta/20 px-3 py-1.5 rounded-lg transition-all"
                        >
                          <BrainCircuit className="h-3.5 w-3.5" /> Review Flashcards
                        </Link>
                      )}
                      <Link
                        to={`/quiz/${activePlan.topic_id}`}
                        state={{
                          topicTitle: dayObj.title,
                          materialContext: materials?.find((m: any) => m.id === activePlan.material_id)?.extracted_text || materials?.find((m: any) => m.id === activePlan.material_id)?.summary || "",
                          difficulty: "Medium"
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-success hover:text-success/80 bg-success/10 hover:bg-success/20 px-3 py-1.5 rounded-lg transition-all"
                      >
                        <Zap className="h-3.5 w-3.5" /> Take Daily Quiz
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // ── No active plan — Plan creation UI ──────────────────
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Back to active plan button */}
          {activePlan && showCreationForm && (
            <Button variant="outline" size="sm" onClick={() => setShowCreationForm(false)} className="gap-2">
              ← Back to Active Plan
            </Button>
          )}
          {/* Mode selector */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setPlanMode("smart"); setSelectedMaterial(null); }}
              className={`p-5 rounded-xl border transition-all text-left ${
                planMode === "smart" ? "bg-primary/5 border-primary ring-1 ring-primary/30" : "bg-card border-border hover:border-primary/40"
              }`}
            >
              <Sparkles className={`h-6 w-6 mb-2 ${planMode === "smart" ? "text-primary" : "text-muted-foreground"}`} />
              <div className="text-sm font-bold text-foreground">Smart Plan</div>
              <div className="text-xs text-muted-foreground mt-0.5">AI generates a plan from your profile & subjects</div>
            </button>
            <button onClick={() => setPlanMode("material")}
              className={`p-5 rounded-xl border transition-all text-left ${
                planMode === "material" ? "bg-primary/5 border-primary ring-1 ring-primary/30" : "bg-card border-border hover:border-primary/40"
              }`}
            >
              <FileText className={`h-6 w-6 mb-2 ${planMode === "material" ? "text-primary" : "text-muted-foreground"}`} />
              <div className="text-sm font-bold text-foreground">Material-Based</div>
              <div className="text-xs text-muted-foreground mt-0.5">Build a plan around uploaded study materials</div>
            </button>
          </div>

          {/* Personalization summary from onboarding */}
          {preferences && planMode === "smart" && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Target className="h-4 w-4 text-primary" /> Your Learning Profile
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {preferences.learner_type && (
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Identity</div>
                    <div className="text-xs text-foreground">{preferences.learner_type}</div>
                  </div>
                )}
                {preferences.current_goal && (
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Goal</div>
                    <div className="text-xs text-foreground">{preferences.current_goal}</div>
                  </div>
                )}
                {preferences.learning_preference && (
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Style</div>
                    <div className="text-xs text-foreground">{preferences.learning_preference}</div>
                  </div>
                )}
                {preferences.study_time && (
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Daily Time</div>
                    <div className="text-xs text-foreground">{preferences.study_time}</div>
                  </div>
                )}
                {preferences.goal_urgency && (
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Urgency</div>
                    <div className="text-xs text-foreground">{preferences.goal_urgency}</div>
                  </div>
                )}
                {preferences.pain_points?.length > 0 && (
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Challenges</div>
                    <div className="text-xs text-foreground">{preferences.pain_points.slice(0, 2).join(", ")}</div>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Your plan is personalized using your onboarding data. <Link to="/onboarding" className="text-primary hover:underline">Update preferences →</Link>
              </p>
            </div>
          )}

          {/* Material selection for material-based plans */}
          {planMode === "material" && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">Select a material</h3>
              {materials && materials.length > 0 ? (
                <div className="grid sm:grid-cols-2 gap-3">
                  {materials.map((m: any) => (
                    <button key={m.id} onClick={() => setSelectedMaterial(m)}
                      className={`p-4 rounded-xl border transition-all text-left ${
                        selectedMaterial?.id === m.id ? "bg-primary/5 border-primary" : "bg-card border-border hover:border-primary/40"
                      }`}
                    >
                      <FileText className="h-4 w-4 text-primary mb-1" />
                      <div className="text-sm font-medium text-foreground truncate">{m.file_name}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground bg-muted/50 rounded-xl border border-dashed border-border">
                  <FileText className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm mb-4">No materials uploaded yet.</p>
                  <Link to="/materials"><Button variant="outline" size="sm">Upload Material</Button></Link>
                </div>
              )}
            </div>
          )}

          {/* Plan configuration */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <div className="text-center">
              <Calendar className="h-10 w-10 text-muted-foreground mx-auto opacity-50 mb-3" />
              <h3 className="font-bold text-foreground">Configure Your Plan</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
                Set your target date and daily study hours — AI will create your personalized roadmap.
              </p>
            </div>
            <div className="max-w-sm mx-auto space-y-4">
              <div className="space-y-2 text-left">
                <label className="text-sm font-medium">Target / Exam Date</label>
                <Input type="date" value={examDateStr} onChange={e => setExamDateStr(e.target.value)}
                  min={new Date().toISOString().split('T')[0]} />
              </div>
              <div className="space-y-2 text-left">
                <label className="text-sm font-medium">Study Hours Per Day</label>
                <Input type="number" min="1" max="12" value={hoursPerDay}
                  onChange={e => setHoursPerDay(Number(e.target.value))} />
              </div>
              <Button onClick={handleGenerate}
                disabled={generating || !examDateStr || (planMode === "material" && !selectedMaterial)}
                className="w-full gap-2"
              >
                {generating ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Generating your plan...</>
                ) : (
                  <><Sparkles className="h-4 w-4" /> Generate Smart Roadmap</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
