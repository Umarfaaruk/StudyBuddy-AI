import { useState, useRef, useEffect, useCallback } from "react";
import { Youtube, Loader2, Sparkles, Send, X, PlayCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { aiComplete, aiStream } from "@/lib/aiService";
import { extractYouTubeVideoId } from "@/lib/youtube";
import ReactMarkdown from "react-markdown";

type Segment = { start: number; text: string };

type VideoData = {
  id: string;
  title: string;
  channel: string;
  transcript: string;
  hasCaptions: boolean;
  segments: Segment[];
};

type ChatMessage = { role: "user" | "assistant"; content: string };

const QUICK_ACTIONS = [
  { id: "summarise", label: "Summarise the video" },
  { id: "takeaways", label: "Key takeaways" },
  { id: "simple", label: "Explain simply" },
] as const;

const SUMMARY_SYSTEM = `You are a precise video summarizer. Summarize ONLY from the transcript provided.

Rules:
- Use only facts from the transcript. Do not invent content.
- Bold important names, titles, and organizations with **markdown**.
- Include accurate timestamp ranges for each topic segment.

Output format (markdown, no extra headings before intro):

Write a 2-4 sentence overview paragraph first (bold key names/entities).

Then exactly this heading on its own line:
**Key Highlights and Topics:**

Then bullet points in this exact format:
- **Topic Title (M:SS - M:SS):** One or two sentences describing what is discussed in that segment.

Use 5-8 bullet points covering the full video chronologically. Timestamps must match the transcript timestamps.`;

const NO_CAPTIONS_SYSTEM = `This video has no captions. You only have title, channel, and description.
Be honest that you cannot summarize the full video. Give a brief metadata-only overview. Do not invent lecture content.`;

function extractVideoId(link: string): string | null {
  return extractYouTubeVideoId(link);
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseTimestampToSeconds(ts: string): number | null {
  const parts = ts.trim().split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

function formatTranscriptWithTimestamps(segments: Segment[], maxChars = 120000): string {
  const lines: string[] = [];
  let total = 0;
  for (const seg of segments) {
    const line = `[${formatTimestamp(seg.start)}] ${seg.text}`;
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

async function generateVideoSummary(
  title: string,
  segments: Segment[],
  transcript: string,
  hasCaptions: boolean
): Promise<string> {
  if (!hasCaptions) {
    const result = await aiComplete({
      messages: [
        { role: "system", content: NO_CAPTIONS_SYSTEM },
        { role: "user", content: `Video: "${title}"\n\nMetadata:\n${transcript}` },
      ],
      temperature: 0.2,
      maxTokens: 2048,
    });
    return result.trim() || "Could not generate a summary from available metadata.";
  }

  const timestamped =
    segments.length > 0 ? formatTranscriptWithTimestamps(segments) : transcript;

  if (!timestamped.trim()) {
    throw new Error("Transcript is empty. Try a different video with captions enabled.");
  }

  const chunks = splitIntoChunks(timestamped);

  let result: string;
  if (chunks.length === 1) {
    result = await aiComplete({
      messages: [
        { role: "system", content: SUMMARY_SYSTEM },
        { role: "user", content: `Video: "${title}"\n\nTranscript:\n${timestamped}` },
      ],
      temperature: 0.15,
      maxTokens: 8192,
    });
  } else {
    const parts: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const part = await aiComplete({
        messages: [
          {
            role: "system",
            content:
              "Extract factual bullet points with timestamps from this transcript segment. Format: - **Topic (M:SS - M:SS):** description",
          },
          { role: "user", content: `Segment ${i + 1}/${chunks.length} of "${title}":\n\n${chunks[i]}` },
        ],
        temperature: 0.15,
        maxTokens: 4096,
      });
      parts.push(part);
    }
    result = await aiComplete({
      messages: [
        { role: "system", content: SUMMARY_SYSTEM },
        {
          role: "user",
          content: `Merge into one summary for "${title}". Keep chronological order and all timestamps.\n\n${parts.join("\n\n")}`,
        },
      ],
      temperature: 0.15,
      maxTokens: 8192,
    });
  }

  const trimmed = result.trim();
  if (!trimmed) {
    throw new Error("AI returned an empty summary. Please try again.");
  }
  return trimmed;
}

/** Make timestamp ranges clickable — e.g. (4:10 - 15:55) */
function linkifyTimestamps(text: string): string {
  return text.replace(
    /(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)/g,
    "[$1 - $2](#t=$1)"
  );
}

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
            return <a href={href}>{children}</a>;
          },
          p: ({ children }) => (
            <p className="text-[15px] text-accent leading-relaxed mb-4 last:mb-0">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="space-y-3 mt-3 mb-0 pl-0 list-none">{children}</ul>
          ),
          li: ({ children }) => (
            <li className="text-[14px] text-accent leading-relaxed pl-4 border-l-2 border-primary/20">
              {children}
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}

export const YoutubeSummarizer = () => {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [playerStartSeconds, setPlayerStartSeconds] = useState<number | null>(null);
  const [summary, setSummary] = useState("");
  const [activeAction, setActiveAction] = useState<string>("summarise");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatSending, setIsChatSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleSeek = useCallback((seconds: number) => {
    setPlayerStartSeconds(Math.floor(seconds));
  }, []);

  const resetSession = () => {
    setSummary("");
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
    const id = extractVideoId(url);
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
        hasCaptions,
        segments: data.segments || [],
        transcript: hasCaptions
          ? data.transcript
          : `Title: ${data.title}\nChannel: ${data.channel}\nDescription: ${data.transcript || "N/A"}`,
      };

      setVideoData(video);
      setIsLoading(false);
      setIsGenerating(true);

      const result = await generateVideoSummary(
        video.title,
        video.segments,
        video.transcript,
        hasCaptions
      );
      setSummary(result);
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to summarize video");
      setVideoData(null);
    } finally {
      setIsLoading(false);
      setIsGenerating(false);
    }
  };

  const askQuestion = async (question: string, showInChat = true) => {
    if (!videoData || isChatSending) return;

    if (showInChat) {
      setChatMessages((prev) => [...prev, { role: "user", content: question }]);
    }
    setIsChatSending(true);

    try {
      const transcriptContext =
        videoData.segments.length > 0
          ? formatTranscriptWithTimestamps(videoData.segments, 18000)
          : videoData.transcript.substring(0, 18000);

      const systemPrompt = videoData.hasCaptions
        ? `Answer questions about this video using ONLY the transcript. If not in transcript, say so clearly.

Video: "${videoData.title}" by ${videoData.channel}
${summary ? `\nExisting summary:\n${summary}\n` : ""}
Transcript:
${transcriptContext}`
        : `This video has no captions. Answer about "${videoData.title}" using metadata only. Be honest about limitations.`;

      const history = chatMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

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
        () => {}
      );

      if (showInChat) {
        setChatMessages((prev) => [...prev, { role: "assistant", content: result }]);
      } else {
        setSummary(result);
      }
    } catch {
      toast.error("Failed to get a response");
    } finally {
      setIsChatSending(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  const handleQuickAction = async (actionId: string) => {
    if (!videoData) return;
    setActiveAction(actionId);

    if (actionId === "summarise") {
      if (summary) return;
      setIsGenerating(true);
      try {
        const result = await generateVideoSummary(
          videoData.title,
          videoData.segments,
          videoData.transcript,
          videoData.hasCaptions
        );
        setSummary(result);
      } catch {
        toast.error("Failed to generate summary");
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    const prompts: Record<string, string> = {
      takeaways: "What are the key takeaways from this video? List 4-6 concise bullet points based only on the transcript.",
      simple: "Explain the main ideas from this video in simple, easy-to-understand language for a beginner.",
    };

    await askQuestion(prompts[actionId] || prompts.takeaways, actionId !== "summarise");
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput("");
    askQuestion(msg, true);
  };

  useEffect(() => {
    if (summary || chatMessages.length) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [summary, chatMessages, isChatSending]);

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
                  Paste any lecture or tutorial link. Get a timestamped summary and ask follow-up questions grounded in the video transcript.
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

            <p className="text-xs text-muted-foreground text-center">
              Works best when the video has captions enabled
            </p>
          </div>
        </div>
      </div>
    );
  }

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

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
            <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
              {videoData.title}
            </h3>
            <p className="text-xs text-muted-foreground font-medium">{videoData.channel}</p>
            <div className="flex flex-wrap gap-2 pt-1">
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
        </div>

        {/* AI panel */}
        <div className="lg:col-span-3 flex flex-col min-h-[520px] lg:min-h-[640px]">
          <div className="flex flex-col flex-1 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-divider bg-gradient-to-r from-primary/5 to-transparent">
              <div>
                <h3 className="text-base font-semibold text-foreground">Ask about this video</h3>
                <p className="text-xs text-muted-foreground mt-0.5">AI answers from the transcript</p>
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-4 border-b border-divider bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Quick actions
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => handleQuickAction(action.id)}
                    disabled={isGenerating || isChatSending}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50 ${
                      activeAction === action.id
                        ? "bg-foreground text-background shadow-sm"
                        : "bg-card text-accent border border-border hover:border-primary/30 hover:bg-primary-light/30"
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-6 py-5 space-y-5 scrollbar-thin min-h-[280px]"
            >
              {isGenerating && (
                <div className="rounded-xl border border-border bg-muted/40 p-6 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Analysing transcript…
                  </div>
                  <div className="space-y-2">
                    <div className="h-2.5 bg-border rounded-full w-full animate-pulse" />
                    <div className="h-2.5 bg-border rounded-full w-4/5 animate-pulse" />
                    <div className="h-2.5 bg-border rounded-full w-3/5 animate-pulse" />
                  </div>
                </div>
              )}

              {!isGenerating && summary && (
                <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-divider">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Video summary
                    </span>
                  </div>
                  <TimestampMarkdown content={summary} onSeek={handleSeek} />
                </div>
              )}

              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="h-4 w-4 text-primary" />
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

              {isChatSending && (
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  </div>
                  <div className="rounded-xl border border-border bg-muted/50 px-4 py-3">
                    <span className="text-sm text-muted-foreground">Thinking…</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="px-6 py-4 border-t border-divider bg-card">
              <div className="flex items-center gap-2 rounded-xl border border-input bg-background pl-4 pr-1.5 py-1.5 focus-within:ring-2 focus-within:ring-ring/25 focus-within:border-primary transition-shadow">
                <input
                  type="text"
                  placeholder="Ask a question about this video…"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={isChatSending}
                  className="flex-1 h-10 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
                  onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSendChat}
                  disabled={isChatSending || !chatInput.trim()}
                  className="h-9 w-9 p-0 rounded-lg bg-primary hover:bg-primary/90 shrink-0"
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-center text-[11px] text-muted-foreground mt-3 flex items-center justify-center gap-1">
                Powered by
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
