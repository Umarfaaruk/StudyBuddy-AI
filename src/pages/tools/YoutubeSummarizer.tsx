import { useState, useRef, useEffect, useCallback } from "react";
import {
  Youtube,
  Loader2,
  Sparkles,
  Send,
  X,
  PlayCircle,
  AlertCircle,
  Copy,
  Check,
  Clock,
  Eye,
  BookOpen,
  Lightbulb,
  MessageSquare,
  ChevronDown,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { aiComplete, aiStream } from "@/lib/aiService";
import { extractYouTubeVideoId } from "@/lib/youtube";
import ReactMarkdown from "react-markdown";

/* ─── Types ─────────────────────────────────────────────── */
type Segment = { start: number; text: string };

type VideoData = {
  id: string;
  title: string;
  channel: string;
  duration: number | null;
  thumbnail: string;
  viewCount: number | null;
  hasCaptions: boolean;
  segments: Segment[];
  transcript: string;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

type ActionId = "summarise" | "takeaways" | "mindmap" | "quiz" | "chat";

/* ─── Constants ─────────────────────────────────────────── */
const QUICK_ACTIONS: { id: ActionId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "summarise", label: "Summary", icon: BookOpen },
  { id: "takeaways", label: "Key Takeaways", icon: Lightbulb },
  { id: "mindmap",   label: "Mind Map",     icon: Sparkles },
  { id: "quiz",      label: "Quiz Me",      icon: MessageSquare },
  { id: "chat",      label: "Ask Anything", icon: ChevronDown },
];

const SUMMARY_SYSTEM = `You are a precise transcript summarizer. Summarize ONLY from the transcript provided.

STRICT RULES:
- Use ONLY facts, arguments, examples, and terminology from the transcript.
- Do NOT add external knowledge or invent content not spoken in the video.
- Preserve the speaker's key terms, names, and examples as stated.
- Cover topics in chronological order as they appear in the transcript.
- If something is unclear in the transcript, omit it — do not guess.

Output format (markdown):

Write a 2-4 sentence overview paragraph first (bold key names/entities).

Then exactly this heading on its own line:
**Key Highlights and Topics:**

Then bullet points in this exact format:
- **Topic Title (M:SS - M:SS):** One or two sentences describing what is discussed in that segment.

Use 5-10 bullet points covering the full video chronologically. Timestamps must match the transcript timestamps.`;

const NO_CAPTIONS_SYSTEM = `You are analysing a YouTube video that has NO captions or transcript available.
You only know the video title, channel name, and possibly a short description.

RULES:
- Clearly tell the user that captions are unavailable for this video.
- Do NOT invent, fabricate, or guess any lecture content, code examples, or explanations.
- Give a brief 2-3 sentence overview based ONLY on the title/channel/description.
- Suggest the user watches the video directly and returns to chat any specific questions.`;

// Used when a transcript IS available
const TAKEAWAYS_SYSTEM_WITH_TRANSCRIPT = `Extract 5-8 key takeaways from this video transcript.
Format as a numbered list. Each takeaway: 1-2 sentences, specific and actionable.
Use ONLY content explicitly stated in the transcript provided.`;

// Used when NO transcript is available
const TAKEAWAYS_SYSTEM_NO_TRANSCRIPT = `This video has no captions or transcript available.
Tell the user that key takeaways cannot be extracted without a transcript.
Briefly suggest what the video likely covers based on its title, and invite them to ask questions after watching.
Do NOT invent any content.`;

const MINDMAP_SYSTEM_WITH_TRANSCRIPT = `Create a structured mind map outline from this video transcript.
Format with markdown:
# [Main Topic]
## [Branch 1]
- Sub-point
## [Branch 2]
- Sub-point
Use 4-6 main branches with 2-4 sub-points each. Use ONLY content from the transcript.`;

const MINDMAP_SYSTEM_NO_TRANSCRIPT = `This video has no captions or transcript available.
Tell the user a mind map cannot be created without transcript content.
Offer a brief topic outline based only on the video title if possible.
Do NOT invent any content.`;

const QUIZ_SYSTEM_WITH_TRANSCRIPT = `Generate 5 comprehension questions based on this video transcript.
Format each as:
**Q[N]: [Question]**
> Answer: [Answer]

Make questions test genuine understanding. Use ONLY content from the transcript.`;

const QUIZ_SYSTEM_NO_TRANSCRIPT = `This video has no captions or transcript available.
Tell the user that quiz questions cannot be generated without a transcript.
Suggest they watch the video and then ask specific questions in the chat tab.
Do NOT invent any content.`;

/* ─── Utility functions ─────────────────────────────────── */
function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatViewCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K views`;
  return `${n} views`;
}

function parseTimestampToSeconds(ts: string): number | null {
  const parts = ts.trim().split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

function cleanSegmentText(text: string): string {
  return text.replace(/[\u266a\u266b\u266c\u266d\u266e\u266f♪♫]/g, " ").replace(/\s+/g, " ").trim();
}

function formatTranscriptWithTimestamps(segments: Segment[], maxChars = 120000): string {
  const lines: string[] = [];
  let total = 0;
  for (const seg of segments) {
    const text = cleanSegmentText(seg.text);
    if (!text) continue;
    const line = `[${formatTimestamp(seg.start)}] ${text}`;
    if (total + line.length > maxChars) break;
    lines.push(line);
    total += line.length + 1;
  }
  return lines.join("\n");
}

function splitIntoChunks(text: string, chunkSize = 8000, overlap = 400): string[] {
  if (text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) {
      const slice = text.substring(start, end);
      const lastBreak = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(". "));
      if (lastBreak > chunkSize * 0.5) end = start + lastBreak + 1;
    }
    chunks.push(text.substring(start, end));
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

function linkifyTimestamps(text: string): string {
  return text.replace(
    /(?<!\[)(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)(?!\))/g,
    "[$1 - $2](#t=$1)"
  );
}

/* ─── AI generation helpers ─────────────────────────────── */
async function runAI(
  systemPrompt: string,
  userContent: string,
  onToken?: (t: string) => void
): Promise<string> {
  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userContent },
  ];
  if (onToken) {
    return aiStream({ messages, temperature: 0.2, maxTokens: 8192 }, onToken);
  }
  return aiComplete({ messages, temperature: 0.15, maxTokens: 8192 });
}

async function generateVideoSummary(
  title: string,
  segments: Segment[],
  transcript: string,
  hasCaptions: boolean
): Promise<string> {
  if (!hasCaptions) {
    return runAI(NO_CAPTIONS_SYSTEM, `Video: "${title}"\n\nMetadata:\n${transcript}`);
  }

  const timestamped =
    segments.length > 0 ? formatTranscriptWithTimestamps(segments) : transcript;

  if (!timestamped.trim()) {
    throw new Error("Transcript is empty. Try a different video with captions enabled.");
  }

  const chunks = splitIntoChunks(timestamped);
  const durationHint =
    segments.length > 0 ? formatTimestamp(segments[segments.length - 1].start) : "unknown";

  if (chunks.length === 1) {
    return runAI(
      SUMMARY_SYSTEM,
      `Summarize this video faithfully.\n\nVideo: "${title}" (duration ~${durationHint})\n\nTranscript:\n${timestamped}`
    );
  }

  const parts: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const part = await runAI(
      "Extract factual bullet points with timestamps from this transcript segment. Include ONLY what is explicitly stated. Format: - **Topic (M:SS - M:SS):** description",
      `Segment ${i + 1}/${chunks.length} of "${title}":\n\n${chunks[i]}`
    );
    parts.push(part);
  }
  return runAI(
    SUMMARY_SYSTEM,
    `Combine these segment summaries into one cohesive summary for "${title}" (~${durationHint}). Keep chronological order, all timestamps, and only facts from the segments.\n\n${parts.join("\n\n---\n\n")}`
  );
}

/* ─── Sub-components ────────────────────────────────────── */
function TimestampMarkdown({
  content,
  onSeek,
}: {
  content: string;
  onSeek: (seconds: number) => void;
}) {
  const processed = linkifyTimestamps(content);
  return (
    <div className="prose prose-sm max-w-none prose-slate prose-p:text-accent prose-p:leading-relaxed prose-strong:text-foreground prose-li:text-accent prose-li:my-1.5">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("#t=")) {
              const ts = href.replace("#t=", "").split("-")[0].trim();
              const seconds = parseTimestampToSeconds(ts);
              if (seconds !== null) {
                return (
                  <button
                    type="button"
                    onClick={() => onSeek(seconds)}
                    className="inline-flex items-center gap-0.5 text-primary font-medium hover:underline cursor-pointer not-prose"
                  >
                    <PlayCircle className="h-3.5 w-3.5 shrink-0" />
                    {children}
                  </button>
                );
              }
            }
            return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
          },
          p: ({ children }) => (
            <p className="text-[15px] text-accent leading-relaxed mb-4 last:mb-0">{children}</p>
          ),
          ul: ({ children }) => <ul className="space-y-3 mt-3 mb-0 pl-0 list-none">{children}</ul>,
          ol: ({ children }) => <ol className="space-y-3 mt-3 mb-0 pl-4">{children}</ol>,
          li: ({ children }) => (
            <li className="text-[14px] text-accent leading-relaxed pl-4 border-l-2 border-primary/20">
              {children}
            </li>
          ),
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          h1: ({ children }) => <h1 className="text-lg font-bold text-foreground mt-4 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold text-foreground mt-3 mb-1.5">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-foreground mt-2 mb-1">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/40 pl-4 text-muted-foreground italic my-3">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
          ),
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/* ─── Main component ────────────────────────────────────── */
export const YoutubeSummarizer = () => {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [playerStartSeconds, setPlayerStartSeconds] = useState<number | null>(null);

  // One content slot per action tab
  const [actionContent, setActionContent] = useState<Record<ActionId, string>>({
    summarise: "",
    takeaways: "",
    mindmap: "",
    quiz: "",
    chat: "",
  });
  // Streaming partial for current tab
  const [streamingContent, setStreamingContent] = useState("");

  const [activeAction, setActiveAction] = useState<ActionId>("summarise");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatSending, setIsChatSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleSeek = useCallback((seconds: number) => {
    setPlayerStartSeconds(Math.floor(seconds));
  }, []);

  const resetSession = () => {
    setActionContent({ summarise: "", takeaways: "", mindmap: "", quiz: "", chat: "" });
    setStreamingContent("");
    setChatMessages([]);
    setPlayerStartSeconds(null);
    setActiveAction("summarise");
  };

  const handleClear = () => {
    setVideoData(null);
    setUrl("");
    resetSession();
  };

  const handleSummarize = async () => {
    const id = extractYouTubeVideoId(url.trim());
    if (!id) {
      toast.error("Please enter a valid YouTube URL");
      return;
    }

    setIsLoading(true);
    setVideoData(null);
    resetSession();

    try {
      const resp = await fetch(`/api/youtube-transcript?v=${id}`);
      if (!resp.ok) throw new Error("Failed to fetch video details");
      const data = await resp.json();

      const hasCaptions = data.hasTranscript === true && (data.segments?.length ?? 0) > 0;
      if (!hasCaptions) {
        toast.warning("No captions found — summary will be limited to video metadata.");
      }

      const video: VideoData = {
        id,
        title: data.title || "YouTube Video",
        channel: data.channel || "Unknown Channel",
        duration: data.duration || null,
        thumbnail: data.thumbnail || `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
        viewCount: data.viewCount || null,
        hasCaptions,
        segments: data.segments || [],
        transcript: hasCaptions
          ? data.transcript
          : `Title: ${data.title}\nChannel: ${data.channel}\nDescription: ${data.transcript || "N/A"}`,
      };

      setVideoData(video);
      setIsLoading(false);
      setIsGenerating(true);
      setActiveAction("summarise");
      setStreamingContent("");

      // Stream the summary
      const result = await generateVideoSummary(
        video.title,
        video.segments,
        video.transcript,
        hasCaptions
      );

      setActionContent((prev) => ({ ...prev, summarise: result }));
      setStreamingContent("");

      toast.success(
        hasCaptions ? "Summary ready!" : "Limited summary generated (no captions)"
      );
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to summarize video");
      setVideoData(null);
    } finally {
      setIsLoading(false);
      setIsGenerating(false);
    }
  };

  const runAction = async (actionId: ActionId) => {
    if (!videoData || isGenerating || isChatSending) return;
    if (actionContent[actionId] && actionId !== "chat") return; // already generated

    const transcriptContext =
      videoData.segments.length > 0
        ? formatTranscriptWithTimestamps(videoData.segments, 20000)
        : videoData.transcript.substring(0, 20000);

    const context = hasCaps
      ? `Video: "${videoData.title}" by ${videoData.channel}\n\nTranscript:\n${transcriptContext}`
      : `Video Title: "${videoData.title}"\nChannel: ${videoData.channel}\n${videoData.transcript ? `\nDescription:\n${videoData.transcript.slice(0, 1000)}` : "\nNo description available."}`;

    const hasCaps = videoData.hasCaptions && videoData.transcript.trim().length > 50;
    const systemMap: Record<Exclude<ActionId, "chat" | "summarise">, string> = {
      takeaways: hasCaps ? TAKEAWAYS_SYSTEM_WITH_TRANSCRIPT : TAKEAWAYS_SYSTEM_NO_TRANSCRIPT,
      mindmap:   hasCaps ? MINDMAP_SYSTEM_WITH_TRANSCRIPT   : MINDMAP_SYSTEM_NO_TRANSCRIPT,
      quiz:      hasCaps ? QUIZ_SYSTEM_WITH_TRANSCRIPT      : QUIZ_SYSTEM_NO_TRANSCRIPT,
    };

    if (actionId === "summarise") {
      setIsGenerating(true);
      setStreamingContent("");
      try {
        const result = await generateVideoSummary(
          videoData.title,
          videoData.segments,
          videoData.transcript,
          videoData.hasCaptions
        );
        setActionContent((prev) => ({ ...prev, summarise: result }));
      } catch {
        toast.error("Failed to generate summary");
      } finally {
        setIsGenerating(false);
        setStreamingContent("");
      }
      return;
    }

    if (actionId === "chat") return;

    setIsGenerating(true);
    setStreamingContent("");
    try {
      let accumulated = "";
      const result = await aiStream(
        {
          messages: [
            { role: "system", content: systemMap[actionId] },
            { role: "user", content: context },
          ],
          temperature: 0.2,
          maxTokens: 4096,
        },
        (token) => {
          accumulated += token;
          setStreamingContent(accumulated);
        }
      );
      setActionContent((prev) => ({ ...prev, [actionId]: result }));
    } catch {
      toast.error("Failed to generate content");
    } finally {
      setIsGenerating(false);
      setStreamingContent("");
    }
  };

  const handleTabClick = (actionId: ActionId) => {
    setActiveAction(actionId);
    if (!actionContent[actionId] && actionId !== "chat" && !isGenerating) {
      runAction(actionId);
    }
  };

  const askQuestion = async (question: string) => {
    if (!videoData || isChatSending) return;
    setChatMessages((prev) => [...prev, { role: "user", content: question }]);
    setIsChatSending(true);

    try {
      const transcriptContext =
        videoData.segments.length > 0
          ? formatTranscriptWithTimestamps(videoData.segments, 18000)
          : videoData.transcript.substring(0, 18000);

      const systemPrompt = videoData.hasCaptions
        ? `Answer questions about this video using ONLY the transcript. If not in transcript, say so clearly.\n\nVideo: "${videoData.title}" by ${videoData.channel}\n${actionContent.summarise ? `\nExisting summary:\n${actionContent.summarise}\n` : ""}\nTranscript:\n${transcriptContext}`
        : `This video has no captions. Answer about "${videoData.title}" using metadata only. Be honest about limitations.`;

      const history = chatMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      let accumulated = "";
      // Optimistically add empty assistant message, then fill
      setChatMessages((prev) => [...prev, { role: "assistant", content: "…" }]);

      const result = await aiStream(
        {
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: question },
          ],
          temperature: 0.2,
          maxTokens: 4096,
        },
        (token) => {
          accumulated += token;
          setChatMessages((prev) => [
            ...prev.slice(0, -1),
            { role: "assistant", content: accumulated },
          ]);
        }
      );

      setChatMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: result },
      ]);
    } catch {
      toast.error("Failed to get a response");
      setChatMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsChatSending(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  const handleSendChat = () => {
    if (!chatInput.trim() || isChatSending) return;
    const msg = chatInput.trim();
    setChatInput("");
    askQuestion(msg);
  };

  const handleDownloadSummary = () => {
    if (!videoData || !actionContent.summarise) return;
    const content = `# ${videoData.title}\nChannel: ${videoData.channel}\n\n${actionContent.summarise}`;
    const blob = new Blob([content], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${videoData.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_summary.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Summary downloaded");
  };

  useEffect(() => {
    if (actionContent.summarise || chatMessages.length) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [actionContent, chatMessages, isChatSending, streamingContent]);

  /* ─── Input screen ──────────────────────────────────── */
  if (!videoData) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-cta/5 pointer-events-none" />
          <div className="relative p-8 md:p-10 space-y-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 ring-1 ring-primary/10">
                <Youtube className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold text-foreground tracking-tight">
                  YouTube Summarizer
                </h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-md leading-relaxed">
                  Paste any YouTube link. Get a timestamped summary, key takeaways, mind map, quiz, and chat with the transcript.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Youtube className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <input
                  type="url"
                  placeholder="https://youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isLoading}
                  className="w-full h-12 pl-12 pr-4 text-sm bg-background border border-input rounded-xl outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary text-foreground transition-shadow disabled:opacity-60"
                  onKeyDown={(e) => e.key === "Enter" && handleSummarize()}
                />
              </div>
              <Button
                onClick={handleSummarize}
                disabled={isLoading || !url.trim()}
                className="h-12 px-8 rounded-xl bg-cta text-cta-foreground hover:bg-cta/90 font-semibold shadow-sm shrink-0"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Summarize
                  </>
                )}
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              {[
                { icon: BookOpen, label: "Timestamped Summary" },
                { icon: Lightbulb, label: "Key Takeaways" },
                { icon: Sparkles, label: "Mind Map" },
                { icon: MessageSquare, label: "Chat & Quiz" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-xl px-3 py-2.5">
                  <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Works best with videos that have captions enabled
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Video + AI panel ──────────────────────────────── */
  const currentContent = streamingContent || actionContent[activeAction];

  return (
    <div className="animate-in fade-in duration-300">
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Video column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl overflow-hidden bg-foreground aspect-video shadow-md ring-1 ring-border">
            <iframe
              key={playerStartSeconds}
              src={`https://www.youtube.com/embed/${videoData.id}${playerStartSeconds !== null ? `?start=${playerStartSeconds}&autoplay=1` : ""}`}
              className="w-full h-full border-none"
              title={videoData.title}
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2.5">
            <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
              {videoData.title}
            </h3>
            <p className="text-xs text-muted-foreground font-medium">{videoData.channel}</p>

            {/* Metadata row */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {videoData.duration && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(videoData.duration)}
                </span>
              )}
              {videoData.viewCount && (
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {formatViewCount(videoData.viewCount)}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-0.5">
              {videoData.hasCaptions ? (
                <Badge variant="secondary" className="text-[10px] font-medium bg-success-light text-success border-0">
                  Captions available
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] font-medium bg-cta-light text-cta border-0 gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Limited metadata only
                </Badge>
              )}
              <button
                type="button"
                onClick={handleClear}
                className="text-[10px] font-semibold text-muted-foreground hover:text-destructive transition-colors ml-auto"
              >
                Change video
              </button>
            </div>
          </div>

          {/* Action buttons on mobile (hidden on lg) */}
          <div className="flex flex-wrap gap-2 lg:hidden">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => handleTabClick(action.id)}
                  disabled={isGenerating || isChatSending}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all disabled:opacity-50 ${
                    activeAction === action.id
                      ? "bg-foreground text-background shadow-sm"
                      : "bg-card text-accent border border-border hover:border-primary/30"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* AI panel */}
        <div className="lg:col-span-3 flex flex-col min-h-[520px] lg:min-h-[640px]">
          <div className="flex flex-col flex-1 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-divider bg-gradient-to-r from-primary/5 to-transparent">
              <div>
                <h3 className="text-sm font-semibold text-foreground">AI Analysis</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Grounded in the video transcript</p>
              </div>
              <div className="flex items-center gap-1">
                {activeAction === "summarise" && actionContent.summarise && (
                  <>
                    <CopyButton text={actionContent.summarise} />
                    <button
                      type="button"
                      onClick={handleDownloadSummary}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Download summary"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                {activeAction !== "summarise" && actionContent[activeAction] && (
                  <CopyButton text={actionContent[activeAction]} />
                )}
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors ml-1"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-divider bg-muted/20 overflow-x-auto scrollbar-none">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                const hasContent = !!actionContent[action.id] || (action.id === "chat" && chatMessages.length > 0);
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => handleTabClick(action.id)}
                    disabled={isGenerating && activeAction !== action.id}
                    className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap transition-all border-b-2 disabled:opacity-40 ${
                      activeAction === action.id
                        ? "border-primary text-foreground bg-background"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {action.label}
                    {hasContent && activeAction !== action.id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 ml-0.5" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Content area */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-5 py-5 space-y-4 scrollbar-thin min-h-[260px]"
            >
              {/* Generating skeleton */}
              {isGenerating && !streamingContent && (
                <div className="rounded-xl border border-border bg-muted/40 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    {activeAction === "quiz" ? "Generating quiz questions…" :
                     activeAction === "mindmap" ? "Building mind map…" :
                     activeAction === "takeaways" ? "Extracting key takeaways…" :
                     "Analysing transcript…"}
                  </div>
                  <div className="space-y-2">
                    <div className="h-2.5 bg-border rounded-full w-full animate-pulse" />
                    <div className="h-2.5 bg-border rounded-full w-4/5 animate-pulse" />
                    <div className="h-2.5 bg-border rounded-full w-3/5 animate-pulse" />
                  </div>
                </div>
              )}

              {/* Streaming content */}
              {isGenerating && streamingContent && (
                <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-divider">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Generating…
                    </span>
                  </div>
                  <TimestampMarkdown content={streamingContent} onSeek={handleSeek} />
                </div>
              )}

              {/* Non-chat content */}
              {!isGenerating && activeAction !== "chat" && currentContent && (
                <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-divider">
                    <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                      {(() => {
                        const Icon = QUICK_ACTIONS.find(a => a.id === activeAction)?.icon || Sparkles;
                        return <Icon className="h-3.5 w-3.5 text-primary" />;
                      })()}
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {QUICK_ACTIONS.find(a => a.id === activeAction)?.label}
                    </span>
                  </div>
                  <TimestampMarkdown content={currentContent} onSeek={handleSeek} />
                </div>
              )}

              {/* Empty state for non-chat tabs */}
              {!isGenerating && activeAction !== "chat" && !currentContent && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="h-10 w-10 rounded-2xl bg-muted flex items-center justify-center mb-3">
                    {(() => {
                      const Icon = QUICK_ACTIONS.find(a => a.id === activeAction)?.icon || Sparkles;
                      return <Icon className="h-5 w-5 text-muted-foreground" />;
                    })()}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Click to generate {QUICK_ACTIONS.find(a => a.id === activeAction)?.label}
                  </p>
                  <Button
                    onClick={() => runAction(activeAction)}
                    size="sm"
                    className="mt-3"
                    disabled={isGenerating}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    Generate
                  </Button>
                </div>
              )}

              {/* Chat tab */}
              {activeAction === "chat" && (
                <>
                  {chatMessages.length === 0 && !isChatSending && (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Suggested questions
                      </p>
                      {[
                        "What is the main argument of this video?",
                        "What examples does the speaker use?",
                        "What conclusions does the video reach?",
                        "What should I do next after watching this?",
                      ].map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => askQuestion(q)}
                          disabled={isChatSending}
                          className="w-full text-left px-4 py-3 rounded-xl border border-border bg-background hover:border-primary/30 hover:bg-primary-light/20 text-sm text-accent transition-all"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}

                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {msg.role === "assistant" && (
                        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                        </div>
                      )}
                      <div
                        className={`max-w-[88%] ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-3 text-sm leading-relaxed shadow-sm"
                            : "rounded-xl border border-border bg-background p-4 shadow-sm"
                        }`}
                      >
                        {msg.role === "assistant" ? (
                          <TimestampMarkdown content={msg.content} onSeek={handleSeek} />
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>
                  ))}

                  {isChatSending && !chatMessages[chatMessages.length - 1]?.content.length && (
                    <div className="flex gap-3">
                      <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      </div>
                      <div className="rounded-xl border border-border bg-muted/50 px-4 py-3">
                        <span className="text-sm text-muted-foreground">Thinking…</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            {/* Chat input (only on chat tab) */}
            {activeAction === "chat" && (
              <div className="px-5 py-4 border-t border-divider bg-card">
                <div className="flex items-center gap-2 rounded-xl border border-input bg-background pl-4 pr-1.5 py-1.5 focus-within:ring-2 focus-within:ring-ring/25 focus-within:border-primary transition-shadow">
                  <input
                    type="text"
                    placeholder="Ask anything about this video…"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={isChatSending}
                    className="flex-1 h-10 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendChat()}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSendChat}
                    disabled={isChatSending || !chatInput.trim()}
                    className="h-9 w-9 p-0 rounded-lg bg-primary hover:bg-primary/90 shrink-0"
                    aria-label="Send"
                  >
                    {isChatSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="px-5 py-3 border-t border-divider bg-card/50">
              <p className="text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1">
                Powered by{" "}
                <span className="inline-flex items-center gap-0.5 font-medium text-foreground/70">
                  <Sparkles className="h-3 w-3 text-primary" />
                  EduOnx AI
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default YoutubeSummarizer;
