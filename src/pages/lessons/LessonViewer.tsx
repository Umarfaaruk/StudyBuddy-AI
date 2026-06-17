import { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, ArrowRight, CheckCircle2, BookOpen, Focus, X, Zap,
  StickyNote, Plus, Trash2, Loader2
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { useDeepFocus } from "@/hooks/useDeepFocus";
import { awardXP } from "@/lib/studySession";
import { toast } from "sonner";
import { doc, getDoc, collection, getDocs, query, where, writeBatch, addDoc, deleteDoc, onSnapshot, orderBy } from "firebase/firestore";

const LESSON_XP = 20; // XP awarded per lesson completion

// ── Mini Quick Notes (Study Area - Backed by Firestore) ───────────────────────────────
const MiniNotes = ({
  lessonId,
  lessonTitle,
  topicId,
  topicTitle
}: {
  lessonId: string;
  lessonTitle: string;
  topicId: string;
  topicTitle: string;
}) => {
  const { user } = useAuth();
  const [notes, setNotes] = useState<{ id: string; text: string; created_at: any }[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);

  // Subscribe to notes in Firestore for this lesson + user
  useEffect(() => {
    if (!user || !lessonId) return;

    // Equality-only query (no orderBy) avoids needing a composite index — sorted
    // newest-first on the client below.
    const q = query(
      collection(db, "saved_notes"),
      where("user_id", "==", user.uid),
      where("lesson_id", "==", lessonId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      fetched.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
      setNotes(fetched);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to saved notes:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, lessonId]);

  const add = async () => {
    if (!draft.trim() || !user) return;
    try {
      await addDoc(collection(db, "saved_notes"), {
        user_id: user.uid,
        lesson_id: lessonId,
        lesson_title: lessonTitle || "Untitled Lesson",
        topic_id: topicId || "",
        topic_title: topicTitle || "Untitled Topic",
        text: draft.trim(),
        created_at: new Date().toISOString()
      });
      setDraft("");
      toast.success("Note saved!");
    } catch (err) {
      console.error("Failed to save note:", err);
      toast.error("Failed to save note.");
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteDoc(doc(db, "saved_notes", id));
      toast.success("Note deleted");
    } catch (err) {
      console.error("Failed to delete note:", err);
      toast.error("Failed to delete note.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Textarea
          placeholder="Jot a note…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[70px] resize-none text-sm bg-gray-50 border-gray-200 rounded-xl focus-visible:ring-[#29ABE2]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.ctrlKey) {
              e.preventDefault();
              add();
            }
          }}
        />
      </div>
      <Button onClick={add} size="sm" disabled={!draft.trim() || loading} className="gap-2 w-full bg-[#0F172A] text-white hover:bg-[#0F172A]/90 font-semibold shadow-sm rounded-xl">
        <Plus className="h-3.5 w-3.5 text-[#29ABE2]" /> Save Note
      </Button>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-[#29ABE2]" />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-4">No notes saved for this lesson yet.</p>
      ) : (
        <div className="space-y-2 max-h-[350px] overflow-y-auto scrollbar-thin pr-1">
          {notes.map((n) => (
            <div key={n.id} className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex items-start gap-2 group relative hover:border-[#29ABE2]/30 transition-all">
              <p className="text-xs text-gray-700 flex-1 whitespace-pre-wrap pr-6 leading-relaxed">{n.text}</p>
              <button
                onClick={() => remove(n.id)}
                className="absolute top-2.5 right-2.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete note"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const LessonViewer = () => {
  const { id: topicId } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isDeepFocus, toggleDeepFocus } = useDeepFocus();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showTools, setShowTools] = useState(false);

  // Fetch topic and lessons from Firestore
  const { data: topic, isLoading: topicLoading } = useQuery({
    queryKey: ["topic", topicId],
    queryFn: async () => {
      if (!topicId) return null;
      try {
        const topicDoc = await getDoc(doc(db, "topics", topicId));
        return topicDoc.exists() ? { id: topicDoc.id, ...topicDoc.data() } as {
          id: string;
          title?: string;
          subject?: string;
          subjectName?: string;
          subjects?: { name?: string };
          [key: string]: any;
        } : null;
      } catch (error) {
        console.error("[LessonViewer] Topic fetch error:", error);
        return null;
      }
    }
  });

  const { data: lessons = [], isLoading: lessonsLoading } = useQuery({
    queryKey: ["lessons", topicId],
    queryFn: async () => {
      if (!topicId) return [];
      try {
        const lessonsSnap = await getDocs(
          query(
            collection(db, "lessons"),
            where("topic_id", "==", topicId)
          )
        );
        const docs = lessonsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as {
          id: string;
          topic_id: string;
          title: string;
          content?: string;
          order?: number;
          [key: string]: any;
        }));
        return docs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      } catch (error) {
        console.error("[LessonViewer] Lessons fetch error:", error);
        return [];
      }
    },
    enabled: !!topicId
  });

  // Fetch user progress for this topic
  const { data: progress = [] } = useQuery({
    queryKey: ["lesson-progress", topicId, user?.uid],
    queryFn: async () => {
      if (!topicId || !user) return [];
      try {
        // The progress doc ID is deterministic (`${uid}_${topicId}`), so a single
        // getDoc is faster and cheaper than a filtered collection query.
        const progressRef = doc(db, "lesson_progress", `${user.uid}_${topicId}`);
        const snap = await getDoc(progressRef);
        if (!snap.exists()) return [];
        return [{
          id: snap.id,
          ...snap.data()
        } as {
          id: string;
          user_id: string;
          topic_id: string;
          lesson_id: string;
          completed: boolean;
          [key: string]: any;
        }];
      } catch (error) {
        console.error("[LessonViewer] Progress fetch error:", error);
        return [];
      }
    },
    enabled: !!topicId && !!user
  });

  const completedSet = new Set(
    (progress ?? []).flatMap((p: any) => p.completed_lessons ?? [])
  );

  const currentLesson = lessons?.[currentIndex];
  const isCompleted = currentLesson ? completedSet.has(currentLesson.id) : false;
  const isLoading = topicLoading || lessonsLoading;
  const totalLessons = lessons?.length ?? 0;
  const overallPct = totalLessons > 0 ? Math.round((completedSet.size / totalLessons) * 100) : 0;

  // Mark complete AND award XP
  const markComplete = useMutation({
    mutationFn: async () => {
      if (!user || !currentLesson || !topicId) return;

      const batch = writeBatch(db);
      const progressRef = doc(db, "lesson_progress", `${user.uid}_${topicId}`);

      const existingProgress = progress[0] || { completed_lessons: [] };
      const updated = Array.from(new Set([...(existingProgress.completed_lessons || []), currentLesson.id]));

      batch.set(progressRef, {
        user_id: user.uid,
        topic_id: topicId,
        completed_lessons: updated,
        updated_at: new Date()
      }, { merge: true });

      await batch.commit();
      await awardXP(user.uid, LESSON_XP, "lesson");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lesson-progress", topicId, user?.uid] });
      queryClient.invalidateQueries({ queryKey: ["topics", user?.uid] });
      queryClient.invalidateQueries({ queryKey: ["totalXp"] });
      toast.success(`Lesson completed! +${LESSON_XP} XP earned.`);
    },
    onError: (err) => {
      console.error("[LessonViewer] Complete mutation error:", err);
      toast.error("Failed to update progress.");
    }
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-6 w-32 rounded-lg" />
        <Skeleton className="h-10 w-3/4 animate-pulse rounded-xl" />
        <Skeleton className="h-4 w-full animate-pulse rounded-lg" />
        <div className="grid grid-cols-1 gap-5">
          <Skeleton className="h-[400px] w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!currentLesson) {
    return (
      <div className="p-12 text-center space-y-4 bg-white rounded-2xl border border-gray-100 shadow-sm max-w-2xl mx-auto mt-8">
        <h2 className="text-xl font-bold text-gray-900">No lessons found</h2>
        <p className="text-gray-500 text-sm">We couldn't load lessons for this topic.</p>
        <Link to="/lessons">
          <Button variant="outline" className="mt-2 rounded-xl border-gray-200"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Lessons</Button>
        </Link>
      </div>
    );
  }

  // Content formatting helper
  const renderInline = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={idx} className="text-gray-900 font-bold">{part.slice(2, -2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`"))
        return <code key={idx} className="text-[#29ABE2] bg-[#DBEAFE] px-1.5 py-0.5 rounded-md text-xs font-mono border border-[#29ABE2]/10">{part.slice(1, -1)}</code>;
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch)
        return <a key={idx} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-[#29ABE2] hover:text-[#29ABE2] font-medium underline underline-offset-2">{linkMatch[1]}</a>;
      return part;
    });
  };

  const renderContent = (text?: string) =>
    (text ?? "").split("\n").map((line, i) => {
      if (line.startsWith("### "))
        return <h3 key={i} className="text-lg font-bold mt-6 mb-3 text-gray-900">{renderInline(line.slice(4))}</h3>;
      if (line.startsWith("## "))
        return <h2 key={i} className="text-xl font-bold mt-8 mb-4 text-gray-900">{renderInline(line.slice(3))}</h2>;
      if (line.startsWith("# "))
        return <h1 key={i} className="text-2xl font-bold mt-10 mb-5 text-gray-900 tracking-tight">{renderInline(line.slice(2))}</h1>;
      if (line.startsWith("- "))
        return <li key={i} className="text-gray-600 ml-5 mb-2 leading-relaxed flex items-start"><span className="mr-2 mt-2 h-1.5 w-1.5 rounded-full bg-[#29ABE2] flex-shrink-0"></span><span>{renderInline(line.slice(2))}</span></li>;
      if (/^\d+\.\s/.test(line))
        return <li key={i} className="text-gray-600 ml-5 mb-2 list-decimal leading-relaxed">{renderInline(line.replace(/^\d+\.\s/, ""))}</li>;
      if (line.trim() === "") return <br key={i} />;
      if (line.startsWith("  "))
        return (
          <div key={i} className="font-mono text-sm text-[#29ABE2] bg-[#DBEAFE] border border-[#29ABE2]/10 px-4 py-2 rounded-xl my-2 overflow-x-auto">
            {line}
          </div>
        );
      return (
        <p key={i} className="text-gray-600 leading-relaxed mb-4 text-[15px]">
          {renderInline(line)}
        </p>
      );
    });

  return (
    <div className={`p-4 md:p-8 max-w-5xl mx-auto space-y-6 ${isDeepFocus ? "reading-mode" : ""}`}>
      {/* ── Back link + Actions ───────────────────────────── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {!isDeepFocus && (
          <Link
            to="/lessons"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Lessons
          </Link>
        )}

        <div className="flex items-center gap-2 ml-auto">
          {/* Lesson Notes Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTools(!showTools)}
            className={`gap-2 text-xs rounded-xl transition-all ${showTools ? "border-[#29ABE2] text-[#29ABE2] bg-[#DBEAFE]" : "text-gray-500 border-gray-200 hover:bg-gray-50"}`}
          >
            <StickyNote className="h-3.5 w-3.5" />
            <span>Notes</span>
          </Button>

          {/* Deep Focus Mode toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={toggleDeepFocus}
            className={`gap-2 text-xs rounded-xl transition-all ${
              isDeepFocus
                ? "border-[#29ABE2] text-[#29ABE2] bg-[#DBEAFE]"
                : "text-gray-500 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {isDeepFocus ? (
              <><X className="h-3.5 w-3.5" /> Exit Focus</>
            ) : (
              <><Focus className="h-3.5 w-3.5" /> Deep Focus</>
            )}
          </Button>
        </div>
      </div>

      {/* ── Topic / lesson metadata ───────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
          <span className="bg-[#DBEAFE] text-[#29ABE2] px-2.5 py-1 rounded-full font-bold tracking-wide uppercase text-[10px]">
            {(topic?.subjects as { name?: string })?.name ?? topic?.subject ?? "Subject"}
          </span>
          <span className="font-medium">Lesson {currentIndex + 1} of {totalLessons}</span>
          {isCompleted && (
            <span className="flex items-center gap-1 text-emerald-500 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> Completed
            </span>
          )}
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight leading-tight">
          {currentLesson.title}
        </h1>
      </div>

      {/* ── Progress bar ─────────────────────────────────── */}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden w-full">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${overallPct}%` }}
        />
      </div>

      {/* ── Main content area (responsive grid with tools) ── */}
      <div className={`grid gap-6 items-start ${showTools ? "lg:grid-cols-[1fr_320px]" : "grid-cols-1"}`}>
        {/* Left: Lesson content card */}
        <div className="space-y-4 min-w-0">
          {/* YouTube Video Embed (for YouTube-sourced courses) */}
          {topic?.youtube_video_id && (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="aspect-video bg-black relative">
                <iframe
                  src={`https://www.youtube.com/embed/${topic.youtube_video_id}`}
                  className="absolute inset-0 w-full h-full border-none"
                  title={topic.youtube_title || topic.title || "YouTube Video"}
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
              </div>
              <div className="px-5 py-3 flex items-center gap-3 border-t border-gray-100 bg-gray-50/50">
                <div className="h-7 w-7 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                  <svg className="h-3.5 w-3.5 text-red-500" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-900 truncate">{topic.youtube_title || topic.title}</p>
                  {topic.youtube_channel && (
                    <p className="text-[10px] text-gray-400 truncate">{topic.youtube_channel}</p>
                  )}
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-red-500 bg-red-50 px-2 py-0.5 rounded-full flex-shrink-0">
                  YouTube Source
                </span>
              </div>
            </div>
          )}

          {/* Lesson Content Card */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 md:p-10 shadow-sm">
            <div className="flex items-center gap-3 pb-5 border-b border-gray-100 mb-6">
              <div className="h-8 w-8 rounded-lg bg-[#DBEAFE] flex items-center justify-center">
                <BookOpen className="h-4 w-4 text-[#29ABE2]" />
              </div>
              <span className="font-semibold text-gray-900">Lesson Content</span>
              <span className="ml-auto text-[10px] font-bold tracking-widest uppercase text-[#29ABE2] bg-[#DBEAFE] px-2.5 py-1 rounded-full">
                +{LESSON_XP} XP
              </span>
            </div>
            <div className="prose prose-gray prose-sm md:prose-base max-w-none">
              {renderContent(currentLesson.content)}
            </div>
          </div>
        </div>

        {/* Right: Notes Sidebar (only when toggled) */}
        {showTools && (
          <div className="animate-in slide-in-from-right-4 duration-200">
            <div className="bg-white border border-gray-100 rounded-2xl p-5 sticky top-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 pb-4 border-b border-gray-100 mb-4">
                <StickyNote className="h-4 w-4 text-[#29ABE2]" />
                Lesson Notes
              </div>
              <div className="min-h-[200px]">
                <MiniNotes
                  lessonId={currentLesson.id}
                  lessonTitle={currentLesson.title}
                  topicId={topicId || ""}
                  topicTitle={topic?.title || "Untitled Course"}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Navigation + Complete actions ─────────────────── */}
      <div className="flex items-center gap-3 flex-wrap pt-4">
        <Button
          variant="outline"
          className="gap-2 min-h-[48px] rounded-xl border-gray-200 hover:bg-gray-50 text-gray-700"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((i) => i - 1)}
        >
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline font-medium">Previous</span>
        </Button>

        {/* Mark complete */}
        <Button
          onClick={() => markComplete.mutate()}
          className={`gap-2 flex-1 min-h-[48px] rounded-xl font-semibold transition-all shadow-sm ${
            isCompleted
              ? "bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100"
              : "bg-gradient-to-r from-[#29ABE2] to-[#29ABE2] text-white hover:opacity-90"
          }`}
          disabled={isCompleted || markComplete.isPending}
        >
          {isCompleted ? (
            <><CheckCircle2 className="h-5 w-5" /> Completed</>
          ) : markComplete.isPending ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Saving…</>
          ) : (
            <><Zap className="h-5 w-5 text-white/90" /> Mark Complete (+{LESSON_XP} XP)</>
          )}
        </Button>

        <Button
          className="gap-2 min-h-[48px] rounded-xl bg-[#0F172A] text-white hover:bg-[#0F172A]/90 font-medium shadow-sm"
          disabled={currentIndex >= totalLessons - 1}
          onClick={() => setCurrentIndex((i) => i + 1)}
        >
          <span className="hidden sm:inline">Next</span> <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Take a quiz prompt ────────────────────────────── */}
      {overallPct === 100 && (
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 mt-6 flex items-center justify-between flex-wrap gap-4 shadow-lg">
          <div>
            <div className="font-bold text-white text-lg flex items-center gap-2">
              <span className="text-2xl">🎉</span> All lessons complete!
            </div>
            <div className="text-emerald-50 mt-1 font-medium text-sm">
              Test your knowledge with a quiz on this topic.
            </div>
          </div>
          <Link to={`/quiz/${topicId}`} state={{ topicTitle: topic?.title ?? "Topic", subjectName: (topic?.subjects as { name?: string })?.name ?? "" }}>
            <Button className="bg-white text-emerald-600 hover:bg-gray-50 font-bold rounded-xl h-11 px-6 shadow-sm">
              Take Quiz
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
};

export default LessonViewer;
