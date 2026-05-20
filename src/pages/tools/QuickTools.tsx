import { useState, useEffect, useRef, useCallback } from "react";
import {
  FileText, Wrench, Youtube, BookOpen, HelpCircle, Clock, Headphones, MessageSquare, Copy, Loader2, X, Send, Sparkles, Atom, Lightbulb
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { aiComplete } from "@/lib/aiService";
import ReactMarkdown from "react-markdown";

// ── Video Notebook Workspace (NotebookLM) Component ────────────────
const VideoNotebookWorkspace = () => {
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
      toast.success("Video workspace loaded successfully!");
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

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Youtube className="h-6 w-6 text-red-500 animate-pulse" />
          <h2 className="font-bold text-lg text-foreground">AI Video Notebook (NotebookLM Workspace)</h2>
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
        <div className="space-y-4 font-sans">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Paste a YouTube link below to index it. This creates a virtual NotebookLM study workspace where you can generate study guides, briefing documents, interactive timelines, podcast scripts, and chat directly with the video's content.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1 font-sans">
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
              <div className="flex-1 flex flex-col justify-between font-sans">
                <div className="flex items-center justify-between pb-3 border-b border-border/40 font-sans">
                  <span className="text-xs font-bold text-foreground font-sans">
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
                <div className="flex-1 overflow-y-auto max-h-[360px] py-3 pr-1 scrollbar-thin mt-2 font-sans font-normal">
                  {notebookOutputs[activeNotebookTool] ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-foreground/90 leading-relaxed font-sans font-normal">
                      <ReactMarkdown>{notebookOutputs[activeNotebookTool]}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-2">
                      <Sparkles className="h-8 w-8 opacity-30 animate-pulse" />
                      <p className="text-xs font-sans">Select a tool to generate analysis.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── AI Concept Explorer Component ──────────────────────────────────
const ConceptExplorer = () => {
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

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-sm font-sans">
      <div className="flex items-center gap-2 pb-3 border-b border-border">
        <Atom className="h-5 w-5 text-accent animate-pulse" />
        <h2 className="font-bold text-lg text-foreground">AI Concept Explorer & Analogy Studio</h2>
      </div>

      <div className="grid md:grid-cols-[1fr_320px] gap-6">
        {/* Left panel: Input options & Generate */}
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="concept-input-tool" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Enter a topic or complex concept
            </label>
            <input
              id="concept-input-tool"
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
  );
};

// ── Main Quick Tools Page ────────────────────────────────────────
const QuickTools = () => {
  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8 font-sans">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Wrench className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Quick Tools</h1>
          <p className="text-muted-foreground text-sm">AI study assistants to supercharge your learning sessions</p>
        </div>
      </div>

      {/* AI Video Notebook (NotebookLM) Workspace */}
      <VideoNotebookWorkspace />

      {/* AI Concept Explorer & Analogy Studio */}
      <ConceptExplorer />
    </div>
  );
};

export default QuickTools;
