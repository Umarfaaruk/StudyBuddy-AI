import { useState, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronRight, Search, Calculator, Atom, FlaskConical, Leaf, FileText, Loader2, Sparkles, Plus, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, query, getDocs, where, doc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { aiComplete } from "@/lib/aiService";
import { toast } from "sonner";

const StudyPlanner = lazy(() => import("@/pages/materials/StudyPlanner"));

const iconMap: Record<string, React.ReactNode> = {
  calculator:     <Calculator    className="h-5 w-5 text-primary" />,
  atom:           <Atom          className="h-5 w-5 text-primary" />,
  "flask-conical":<FlaskConical  className="h-5 w-5 text-primary" />,
  leaf:           <Leaf          className="h-5 w-5 text-primary" />,
};

const LessonList = () => {
  const { user } = useAuth();
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [showPlanner, setShowPlanner] = useState(false);
  const queryClient = useQueryClient();

  // Fetch user materials
  const { data: materials } = useQuery({
    queryKey: ["user-materials", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      const q = query(collection(db, "materials"), where("user_id", "==", user.uid));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    },
    enabled: !!user
  });

  // Fetch topics with progress tracking
  const { data: topics = [], isLoading } = useQuery({
    queryKey: ["topics", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      try {
        const topicsSnap = await getDocs(collection(db, "topics"));
        const topicsData = topicsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as any));

        // Fetch user progress for each topic
        const progressSnap = await getDocs(
          query(
            collection(db, "lesson_progress"),
            where("user_id", "==", user.uid)
          )
        );
        const progressMap = new Map(
          progressSnap.docs.map(doc => [doc.id.split("_")[1], doc.data()])
        );

        return topicsData.map(topic => {
          const progress = progressMap.get(topic.id);
          const completed = progress?.completed_lessons?.length ?? 0;
          const total = topic.lesson_count ?? 0;
          return {
            ...topic,
            pct: total > 0 ? Math.round((completed / total) * 100) : 0,
            completedLessons: completed,
            totalLessons: total
          };
        });
      } catch (error) {
        console.error("[LessonList] Fetch error:", error);
        return [];
      }
    },
    enabled: !!user
  });

  // Extract unique subjects
  const subjects = Array.from(new Set(topics.map(t => t.subject)))
    .map(subject => ({ name: subject }));


  const subjectNames = ["All", ...(subjects?.map((s) => s.name) ?? [])];
  const filtered = (topics ?? []).filter(
    (t) =>
      (filter === "All" || t.subjectName === filter || t.subject === filter || (t.is_custom && filter === "Your Courses")) &&
      t.title.toLowerCase().includes(search.toLowerCase())
  );

  // Auto-add "Your Courses" to filter if custom topics exist
  if (topics.some((t: any) => t.is_custom) && !subjectNames.includes("Your Courses")) {
    subjectNames.push("Your Courses");
  }

  const handleGenerateCourse = async (material: any) => {
    if (!user) return;
    
    // Validate material has content to work with
    const materialContent = material.extracted_text?.substring(0, 5000) || material.summary || "";
    if (!materialContent || materialContent.length < 50) {
      toast.error("This material doesn't have enough content to generate a course. Try uploading a more detailed file.");
      return;
    }
    
    setGeneratingFor(material.id);
    toast.info("Generating your AI Course. This may take a minute...");
    
    let parsed = null;
    let attempt = 0;
    const maxRetries = 3;
    let lastError = null;

    while (attempt < maxRetries && !parsed) {
      try {
        attempt++;
        const prompt = `Create a structured course from the material below. Return ONLY a valid JSON object (no markdown wrappers, no commentary).

JSON format:
{"topic_title":"string","subject":"string","description":"string","lessons":[{"title":"string","content":"string"}]}

Rules:
- topic_title: concise course name based on the material
- subject: the academic subject area
- description: 1-2 sentence summary
- lessons: exactly 3-4 lessons
- Each lesson content: 150-300 words using ## headings, **bold** key terms, and bullet points
- Progress from fundamentals to advanced
- Content must be SPECIFIC to the material, not generic

Material filename: ${material.file_name}
Material content:
${materialContent}`;

        const res = await aiComplete({
          messages: [{ role: "user", content: prompt }],
          temperature: 0.4,
          maxTokens: 4096,
        });

        let jsonString = res;
        // Strip markdown code blocks
        const match = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) {
          jsonString = match[1];
        }
        // Extract JSON object
        const startIdx = jsonString.indexOf('{');
        const endIdx = jsonString.lastIndexOf('}');
        if (startIdx === -1 || endIdx === -1) {
          throw new Error("No JSON object found in AI response");
        }
        jsonString = jsonString.substring(startIdx, endIdx + 1);
        
        parsed = JSON.parse(jsonString.trim());
        
        // Validate structure
        if (!parsed.topic_title || !parsed.lessons || !Array.isArray(parsed.lessons) || parsed.lessons.length === 0) {
          throw new Error("Invalid course structure — missing title or lessons");
        }
        
        // Validate each lesson has content
        parsed.lessons = parsed.lessons.filter((l: any) => l && l.title && l.content);
        if (parsed.lessons.length === 0) {
          throw new Error("No valid lessons in generated course");
        }
      } catch (err) {
        lastError = err;
        console.warn(`Course generation retry ${attempt} failed:`, err);
        parsed = null;
        // Small delay before retry
        if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000));
      }
    }

    try {
      if (!parsed) throw lastError || new Error("Failed to generate course after multiple attempts.");

      const batch = writeBatch(db);
      const newTopicRef = doc(collection(db, "topics"));
      
      batch.set(newTopicRef, {
        title: parsed.topic_title,
        subject: parsed.subject || "General",
        subjectName: parsed.subject || "General",
        subjectIcon: "file-text",
        description: parsed.description || "",
        lesson_count: parsed.lessons.length,
        is_custom: true,
        material_id: material.id,
        user_id: user.uid,
        created_at: new Date()
      });

      parsed.lessons.forEach((lesson: any, i: number) => {
        const lessonRef = doc(collection(db, "lessons"));
        batch.set(lessonRef, {
          topic_id: newTopicRef.id,
          title: lesson.title,
          content: lesson.content,
          order: i + 1,
          created_at: new Date()
        });
      });

      await batch.commit();
      toast.success(`AI Course "${parsed.topic_title}" generated with ${parsed.lessons.length} lessons!`);
      queryClient.invalidateQueries({ queryKey: ["topics", user.uid] });
      setFilter("Your Courses");
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate course. Try again.");
    } finally {
      setGeneratingFor(null);
    }
  };


  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Lessons</h1>
          <p className="text-muted-foreground text-sm mt-1">Browse topics and continue learning</p>
        </div>
        <button
          onClick={() => setShowPlanner(!showPlanner)}
          className="flex items-center gap-3 group"
          aria-label="Toggle Study Planner"
        >
          <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors hidden sm:inline">
            <CalendarDays className="h-4 w-4 inline mr-1.5 -mt-0.5" />
            Study Planner
          </span>
          <CalendarDays className="h-5 w-5 text-muted-foreground sm:hidden" />
          <div className={`h-6 w-11 rounded-full transition-colors flex-shrink-0 ${
            showPlanner ? "bg-primary" : "bg-muted"
          }`}>
            <div className={`h-5 w-5 rounded-full bg-card shadow transition-transform ${
              showPlanner ? "translate-x-5" : "translate-x-0.5"
            } mt-0.5`} />
          </div>
        </button>
      </div>

      {/* Inline Study Planner Panel */}
      {showPlanner && (
        <div className="border border-primary/20 rounded-xl overflow-hidden bg-primary/[0.02] animate-in slide-in-from-top-2 duration-300">
          <Suspense fallback={<div className="p-8 flex justify-center"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>}>
            <StudyPlanner />
          </Suspense>
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search topics…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10 focus-visible:ring-primary"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {subjectNames.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border whitespace-nowrap transition-colors ${
                filter === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-foreground hover:border-primary/40"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Topic list */}
      <div className="space-y-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 bg-card border border-border rounded-xl p-5">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-1.5 w-full max-w-xs" />
                </div>
              </div>
            ))
          : filtered.map((t) => (
              <Link
                key={t.id}
                to={`/lessons/${t.id}`}
                className="flex items-center gap-4 bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-sm transition-all group"
              >
                {/* Icon */}
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  {iconMap[t.subjectIcon] ?? <BookOpen className="h-5 w-5 text-primary" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">{t.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t.subjectName} · {t.completedLessons}/{t.totalLessons} lessons
                  </div>
                  {/* Progress bar — success green */}
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2 w-full max-w-xs">
                    <div
                      className="h-full bg-success rounded-full transition-all duration-500"
                      style={{ width: `${t.pct}%` }}
                    />
                  </div>
                </div>

                {/* Completion % */}
                <span className={`text-xs font-bold ${t.pct === 100 ? "text-success" : "text-muted-foreground"}`}>
                  {t.pct}%
                </span>

                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </Link>
            ))}

        {!isLoading && filtered.length === 0 && filter !== "Your Courses" && (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No topics found for "{search}"</p>
          </div>
        )}


        {/* Uploaded Materials Generation Section */}
        {materials && materials.length > 0 && (
          <div className="mt-12 space-y-4">
            <h2 className="text-xl font-bold text-foreground tracking-tight border-t border-border pt-6">
              Create Course from Materials
            </h2>
            <p className="text-sm text-muted-foreground">
              Turn your uploaded PDFs and text into structured, step-by-step lessons.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {materials.map((m: any) => {
                const alreadyGenerated = topics.some((t: any) => t.material_id === m.id);
                if (alreadyGenerated) return null;
                return (
                  <div key={m.id} className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-cta/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-5 w-5 text-cta" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">{m.file_name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Uploaded Material</div>
                      </div>
                    </div>
                    <Button 
                      onClick={() => handleGenerateCourse(m)}
                      disabled={generatingFor === m.id}
                      className="w-full bg-cta text-cta-foreground hover:bg-cta/90 text-sm gap-2"
                    >
                      {generatingFor === m.id ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Generating Course...</>
                      ) : (
                        <><Sparkles className="h-4 w-4" /> Generate Course</>
                      )}
                    </Button>
                  </div>
                );
              })}
              <Link to="/materials" className="border-2 border-dashed border-border rounded-xl p-5 flex flex-col items-center justify-center text-muted-foreground hover:text-foreground hover:border-cta/50 transition-colors gap-2 min-h-[140px]">
                <Plus className="h-6 w-6" />
                <span className="text-sm font-medium">Upload New Material</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LessonList;
