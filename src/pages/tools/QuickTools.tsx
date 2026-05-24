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

  /**
   * Split transcript into chunks for comprehensive summarization.
   * Each chunk is ~6000 chars with ~500 char overlap to preserve context.
   */
  const splitTranscriptIntoChunks = (transcript: string, chunkSize = 6000, overlap = 500): string[] => {
    if (transcript.length <= chunkSize) return [transcript];
    const chunks: string[] = [];
    let start = 0;
    while (start < transcript.length) {
      const end = Math.min(start + chunkSize, transcript.length);
      chunks.push(transcript.substring(start, end));
      start = end - overlap;
      if (start >= transcript.length) break;
    }
    return chunks;
  };

  /**
   * Chunked summarization: summarize each segment, then combine.
   * Uses low temperature (0.3) for factual precision. Each chunk produces
   * a structured summary, then all are merged into one cohesive document.
   */
  const generateChunkedSummary = async (transcript: string, title: string): Promise<string> => {
    const chunks = splitTranscriptIntoChunks(transcript);
    const totalMinutes = Math.round(transcript.length / 800); // rough estimate: ~800 chars/min spoken

    if (chunks.length === 1) {
      const res = await aiComplete({
        messages: [
          { role: "system", content: "You are a precise educational summarizer. Stick strictly to the transcript content. Never add information not present in the transcript. Be thorough but concise." },
          { role: "user", content: `Summarize this entire video transcript precisely and completely. Cover every key point, concept, and argument from beginning to end in chronological order.

Rules:
- ONLY include information explicitly stated in the transcript
- Do NOT infer, assume, or add external knowledge
- Use ## headers for major sections
- Use bullet points for key details
- Use **bold** for important terms
- Include a "## Key Takeaways" section at the end with 3-5 main lessons
- Estimated video length: ~${totalMinutes} minutes

Video Title: "${title}"
Transcript:
${transcript}` }
        ],
        temperature: 0.3,
        maxTokens: 4096,
      });
      return res;
    }

    // Multi-chunk: summarize each chunk precisely
    const chunkSummaries: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const startMin = Math.round((i * 6000) / 800);
      const endMin = Math.round(((i + 1) * 6000) / 800);
      const chunkLabel = `[~${startMin}-${endMin} min] Part ${i + 1}/${chunks.length}`;

      const res = await aiComplete({
        messages: [
          { role: "system", content: "You are a precise transcript summarizer. Extract only what is explicitly said. No external knowledge." },
          { role: "user", content: `Summarize this transcript segment (${chunkLabel}) from the video "${title}". List every key point, concept, example, and argument mentioned. Be precise and factual.

Transcript segment:
${chunks[i]}` }
        ],
        temperature: 0.3,
        maxTokens: 1500,
      });
      chunkSummaries.push(`### ${chunkLabel}\n${res}`);
    }

    // Combine into a single precise document
    const combinedSummaries = chunkSummaries.join("\n\n---\n\n");
    const finalRes = await aiComplete({
      messages: [
        { role: "system", content: "You are a precise educational summarizer. Merge segment summaries into one cohesive document. Do not add information not present in the segment summaries." },
        { role: "user", content: `Merge these ${chunks.length} segment summaries of the video "${title}" into ONE well-structured summary. Cover the ENTIRE video from start (~0 min) to end (~${totalMinutes} min).

Rules:
- Preserve ALL key points from every segment — do not drop any
- Use chronological flow with time markers where available
- Use ## headers for major topic sections
- Use bullet points for details
- Use **bold** for important terms
- End with "## Key Takeaways" (3-5 bullet points)
- Be precise — only include what was in the segment summaries

Segment summaries:
${combinedSummaries}` }
      ],
      temperature: 0.3,
      maxTokens: 4096,
    });
    return finalRes;
  };

  const generateToolOutput = useCallback(async (tool: typeof activeNotebookTool) => {
    if (!workspaceVideoData) return;
    if (notebookOutputs[tool]) return;

    setGeneratingTool(tool);
    try {
      let result = "";
      const fullTranscript = workspaceVideoData.transcript;

      if (tool === "briefing") {
        result = await generateChunkedSummary(fullTranscript, workspaceVideoData.title);
      } else {
        const transcriptForPrompt = fullTranscript.length > 12000
          ? fullTranscript.substring(0, 12000) + `\n\n[... transcript continues for ${fullTranscript.length} total characters.]`
          : fullTranscript;

        let prompt = "";
        if (tool === "study") {
          prompt = `You are a master teacher. Generate a complete "Study Guide" based on the video transcript.
It must contain:
1. Key Definitions & Concepts (with detailed explanations)
2. 3-5 Essay or Short-Answer Prompts to test comprehension
3. A concluding summary of the intellectual significance of the topic.
Format with clean markdown headings (##) and bold text.

Video Title: "${workspaceVideoData.title}"
Transcript:
${transcriptForPrompt}`;
        } else if (tool === "faq") {
          prompt = `You are an academic advisor. Generate 5-8 FAQ that a student would ask about this video, with clear answers based strictly on the transcript. Format as markdown.

Video Title: "${workspaceVideoData.title}"
Transcript:
${transcriptForPrompt}`;
        } else if (tool === "timeline") {
          prompt = `You are a historian and structure planner. Outline a chronological timeline of ALL topics discussed in the video from start to finish. Cover every section and transition. Format as markdown.

Video Title: "${workspaceVideoData.title}"
Transcript:
${transcriptForPrompt}`;
        } else if (tool === "podcast") {
          prompt = `You are a professional audio scriptwriter. Create a lively dialogue script between two podcast hosts (Alex and Robin) discussing the main points of this video. Alex asks insightful questions, Robin explains with analogies.
Format as:
Alex: ...
Robin: ...

Video Title: "${workspaceVideoData.title}"
Transcript:
${transcriptForPrompt}`;
        }

        result = await aiComplete({
          messages: [
            { role: "system", content: "You are a helpful educational AI assistant. Follow instructions strictly and return answers in markdown formatting." },
            { role: "user", content: prompt }
          ],
          temperature: 0.6
        });
      }

      setNotebookOutputs(prev => ({ ...prev, [tool]: result }));
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate tool output");
    } finally {
      setGeneratingTool(null);
    }
  }, [notebookOutputs, workspaceVideoData]);

  useEffect(() => {
    if (workspaceVideoData && activeNotebookTool !== "chat" && !notebookOutputs[activeNotebookTool]) {
      generateToolOutput(activeNotebookTool);
    }
  }, [activeNotebookTool, generateToolOutput, notebookOutputs, workspaceVideoData]);

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
Answer the user's questions strictly using the video transcript provided below.

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
    <div className="bg-white border border-gray-100 rounded-2xl p-6 space-y-6 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Youtube className="h-6 w-6 text-red-500 animate-pulse" />
          <h2 className="font-bold text-lg text-gray-900">AI Video Notebook</h2>
        </div>
        {workspaceVideoData && (
          <button
            onClick={() => {
              setWorkspaceVideoData(null);
              setWorkspaceUrl("");
              setNotebookOutputs({});
              setNotebookChatMessages([]);
            }}
            className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Clear Workspace
          </button>
        )}
      </div>

      {!workspaceVideoData ? (
        <div className="space-y-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            Paste a YouTube link below to create a study workspace. Generate summaries, study guides, FAQs, timelines, podcast scripts, and chat with the video content.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
              <input
                type="url"
                placeholder="Paste YouTube link here..."
                value={workspaceUrl}
                onChange={(e) => setWorkspaceUrl(e.target.value)}
                className="w-full h-11 pl-10 pr-3 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#1D4ED8]/40 focus:ring-2 focus:ring-[#1D4ED8]/10 text-gray-900 transition-all"
                onKeyDown={(e) => e.key === "Enter" && handleLoadVideo()}
              />
            </div>
            <Button
              onClick={handleLoadVideo}
              disabled={isWorkspaceLoading || !workspaceUrl.trim()}
              className="bg-[#1D4ED8] text-white hover:bg-[#2563EB] h-11 px-5 gap-2 font-semibold rounded-xl"
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
          {/* Left Column: Video Player & User Notes */}
          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-xl overflow-hidden bg-black aspect-video relative shadow-md border border-gray-200">
              <iframe
                src={`https://www.youtube.com/embed/${workspaceVideoData.id}`}
                className="absolute inset-0 w-full h-full border-none"
                title={workspaceVideoData.title}
                allowFullScreen
              />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 line-clamp-2 leading-tight" title={workspaceVideoData.title}>
                {workspaceVideoData.title}
              </h3>
              <p className="text-xs text-gray-500 mt-1">{workspaceVideoData.channel}</p>
            </div>

            {/* User Note Taking Area */}
            <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3 shadow-sm">
              <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">My Study Notes</h4>
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
                    className="h-7 text-[10px] bg-[#1D4ED8] text-white hover:bg-[#2563EB] px-2"
                    onClick={handleSaveNotesToResources}
                    disabled={isSavingNotes || !personalNotes.trim()}
                  >
                    {isSavingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save to Resources"}
                  </Button>
                </div>
              </div>
              <textarea
                placeholder="Write your notes here while watching the video..."
                value={personalNotes}
                onChange={(e) => setPersonalNotes(e.target.value)}
                className="w-full min-h-[160px] p-3 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[#1D4ED8]/40 text-gray-900 resize-y font-mono"
              />
            </div>
          </div>

          {/* Right Column: AI Study Tools & Chat */}
          <div className="lg:col-span-5 flex flex-col bg-gray-50 border border-gray-100 rounded-xl p-4 min-h-[500px]">
            {/* Tabs for tools */}
            <div className="flex border-b border-gray-200 pb-2 mb-4 overflow-x-auto gap-1">
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
                      ? "bg-[#1D4ED8]/10 text-[#1D4ED8] font-semibold"
                      : "text-gray-400 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  {tool.label}
                </button>
              ))}
            </div>

            {generatingTool === activeNotebookTool ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-[#1D4ED8]" />
                <p className="text-xs text-gray-400 animate-pulse text-center">AI Notebook is generating content...</p>
              </div>
            ) : activeNotebookTool === "chat" ? (
              /* Chat view */
              <div className="flex flex-col h-full flex-1">
                <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                  <div className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-[#1D4ED8]" />
                    Ask anything about this video
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-1 max-h-[300px] scrollbar-thin">
                  {notebookChatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
                      <MessageSquare className="h-8 w-8 text-gray-200" />
                      <p className="text-xs text-gray-400">Ask a question to begin chatting with this YouTube video.</p>
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
                              ? "bg-[#1D4ED8] text-white"
                              : "bg-white border border-gray-100 text-gray-900 prose prose-sm max-w-none"
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
                      <div className="bg-white border border-gray-100 rounded-lg p-2.5 flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin text-[#1D4ED8]" />
                        <span className="text-[10px] text-gray-400">Thinking...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="flex gap-2 pt-3 border-t border-gray-200 mt-auto">
                  <input
                    type="text"
                    placeholder="Ask about this video..."
                    value={notebookChatInput}
                    onChange={(e) => setNotebookChatInput(e.target.value)}
                    className="flex-1 h-9 px-3 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:border-[#1D4ED8]/40 text-gray-900 transition-all"
                    onKeyDown={(e) => e.key === "Enter" && handleSendChatMessage()}
                  />
                  <Button
                    onClick={handleSendChatMessage}
                    disabled={isNotebookChatSending || !notebookChatInput.trim()}
                    className="bg-[#1D4ED8] text-white hover:bg-[#2563EB] h-9 w-9 p-0 flex items-center justify-center rounded-lg"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              /* Markdown generated outputs */
              <div className="flex-1 flex flex-col justify-between">
                <div className="flex items-center justify-between pb-2.5 border-b border-gray-200 mb-3">
                  <span className="text-xs font-bold text-gray-900">
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
                      className="text-[10px] text-[#1D4ED8] hover:underline flex items-center gap-1 transition-all bg-[#1D4ED8]/5 hover:bg-[#1D4ED8]/10 px-2 py-1 rounded border border-[#1D4ED8]/20"
                    >
                      Append to My Notes
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto max-h-[360px] py-3 pr-1 scrollbar-thin mt-2">
                  {notebookOutputs[activeNotebookTool] ? (
                    <div className="prose prose-sm max-w-none text-xs text-gray-700 leading-relaxed">
                      <ReactMarkdown>{notebookOutputs[activeNotebookTool]}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
                      <Sparkles className="h-8 w-8 text-gray-200 animate-pulse" />
                      <p className="text-xs text-gray-400">Generating details...</p>
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
import ConceptExplorerWorkspace from "./ConceptExplorerWorkspace";

// ── Main Quick Tools Page ────────────────────────────────────────
const QuickTools = () => {
  const [activeTab, setActiveTab] = useState<"youtube" | "concept" | "doubt">("youtube");

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-[#1D4ED8]/10 flex items-center justify-center">
          <Wrench className="h-5 w-5 text-[#1D4ED8]" />
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
            activeTab === "youtube" ? "bg-[#0F172A] text-white shadow-md" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
          }`}
        >
          📺 YouTube Summarizer
        </button>
        <button
          onClick={() => setActiveTab("concept")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
            activeTab === "concept" ? "bg-[#0F172A] text-white shadow-md" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
          }`}
        >
          🧠 Concept Explorer
        </button>
        <button
          onClick={() => setActiveTab("doubt")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
            activeTab === "doubt" ? "bg-[#0F172A] text-white shadow-md" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
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
        {activeTab === "concept" && (
          <div className="px-6 md:px-8">
            <ConceptExplorerWorkspace />
          </div>
        )}
        {activeTab === "doubt" && <DoubtInput />}
      </div>
    </div>
  );
};

export default QuickTools;
