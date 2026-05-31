import { useState, useRef, useEffect } from "react";
import {
  Youtube, Loader2, Sparkles, Copy, CheckCheck, MessageSquare, Send, X,
  FileText, Play
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { geminiComplete, geminiStream } from "@/lib/geminiService";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, addDoc } from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";

export const YoutubeSummarizer = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingTab, setGeneratingTab] = useState<string | null>(null);

  const [videoData, setVideoData] = useState<{
    id: string;
    title: string;
    channel: string;
    transcript: string;
    hasCaptions: boolean;
    segments: { start: number; text: string }[];
  } | null>(null);

  // Active workspace time offset for video player
  const [playerStartSeconds, setPlayerStartSeconds] = useState<number | null>(null);

  // Tab configurations
  const [activeTab, setActiveTab] = useState<"summary" | "timeline" | "concepts" | "study" | "podcast" | "faq" | "chat">("summary");
  const [tabOutputs, setTabOutputs] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  // Personal Notepad State
  const [personalNotes, setPersonalNotes] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatSending, setIsChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load notepad drafts from LocalStorage to prevent data loss
  useEffect(() => {
    if (videoData) {
      const cached = localStorage.getItem(`notes_${videoData.id}`);
      if (cached) {
        setPersonalNotes(cached);
      } else {
        setPersonalNotes(`## Study Notes: ${videoData.title}\n\n*Write your key observations, code snippets, or personal thoughts here...*`);
      }
    }
  }, [videoData]);

  // Sync notepad text with LocalStorage on change
  const handleNotesChange = (text: string) => {
    setPersonalNotes(text);
    if (videoData) {
      localStorage.setItem(`notes_${videoData.id}`, text);
    }
  };

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

  const FAITHFUL_SUMMARY_SYSTEM = `You are a precise transcript summarizer. Your job is to produce a summary that accurately reflects ONLY what is said in the video transcript.

STRICT RULES:
- Use ONLY facts, arguments, examples, and terminology from the transcript.
- Do NOT add external knowledge, opinions, or information not present in the transcript.
- Preserve the speaker's key terms, names, and examples exactly as stated.
- Cover topics in the same order they appear in the video when possible.
- If the transcript is unclear on a point, say so — do not invent details.
- Write in clear markdown with ## headings and bullet points.`;

  const NO_CAPTIONS_SYSTEM = `You are an honest educational assistant. This video has NO captions/transcript available.
You only have the title, channel, and description. Clearly state that the summary is based on metadata only, not the full video.
Do NOT pretend you watched the video. Do NOT invent specific quotes or detailed lecture content.`;

  const formatTranscriptWithTimestamps = (
    segments: { start: number; text: string }[],
    maxChars = 120000
  ): string => {
    if (segments.length === 0) return "";
    const lines: string[] = [];
    let total = 0;
    for (const seg of segments) {
      const line = `[${formatTimestamp(seg.start)}] ${seg.text}`;
      if (total + line.length > maxChars) break;
      lines.push(line);
      total += line.length + 1;
    }
    return lines.join("\n");
  };

  const splitIntoChunks = (text: string, chunkSize = 8000, overlap = 400): string[] => {
    if (text.length <= chunkSize) return [text];
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + chunkSize, text.length);
      if (end < text.length) {
        const slice = text.substring(start, end);
        const lastBreak = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(". "));
        if (lastBreak > chunkSize * 0.5) {
          end = start + lastBreak + 1;
        }
      }
      chunks.push(text.substring(start, end));
      if (end >= text.length) break;
      start = Math.max(end - overlap, start + 1);
    }
    return chunks;
  };

  const generateAccurateSummary = async (
    transcript: string,
    title: string,
    segments: { start: number; text: string }[],
    hasCaptions: boolean
  ): Promise<string> => {
    if (!hasCaptions) {
      return await geminiComplete({
        messages: [
          { role: "system", content: NO_CAPTIONS_SYSTEM },
          {
            role: "user",
            content: `Video: "${title}"

Available metadata (NOT a full transcript):
${transcript}

Provide a brief, honest overview based only on the metadata above. Start with a note that captions were unavailable.`,
          },
        ],
        temperature: 0.2,
        maxTokens: 2048,
      });
    }

    const timestampedTranscript =
      segments.length > 0
        ? formatTranscriptWithTimestamps(segments)
        : transcript;

    const chunks = splitIntoChunks(timestampedTranscript);
    const durationHint =
      segments.length > 0
        ? `~${formatTimestamp(segments[segments.length - 1].start)}`
        : "unknown length";

    if (chunks.length === 1) {
      return await geminiComplete({
        messages: [
          { role: "system", content: FAITHFUL_SUMMARY_SYSTEM },
          {
            role: "user",
            content: `Summarize this video transcript faithfully. The summary must match what is actually said in the video.

Video title: "${title}"
Duration: ${durationHint}

Transcript (with timestamps):
${timestampedTranscript}

Structure your summary as:
## Overview
2-4 sentences covering the main topic and purpose as stated in the video.

## Key Points
Bullet points for each major topic discussed, in chronological order. Include specific examples, names, and arguments from the transcript.

## Conclusion
What the speaker concludes or emphasizes at the end, based only on the transcript.`,
          },
        ],
        temperature: 0.1,
        maxTokens: 8192,
      });
    }

    const chunkSummaries: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkRes = await geminiComplete({
        messages: [
          {
            role: "system",
            content:
              "Extract a factual bullet-point summary of this transcript segment. Include only what is explicitly stated. Do not add outside knowledge.",
          },
          {
            role: "user",
            content: `Video: "${title}" — Segment ${i + 1} of ${chunks.length}\n\n${chunks[i]}`,
          },
        ],
        temperature: 0.1,
        maxTokens: 4096,
      });
      chunkSummaries.push(`### Part ${i + 1}\n${chunkRes}`);
    }

    const blended = chunkSummaries.join("\n\n");
    return await geminiComplete({
      messages: [
        { role: "system", content: FAITHFUL_SUMMARY_SYSTEM },
        {
          role: "user",
          content: `Combine these segment summaries into one cohesive summary of "${title}" (${durationHint}).

Rules: preserve chronological order, do not add new facts, remove redundancy, keep specific names/examples from the segments.

Segment summaries:
${blended}

Final structure:
## Overview
## Key Points (chronological)
## Conclusion`,
        },
      ],
      temperature: 0.1,
      maxTokens: 8192,
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
    setTabOutputs({});
    setChatMessages([]);
    setPlayerStartSeconds(null);
    setActiveTab("summary");

    try {
      const resp = await fetch(`/api/youtube-transcript?v=${id}`);
      if (!resp.ok) throw new Error("Failed to extract YouTube details");
      const data = await resp.json();

      const hasCaptions = data.hasTranscript === true && (data.segments?.length ?? 0) > 0;

      if (!hasCaptions) {
        toast.warning(
          "This video has no captions. Summary will be based on title/description only — it may not match the full video content."
        );
      }

      const transcriptText = hasCaptions
        ? data.transcript
        : `No transcript available.\nTitle: ${data.title || "YouTube Video"}\nChannel: ${data.channel || "Unknown"}\nDescription: ${data.transcript || "No description provided."}`;

      const videoObject = {
        id,
        title: data.title || "YouTube Video",
        channel: data.channel || "Unknown Channel",
        transcript: transcriptText,
        hasCaptions,
        segments: data.segments || [],
      };

      setVideoData(videoObject);
      setIsLoading(false);
      setIsGenerating(true);

      const result = await generateAccurateSummary(
        transcriptText,
        videoObject.title,
        videoObject.segments,
        hasCaptions
      );

      setTabOutputs(prev => ({ ...prev, summary: result }));
      toast.success(
        hasCaptions
          ? "Summary generated from video captions!"
          : "Limited summary generated (no captions available)."
      );
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to generate summary");
    } finally {
      setIsLoading(false);
      setIsGenerating(false);
    }
  };

  // ── Tab content generators ──────────────────────────────────
  const generateTabContent = async (tab: typeof activeTab) => {
    if (!videoData || tabOutputs[tab]) return;
    setGeneratingTab(tab);

    try {
      const transcriptForPrompt =
        videoData.segments.length > 0
          ? formatTranscriptWithTimestamps(videoData.segments, 15000)
          : videoData.transcript.length > 15000
            ? videoData.transcript.substring(0, 15000) + `\n\n[... transcript truncated at 15000 chars.]`
            : videoData.transcript;

      const hasCaptions = videoData.hasCaptions;
      let prompt = "";
      let systemPrompt = "";

      if (tab === "timeline") {
        systemPrompt =
          "Create a chronological timeline strictly from the transcript. Use approximate timestamps. Do not invent topics not in the transcript.";
        prompt = hasCaptions
          ? `Generate a chronological timeline of topics discussed in this video. For each entry, give a timestamp and 1-2 sentences describing what is explained at that point.

Video: "${videoData.title}"
Transcript:
${transcriptForPrompt}`
          : `This video has no captions. Create a brief hypothetical study outline for "${videoData.title}" based on the title only. Label it clearly as estimated, not from the video.`;
      } else if (tab === "concepts") {
        systemPrompt =
          "Extract concepts defined or explained in the transcript. Use only transcript content — no external definitions.";
        prompt = hasCaptions
          ? `Extract core concepts from this video transcript. For each: name, definition as given in the video, and any example the speaker uses.

Video: "${videoData.title}"
Transcript:
${transcriptForPrompt}`
          : `List likely core concepts for "${videoData.title}" based on the title only. State that these are inferred, not from the video.`;
      } else if (tab === "study") {
        systemPrompt =
          "Create a study guide from transcript content only. Questions must be answerable from the transcript.";
        prompt = hasCaptions
          ? `Create a study guide from this video transcript:
1. Key terms and definitions (as stated in the video)
2. 4-5 comprehension questions with answers (answerable from transcript only)
3. Brief review of main arguments

Video: "${videoData.title}"
Transcript:
${transcriptForPrompt}`
          : `Create a basic study guide outline for "${videoData.title}" from the title only. Note that captions were unavailable.`;
      } else if (tab === "podcast") {
        systemPrompt =
          "Convert the transcript into a dialogue between two hosts. Every fact discussed must come from the transcript.";
        prompt = hasCaptions
          ? `Convert this video transcript into a podcast dialogue between Alex (curious student) and Robin (teacher). Cover the same topics and facts as the original video — do not add new content.

Video: "${videoData.title}"
Transcript:
${transcriptForPrompt}`
          : `Write a short podcast dialogue about "${videoData.title}" based on the title only. Note captions were unavailable.`;
      } else if (tab === "faq") {
        systemPrompt =
          "Generate FAQs with answers strictly from the transcript. If a question cannot be answered from the transcript, omit it.";
        prompt = hasCaptions
          ? `Generate 6-8 FAQs about this video with detailed answers based ONLY on the transcript.

Video: "${videoData.title}"
Transcript:
${transcriptForPrompt}`
          : `Generate 4-5 general FAQs about "${videoData.title}" from the title only. Note answers are not from the video.`;
      }

      const result = await geminiComplete({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: hasCaptions ? 0.15 : 0.3,
        maxTokens: 6144,
      });

      setTabOutputs(prev => ({ ...prev, [tab]: result }));
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate content tab");
    } finally {
      setGeneratingTab(null);
    }
  };

  // ── Chat with Video Transcript ──────────────────────────────
  const handleSendChat = async () => {
    if (!chatInput.trim() || !videoData || isChatSending) return;

    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsChatSending(true);

    try {
      const history = chatMessages.map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
      const hasCaptions = videoData.hasCaptions;

      const transcriptContext =
        videoData.segments.length > 0
          ? formatTranscriptWithTimestamps(videoData.segments, 18000)
          : videoData.transcript.substring(0, 18000);

      const systemPrompt = hasCaptions
        ? `You are a tutor answering questions about a video. Answer ONLY using the transcript below. If the answer is not in the transcript, say "That is not covered in this video's transcript."

Video: "${videoData.title}" by "${videoData.channel}"
Transcript:
${transcriptContext}`
        : `This video has no captions. Answer questions about "${videoData.title}" using general knowledge, but clearly state you cannot reference specific video content.`;

      const result = await geminiStream(
        {
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: userMsg }
          ],
          temperature: hasCaptions ? 0.2 : 0.4,
          maxTokens: 4096,
        },
        () => {}
      );

      setChatMessages(prev => [...prev, { role: "assistant", content: result }]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch response");
    } finally {
      setIsChatSending(false);
    }
  };

  // Notepad Firestore Persist
  const handleSaveNotes = async () => {
    if (!personalNotes.trim()) {
      toast.error("Notepad is empty!");
      return;
    }
    if (!user) {
      toast.error("Please login to save notes");
      return;
    }

    setIsSavingNotes(true);
    try {
      const titleClean = videoData?.title || "Video";
      const fileName = `${titleClean.substring(0, 40)}_Study_Notes.md`;

      await addDoc(collection(db, "materials"), {
        user_id: user.uid,
        file_name: fileName,
        content_type: "text/markdown",
        file_size: new Blob([personalNotes]).size,
        processing_status: "completed",
        uploaded_at: new Date().toISOString(),
        extracted_text: personalNotes,
        summary: `Personal study notes taken while analyzing the YouTube video: "${videoData?.title || "Video"}"`,
        key_topics: [videoData?.channel || "Study Notes"],
        content_length: personalNotes.length,
        concepts: [
          { name: videoData?.title || "Video Notes", importance: "critical" }
        ]
      });

      queryClient.invalidateQueries({ queryKey: ["materials", user.uid] });
      toast.success("Study notes saved to your Resources Library!");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to save notes");
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleCopy = () => {
    const content = activeTab === "chat" ? "" : (tabOutputs[activeTab] || tabOutputs.summary);
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTabSwitch = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (tab !== "chat" && !tabOutputs[tab] && videoData) {
      generateTabContent(tab);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and paste area */}
      {!videoData ? (
        <div className="bg-white border border-gray-100 rounded-3xl p-6 md:p-8 shadow-sm space-y-4 max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#0F172A]/5 flex items-center justify-center">
              <Youtube className="h-5 w-5 text-[#0F172A]" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-gray-900 tracking-tight">YouTube Summarizer</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Accurate summaries from video captions, with timeline and study tools.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Youtube className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="url"
                  placeholder="Paste YouTube link here..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isLoading}
                  className="w-full h-12 pl-12 pr-4 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#1D4ED8]/50 focus:ring-2 focus:ring-[#1D4ED8]/10 text-gray-900 transition-all disabled:opacity-50"
                  onKeyDown={(e) => e.key === "Enter" && handleSummarize()}
                />
              </div>
              <Button
                onClick={handleSummarize}
                disabled={isLoading || !url.trim()}
                className="bg-[#0F172A] text-white hover:bg-[#0F172A]/90 h-12 gap-2 font-semibold rounded-xl px-6 transition-all shadow-sm"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Summarize Video
              </Button>
            </div>
            <p className="text-[10px] text-gray-400 text-center leading-relaxed">
              Summaries are generated from video captions when available. Enable captions on the source video for best accuracy.
            </p>
          </div>
        </div>
      ) : (
        /* Video Loaded: Split workspace layout */
        <div className="grid lg:grid-cols-12 gap-6 animate-in fade-in duration-300">
          
          {/* Left Panel: Video & Notes */}
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-4">
              {/* Responsive Iframe Player */}
              <div className="rounded-xl overflow-hidden bg-black aspect-video relative shadow-sm border border-gray-100">
                <iframe
                  key={playerStartSeconds}
                  src={`https://www.youtube.com/embed/${videoData.id}${playerStartSeconds !== null ? `?start=${playerStartSeconds}&autoplay=1` : ""}`}
                  className="absolute inset-0 w-full h-full border-none"
                  title={videoData.title}
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
              </div>
              <div>
                <div className="flex justify-between items-start gap-4">
                  <h3 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2" title={videoData.title}>
                    {videoData.title}
                  </h3>
                  <button
                    onClick={() => {
                      localStorage.removeItem(`notes_${videoData.id}`);
                      setVideoData(null);
                      setUrl("");
                      setTabOutputs({});
                      setChatMessages([]);
                      setPlayerStartSeconds(null);
                    }}
                    className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors shrink-0 font-semibold"
                  >
                    <X className="h-3.5 w-3.5" /> Clear
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1 font-medium">
                  {videoData.channel}
                  {!videoData.hasCaptions && (
                    <span className="ml-2 text-amber-600">· No captions — summary may be limited</span>
                  )}
                </p>
              </div>
            </div>

            {/* Markdown Notepad */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                <div className="flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-orange-500" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">My Study Notepad</h4>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (!personalNotes.trim()) return;
                      navigator.clipboard.writeText(personalNotes);
                      toast.success("Notes copied to clipboard!");
                    }}
                    className="text-[10px] font-semibold text-gray-500 border border-gray-200 px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Copy
                  </button>
                  <Button
                    size="sm"
                    className="h-7 text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 px-3 font-semibold rounded-lg"
                    onClick={handleSaveNotes}
                    disabled={isSavingNotes || !personalNotes.trim()}
                  >
                    {isSavingNotes ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>Save to Resources</>
                    )}
                  </Button>
                </div>
              </div>
              <textarea
                placeholder="Type your notes as you watch the video..."
                value={personalNotes}
                onChange={(e) => handleNotesChange(e.target.value)}
                className="w-full min-h-[180px] p-3 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-orange-500/30 text-gray-800 resize-y font-mono leading-relaxed"
              />
              <p className="text-[10px] text-gray-400 text-right italic">
                Draft is auto-saved in your local storage.
              </p>
            </div>
          </div>

          {/* Right Panel: AI Tabs and Chat */}
          <div className="lg:col-span-6 flex flex-col bg-white border border-gray-100 rounded-2xl p-5 shadow-sm min-h-[550px]">
            {/* Header Tabs */}
            <div className="flex gap-1 pb-2 border-b border-gray-100 overflow-x-auto scrollbar-thin">
              {[
                { key: "summary" as const, label: "Summary" },
                { key: "timeline" as const, label: "Timeline" },
                { key: "concepts" as const, label: "Concepts" },
                { key: "study" as const, label: "Study Guide" },
                { key: "podcast" as const, label: "Podcast" },
                { key: "faq" as const, label: "FAQ" },
                { key: "chat" as const, label: "Ask Tutor" }
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => handleTabSwitch(tab.key)}
                  className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-all font-semibold ${
                    activeTab === tab.key
                      ? "bg-[#0F172A]/8 text-[#0F172A] font-bold"
                      : "text-gray-400 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Quick action actions */}
            {activeTab !== "chat" && tabOutputs[activeTab] && (
              <div className="flex justify-end gap-3 pt-2.5">
                <button
                  onClick={() => {
                    const text = `\n\n### AI ${activeTab.toUpperCase()}\n${tabOutputs[activeTab]}`;
                    handleNotesChange(personalNotes + text);
                    toast.success(`Appended ${activeTab} to your notepad!`);
                  }}
                  className="text-[10px] text-orange-600 hover:underline flex items-center font-semibold bg-orange-50 px-2.5 py-1 rounded-md border border-orange-100"
                >
                  Append to Notepad
                </button>
                <button
                  onClick={handleCopy}
                  className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1 font-semibold"
                >
                  {copied ? <CheckCheck className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}

            {/* Dynamic Content Window */}
            {isGenerating || generatingTab === activeTab ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-[#1D4ED8]" />
                <p className="text-xs text-gray-500 animate-pulse text-center">Generating summary from transcript…</p>
              </div>
            ) : activeTab === "chat" ? (
              /* Chat Workspace */
              <div className="flex flex-col h-full flex-1 pt-3">
                <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1 max-h-[360px] scrollbar-thin">
                  {chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                      <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                        <MessageSquare className="h-5 w-5 text-orange-500" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-700">Ask Anything About This Video</p>
                        <p className="text-[10px] text-gray-400 mt-1 max-w-[240px] mx-auto leading-relaxed">
                          Your personal Gemini Tutor can answer specific inquiries based entirely on the transcript context.
                        </p>
                      </div>
                    </div>
                  ) : (
                    chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm border ${
                          msg.role === "user"
                            ? "bg-orange-500 text-white border-orange-500"
                            : "bg-white border-gray-100 text-gray-800 prose prose-sm max-w-none dark:prose-invert"
                        }`}>
                          {msg.role === "user" ? (
                            msg.content
                          ) : (
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  {isChatSending && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-gray-100 rounded-2xl px-4 py-2.5 flex items-center gap-2 shadow-sm">
                        <Loader2 className="h-3 w-3 animate-spin text-orange-500" />
                        <span className="text-[10px] text-gray-400 font-medium">Tutor is thinking...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="flex gap-2 pt-3 border-t border-gray-100 mt-auto">
                  <input
                    type="text"
                    placeholder="Ask a question about this video..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="flex-1 h-10 px-4 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-orange-500/40 text-gray-900 transition-all placeholder:text-gray-400"
                    onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                  />
                  <Button
                    onClick={handleSendChat}
                    disabled={isChatSending || !chatInput.trim()}
                    className="bg-cta text-cta-foreground hover:bg-cta/90 h-10 w-10 p-0 flex items-center justify-center rounded-xl shrink-0"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              /* Generated Markdown Tabs */
              <div className="flex-1 flex flex-col pt-3">
                <div className="flex-1 overflow-y-auto max-h-[420px] py-2 pr-1 scrollbar-thin">
                  {tabOutputs[activeTab] ? (
                    <div className="prose prose-sm max-w-none text-xs text-gray-700 dark:text-gray-300 leading-relaxed dark:prose-invert">
                      <ReactMarkdown>{tabOutputs[activeTab]}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                      <Sparkles className="h-8 w-8 text-orange-300 animate-pulse" />
                      <div>
                        <p className="text-xs font-semibold text-gray-700">Content Not Generated Yet</p>
                        <p className="text-[10px] text-gray-400 mt-1 max-w-[220px] mx-auto leading-relaxed">
                          Click below to have Gemini compile the timeline, key concepts, or quizzes.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => generateTabContent(activeTab)}
                        className="bg-cta text-cta-foreground hover:bg-cta/90 font-semibold rounded-lg mt-2 text-xs px-4"
                      >
                        Generate {activeTab.toUpperCase()}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Sub-Timeline Interaction Panel inside timeline tab */}
                {activeTab === "timeline" && videoData.segments.length > 0 && tabOutputs.timeline && (
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Play className="h-3 w-3 text-orange-500" />
                      Click Segment to Jump Video
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scroll-smooth">
                      {videoData.segments.filter((_, i) => i % Math.max(1, Math.floor(videoData.segments.length / 10)) === 0).map((seg, idx) => (
                        <button
                          key={idx}
                          onClick={() => setPlayerStartSeconds(Math.floor(seg.start))}
                          className="flex-shrink-0 bg-gray-50 hover:bg-orange-50 hover:border-orange-200 border border-gray-200/60 rounded-xl p-2.5 text-left transition-all max-w-[150px] space-y-1 text-[10px] group"
                        >
                          <span className="font-mono font-bold text-orange-600 bg-orange-500/10 px-2 py-0.5 rounded text-[9px]">
                            {formatTimestamp(seg.start)}
                          </span>
                          <p className="text-gray-500 group-hover:text-orange-950 font-medium line-clamp-2 leading-snug">
                            {seg.text}
                          </p>
                        </button>
                      ))}
                    </div>
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
