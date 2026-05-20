import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Send, Sparkles, BookOpen, Calculator, Atom, History, Paperclip,
  Image, X, FileText, HelpCircle, Clock, MessageSquare, Copy, Loader2,
  Wrench, Lightbulb
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, getDocs, limit } from "firebase/firestore";
import { toast } from "sonner";
import { aiComplete } from "@/lib/aiService";
import ReactMarkdown from "react-markdown";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, "application/pdf", "text/plain"];

const DoubtInput = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [question, setQuestion] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── AI Analogy & Roadmap Generator States ──────────────────────
  const [concept, setConcept] = useState("");
  const [explainLevel, setExplainLevel] = useState<"child" | "student" | "expert">("student");
  const [outputFormat, setOutputFormat] = useState<"analogy" | "roadmap" | "application">("analogy");
  const [generatorResult, setGeneratorResult] = useState("");
  const [isGeneratingConcept, setIsGeneratingConcept] = useState(false);

  const handleGenerateConcept = async () => {
    if (!concept.trim()) {
      toast.error("Please enter a concept or topic first");
      return;
    }
    setIsGeneratingConcept(true);
    setGeneratorResult("");
    try {
      let levelPrompt = "";
      if (explainLevel === "child") {
        levelPrompt = "Explain like I am 5 years old, using extremely simple vocabulary, vivid storytelling, and fun characters or everyday objects.";
      } else if (explainLevel === "student") {
        levelPrompt = "Explain like I am a high school student, using clear academic concepts, relatable teenage analogies, and structured formatting.";
      } else {
        levelPrompt = "Explain like I am a college graduate or professor, using precise terminology, deep conceptual rigor, and professional metaphors.";
      }

      let formatPrompt = "";
      if (outputFormat === "analogy") {
        formatPrompt = "Provide a highly creative, immersive metaphor or analogy that makes this complex concept instantly intuitive. Contrast the metaphor directly with the actual scientific or mathematical mechanisms.";
      } else if (outputFormat === "roadmap") {
        formatPrompt = "Provide a step-by-step learning roadmap or milestones outline, showing exactly what pre-requisites to master first, the core concepts, and advanced topics to study next in sequence.";
      } else {
        formatPrompt = "Provide a detailed guide on real-world industrial, medical, or scientific applications of this concept, demonstrating exactly how it is used in modern careers or technologies.";
      }

      const prompt = `You are a world-class academic tutor and master educator. 
Explain the following concept: "${concept}".
Level: ${levelPrompt}
Focus Format: ${formatPrompt}

Format your output using gorgeous markdown with bullet points, numbered lists, and bold text headers where appropriate. Make the explanation feel premium, highly engaging, and easy to read.`;

      const result = await aiComplete({
        messages: [
          { role: "system", content: "You are an expert tutor specializing in visual analogies and conceptual roadmap breakdowns. Respond in high-quality markdown." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      });
      setGeneratorResult(result);
      toast.success("Explanation generated!");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate concept explanation");
    } finally {
      setIsGeneratingConcept(false);
    }
  };

  // Fetch recent doubts from Firestore
  const { data: history } = useQuery({
    queryKey: ["recent-doubts", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      try {
        const q = query(
          collection(db, "doubt_sessions"),
          where("user_id", "==", user.uid),
          orderBy("created_at", "desc"),
          limit(5)
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({
          id: d.id,
          ...d.data()
        } as {
          id: string;
          user_id: string;
          created_at: string;
          [key: string]: any;
        }));
      } catch (indexErr: any) {
        if (indexErr?.code === "failed-precondition" || indexErr?.message?.includes("index")) {
          console.warn("[DoubtInput] Composite index missing, falling back to client-side sort");
          try {
            const qFallback = query(
              collection(db, "doubt_sessions"),
              where("user_id", "==", user.uid)
            );
            const snapFallback = await getDocs(qFallback);
            return snapFallback.docs
              .map((d) => ({ id: d.id, ...d.data() } as { id: string; user_id: string; created_at: string; [key: string]: any }))
              .sort((a, b) => {
                const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return dateB - dateA;
              })
              .slice(0, 5);
          } catch {
            return [];
          }
        }
        console.error("[DoubtInput] Recent doubts fetch error:", indexErr);
        return [];
      }
    },
    enabled: !!user,
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast.error("Unsupported file type. Use images (JPEG, PNG, WebP) or PDF files.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error("File is too large. Maximum size is 10MB.");
      return;
    }

    setAttachedFile(file);

    // Generate preview for images
    if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
      const reader = new FileReader();
      reader.onloadend = () => setFilePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const clearAttachment = () => {
    setAttachedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = () => {
    if (!question.trim() && !attachedFile) return;

    // For image attachments, redirect to camera Q&A flow with the image
    if (attachedFile && ALLOWED_IMAGE_TYPES.includes(attachedFile.type) && filePreview) {
      navigate("/doubts/camera", {
        state: {
          preloadedImage: filePreview,
          preloadedQuestion: question.trim()
        }
      });
      return;
    }

    // For text questions (with or without PDF context), use the standard solution flow
    if (question.trim()) {
      let fullQuestion = question.trim();

      // If a PDF is attached, note it in the question context
      if (attachedFile && attachedFile.type === "application/pdf") {
        fullQuestion = `[Attached file: ${attachedFile.name}]\n\n${fullQuestion}`;
      }

      navigate("/doubts/solution", {
        state: {
          question: fullQuestion
        }
      });
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Ask a Doubt</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload your materials or type a specific question below. You can ask me to explain concepts, summarize text, or solve complex problems.
          </p>
        </div>
        {(history?.length ?? 0) > 0 && (
          <Link to="/doubts/history" className="text-xs text-accent hover:underline flex items-center gap-1">
            <History className="h-3.5 w-3.5" /> View All
          </Link>
        )}
      </div>

      <div className="grid md:grid-cols-[1fr_320px] gap-6 items-start">
        {/* Left: Ask Doubt Form */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Sparkles className="h-5 w-5 text-accent" />
            <span className="font-semibold text-sm text-foreground">AI Doubt Solver</span>
          </div>

          <Textarea
            placeholder="Type your question here... e.g. 'How do I find the derivative of sin(x)?'"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="min-h-[140px] resize-none text-sm bg-muted/20"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && (question.trim() || attachedFile)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />

          {/* File attachment preview */}
          {attachedFile && (
            <div className="flex items-center gap-3 bg-muted/50 rounded-lg p-3 border border-border">
              {filePreview ? (
                <img src={filePreview} alt="Preview" className="h-16 w-16 rounded-lg object-cover border border-border" />
              ) : (
                <div className="h-16 w-16 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <FileText className="h-6 w-6 text-destructive" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{attachedFile.name}</p>
                <p className="text-xs text-muted-foreground">{(attachedFile.size / 1024).toFixed(1)} KB · {attachedFile.type.split("/")[1]?.toUpperCase()}</p>
              </div>
              <button onClick={clearAttachment} className="p-1.5 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            {/* Attachment buttons */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg hover:bg-muted"
              title="Attach image or PDF"
            >
              <Paperclip className="h-4 w-4" />
              <span>Attach File</span>
            </button>
            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.accept = "image/*";
                  fileInputRef.current.click();
                  setTimeout(() => {
                    if (fileInputRef.current) fileInputRef.current.accept = "image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain";
                  }, 100);
                }
              }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg hover:bg-muted"
              title="Upload image"
            >
              <Image className="h-4 w-4" />
              <span>Image</span>
            </button>

            <div className="flex-1" />
            <Button
              onClick={handleSubmit}
              className="gap-2 bg-navy text-highlight hover:bg-navy/90 font-semibold"
              disabled={!question.trim() && !attachedFile}
            >
              <Send className="h-4 w-4" /> Solve Doubt
            </Button>
          </div>
        </div>

        {/* Right: Recent doubts history */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border/60">
            <History className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Recent Doubts</h3>
          </div>
          {(history?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground py-4">No recent doubt queries.</p>
          ) : (
            <div className="space-y-2.5">
              {history?.map((d) => (
                <Link
                  key={d.id}
                  to={`/doubts/session/${d.id}`}
                  className="block w-full text-left bg-card border border-border rounded-lg p-3 text-xs text-muted-foreground hover:border-accent/40 transition-colors"
                >
                  <p className="truncate font-medium text-foreground">{d.question_preview}</p>
                  <span className="block text-[10px] text-muted-foreground/60 mt-1">
                    {new Date(d.created_at).toLocaleDateString()}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── AI Concept Explorer & Analogy Studio ── */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-sm font-sans">
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <Atom className="h-5 w-5 text-accent animate-pulse" />
          <h2 className="font-bold text-lg text-foreground">AI Concept Explorer & Analogy Studio</h2>
        </div>

        <div className="grid md:grid-cols-[1fr_320px] gap-6">
          {/* Left panel: Input options & Generate */}
          <div className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="concept-input" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Enter a topic or complex concept
              </label>
              <input
                id="concept-input"
                type="text"
                placeholder="e.g. Quantum Superposition, Recursion in JavaScript, Krebs Cycle..."
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                className="w-full h-11 px-4 text-sm bg-muted/30 border border-border rounded-lg outline-none focus:border-primary/40 text-foreground transition-all"
                onKeyDown={(e) => e.key === "Enter" && handleGenerateConcept()}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {/* Explanation Level */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Explanation Level
                </label>
                <div className="flex flex-col gap-1.5">
                  {[
                    { key: "child" as const, label: "Explain Like I'm 5 🧸" },
                    { key: "student" as const, label: "High School Student 🎒" },
                    { key: "expert" as const, label: "College / Professional 🎓" },
                  ].map((lvl) => (
                    <button
                      key={lvl.key}
                      onClick={() => setExplainLevel(lvl.key)}
                      className={`text-left px-3 py-2 text-xs rounded-lg border transition-all ${
                        explainLevel === lvl.key
                          ? "bg-primary/10 text-primary border-primary font-semibold"
                          : "bg-card border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      }`}
                    >
                      {lvl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Output Mode */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Studio Focus Format
                </label>
                <div className="flex flex-col gap-1.5">
                  {[
                    { key: "analogy" as const, label: "Creative Analogy ✨" },
                    { key: "roadmap" as const, label: "Learning Roadmap 🗺️" },
                    { key: "application" as const, label: "Real-World Uses 🚀" },
                  ].map((fmt) => (
                    <button
                      key={fmt.key}
                      onClick={() => setOutputFormat(fmt.key)}
                      className={`text-left px-3 py-2 text-xs rounded-lg border transition-all ${
                        outputFormat === fmt.key
                          ? "bg-primary/10 text-primary border-primary font-semibold"
                          : "bg-card border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      }`}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Button
              onClick={handleGenerateConcept}
              disabled={isGeneratingConcept || !concept.trim()}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90 h-11 gap-2 font-semibold"
            >
              {isGeneratingConcept ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating Explanation...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Explore Concept
                </>
              )}
            </Button>
          </div>

          {/* Right panel: Result Output */}
          <div className="bg-muted/10 border border-border/60 rounded-xl p-4 flex flex-col min-h-[300px]">
            <div className="flex items-center justify-between pb-2.5 border-b border-border/40 mb-3">
              <span className="text-xs font-bold text-foreground">
                {explainLevel === "child" && "🧸 Child-Friendly Metaphor"}
                {explainLevel === "student" && "🎒 Student Explainer"}
                {explainLevel === "expert" && "🎓 Professional Insight"}
              </span>
              {generatorResult && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatorResult);
                    toast.success("Copied to clipboard!");
                  }}
                  className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-all bg-muted/50 hover:bg-muted px-2 py-1 rounded"
                >
                  <Copy className="h-3 w-3" /> Copy
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto max-h-[360px] pr-1 scrollbar-thin">
              {isGeneratingConcept ? (
                <div className="h-full flex flex-col items-center justify-center py-12 space-y-3">
                  <Loader2 className="h-8 w-8 animate-spin text-accent" />
                  <p className="text-xs text-muted-foreground animate-pulse text-center">AI Tutor is crafting metaphors and structuring knowledge...</p>
                </div>
              ) : generatorResult ? (
                <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-foreground/90 leading-relaxed font-normal">
                  <ReactMarkdown>{generatorResult}</ReactMarkdown>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-2">
                  <Lightbulb className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-xs">Your custom explanation or roadmap will display here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoubtInput;
