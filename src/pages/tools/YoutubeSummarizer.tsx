import { useState } from "react";
import { Youtube, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { aiComplete } from "@/lib/aiService";
import ReactMarkdown from "react-markdown";

export const YoutubeSummarizer = () => {
  const [url, setUrl] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const extractVideoId = (link: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = link.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  const handleSummarize = async () => {
    const id = extractVideoId(url);
    if (!id) {
      toast.error("Please enter a valid YouTube URL");
      return;
    }
    
    setVideoId(id);
    setIsGenerating(true);
    setSummary("");
    
    try {
      // In a real app, we would fetch the YouTube transcript here.
      // For now, we simulate summarization based on the video URL/Topic.
      const prompt = `You are an expert AI summarizer. The user has provided a YouTube video URL: ${url}. 
Please provide a highly structured, comprehensive summary of what this video likely covers. 
Include:
1. Main thesis or topic
2. Key takeaways (bullet points)
3. Target audience and value provided

Format your output in professional Markdown.`;

      const result = await aiComplete({
        messages: [
          { role: "system", content: "You are an expert educational summarizer." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      });
      setSummary(result);
      toast.success("Summary generated!");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate summary");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-sm font-sans h-full">
      <div className="flex items-center gap-2 pb-3 border-b border-border">
        <Youtube className="h-6 w-6 text-red-500 animate-pulse" />
        <h2 className="font-bold text-lg text-foreground">YouTube Video Summarizer</h2>
      </div>

      <div className="space-y-4">
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Paste YouTube Link here (e.g., https://youtube.com/watch?v=...)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 h-11 px-4 text-sm bg-muted/40 border border-border rounded-xl outline-none focus:border-red-500/40 focus:ring-2 focus:ring-red-500/10 text-foreground transition-all"
            onKeyDown={(e) => e.key === "Enter" && handleSummarize()}
          />
          <Button
            onClick={handleSummarize}
            disabled={isGenerating || !url.trim()}
            className="bg-red-500 text-white hover:bg-red-600 h-11 gap-2 font-semibold rounded-xl px-6"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Summarize
          </Button>
        </div>

        {videoId && (
          <div className="grid md:grid-cols-2 gap-6 mt-6">
            {/* Left: Video Player */}
            <div className="rounded-xl overflow-hidden border border-border bg-black aspect-video flex-shrink-0 shadow-sm">
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${videoId}`}
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              ></iframe>
            </div>

            {/* Right: AI Summary */}
            <div className="bg-muted/20 border border-border rounded-xl p-5 flex flex-col min-h-[300px]">
              {isGenerating ? (
                <div className="flex-1 flex items-center justify-center flex-col gap-3">
                  <Loader2 className="h-8 w-8 text-red-500 animate-spin" />
                  <p className="text-sm text-muted-foreground animate-pulse">Analyzing video content...</p>
                </div>
              ) : summary ? (
                <div className="flex-1 overflow-y-auto scrollbar-thin">
                  <h3 className="font-bold text-sm text-foreground mb-4 pb-2 border-b border-border/50">AI Summary</h3>
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground/90 leading-relaxed font-sans">
                    <ReactMarkdown>{summary}</ReactMarkdown>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                  The AI summary will appear here.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default YoutubeSummarizer;
