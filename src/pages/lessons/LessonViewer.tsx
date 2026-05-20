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

    const q = query(
      collection(db, "saved_notes"),
      where("user_id", "==", user.uid),
      where("lesson_id", "==", lessonId),
      orderBy("created_at", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
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
          className="min-h-[70px] resize-none text-sm bg-muted/30"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.ctrlKey) {
              e.preventDefault();
              add();
            }
          }}
        />
      </div>
      <Button onClick={add} size="sm" disabled={!draft.trim() || loading} className="gap-2 w-full bg-navy text-highlight hover:bg-navy/90 font-semibold shadow-sm">
        <Plus className="h-3.5 w-3.5" /> Save Note
      </Button>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No notes saved for this lesson yet.</p>
      ) : (
        <div className="space-y-2 max-h-[350px] overflow-y-auto scrollbar-thin pr-1">
          {notes.map((n) => (
            <div key={n.id} className="bg-muted/40 border border-border/50 rounded-lg p-3 flex items-start gap-2 group relative hover:border-primary/20 transition-all">
              <p className="text-xs text-foreground flex-1 whitespace-pre-wrap pr-6 leading-relaxed">{n.text}</p>
              <button
                onClick={() => remove(n.id)}
                className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
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
        const progressSnap = await getDocs(
          query(
            collection(db, "lesson_progress"),
            where("user_id", "==", user.uid),
            where("topic_id", "==", topicId)
          )
        );
        return progressSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as {
          id: string;
          user_id: string;
          topic_id: string;
          lesson_id: string;
          completed: boolean;
          [key: string]: any;
        }));
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
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-3/4 animate-pulse" />
        <Skeleton className="h-4 w-full animate-pulse" />
        <div className="grid grid-cols-1 gap-5">
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  if (!currentLesson) {
    return (
      <div className="p-8 text-center space-y-4">
        <h2 className="text-xl font-bold text-foreground">No lessons found</h2>
        <p className="text-muted-foreground text-sm">We couldn't load lessons for this topic.</p>
        <Link to="/lessons">
          <Button variant="outline" className="mt-2"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Lessons</Button>
        </Link>
      </div>
    );
  }

  // Content formatting helper
  const renderInline = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={idx} className="text-foreground font-bold">{part.slice(2, -2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`"))
        return <code key={idx} className="text-primary bg-primary/10 px-1 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch)
        return <a key={idx} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{linkMatch[1]}</a>;
      return part;
    });
  };

  const renderContent = (text?: string) =>
    (text ?? "").split("\n").map((line, i) => {
      if (line.startsWith("### "))
        return <h3 key={i} className="text-lg font-bold mt-5 mb-2 text-foreground">{renderInline(line.slice(4))}</h3>;
      if (line.startsWith("## "))
        return <h2 key={i} className="text-xl font-bold mt-6 mb-3 text-foreground">{renderInline(line.slice(3))}</h2>;
      if (line.startsWith("# "))
        return <h1 key={i} className="text-2xl font-bold mt-8 mb-4 text-foreground">{renderInline(line.slice(2))}</h1>;
      if (line.startsWith("- "))
        return <li key={i} className="text-muted-foreground ml-4 leading-relaxed">{renderInline(line.slice(2))}</li>;
      if (/^\d+\.\s/.test(line))
        return <li key={i} className="text-muted-foreground ml-4 list-decimal leading-relaxed">{renderInline(line.replace(/^\d+\.\s/, ""))}</li>;
      if (line.trim() === "") return <br key={i} />;
      if (line.startsWith("  "))
        return (
          <div key={i} className="font-mono text-sm text-primary bg-muted px-3 py-0.5 rounded my-0.5">
            {line}
          </div>
        );
      return (
        <p key={i} className="text-muted-foreground leading-relaxed">
          {renderInline(line)}
        </p>
      );
    });

  return (
    <div className={`p-4 md:p-8 max-w-6xl mx-auto space-y-5 ${isDeepFocus ? "reading-mode" : ""}`}>

      {/* ── Back link + Actions ───────────────────────────── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {!isDeepFocus && (
          <Link
            to="/lessons"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
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
            className={`gap-2 text-xs ${showTools ? "border-primary text-primary bg-primary/10" : "text-muted-foreground"}`}
          >
            <StickyNote className="h-3.5 w-3.5" />
            <span>Notes</span>
          </Button>

          {/* Deep Focus Mode toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={toggleDeepFocus}
            className={`gap-2 text-xs ${
              isDeepFocus
                ? "border-primary text-primary bg-primary/10"
                : "text-muted-foreground"
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
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
            {(topic?.subjects as { name?: string })?.name ?? topic?.subject ?? "Subject"}
          </span>
          <span>Lesson {currentIndex + 1} of {totalLessons}</span>
          {isCompleted && (
            <span className="flex items-center gap-1 text-success font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> Completed
            </span>
          )}
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
          {currentLesson.title}
        </h1>
      </div>

      {/* ── Progress bar ─────────────────────────────────── */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-success rounded-full transition-all duration-500"
          style={{ width: `${overallPct}%` }}
        />
      </div>

      {/* ── Main content area (responsive grid with tools) ── */}
      <div className={`grid gap-5 ${showTools ? "lg:grid-cols-[1fr_320px]" : "grid-cols-1"}`}>

        {/* Left: Lesson content card */}
        <div className="bg-card border border-border rounded-xl p-5 md:p-8 space-y-4 shadow-sm min-w-0">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground">Lesson Content</span>
            <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              +{LESSON_XP} XP on complete
            </span>
          </div>
          <div className="prose prose-sm max-w-none space-y-1">
            {renderContent(currentLesson.content)}
          </div>
        </div>

        {/* Right: Notes Sidebar (only when toggled) */}
        {showTools && (
          <div className="space-y-4 animate-in slide-in-from-right-4 duration-200">
            <div className="bg-card border border-border rounded-xl p-4 space-y-4 sticky top-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground pb-3 border-b border-border">
                <StickyNote className="h-4 w-4 text-primary" />
                Lesson Notes
              </div>

              {/* Notes content */}
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
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        <Button
          variant="outline"
          className="gap-2 min-h-[44px]"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((i) => i - 1)}
        >
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Previous</span>
        </Button>

        {/* Mark complete — primary CTA uses Amber */}
        <Button
          onClick={() => markComplete.mutate()}
          className={`gap-2 flex-1 min-h-[44px] ${
            isCompleted
              ? "bg-success/10 text-success border border-success/30 hover:bg-success/20"
              : "bg-cta text-cta-foreground hover:bg-cta/90 font-semibold"
          }`}
          disabled={isCompleted || markComplete.isPending}
        >
          {isCompleted ? (
            <><CheckCircle2 className="h-4 w-4" /> Completed</>
          ) : markComplete.isPending ? (
            "Saving…"
          ) : (
            <><Zap className="h-4 w-4" /> Mark Complete (+{LESSON_XP} XP)</>
          )}
        </Button>

        <Button
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px]"
          disabled={currentIndex >= totalLessons - 1}
          onClick={() => setCurrentIndex((i) => i + 1)}
        >
          <span className="hidden sm:inline">Next</span> <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Take a quiz prompt ────────────────────────────── */}
      {overallPct === 100 && (
        <div className="bg-success/10 border border-success/20 rounded-xl p-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="font-semibold text-foreground text-sm">🎉 All lessons complete!</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Test your knowledge with a quiz on this topic.
            </div>
          </div>
          <Link to={`/quiz/${topicId}`} state={{ topicTitle: topic?.title ?? "Topic", subjectName: (topic?.subjects as { name?: string })?.name ?? "" }}>
            <Button className="bg-cta text-cta-foreground hover:bg-cta/90 text-sm min-h-[44px]">
              Take Quiz
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
};

export default LessonViewer;
