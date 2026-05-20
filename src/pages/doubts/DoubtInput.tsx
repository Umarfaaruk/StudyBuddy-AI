import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Send, Sparkles, BookOpen, Calculator, Atom, History, Paperclip,
  Image, X, FileText, Youtube, Link2, HelpCircle, Clock, Headphones,
  MessageSquare, Copy, Loader2, Wrench
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

  // ── Quick Tools NotebookLM Workspace States ──────────────────────
  const [workspaceUrl, setWorkspaceUrl] = useState("");
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [workspaceVideoData, setWorkspaceVideoData] = useState<{
    id: string;
    title: string;
    channel: string;
    transcript: string;
  } | null>(null);
  const [activeNotebookTool, setActiveNotebookTool] = useState<"briefing" | "study" | "faq" | "timeline" | "podcast" | "chat">("briefing");
  const [notebookOutputs, setNotebookOutputs] = useState<Record<string, string>>({});
  const [generatingTool, setGeneratingTool] = useState<string | null>(null);
  const [notebookChatInput, setNotebookChatInput] = useState("");
  const [notebookChatMessages, setNotebookChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [isNotebookChatSending, setIsNotebookChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const extractYouTubeId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  };

  const handleLoadVideo = async () => {
    const videoId = extractYouTubeId(workspaceUrl);
    if (!videoId) {
      toast.error("Please enter a valid YouTube URL");
      return;
    }

    setIsWorkspaceLoading(true);
    setWorkspaceVideoData(null);
    setNotebookOutputs({});
    setNotebookChatMessages([]);
    try {
      const resp = await fetch(`/api/youtube-transcript?v=${videoId}`);
      if (!resp.ok) {
        throw new Error("Failed to retrieve video transcript");
      }
      const data = await resp.json();
      if (!data.transcript) {
        throw new Error("No transcript or subtitle available for this video");
      }

      setWorkspaceVideoData({
        id: videoId,
        title: data.title || "YouTube Video",
        channel: data.channel || "Unknown Channel",
        transcript: data.transcript
      });
      toast.success("Video and transcript loaded successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to load video context");
    } finally {
      setIsWorkspaceLoading(false);
    }
  };

  const generateToolOutput = async (tool: typeof activeNotebookTool) => {
    if (!workspaceVideoData) return;
    if (notebookOutputs[tool]) return; // Already generated

    setGeneratingTool(tool);
    try {
      let prompt = "";
      if (tool === "briefing") {
        prompt = `You are an expert educational researcher. Create a comprehensive "Briefing Document" based on this video transcript.
Summarize the core thesis, outline the key takeaways, and compile a structured, high-level summary of all main ideas.
Format with markdown headers (##), bold text, and brief bullet points. Ensure it is factually aligned with the video transcript.

Video Title: "${workspaceVideoData.title}"
Transcript:
${workspaceVideoData.transcript.substring(0, 15000)}`;
      } else if (tool === "study") {
        prompt = `You are a master teacher. Generate a complete "Study Guide" based on the video transcript.
It must contain:
1. Key Definitions & Concepts (with detailed explanations)
2. 3-5 Essay or Short-Answer Prompts to test comprehension
3. A concluding summary of the intellectual significance of the topic.
Format with clean markdown headings (##) and bold text. Ensure all generated information aligns with the transcript.

Video Title: "${workspaceVideoData.title}"
Transcript:
${workspaceVideoData.transcript.substring(0, 15000)}`;
      } else if (tool === "faq") {
        prompt = `You are an academic advisor. Analyze the video transcript and generate a list of 5-8 Frequently Asked Questions (FAQ) that a student would ask, followed by clear, thorough, and highly accurate answers based strictly on the transcript. Format as markdown.

Video Title: "${workspaceVideoData.title}"
Transcript:
${workspaceVideoData.transcript.substring(0, 15000)}`;
      } else if (tool === "timeline") {
        prompt = `You are a historian and structure planner. Outline a chronological timeline of topics discussed in the video transcript. Group ideas by time periods or logical sequence. Highlight key milestones, transitions, or narrative arcs in the explanation. Format as markdown.

Video Title: "${workspaceVideoData.title}"
Transcript:
${workspaceVideoData.transcript.substring(0, 15000)}`;
      } else if (tool === "podcast") {
        prompt = `You are a professional audio scriptwriter. Create a lively, engaging dialogue script between two podcast hosts (named Alex and Robin) who are discussing and explaining the main points of this video in an accessible, conversational way. Alex asks insightful questions, and Robin explains the details clearly with analogies. Format the script like:
Alex: ...
Robin: ...
Keep it highly educational and engaging!

Video Title: "${workspaceVideoData.title}"
Transcript:
${workspaceVideoData.transcript.substring(0, 15000)}`;
      }

      const res = await aiComplete({
        messages: [
          { role: "system", content: "You are a helpful educational AI assistant representing a NotebookLM-style workspace. Follow instructions strictly and return answers in markdown formatting." },
          { role: "user", content: prompt }
        ],
        temperature: 0.6
      });

      setNotebookOutputs(prev => ({ ...prev, [tool]: res }));
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate tool output");
    } finally {
      setGeneratingTool(null);
    }
  };

  useEffect(() => {
    if (workspaceVideoData && activeNotebookTool !== "chat" && !notebookOutputs[activeNotebookTool]) {
      generateToolOutput(activeNotebookTool);
    }
  }, [activeNotebookTool, workspaceVideoData]);

  const handleSendChatMessage = async () => {
    if (!notebookChatInput.trim() || !workspaceVideoData || isNotebookChatSending) return;

    const userMsg = notebookChatInput.trim();
    setNotebookChatInput("");
    setNotebookChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsNotebookChatSending(true);

    try {
      const historyMsg = notebookChatMessages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content
      }));

      const res = await aiComplete({
        messages: [
          {
            role: "system",
            content: `You are an expert tutor in a NotebookLM-style study environment. You have loaded the transcript of the video: "${workspaceVideoData.title}" by "${workspaceVideoData.channel}".
Answer the user's questions strictly using the video transcript provided below. If the answer is not mentioned in the transcript, explain that you are answering from the video context and do not have additional details outside the video, but try to be as helpful as possible based on the video context.

Transcript:
${workspaceVideoData.transcript.substring(0, 15000)}`
          },
          ...historyMsg,
          { role: "user", content: userMsg }
        ],
        temperature: 0.5
      });

      setNotebookChatMessages(prev => [...prev, { role: "assistant", content: res }]);
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to send message");
    } finally {
      setIsNotebookChatSending(false);
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

      {/* ── NotebookLM Quick Tools Section ── */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-accent" />
            <h2 className="font-bold text-lg text-foreground">NotebookLM Video Workspace</h2>
          </div>
          {workspaceVideoData && (
            <button
              onClick={() => {
                setWorkspaceVideoData(null);
                setWorkspaceUrl("");
                setNotebookOutputs({});
                setNotebookChatMessages([]);
              }}
              className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Clear Workspace
            </button>
          )}
        </div>

        {!workspaceVideoData ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Paste a YouTube link below to index it. This creates a virtual NotebookLM study workspace where you can generate study guides, briefing documents, interactive timelines, podcast scripts, and chat directly with the video's content.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
                <input
                  type="url"
                  placeholder="Paste YouTube link here... e.g. https://www.youtube.com/watch?v=..."
                  value={workspaceUrl}
                  onChange={(e) => setWorkspaceUrl(e.target.value)}
                  className="w-full h-11 pl-10 pr-3 text-sm bg-muted/30 border border-border rounded-lg outline-none focus:border-primary/40 text-foreground transition-all"
                  onKeyDown={(e) => e.key === "Enter" && handleLoadVideo()}
                />
              </div>
              <Button
                onClick={handleLoadVideo}
                disabled={isWorkspaceLoading || !workspaceUrl.trim()}
                className="bg-accent text-accent-foreground hover:bg-accent/90 h-11 px-5 gap-2 font-semibold"
              >
                {isWorkspaceLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>Load Workspace</>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-[280px_1fr] gap-6">
            {/* Left side: Video Info & Tool selector */}
            <div className="space-y-4 border-r border-border/50 pr-4">
              <div className="rounded-lg overflow-hidden bg-black aspect-video relative">
                <iframe
                  src={`https://www.youtube.com/embed/${workspaceVideoData.id}`}
                  className="absolute inset-0 w-full h-full border-none"
                  title={workspaceVideoData.title}
                  allowFullScreen
                />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-foreground line-clamp-2 leading-tight" title={workspaceVideoData.title}>
                  {workspaceVideoData.title}
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">{workspaceVideoData.channel}</p>
              </div>

              {/* Tool list (buttons) */}
              <div className="space-y-1 pt-2 border-t border-border/40">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/75 font-semibold px-2 mb-1">Notebook Guide Tools</p>
                {[
                  { key: "briefing" as const, label: "Briefing Document", icon: FileText, desc: "High-level summary of core ideas" },
                  { key: "study" as const, label: "Study Guide", icon: BookOpen, desc: "Key terms & comprehension essay prompts" },
                  { key: "faq" as const, label: "FAQ Generator", icon: HelpCircle, desc: "Questions & detailed answers" },
                  { key: "timeline" as const, label: "Timeline", icon: Clock, desc: "Chronological flow of discussion topics" },
                  { key: "podcast" as const, label: "Audio Overview (Script)", icon: Headphones, desc: "Alex & Robin podcast dialogue" },
                  { key: "chat" as const, label: "Ask Workspace Chat", icon: MessageSquare, desc: "Interactive chat with the video context" }
                ].map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <button
                      key={tool.key}
                      onClick={() => setActiveNotebookTool(tool.key)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg flex items-start gap-2.5 transition-all ${
                        activeNotebookTool === tool.key
                          ? "bg-accent/10 text-accent font-semibold border-l-2 border-accent"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs leading-none">{tool.label}</div>
                        <div className="text-[9px] text-muted-foreground/80 mt-1 truncate">{tool.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right side: Tool Output area */}
            <div className="bg-muted/10 border border-border/60 rounded-xl p-4 flex flex-col min-h-[400px]">
              {generatingTool === activeNotebookTool ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 space-y-3">
                  <Loader2 className="h-8 w-8 animate-spin text-accent" />
                  <p className="text-xs text-muted-foreground animate-pulse">NotebookLM is indexing concepts and drafting content...</p>
                </div>
              ) : activeNotebookTool === "chat" ? (
                /* Chat view */
                <div className="flex flex-col h-full flex-1">
                  <div className="flex items-center justify-between pb-3 border-b border-border/40">
                    <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5 text-accent" />
                      Ask anything about this video
                    </div>
                  </div>

                  {/* Messages list */}
                  <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-1 max-h-[300px] scrollbar-thin">
                    {notebookChatMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-2">
                        <MessageSquare className="h-8 w-8 opacity-30" />
                        <p className="text-xs text-muted-foreground/80">Ask a question to begin chatting with this YouTube video.</p>
                      </div>
                    ) : (
                      notebookChatMessages.map((msg, i) => (
                        <div
                          key={i}
                          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-lg p-2.5 text-xs whitespace-pre-wrap leading-relaxed ${
                              msg.role === "user"
                                ? "bg-accent text-accent-foreground"
                                : "bg-card border border-border text-foreground prose prose-sm max-w-none dark:prose-invert"
                            }`}
                          >
                            {msg.role === "user" ? (
                              msg.content
                            ) : (
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    {isNotebookChatSending && (
                      <div className="flex justify-start">
                        <div className="bg-card border border-border rounded-lg p-2.5 flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin text-accent" />
                          <span className="text-[10px] text-muted-foreground">NotebookLM is thinking...</span>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Chat input box */}
                  <div className="flex gap-2 pt-3 border-t border-border/40 mt-auto">
                    <input
                      type="text"
                      placeholder="Ask about this video... (e.g. 'What is the main takeaway?')"
                      value={notebookChatInput}
                      onChange={(e) => setNotebookChatInput(e.target.value)}
                      className="flex-1 h-9 px-3 text-xs bg-muted/40 border border-border rounded-lg outline-none focus:border-accent/40 text-foreground transition-all"
                      onKeyDown={(e) => e.key === "Enter" && handleSendChatMessage()}
                    />
                    <Button
                      onClick={handleSendChatMessage}
                      disabled={isNotebookChatSending || !notebookChatInput.trim()}
                      size="sm"
                      className="bg-accent text-accent-foreground h-9 px-3"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                /* Standard Markdown output view */
                <div className="flex-1 flex flex-col justify-between">
                  <div className="flex items-center justify-between pb-3 border-b border-border/40">
                    <span className="text-xs font-bold text-foreground">
                      {activeNotebookTool === "briefing" && "Briefing Document"}
                      {activeNotebookTool === "study" && "Study Guide"}
                      {activeNotebookTool === "faq" && "FAQ Generator"}
                      {activeNotebookTool === "timeline" && "Timeline / Milestone Flow"}
                      {activeNotebookTool === "podcast" && "Podcast Dialogue Script"}
                    </span>
                    {notebookOutputs[activeNotebookTool] && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(notebookOutputs[activeNotebookTool]);
                          toast.success("Copied to clipboard!");
                        }}
                        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors bg-muted/50 hover:bg-muted px-2 py-1 rounded"
                      >
                        <Copy className="h-3 w-3" /> Copy
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto max-h-[360px] py-3 pr-1 scrollbar-thin mt-2">
                    {notebookOutputs[activeNotebookTool] ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-foreground/90 leading-relaxed">
                        <ReactMarkdown>{notebookOutputs[activeNotebookTool]}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-2">
                        <Sparkles className="h-8 w-8 opacity-30 animate-pulse" />
                        <p className="text-xs">Select a tool to generate analysis.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DoubtInput;
