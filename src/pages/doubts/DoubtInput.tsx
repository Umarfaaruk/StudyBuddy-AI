import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Send, Sparkles, BookOpen, Calculator, Atom, History, Paperclip,
  Image, X, FileText, HelpCircle, Clock, MessageSquare, Copy, Loader2,
  Wrench, Lightbulb, Mic, Share2, Star, MoreVertical, Trash2,
  FolderOpen, ImageIcon, Upload
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

  const handleClearChat = () => {
    setQuestion("");
    setAttachedFile(null);
    setFilePreview(null);
    setGeneratorResult("");
    setConcept("");
  };

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-24px)]">
      {/* ── Chat Header ── */}
      <div className="flex items-center justify-between px-6 md:px-8 pt-6 pb-4">
        <div className="flex-1" />
        <h1 className="text-xl font-bold text-[#0f172a]">New Chat</h1>
        <div className="flex-1 flex justify-end">
          <button
            onClick={handleClearChat}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-white hover:shadow-sm transition-all"
          >
            <Trash2 className="h-4 w-4" />
            Clear chat
          </button>
        </div>
      </div>

      {/* ── Chat Messages Area ── */}
      <div className="flex-1 overflow-y-auto px-6 md:px-8 space-y-6 scrollbar-thin">
        {/* AI Greeting */}
        <div className="flex items-start gap-4">
          <div className="h-11 w-11 rounded-full bg-[#f4a261] flex items-center justify-center flex-shrink-0 shadow-md">
            <span className="text-white text-lg">🤖</span>
          </div>
          <div className="pt-1">
            <div className="text-sm text-gray-400 font-medium">Hi!</div>
            <div className="text-xl font-bold text-[#0f172a]">how can I help?</div>
          </div>
        </div>

        {/* Recent doubts as example messages */}
        {(history?.length ?? 0) > 0 && (
          <div className="space-y-4">
            {history?.slice(0, 2).map((d) => (
              <div key={d.id} className="space-y-4">
                {/* User message bubble - right aligned */}
                <div className="flex justify-end">
                  <Link
                    to={`/doubts/session/${d.id}`}
                    className="bg-white rounded-2xl px-5 py-3 max-w-[70%] shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                  >
                    <p className="text-sm text-[#0f172a]">{d.question_preview}</p>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Concept Explorer response */}
        {generatorResult && (
          <div className="space-y-4">
            {/* AI Response */}
            <div className="flex items-start gap-4">
              <div className="h-11 w-11 rounded-full bg-[#f4a261] flex items-center justify-center flex-shrink-0 shadow-md">
                <span className="text-white text-lg">🤖</span>
              </div>
              <div className="flex-1 max-w-[80%]">
                <div className="prose prose-sm max-w-none text-[#0f172a]/90 leading-relaxed">
                  <ReactMarkdown>{generatorResult}</ReactMarkdown>
                </div>
              </div>
              {/* Side actions */}
              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatorResult);
                    toast.success("Copied to clipboard!");
                  }}
                  className="p-2 rounded-xl hover:bg-white hover:shadow-sm text-gray-400 hover:text-[#8b5cf6] transition-all"
                >
                  <Share2 className="h-4 w-4" />
                </button>
                <button className="p-2 rounded-xl hover:bg-white hover:shadow-sm text-gray-400 hover:text-[#8b5cf6] transition-all">
                  <Star className="h-4 w-4" />
                </button>
                <button className="p-2 rounded-xl hover:bg-white hover:shadow-sm text-gray-400 hover:text-[#8b5cf6] transition-all">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Embedded resource cards */}
            <div className="ml-[60px] flex gap-4">
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer">
                <FolderOpen className="h-5 w-5 text-[#8b5cf6]" />
                <span className="text-sm font-medium text-gray-600">Chat files</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer">
                <ImageIcon className="h-5 w-5 text-[#8b5cf6]" />
                <span className="text-sm font-medium text-gray-600">Images</span>
              </div>
              <Link
                to="/materials"
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer"
              >
                <Upload className="h-5 w-5 text-[#8b5cf6]" />
                <span className="text-sm font-medium text-gray-600">Upload</span>
              </Link>
            </div>
          </div>
        )}

        {/* Loading indicator for concept generation */}
        {isGeneratingConcept && (
          <div className="flex items-start gap-4">
            <div className="h-11 w-11 rounded-full bg-[#f4a261] flex items-center justify-center flex-shrink-0 shadow-md">
              <span className="text-white text-lg">🤖</span>
            </div>
            <div className="flex items-center gap-3 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-[#8b5cf6]" />
              <span className="text-sm text-gray-400 animate-pulse">AI Tutor is crafting your explanation...</span>
            </div>
          </div>
        )}

        {/* Empty state with concept explorer */}
        {!generatorResult && !isGeneratingConcept && (
          <div className="mt-8">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                <Atom className="h-5 w-5 text-[#8b5cf6] animate-pulse" />
                <h2 className="font-bold text-lg text-[#0f172a]">AI Concept Explorer & Analogy Studio</h2>
              </div>

              <div className="grid md:grid-cols-[1fr_320px] gap-6">
                {/* Left panel: Input options & Generate */}
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label htmlFor="concept-input" className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Enter a topic or complex concept
                    </label>
                    <input
                      id="concept-input"
                      type="text"
                      placeholder="e.g. Quantum Superposition, Recursion in JavaScript, Krebs Cycle..."
                      value={concept}
                      onChange={(e) => setConcept(e.target.value)}
                      className="w-full h-11 px-4 text-sm bg-[#f3f4f6] border border-gray-200 rounded-xl outline-none focus:border-[#8b5cf6]/40 focus:ring-2 focus:ring-[#8b5cf6]/10 text-[#0f172a] transition-all"
                      onKeyDown={(e) => e.key === "Enter" && handleGenerateConcept()}
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    {/* Explanation Level */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
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
                            className={`text-left px-3 py-2 text-xs rounded-xl border transition-all ${
                              explainLevel === lvl.key
                                ? "bg-[#8b5cf6]/10 text-[#8b5cf6] border-[#8b5cf6] font-semibold"
                                : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-[#0f172a]"
                            }`}
                          >
                            {lvl.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Output Mode */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
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
                            className={`text-left px-3 py-2 text-xs rounded-xl border transition-all ${
                              outputFormat === fmt.key
                                ? "bg-[#8b5cf6]/10 text-[#8b5cf6] border-[#8b5cf6] font-semibold"
                                : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-[#0f172a]"
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
                    className="w-full bg-[#8b5cf6] text-white hover:bg-[#7c3aed] h-11 gap-2 font-semibold rounded-xl"
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

                {/* Right panel: Preview / Info */}
                <div className="bg-[#f3f4f6] border border-gray-200 rounded-2xl p-5 flex flex-col items-center justify-center min-h-[260px]">
                  <Lightbulb className="h-10 w-10 text-gray-300 mb-3" />
                  <p className="text-sm text-gray-400 text-center">Your custom explanation or roadmap will display in the chat above.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── File attachment preview ── */}
      {attachedFile && (
        <div className="px-6 md:px-8 pt-3">
          <div className="flex items-center gap-3 bg-white rounded-xl p-3 border border-gray-200 shadow-sm max-w-md">
            {filePreview ? (
              <img src={filePreview} alt="Preview" className="h-14 w-14 rounded-lg object-cover border border-gray-200" />
            ) : (
              <div className="h-14 w-14 rounded-lg bg-red-50 flex items-center justify-center">
                <FileText className="h-6 w-6 text-red-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#0f172a] truncate">{attachedFile.name}</p>
              <p className="text-xs text-gray-400">{(attachedFile.size / 1024).toFixed(1)} KB · {attachedFile.type.split("/")[1]?.toUpperCase()}</p>
            </div>
            <button onClick={clearAttachment} className="p-1.5 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom Input Bar ── */}
      <div className="px-6 md:px-8 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain"
            className="hidden"
            onChange={handleFileSelect}
          />

          <input
            type="text"
            placeholder="Ask me anything..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && (question.trim() || attachedFile)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            className="flex-1 bg-transparent text-sm text-[#0f172a] placeholder:text-gray-400 outline-none py-2"
          />

          <div className="flex items-center gap-1">
            <button
              className="p-2 rounded-xl text-gray-400 hover:text-[#8b5cf6] hover:bg-[#8b5cf6]/5 transition-all"
              title="Voice input"
            >
              <Mic className="h-5 w-5" />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-xl text-gray-400 hover:text-[#8b5cf6] hover:bg-[#8b5cf6]/5 transition-all"
              title="Attach file"
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <button
              onClick={handleSubmit}
              disabled={!question.trim() && !attachedFile}
              className="h-10 w-10 rounded-xl bg-[#8b5cf6] text-white flex items-center justify-center hover:bg-[#7c3aed] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoubtInput;
