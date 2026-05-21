import { useState, useEffect, useRef, useCallback } from "react";
import {
  FileText, Wrench, Youtube, BookOpen, HelpCircle, Clock, Headphones, MessageSquare, Copy, Loader2, X, Send, Sparkles, Atom, Lightbulb
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { aiComplete } from "@/lib/aiService";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, addDoc } from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";

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
  const [personalNotes, setPersonalNotes] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const handleSaveNotesToResources = async () => {
    if (!personalNotes.trim()) {
      toast.error("Please write some notes first");
      return;
    }
    if (!user) {
      toast.error("You must be logged in to save notes");
      return;
    }
    setIsSavingNotes(true);
    try {
      const fileName = `${workspaceVideoData?.title || "Video"}_Study_Notes.md`;
      
      await addDoc(collection(db, "materials"), {
        user_id: user.uid,
        file_name: fileName,
        content_type: "text/markdown",
        file_size: new Blob([personalNotes]).size,
        processing_status: "completed",
        uploaded_at: new Date().toISOString(),
        extracted_text: personalNotes,
        summary: `Personal study notes generated while studying the video "${workspaceVideoData?.title || "YouTube Video"}"`,
        key_topics: [workspaceVideoData?.title || "Video Notes"],
        content_length: personalNotes.length,
        concepts: [
          { name: workspaceVideoData?.title || "Video Notes", importance: "critical" }
        ]
      });

      queryClient.invalidateQueries({ queryKey: ["materials", user.uid] });
      toast.success("Study notes saved to your Resources section!");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to save study notes to Resources");
    } finally {
      setIsSavingNotes(false);
    }
  };

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
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Left Column: YouTube Video Player & User Notes */}
          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-xl overflow-hidden bg-black aspect-video relative shadow-md border border-border">
              <iframe
                src={`https://www.youtube.com/embed/${workspaceVideoData.id}`}
                className="absolute inset-0 w-full h-full border-none"
                title={workspaceVideoData.title}
                allowFullScreen
              />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground line-clamp-2 leading-tight" title={workspaceVideoData.title}>
                {workspaceVideoData.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">{workspaceVideoData.channel}</p>
            </div>

            {/* User Note Taking Area */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3 shadow-sm">
              <div className="flex justify-between items-center pb-2 border-b border-border/40">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">My Study Notes</h4>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] px-2"
                    onClick={() => {
                      if (!personalNotes.trim()) {
                        toast.error("No notes to copy");
                        return;
                      }
                      navigator.clipboard.writeText(personalNotes);
                      toast.success("Notes copied to clipboard!");
                    }}
                  >
                    Copy Notes
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-[10px] bg-accent text-accent-foreground hover:bg-accent/90 px-2"
                    onClick={handleSaveNotesToResources}
                    disabled={isSavingNotes || !personalNotes.trim()}
                  >
                    {isSavingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save to Resources"}
                  </Button>
                </div>
              </div>
              <textarea
                placeholder="Write your notes here while watching the video. You can copy AI summaries here or type your own takeaways."
                value={personalNotes}
                onChange={(e) => setPersonalNotes(e.target.value)}
                className="w-full min-h-[160px] p-3 text-xs bg-muted/20 border border-border rounded-lg outline-none focus:border-accent/40 text-foreground resize-y font-mono"
              />
            </div>
          </div>

          {/* Right Column: AI Study Tools & Chat */}
          <div className="lg:col-span-5 flex flex-col bg-muted/10 border border-border/60 rounded-xl p-4 min-h-[500px]">
            {/* Tabs for tools */}
            <div className="flex border-b border-border/40 pb-2 mb-4 overflow-x-auto gap-1">
              {[
                { key: "briefing" as const, label: "Summary" },
                { key: "study" as const, label: "Study Guide" },
                { key: "faq" as const, label: "FAQ" },
                { key: "timeline" as const, label: "Timeline" },
                { key: "podcast" as const, label: "Podcast Script" },
                { key: "chat" as const, label: "Ask AI Chat" }
              ].map((tool) => (
                <button
                  key={tool.key}
                  onClick={() => setActiveNotebookTool(tool.key)}
                  className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-colors font-medium ${
                    activeNotebookTool === tool.key
                      ? "bg-accent/10 text-accent font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  {tool.label}
                </button>
              ))}
            </div>

            {generatingTool === activeNotebookTool ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
                <p className="text-xs text-muted-foreground animate-pulse text-center">AI Notebook is generating content parallelly...</p>
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
                        <span className="text-[10px] text-muted-foreground">Thinking...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Chat input box */}
                <div className="flex gap-2 pt-3 border-t border-border/40 mt-auto">
                  <input
                    type="text"
                    placeholder="Ask about this video..."
                    value={notebookChatInput}
                    onChange={(e) => setNotebookChatInput(e.target.value)}
                    className="flex-1 h-9 px-3 text-xs bg-muted/40 border border-border rounded-lg outline-none focus:border-accent/40 text-foreground transition-all"
                    onKeyDown={(e) => e.key === "Enter" && handleSendChatMessage()}
                  />
                  <Button
                    onClick={handleSendChatMessage}
                    disabled={isNotebookChatSending || !notebookChatInput.trim()}
                    className="bg-accent text-accent-foreground hover:bg-accent/90 h-9 w-9 p-0 flex items-center justify-center rounded-lg"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              /* Markdown generated outputs */
              <div className="flex-1 flex flex-col justify-between">
                <div className="flex items-center justify-between pb-2.5 border-b border-border/40 mb-3">
                  <span className="text-xs font-bold text-foreground">
                    {activeNotebookTool === "briefing" && "📖 Summary notes"}
                    {activeNotebookTool === "study" && "📝 Comprehension study guide"}
                    {activeNotebookTool === "faq" && "❓ Frequently asked questions"}
                    {activeNotebookTool === "timeline" && "⏰ Key timestamps & sequence"}
                    {activeNotebookTool === "podcast" && "🎙️ Scripted dialog breakdown"}
                  </span>
                  {notebookOutputs[activeNotebookTool] && (
                    <button
                      onClick={() => {
                        const noteSnippet = `\n\n### AI Generated ${activeNotebookTool.toUpperCase()}\n${notebookOutputs[activeNotebookTool]}`;
                        setPersonalNotes(prev => prev + noteSnippet);
                        toast.success("AI notes appended to study notes!");
                      }}
                      className="text-[10px] text-accent hover:underline flex items-center gap-1 transition-all bg-accent/5 hover:bg-accent/10 px-2 py-1 rounded border border-accent/20"
                    >
                      Append to My Notes
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
                      <p className="text-xs font-sans">Generating details...</p>
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

import DoubtInput from "../doubts/DoubtInput";

// ── Main Quick Tools Page ────────────────────────────────────────
const QuickTools = () => {
  const [activeTab, setActiveTab] = useState<"youtube" | "doubt">("youtube");

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8 font-sans">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-[#8b5cf6]/10 flex items-center justify-center">
          <Wrench className="h-5 w-5 text-[#8b5cf6]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Quick Tools</h1>
          <p className="text-gray-500 text-sm">AI study assistants to supercharge your learning sessions</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-gray-100 pb-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab("youtube")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
            activeTab === "youtube" ? "bg-[#131526] text-white shadow-md" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
          }`}
        >
          📺 YouTube Summarizer
        </button>
        <button
          onClick={() => setActiveTab("doubt")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
            activeTab === "doubt" ? "bg-[#131526] text-white shadow-md" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
          }`}
        >
          ❓ Ask Doubt
        </button>
      </div>

      {/* Content */}
      <div className="min-h-[600px] -mx-6 md:-mx-8">
        {activeTab === "youtube" && (
          <div className="px-6 md:px-8">
            <VideoNotebookWorkspace />
          </div>
        )}
        {activeTab === "doubt" && <DoubtInput />}
      </div>
    </div>
  );
};

export default QuickTools;
