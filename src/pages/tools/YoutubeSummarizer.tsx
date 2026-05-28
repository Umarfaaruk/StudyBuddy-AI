import { useState, useRef } from "react";
import { Youtube, Loader2, Sparkles, Copy, CheckCheck, MessageSquare, Send, X, BookOpen, Clock, HelpCircle, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { aiComplete } from "@/lib/aiService";
import ReactMarkdown from "react-markdown";

export const YoutubeSummarizer = () => {
  const [url, setUrl] = useState("");
  const [videoData, setVideoData] = useState<{
    id: string;
    title: string;
    channel: string;
    transcript: string;
    segments: { start: number; text: string }[];
  } | null>(null);
  const [summary, setSummary] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"summary" | "keypoints" | "faq" | "chat">("summary");
  const [tabOutputs, setTabOutputs] = useState<Record<string, string>>({});
  const [generatingTab, setGeneratingTab] = useState<string | null>(null);
  // Chat state
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatSending, setIsChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const extractVideoId = (link: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const p of patterns) {
      const m = link.match(p);
      if (m) return m[1];
    }
    return null;
  };

  const formatTimestamp = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── Chunked summarization for accuracy ──────────────────────
  const splitIntoChunks = (text: string, chunkSize = 6000, overlap = 500): string[] => {
    if (text.length <= chunkSize) return [text];
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.substring(start, end));
      start = end - overlap;
      if (start >= text.length) break;
    }
    return chunks;
  };

  const generateAccurateSummary = async (transcript: string, title: string, segments: { start: number; text: string }[]): Promise<string> => {
    if (transcript.startsWith("No transcript available")) {
      return await aiComplete({
        messages: [
          { role: "system", content: `You are a YouTube video summarizer that produces concise, scannable summaries in a specific live-summary style. Follow this exact format:

1. Start with a brief 2-3 sentence overview paragraph describing what the video covers. Use **bold** for key names (people, brands, channels) mentioned in the title.
2. Then write "**Key Highlights and Topics:**" on its own line.
3. Follow with bullet points for each major topic/section. Each bullet MUST follow this exact pattern:
   • **Topic Name:** Brief 1-2 sentence description of what is discussed.
4. Keep the entire summary concise and scannable — no long paragraphs, no headers (##), no numbered lists.
5. Do NOT use markdown headers (## or ###). Only use **bold** and bullet points (•).` },
          { role: "user", content: `Generate a live-style video summary for: "${title}"

Context:
${transcript}

Remember: Start with a short overview paragraph with **bold names**, then "**Key Highlights and Topics:**", then bullet points with **bold topic labels** and brief descriptions. Keep it concise and scannable like a YouTube video summary card.` }
        ],
        temperature: 0.5,
        maxTokens: 4096,
      });
    }

    const chunks = splitIntoChunks(transcript);
    const totalMinutes = Math.round(transcript.length / 800);

    // Build timestamp markers from segments
    const timestampMarkers = segments
      .filter((_, i) => i % Math.max(1, Math.floor(segments.length / 10)) === 0) // ~10 markers
      .map(s => `[${formatTimestamp(s.start)}] ${s.text.substring(0, 80)}`)
      .join("\n");

    if (chunks.length === 1) {
      return await aiComplete({
        messages: [
          { role: "system", content: `You are a YouTube video summarizer that produces concise, scannable live-style summaries. Follow this exact format:

1. Start with a brief 2-3 sentence overview paragraph describing what the video is about. Use **bold** for key names (people, brands, channels, guests).
2. Then write "**Key Highlights and Topics:**" on its own line.
3. Follow with bullet points for each major topic/segment. Each bullet MUST follow this exact pattern:
   • **Topic Name (startTime - endTime):** Brief 1-2 sentence description of what is discussed in this segment.
4. Use timestamps from the transcript segments. Format timestamps as M:SS or H:MM:SS.
5. Keep the entire summary concise and scannable — no long paragraphs, no markdown headers (## or ###), no numbered lists.
6. ONLY include information explicitly stated in the transcript. Do NOT infer or add external knowledge.
7. Only use **bold** and bullet points (•). No headers.` },
          { role: "user", content: `Summarize this video transcript in a live YouTube summary style.

Video Title: "${title}"
Estimated length: ~${totalMinutes} minutes

Timestamp markers:
${timestampMarkers}

Transcript:
${transcript}

Remember: Brief overview paragraph with **bold names** → "**Key Highlights and Topics:**" → bullet points with **bold topic labels** and (timestamp ranges) and short descriptions. Be precise — only use what's in the transcript.` }
        ],
        temperature: 0.3,
        maxTokens: 4096,
      });
    }

    // Multi-chunk: summarize each, then merge
    const chunkSummaries: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const startMin = Math.round((i * 6000) / 800);
      const endMin = Math.round(((i + 1) * 6000) / 800);
      const res = await aiComplete({
        messages: [
          { role: "system", content: "You are a precise transcript summarizer. Extract key topics as bullet points with approximate timestamps. No external knowledge." },
          { role: "user", content: `Extract the key topics and highlights from this transcript segment (~${startMin}-${endMin} min, Part ${i + 1}/${chunks.length}) from the video "${title}". Format each as a bullet point with **bold topic label** and brief description. Include approximate timestamps.\n\nTranscript:\n${chunks[i]}` }
        ],
        temperature: 0.3,
        maxTokens: 1500,
      });
      chunkSummaries.push(res);
    }

    // Merge into one cohesive document
    const combined = chunkSummaries.join("\n\n---\n\n");
    return await aiComplete({
      messages: [
        { role: "system", content: `You are a YouTube video summarizer that produces concise, scannable live-style summaries. Follow this exact format:

1. Start with a brief 2-3 sentence overview paragraph describing what the video is about. Use **bold** for key names (people, brands, channels, guests).
2. Then write "**Key Highlights and Topics:**" on its own line.
3. Follow with bullet points for each major topic/segment. Each bullet MUST follow this exact pattern:
   • **Topic Name (startTime - endTime):** Brief 1-2 sentence description.
4. Use timestamps in M:SS or H:MM:SS format.
5. Keep it concise and scannable — no long paragraphs, no markdown headers (## or ###), no numbered lists.
6. Do not add information not present in the summaries.
7. Only use **bold** and bullet points (•). No headers.` },
        { role: "user", content: `Merge these ${chunks.length} segment summaries of "${title}" (~${totalMinutes} min) into ONE live-style YouTube summary.

Format: Brief overview paragraph with **bold names** → "**Key Highlights and Topics:**" → bullet points with **bold topic labels**, (timestamp ranges), and short descriptions.

Preserve ALL key points from every segment. Be precise — only include what was in the segments.

Segment summaries:
${combined}` }
      ],
      temperature: 0.3,
      maxTokens: 4096,
    });
  };

  // ── Main handler ────────────────────────────────────────────
  const handleSummarize = async () => {
    const id = extractVideoId(url);
    if (!id) {
      toast.error("Please enter a valid YouTube URL");
      return;
    }

    setIsLoading(true);
    setVideoData(null);
    setSummary("");
    setTabOutputs({});
    setChatMessages([]);
    setActiveTab("summary");

    try {
      // Step 1: Fetch the actual transcript
      const resp = await fetch(`/api/youtube-transcript?v=${id}`);
      if (!resp.ok) throw new Error("Failed to fetch video data");
      const data = await resp.json();

      const hasTranscript = !!(data.transcript && data.transcript.trim().length >= 100);

      if (!hasTranscript) {
        toast.warning("Captions are not available for this video. Generating an educational overview of the video's topic instead!");
      }

      const transcriptText = hasTranscript
        ? data.transcript
        : `No transcript available. Topic: ${data.title || "YouTube Video"}\nChannel: ${data.channel || "Unknown"}\nDescription: ${data.transcript || "No description provided."}`;

      setVideoData({
        id,
        title: data.title || "YouTube Video",
        channel: data.channel || "Unknown Channel",
        transcript: transcriptText,
        segments: data.segments || [],
      });

      // Step 2: Generate accurate summary from real transcript
      setIsLoading(false);
      setIsGenerating(true);

      const result = await generateAccurateSummary(
        transcriptText,
        data.title || "YouTube Video",
        data.segments || []
      );
      setSummary(result);
      setTabOutputs(prev => ({ ...prev, summary: result }));
      toast.success(hasTranscript ? "Summary generated from video transcript!" : "Educational summary generated successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to generate summary");
    } finally {
      setIsLoading(false);
      setIsGenerating(false);
    }
  };

  // ── Tab content generators ──────────────────────────────────
  const generateTabContent = async (tab: string) => {
    if (!videoData || tabOutputs[tab]) return;
    setGeneratingTab(tab);

    try {
      const transcriptForPrompt = videoData.transcript.length > 12000
        ? videoData.transcript.substring(0, 12000) + `\n\n[... transcript continues for ${videoData.transcript.length} total characters.]`
        : videoData.transcript;

      const isFallback = videoData.transcript.startsWith("No transcript available");
      let prompt = "";
      if (tab === "keypoints") {
        prompt = isFallback
          ? `Generate a highly detailed list of key points, important concepts, and core learnings regarding the topic: "${videoData.title}". Format as a numbered list with **bold** key terms, grouped by section. Ensure it is extremely informative and accurate.`
          : `Extract ALL key points, important concepts, and actionable takeaways from this video transcript. Format as a numbered list with **bold** key terms. Group by topic section. Be precise — only include what's in the transcript.

Video: "${videoData.title}"
Transcript:
${transcriptForPrompt}`;
      } else if (tab === "faq") {
        prompt = isFallback
          ? `Generate 6-8 comprehensive Frequently Asked Questions (FAQ) with highly detailed educational answers regarding the topic: "${videoData.title}". Format as markdown with ## for each question.`
          : `Generate 6-8 FAQ that a viewer would ask about this video, with clear, detailed answers based STRICTLY on the transcript content. Do NOT make up answers — only use information from the transcript. Format as markdown with ## for each question.

Video: "${videoData.title}"
Transcript:
${transcriptForPrompt}`;
      }

      const result = await aiComplete({
        messages: [
          { role: "system", content: isFallback ? "You are an expert educator helping a student learn about this topic." : "You are an educational assistant. Answer strictly from the provided transcript content. Never add external information." },
          { role: "user", content: prompt }
        ],
        temperature: isFallback ? 0.6 : 0.3,
        maxTokens: 4096,
      });

      setTabOutputs(prev => ({ ...prev, [tab]: result }));
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate content");
    } finally {
      setGeneratingTab(null);
    }
  };

  // ── Chat with video ─────────────────────────────────────────
  const handleSendChat = async () => {
    if (!chatInput.trim() || !videoData || isChatSending) return;

    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsChatSending(true);

    try {
      const history = chatMessages.map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

      const isFallback = videoData.transcript.startsWith("No transcript available");

      const result = await aiComplete({
        messages: [
          {
            role: "system",
            content: isFallback
              ? `You are an expert tutor. Answer the user's questions about the topic: "${videoData.title}" using your extensive educational knowledge. Provide clear, step-by-step explanations.`
              : `You are an expert tutor. Answer the user's questions STRICTLY using the video transcript below. If the answer is not in the transcript, say so honestly.

Video: "${videoData.title}" by "${videoData.channel}"
Transcript:
${videoData.transcript.substring(0, 15000)}`
          },
          ...history,
          { role: "user", content: userMsg }
        ],
        temperature: isFallback ? 0.6 : 0.4,
      });

      setChatMessages(prev => [...prev, { role: "assistant", content: result }]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err) {
      console.error(err);
      toast.error("Failed to send message");
    } finally {
      setIsChatSending(false);
    }
  };

  const handleCopy = () => {
    const content = activeTab === "chat" ? "" : (tabOutputs[activeTab] || summary);
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Auto-generate tab content when switching
  const handleTabSwitch = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (tab !== "summary" && tab !== "chat" && !tabOutputs[tab] && videoData) {
      generateTabContent(tab);
    }
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6 space-y-6 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Youtube className="h-6 w-6 text-red-500" />
          <h2 className="font-bold text-lg text-gray-900">YouTube Video Summarizer</h2>
        </div>
        {videoData && (
          <button
            onClick={() => {
              setVideoData(null);
              setUrl("");
              setSummary("");
              setTabOutputs({});
              setChatMessages([]);
            }}
            className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {/* URL Input */}
      {!videoData ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 leading-relaxed">
            Paste a YouTube link to get an accurate AI summary based on the actual video transcript — not guesswork.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
              <input
                type="url"
                placeholder="Paste YouTube link here..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isLoading}
                className="w-full h-11 pl-10 pr-3 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-red-500/40 focus:ring-2 focus:ring-red-500/10 text-gray-900 transition-all disabled:opacity-50"
                onKeyDown={(e) => e.key === "Enter" && handleSummarize()}
              />
            </div>
            <Button
              onClick={handleSummarize}
              disabled={isLoading || !url.trim()}
              className="bg-red-500 text-white hover:bg-red-600 h-11 gap-2 font-semibold rounded-xl px-6"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Summarize
            </Button>
          </div>
        </div>
      ) : (
        /* ── Video Loaded: Player + Tabs ── */
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Left: Video Player */}
          <div className="lg:col-span-6 space-y-3">
            <div className="rounded-xl overflow-hidden bg-black aspect-video relative shadow-md border border-gray-200">
              <iframe
                src={`https://www.youtube.com/embed/${videoData.id}`}
                className="absolute inset-0 w-full h-full border-none"
                title={videoData.title}
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 line-clamp-2 leading-tight">{videoData.title}</h3>
              <p className="text-xs text-gray-500 mt-1">{videoData.channel}</p>
            </div>
          </div>

          {/* Right: AI Output Tabs */}
          <div className="lg:col-span-6 flex flex-col bg-gray-50 border border-gray-100 rounded-xl p-4 min-h-[400px]">
            {/* Tab buttons */}
            <div className="flex gap-1 pb-2 mb-3 border-b border-gray-200 overflow-x-auto">
              {[
                { key: "summary" as const, label: "Summary", icon: BookOpen },
                { key: "keypoints" as const, label: "Key Points", icon: ListChecks },
                { key: "faq" as const, label: "FAQ", icon: HelpCircle },
                { key: "chat" as const, label: "Ask AI", icon: MessageSquare },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => handleTabSwitch(tab.key)}
                  className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-colors font-medium flex items-center gap-1.5 ${
                    activeTab === tab.key
                      ? "bg-red-500/10 text-red-600 font-semibold"
                      : "text-gray-400 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  <tab.icon className="h-3 w-3" />
                  {tab.label}
                </button>
              ))}
              {/* Copy button */}
              {activeTab !== "chat" && tabOutputs[activeTab] && (
                <button
                  onClick={handleCopy}
                  className="ml-auto px-2 py-1 text-[10px] text-gray-400 hover:text-gray-700 flex items-center gap-1 transition-colors"
                >
                  {copied ? <CheckCheck className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              )}
            </div>

            {/* Tab content */}
            {isGenerating || generatingTab === activeTab ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-red-500" />
                <p className="text-xs text-gray-400 animate-pulse text-center">Analyzing video transcript...</p>
              </div>
            ) : activeTab === "chat" ? (
              /* Chat interface */
              <div className="flex flex-col h-full flex-1">
                <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1 max-h-[300px] scrollbar-thin">
                  {chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
                      <MessageSquare className="h-8 w-8 text-gray-200" />
                      <p className="text-xs text-gray-400">Ask anything about this video.</p>
                      <p className="text-[10px] text-gray-300">AI answers from the actual transcript only.</p>
                    </div>
                  ) : (
                    chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-lg p-2.5 text-xs whitespace-pre-wrap leading-relaxed ${
                          msg.role === "user"
                            ? "bg-red-500 text-white"
                            : "bg-white border border-gray-100 text-gray-900 prose prose-sm max-w-none"
                        }`}>
                          {msg.role === "user" ? msg.content : <ReactMarkdown>{msg.content}</ReactMarkdown>}
                        </div>
                      </div>
                    ))
                  )}
                  {isChatSending && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-gray-100 rounded-lg p-2.5 flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin text-red-500" />
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
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="flex-1 h-9 px-3 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:border-red-500/40 text-gray-900 transition-all"
                    onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                  />
                  <Button
                    onClick={handleSendChat}
                    disabled={isChatSending || !chatInput.trim()}
                    className="bg-red-500 text-white hover:bg-red-600 h-9 w-9 p-0 flex items-center justify-center rounded-lg"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              /* Summary / Key Points / FAQ content */
              <div className="flex-1 overflow-y-auto max-h-[360px] py-2 pr-1 scrollbar-thin">
                {tabOutputs[activeTab] ? (
                  <div className="prose prose-sm max-w-none text-xs text-gray-700 leading-relaxed">
                    <ReactMarkdown>{tabOutputs[activeTab]}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
                    <Sparkles className="h-8 w-8 text-gray-200" />
                    <p className="text-xs text-gray-400">Click to generate content</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default YoutubeSummarizer;
