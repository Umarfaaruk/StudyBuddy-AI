import { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, ArrowRight, CheckCircle2, BookOpen, Focus, X, Zap,
  Youtube, Play, StickyNote, Calculator, Wrench, Plus, Trash2,
  ExternalLink, Sparkles, Loader2
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { useDeepFocus } from "@/hooks/useDeepFocus";
import { awardXP } from "@/lib/studySession";
import { aiComplete } from "@/lib/aiService";
import { toast } from "sonner";
import { doc, getDoc, collection, getDocs, query, where, writeBatch } from "firebase/firestore";

const LESSON_XP = 20; // XP awarded per lesson completion

// ── YouTube URL Parser ──────────────────────────────────────────
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// ── Mini Quick Notes (Study Area) ───────────────────────────────
const MiniNotes = ({ lessonId }: { lessonId: string }) => {
  const storageKey = `eduonx_lesson_notes_${lessonId}`;
  const [notes, setNotes] = useState<{ id: string; text: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { return []; }
  });
  const [draft, setDraft] = useState("");

  const save = useCallback((n: typeof notes) => {
    setNotes(n);
    localStorage.setItem(storageKey, JSON.stringify(n));
  }, [storageKey]);

  const add = () => {
    if (!draft.trim()) return;
    save([{ id: Date.now().toString(), text: draft.trim() }, ...notes]);
    setDraft("");
    toast.success("Note saved!");
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Textarea placeholder="Jot a note…" value={draft} onChange={(e) => setDraft(e.target.value)}
          className="min-h-[50px] resize-none text-sm" onKeyDown={(e) => e.key === "Enter" && e.ctrlKey && add()} />
      </div>
      <Button onClick={add} size="sm" disabled={!draft.trim()} className="gap-2 w-full">
        <Plus className="h-3.5 w-3.5" /> Add Note
      </Button>
      <div className="space-y-1.5 max-h-[200px] overflow-y-auto scrollbar-thin">
        {notes.map((n) => (
          <div key={n.id} className="bg-muted/50 rounded-lg px-3 py-2 flex items-start gap-2 group">
            <p className="text-xs text-foreground flex-1 whitespace-pre-wrap">{n.text}</p>
            <button onClick={() => save(notes.filter(x => x.id !== n.id))} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Mini Calculator ─────────────────────────────────────────────
const MiniCalc = () => {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const calc = () => {
    try {
      const sanitized = expr.replace(/[^-()\\d/*+.^%\s]/g, '');
      setResult(String(new Function(`return ${sanitized}`)()));
    } catch { setResult("Error"); }
  };
  return (
    <div className="space-y-2">
      <Input placeholder="e.g. (25 * 4) + 100" value={expr} onChange={(e) => setExpr(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && calc()} className="font-mono text-sm h-9" />
      <Button onClick={calc} size="sm" className="w-full" disabled={!expr.trim()}>Calculate</Button>
      {result !== null && (
        <div className="bg-muted/50 rounded-lg px-3 py-2 text-center">
          <div className="text-lg font-bold text-foreground font-mono">{result}</div>
        </div>
      )}
    </div>
  );
};

// ── AI Summarizer ───────────────────────────────────────────────
const AISummarizer = ({ content, videoUrl }: { content: string; videoUrl?: string }) => {
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);

  const summarize = async () => {
    setLoading(true);
    try {
      const text = videoUrl
        ? `Summarize the key concepts from this lesson content that accompanies a YouTube video (${videoUrl}):\n\n${content.substring(0, 6000)}`
        : `Summarize the following lesson content into clear, concise bullet points:\n\n${content.substring(0, 6000)}`;
      const res = await aiComplete({
        messages: [
          { role: "system", content: "You are a study assistant. Create concise, well-structured summaries with bullet points." },
          { role: "user", content: text }
        ],
        temperature: 0.4,
        maxTokens: 1024,
      });
      setSummary(res);
      toast.success("Summary generated!");
    } catch {
      toast.error("Failed to generate summary. Try again.");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-2">
      <Button onClick={summarize} size="sm" disabled={loading} className="w-full gap-2">
        {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Summarizing…</> : <><Sparkles className="h-3.5 w-3.5" /> AI Summary</>}
      </Button>
      {summary && (
        <div className="bg-muted/50 rounded-lg px-3 py-2 text-xs text-foreground whitespace-pre-wrap max-h-[250px] overflow-y-auto scrollbar-thin leading-relaxed">
          {summary}
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
  const [activeTool, setActiveTool] = useState<"notes" | "calc" | "summary">("notes");
  const [videoUrl, setVideoUrl] = useState("");
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  // Fetch topic and lessons from Firestore
  const { data: topic, isLoading: topicLoading } = useQuery({
    queryKey: ["topic", topicId],
    queryFn: async () => {
      if (!topicId) return null;
      try {
        const topicDoc = await getDoc(doc(db, "topics", topicId));
        return topicDoc.exists() ? { id: topicDoc.id, ...topicDoc.data() } : null;
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
        // NOTE: We intentionally do NOT use orderBy here to avoid requiring
        // a Firestore composite index (topic_id + order). Sort client-side instead.
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
        // Sort by order field client-side
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

  // Auto-detect YouTube links in lesson content
  useEffect(() => {
    if (currentLesson?.content) {
      const ytMatch = currentLesson.content.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (ytMatch) {
        setActiveVideoId(ytMatch[1]);
      } else {
        setActiveVideoId(null);
      }
    }
  }, [currentLesson]);

  const handlePasteVideo = () => {
    const id = extractYouTubeId(videoUrl);
    if (id) {
      setActiveVideoId(id);
      toast.success("Video loaded!");
    } else {
      toast.error("Invalid YouTube URL");
    }
  };

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
      toast.success(`Lesson completed! +${LESSON_XP} XP 🎉`);
    },
    onError: (error) => {
      console.error("[LessonViewer] Mark complete error:", error);
      toast.error("Failed to complete lesson");
    }
  });

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-1.5 w-full" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!currentLesson) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto text-center space-y-4 py-20">
        <p className="text-muted-foreground">No lessons found for this topic.</p>
        <Link to="/lessons" className="text-primary hover:underline text-sm">
          ← Back to Lessons
        </Link>
      </div>
    );
  }

  // Rich markdown renderer with bold, inline code, and link support
  const renderInline = (text: string) => {
    // Split on **bold**, `code`, and [text](url) patterns
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={idx} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={idx} className="text-primary bg-primary/10 px-1 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
      }
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        return <a key={idx} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{linkMatch[1]}</a>;
      }
      return part;
    });
  };

  const renderContent = (content: string) =>
    content.split("\n").map((line, i) => {
      if (line.startsWith("### "))
        return <h4 key={i} className="text-base font-semibold mt-4 text-foreground">{renderInline(line.slice(4))}</h4>;
      if (line.startsWith("## "))
        return <h3 key={i} className="text-lg font-semibold mt-6 text-foreground">{renderInline(line.slice(3))}</h3>;
      if (line.startsWith("# "))
        return <h2 key={i} className="text-xl font-bold mt-6 text-foreground">{renderInline(line.slice(2))}</h2>;
      if (line.startsWith("```") || line === "```") return null;
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

  const toolTabs = [
    { key: "notes" as const, icon: StickyNote, label: "Notes" },
    { key: "calc" as const, icon: Calculator, label: "Calculator" },
    { key: "summary" as const, icon: Sparkles, label: "AI Summary" },
  ];

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
          {/* Quick Tools toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTools(!showTools)}
            className={`gap-2 text-xs ${showTools ? "border-primary text-primary bg-primary/10" : "text-muted-foreground"}`}
          >
            <Wrench className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Quick Tools</span>
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
        
        {/* Left: Lesson + Video */}
        <div className="space-y-5 min-w-0">
          
          {/* ── YouTube Workspace ─────────────────────────── */}
          <div className="bg-card border border-border rounded-xl p-4 md:p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Youtube className="h-4 w-4 text-red-500" />
              Video Workspace
            </div>
            
            {activeVideoId ? (
              <div className="space-y-3">
                <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black">
                  <iframe
                    src={`https://www.youtube.com/embed/${activeVideoId}?rel=0`}
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="Lesson Video"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setActiveVideoId(null)} className="gap-1 text-xs">
                    <X className="h-3 w-3" /> Remove Video
                  </Button>
                  <a href={`https://youtube.com/watch?v=${activeVideoId}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> Open on YouTube
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Paste a YouTube URL…"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePasteVideo()}
                  className="h-9 text-sm flex-1"
                />
                <Button onClick={handlePasteVideo} size="sm" disabled={!videoUrl.trim()} className="gap-1 flex-shrink-0">
                  <Play className="h-3.5 w-3.5" /> Load
                </Button>
              </div>
            )}
          </div>

          {/* ── Lesson content card ─────────────────────────── */}
          <div className="bg-card border border-border rounded-xl p-5 md:p-8 space-y-4 shadow-sm">
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
        </div>

        {/* Right: Quick Tools Sidebar (only when toggled) */}
        {showTools && (
          <div className="space-y-4 animate-in slide-in-from-right-4 duration-200">
            <div className="bg-card border border-border rounded-xl p-4 space-y-4 sticky top-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground pb-3 border-b border-border">
                <Wrench className="h-4 w-4 text-primary" />
                Quick Tools
              </div>

              {/* Tool tabs */}
              <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
                {toolTabs.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTool(t.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs font-medium transition-colors ${
                      activeTool === t.key
                        ? "bg-card text-primary shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <t.icon className="h-3.5 w-3.5" />
                    <span className="hidden xl:inline">{t.label}</span>
                  </button>
                ))}
              </div>

              {/* Active tool content */}
              <div className="min-h-[200px]">
                {activeTool === "notes" && <MiniNotes lessonId={currentLesson.id} />}
                {activeTool === "calc" && <MiniCalc />}
                {activeTool === "summary" && (
                  <AISummarizer
                    content={currentLesson.content}
                    videoUrl={activeVideoId ? `https://youtube.com/watch?v=${activeVideoId}` : undefined}
                  />
                )}
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
