import { useState, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronRight, Search, Calculator, Atom, FlaskConical, Leaf, FileText, Loader2, Sparkles, Plus, CalendarDays, Trash2, AlertTriangle, Youtube, Trophy, Award, Printer, X, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, query, getDocs, where, doc, writeBatch, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { aiComplete } from "@/lib/aiService";
import { toast } from "sonner";
import { extractYouTubeVideoId } from "@/lib/youtube";
import { getAuthHeaders } from "@/lib/authHeaders";

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
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeGenerating, setYoutubeGenerating] = useState(false);
  const [selectedCert, setSelectedCert] = useState<any>(null);
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

        // Fetch topic quiz progress
        const topicProgressSnap = await getDocs(
          query(
            collection(db, "topic_progress"),
            where("user_id", "==", user.uid)
          )
        );
        const topicProgressMap = new Map(
          topicProgressSnap.docs.map(doc => [doc.data().topic_id, doc.data()])
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
          const topicProg = topicProgressMap.get(topic.id);
          return {
            ...topic,
            pct: total > 0 ? Math.round((completed / total) * 100) : 0,
            completedLessons: completed,
            totalLessons: total,
            avgQuizScore: topicProg?.avg_quiz_score ?? null,
            completionDate: progress?.updated_at?.toDate() || progress?.created_at?.toDate() || null
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
          // Ownership stamp — lets Firestore rules allow the owner (and only
          // the owner) to write custom lessons without a parent-topic lookup.
          is_custom: true,
          user_id: user.uid,
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

  // ── YouTube to Course ───────────────────────────────────────────
  const handleGenerateYouTubeCourse = async () => {
    if (!user) return;
    const videoId = extractYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      toast.error("Please enter a valid YouTube URL");
      return;
    }

    setYoutubeGenerating(true);
    toast.info("Fetching video transcript & generating course. This may take a minute...");

    try {
      // Step 1: Fetch transcript
      const resp = await fetch(`/api/youtube-transcript?v=${videoId}&t=${Date.now()}`, {
        headers: await getAuthHeaders(),
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: Failed to fetch video data`);
      }
      const videoData = await resp.json();
      
      // Check for API errors in response body
      if (videoData.error) {
        toast.error(`Error fetching video: ${videoData.error}`);
        setYoutubeGenerating(false);
        return;
      }
      
      const videoTitle = videoData.title || "YouTube Video";
      const videoChannel = videoData.channel || "Unknown Channel";
      const hasTranscript =
        videoData.hasTranscript === true && (videoData.segments?.length ?? 0) > 0;

      if (!hasTranscript) {
        toast.warning("Captions are not available for this video. Course will be based on title/description only.");
      }

      const transcript = hasTranscript
        ? videoData.transcript
        : `No transcript available. Topic: ${videoTitle}\nChannel: ${videoChannel}\nDescription: ${videoData.transcript || "No description provided."}`;

      // Step 2: Chunked transcript for long videos
      const maxChunkLen = 120000;
      const chunks: string[] = [];
      if (transcript.length <= maxChunkLen) {
        chunks.push(transcript);
      } else {
        let start = 0;
        while (start < transcript.length) {
          const end = Math.min(start + maxChunkLen, transcript.length);
          chunks.push(transcript.substring(start, end));
          start = end - 500;
          if (start >= transcript.length) break;
        }
      }

      // Step 3: Summarize each chunk for accuracy
      let condensedContent = transcript;
      if (chunks.length > 1) {
        const chunkSummaries: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
          const summary = await aiComplete({
            messages: [
              { role: "system", content: "You are a precise transcript summarizer. Extract every key point, concept, example, and argument. Do not add information not in the transcript." },
              { role: "user", content: `Summarize this transcript segment (Part ${i + 1}/${chunks.length}) from the video "${videoTitle}". Be thorough and precise.\n\nTranscript segment:\n${chunks[i]}` }
            ],
            temperature: 0.3,
            maxTokens: 1500,
          });
          chunkSummaries.push(summary);
        }
        condensedContent = chunkSummaries.join("\n\n---\n\n");
      }

      // Step 4: Generate structured course
      let parsed = null;
      let attempt = 0;
      const maxRetries = 3;
      let lastError: any = null;

      while (attempt < maxRetries && !parsed) {
        try {
          attempt++;
          const prompt = `You are an expert educator. Create a structured course from this YouTube video transcript ${hasTranscript ? '' : '(or since captions are not available, from the video title and topic) '}. Return ONLY a valid JSON object (no markdown wrappers, no commentary).

JSON format:
{"topic_title":"string","subject":"string","description":"string","lessons":[{"title":"string","content":"string"}]}

Rules:
- topic_title: A clear, concise course name based on the video content
- subject: the academic subject area (e.g., "Science", "History", "Business", "Technology")
- description: 1-2 sentence summary of what this course covers
- lessons: 4-6 lessons that break down the video content ${hasTranscript ? 'chronologically' : 'comprehensively'}
- Each lesson content: 200-400 words using ## headings, **bold** key terms, and bullet points
${hasTranscript ? '- Progress from the beginning of the video to the end' : '- Provide a highly informative, accurate educational guide on the topic'}
${hasTranscript ? '- Each lesson should cover a distinct section/topic from the video' : '- Ensure each lesson covers a core sub-topic, theory, or application of this subject'}
- Include specific facts, examples, and key points — be PRECISE
- Do NOT add generic filler content
${hasTranscript ? '- Reference timestamps where possible (e.g., "As discussed early in the video...")' : ''}

Video Title: "${videoTitle}"
Channel: ${videoChannel}
Video Content:
${condensedContent.substring(0, 15000)}`;

          const res = await aiComplete({
            messages: [{ role: "user", content: prompt }],
            temperature: 0.4,
            maxTokens: 4096,
          });

          let jsonString = res;
          const match = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (match) jsonString = match[1];
          const startIdx = jsonString.indexOf('{');
          const endIdx = jsonString.lastIndexOf('}');
          if (startIdx === -1 || endIdx === -1) throw new Error("No JSON object found");
          jsonString = jsonString.substring(startIdx, endIdx + 1);

          parsed = JSON.parse(jsonString.trim());
          if (!parsed.topic_title || !parsed.lessons || !Array.isArray(parsed.lessons) || parsed.lessons.length === 0) {
            throw new Error("Invalid course structure");
          }
          parsed.lessons = parsed.lessons.filter((l: any) => l && l.title && l.content);
          if (parsed.lessons.length === 0) throw new Error("No valid lessons generated");
        } catch (err) {
          lastError = err;
          parsed = null;
          if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000));
        }
      }

      if (!parsed) throw lastError || new Error("Failed to generate course.");

      // Step 5: Save to Firestore
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
        source: "youtube",
        youtube_video_id: videoId,
        youtube_title: videoTitle,
        youtube_channel: videoChannel,
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
          // Ownership stamp — see note above.
          is_custom: true,
          user_id: user.uid,
          created_at: new Date()
        });
      });

      await batch.commit();
      toast.success(`Course "${parsed.topic_title}" created with ${parsed.lessons.length} lessons from YouTube!`);
      queryClient.invalidateQueries({ queryKey: ["topics", user.uid] });
      setFilter("Your Courses");
      setYoutubeUrl("");
    } catch (error: any) {
      console.error("YouTube course generation error:", error);
      toast.error(error.message || "Failed to generate course from YouTube. Try again.");
    } finally {
      setYoutubeGenerating(false);
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


      {/* Completed Courses Section */}
      {(() => {
        const completedTopics = topics.filter((t: any) => t.pct === 100);
        if (completedTopics.length === 0) return null;
        return (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-500" />
                Completed Courses
              </h2>
              <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full">
                {completedTopics.length} Course{completedTopics.length > 1 ? 's' : ''} Completed
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {completedTopics.map((t: any) => (
                <div
                  key={t.id}
                  className="bg-gradient-to-r from-emerald-50/50 to-teal-50/20 border border-emerald-100 rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[150px]"
                >
                  <Award className="absolute -right-6 -bottom-6 h-28 w-28 text-emerald-500/5 pointer-events-none" />

                  <div className="flex items-start gap-4 mb-4">
                    <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600">
                      <Trophy className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
                      <span className="text-[9px] font-extrabold tracking-widest uppercase text-emerald-600 block mb-1">
                        {t.subjectName || t.subject || "General"}
                      </span>
                      <h3 className="text-base font-bold text-gray-900 leading-snug line-clamp-1">{t.title}</h3>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500 font-medium">
                        <span>Completed: {t.completionDate ? new Date(t.completionDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : "Recently"}</span>
                        {t.avgQuizScore !== null && (
                          <>
                            <span className="text-gray-300">•</span>
                            <span className="text-emerald-700 font-bold bg-emerald-100/50 px-2 py-0.5 rounded-full">
                              Quiz Score: {t.avgQuizScore}%
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 mt-2 border-t border-emerald-100/60 pt-3 z-10">
                    <button
                      onClick={() => setSelectedCert({ title: t.title, date: t.completionDate })}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 transition-colors"
                    >
                      <Award className="h-3.5 w-3.5" /> View Certificate
                    </button>
                    <div className="flex gap-2">
                      <Link
                        to={`/lessons/${t.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-xl transition-all"
                      >
                        <BookOpen className="h-3 w-3" /> Review Course
                      </Link>
                      <Link
                        to={`/quiz`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8] hover:text-white hover:bg-[#1D4ED8] bg-[#DBEAFE] px-3 py-1.5 rounded-xl transition-all"
                      >
                        <RotateCcw className="h-3 w-3" /> Retake Quiz
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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

      {/* ── Create Course from YouTube ─────────────────────── */}
      <div className="mt-12 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Youtube className="h-5 w-5 text-red-500" />
            Create Course from YouTube
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Paste a YouTube link to auto-generate a structured course with lessons from the video's content.
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Youtube className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
              <input
                type="url"
                placeholder="Paste YouTube link here (e.g. https://youtube.com/watch?v=...)" 
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                disabled={youtubeGenerating}
                className="w-full h-12 pl-10 pr-4 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#1D4ED8]/40 focus:ring-2 focus:ring-[#1D4ED8]/10 text-gray-900 transition-all disabled:opacity-50"
                onKeyDown={(e) => e.key === "Enter" && !youtubeGenerating && handleGenerateYouTubeCourse()}
              />
            </div>
            <Button
              onClick={handleGenerateYouTubeCourse}
              disabled={youtubeGenerating || !youtubeUrl.trim()}
              className="h-12 px-6 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold rounded-xl gap-2 shadow-sm shrink-0"
            >
              {youtubeGenerating ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
              ) : (
                <><Sparkles className="h-4 w-4" /> Generate Course</>
              )}
            </Button>
          </div>
          {youtubeGenerating && (
            <div className="mt-4 flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl animate-in fade-in duration-300">
              <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Loader2 className="h-4 w-4 animate-spin text-[#1D4ED8]" />
              </div>
              <div>
                <p className="text-xs font-semibold text-blue-900">AI is analyzing the video...</p>
                <p className="text-[10px] text-blue-600 mt-0.5">Fetching transcript → Summarizing content → Generating lessons</p>
              </div>
            </div>
          )}
        </div>
      </div>

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
      {/* ── Certificate Modal ── */}
      {selectedCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl relative border-8 border-amber-100 overflow-hidden">
            {/* Close Button */}
            <button
              onClick={() => setSelectedCert(null)}
              className="absolute top-4 right-4 p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Certificate Frame/Layout */}
            <div className="border-2 border-double border-amber-600 p-8 text-center space-y-6 bg-gradient-to-b from-amber-50/20 to-white">
              <div className="flex justify-center">
                <div className="relative">
                  <Award className="h-16 w-16 text-amber-500 animate-pulse" />
                  <Trophy className="h-6 w-6 text-amber-600 absolute bottom-1 right-1" />
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold tracking-[0.2em] uppercase text-amber-700 block">Certificate of Achievement</span>
                <div className="h-0.5 w-24 bg-amber-600 mx-auto"></div>
              </div>
              <p className="text-sm italic text-gray-500">This is proudly presented to</p>
              <h2 className="text-2xl md:text-3xl font-bold font-serif text-gray-900 border-b border-gray-200 pb-2 max-w-md mx-auto">
                {user?.displayName || "EduOnx Scholar"}
              </h2>
              <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
                for successfully completing the custom curriculum and mastering all course materials for the topic:
              </p>
              <h3 className="text-lg md:text-xl font-bold text-amber-800">{selectedCert.title}</h3>
              <div className="flex justify-between items-center pt-8 max-w-md mx-auto">
                <div className="text-center space-y-0.5">
                  <span className="text-xs text-gray-500 font-mono block">Date Issued</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {selectedCert.date ? new Date(selectedCert.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                <div className="text-center space-y-0.5">
                  <span className="text-xs text-gray-500 font-mono block">Authorized By</span>
                  <span className="text-sm font-serif italic font-bold text-gray-800 block">EduOnx Academy</span>
                </div>
              </div>
            </div>

            {/* Print button */}
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setSelectedCert(null)} className="rounded-xl">
                Close
              </Button>
              <Button onClick={() => window.print()} className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl gap-2 shadow-md">
                <Printer className="h-4 w-4" /> Print Certificate
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LessonList;
