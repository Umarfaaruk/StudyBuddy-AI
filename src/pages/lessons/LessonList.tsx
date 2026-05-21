import { useState, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronRight, Search, Calculator, Atom, FlaskConical, Leaf, FileText, Loader2, Sparkles, Plus, CalendarDays, Trash2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, query, getDocs, where, doc, writeBatch, deleteDoc } from "firebase/firestore";
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

        const filteredTopicsData = topicsData.filter(topic => {
          if (topic.is_custom) {
            return topic.user_id === user.uid;
          }
          return true;
        });

        return filteredTopicsData.map(topic => {
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

  const handleDeleteCourse = async (topicId: string, topicTitle: string) => {
    if (!user) return;
    setDeletingId(topicId);
    try {
      // 1. Delete all lessons for this topic
      const lessonsSnap = await getDocs(
        query(collection(db, "lessons"), where("topic_id", "==", topicId))
      );
      for (const d of lessonsSnap.docs) {
        try {
          await deleteDoc(d.ref);
        } catch (e) {
          console.error("Failed to delete lesson:", d.id, e);
        }
      }

      // 2. Delete lesson_progress for this topic + user
      try {
        const progressRef = doc(db, "lesson_progress", `${user.uid}_${topicId}`);
        await deleteDoc(progressRef);
      } catch (e) {
        console.error("Failed to delete progress:", e);
      }

      // 3. Delete the topic document itself
      await deleteDoc(doc(db, "topics", topicId));

      toast.success(`"${topicTitle}" removed successfully`);
      queryClient.invalidateQueries({ queryKey: ["topics", user.uid] });
    } catch (error) {
      console.error("[LessonList] Delete course error:", error);
      toast.error("Failed to delete course. Try again.");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

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
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8">
      {/* Banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#1D4ED8] to-[#2563EB] rounded-3xl p-8 md:p-10 shadow-lg text-white">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-block px-3 py-1 bg-white/20 rounded-full text-[10px] font-bold tracking-widest uppercase mb-4 backdrop-blur-sm">
              Your Learning Journey
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">Lessons</h1>
            <p className="text-white/80 max-w-md text-sm md:text-base">Browse topics, continue learning, and generate custom courses from your materials.</p>
          </div>
          <button
            onClick={() => setShowPlanner(!showPlanner)}
            className="flex items-center gap-2 bg-[#0F172A] hover:bg-[#0F172A]/90 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm shrink-0"
          >
            <CalendarDays className="h-4 w-4" />
            {showPlanner ? "Hide Planner" : "Study Planner"}
          </button>
        </div>
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 right-20 -mb-20 w-40 h-40 bg-white opacity-10 rounded-full blur-2xl pointer-events-none"></div>
      </div>

      {/* Inline Study Planner Panel */}
      {showPlanner && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 overflow-hidden animate-in slide-in-from-top-2 duration-300">
          <Suspense fallback={<div className="p-8 flex justify-center"><Loader2 className="animate-spin h-6 w-6 text-[#1D4ED8]" /></div>}>
            <StudyPlanner />
          </Suspense>
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            placeholder="Search topics…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-12 h-12 bg-white rounded-xl border-gray-200 focus-visible:ring-[#1D4ED8] shadow-sm text-sm"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide items-center">
          {subjectNames.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border whitespace-nowrap transition-all shadow-sm ${
                filter === s
                  ? "bg-[#0F172A] text-white border-[#0F172A]"
                  : "bg-white border-gray-100 text-gray-500 hover:border-gray-300 hover:text-gray-900"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Topic list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-4 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
                <Skeleton className="h-2 w-full mt-2 rounded-full" />
              </div>
            ))
          : filtered.map((t) => (
              <div key={t.id} className="relative group flex">
                {/* ── Delete Confirmation Overlay ── */}
                {confirmDeleteId === t.id && (
                  <div className="absolute inset-0 z-20 bg-white/95 backdrop-blur-md border border-red-100 rounded-2xl flex flex-col justify-center gap-3 p-6 animate-in fade-in-0 zoom-in-95 duration-200 shadow-lg">
                    <div className="flex items-center gap-2 text-red-600 font-medium">
                      <AlertTriangle className="h-5 w-5" />
                      <p>Delete "{t.title}"?</p>
                    </div>
                    <p className="text-xs text-gray-500">This will remove all lessons & progress permanently.</p>
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs h-9 rounded-xl flex-1 border-gray-200"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleDeleteCourse(t.id, t.title)}
                        disabled={deletingId === t.id}
                        className="text-xs h-9 bg-red-500 text-white hover:bg-red-600 rounded-xl flex-1 gap-1.5 shadow-sm"
                      >
                        {deletingId === t.id ? (
                          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Deleting…</>
                        ) : (
                          <><Trash2 className="h-3.5 w-3.5" /> Delete</>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                <div
                  className="flex flex-col w-full bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:border-[#1D4ED8]/30 hover:shadow-md transition-all relative overflow-hidden"
                >
                  {/* Delete button (visible on hover) */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setConfirmDeleteId(t.id);
                    }}
                    className="absolute top-4 right-4 p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all z-10 focus:opacity-100"
                    title="Remove course"
                    aria-label={`Remove course ${t.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>

                  <Link
                    to={`/lessons/${t.id}`}
                    className="flex flex-col h-full"
                  >
                    <div className="flex items-start gap-4 mb-4">
                      {/* Icon */}
                      <div className="h-12 w-12 rounded-xl bg-[#DBEAFE] flex items-center justify-center flex-shrink-0 text-[#1D4ED8]">
                        {iconMap[t.subjectIcon] ?? <BookOpen className="h-6 w-6" />}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 pr-8">
                        <div className="text-[10px] font-bold tracking-widest uppercase text-[#1D4ED8] mb-1">
                          {t.subjectName}
                        </div>
                        <h3 className="text-base font-semibold text-gray-900 leading-tight mb-1 line-clamp-2">{t.title}</h3>
                        <div className="text-xs text-gray-500 font-medium">
                          {t.completedLessons} of {t.totalLessons} lessons completed
                        </div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-auto pt-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-500">Progress</span>
                        <span className={`text-xs font-bold ${t.pct === 100 ? "text-emerald-500" : "text-[#1D4ED8]"}`}>
                          {t.pct}%
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden w-full">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${t.pct === 100 ? "bg-emerald-500" : "bg-gradient-to-r from-[#1D4ED8] to-[#2563EB]"}`}
                          style={{ width: `${t.pct}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                </div>
              </div>
            ))}
      </div>

      {!isLoading && filtered.length === 0 && filter !== "Your Courses" && (
        <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center shadow-sm">
          <div className="h-16 w-16 bg-[#DBEAFE] rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen className="h-8 w-8 text-[#1D4ED8] opacity-50" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No topics found</h3>
          <p className="text-sm text-gray-500">Try adjusting your search or filter criteria.</p>
        </div>
      )}

      {/* Uploaded Materials Generation Section */}
      {materials && materials.length > 0 && (
        <div className="mt-12 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">
                Create Course from Materials
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Turn your uploaded PDFs and text into structured, step-by-step lessons.
              </p>
            </div>
            <Link to="/materials" className="hidden sm:flex items-center gap-2 text-sm font-medium text-[#1D4ED8] hover:text-[#2563EB] bg-[#DBEAFE] px-4 py-2 rounded-xl transition-colors">
              <Plus className="h-4 w-4" />
              New Material
            </Link>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {materials.map((m: any) => {
              const alreadyGenerated = topics.some((t: any) => t.material_id === m.id);
              if (alreadyGenerated) return null;
              return (
                <div key={m.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between gap-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5 text-indigo-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight" title={m.file_name}>{m.file_name}</div>
                      <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mt-2">Material</div>
                    </div>
                  </div>
                  <Button 
                    onClick={() => handleGenerateCourse(m)}
                    disabled={generatingFor === m.id}
                    className="w-full bg-[#0F172A] text-white hover:bg-[#0F172A]/90 text-sm font-medium gap-2 rounded-xl h-10"
                  >
                    {generatingFor === m.id ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                    ) : (
                      <><Sparkles className="h-4 w-4 text-[#1D4ED8]" /> Generate Course</>
                    )}
                  </Button>
                </div>
              );
            })}
            <Link to="/materials" className="sm:hidden bg-white border-2 border-dashed border-gray-200 rounded-2xl p-5 flex flex-col items-center justify-center text-gray-400 hover:text-[#1D4ED8] hover:border-[#1D4ED8]/50 hover:bg-[#DBEAFE] transition-all gap-2 min-h-[160px]">
              <Plus className="h-8 w-8" />
              <span className="text-sm font-semibold">Upload Material</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default LessonList;
