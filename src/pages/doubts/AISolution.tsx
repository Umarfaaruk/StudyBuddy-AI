import { useEffect, useState, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, Gamepad2, Loader2, Square } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { addDoc, collection } from "firebase/firestore";
import ReactMarkdown from "react-markdown";
import { aiStream } from "@/lib/aiService";
import { extractYouTubeVideoId } from "@/lib/youtube";

/**
 * AISolution — Doubt Solver using OpenRouter (Gemma 3 27B)
 *
 * Previously used direct Gemini API calls.
 * Now uses centralized aiStream service via Groq.
 *
 * Includes:
 * - AbortController for cancelling streams on unmount
 * - Memory leak prevention
 * - Firestore persistence for doubt history
 */
const AISolution = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const question = (location.state as { question?: string })?.question as string | undefined;
  const youtubeUrlState = (location.state as { youtubeUrl?: string })?.youtubeUrl as string | undefined;

  // Extract YouTube URL from the question text if not explicitly passed
  let youtubeUrl = youtubeUrlState;
  if (!youtubeUrl && question) {
    const ytMatch = question.match(/(https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)[a-zA-Z0-9_-]{11})/i);
    if (ytMatch) {
      youtubeUrl = ytMatch[0];
    }
  }

  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const streamed = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const componentMountedRef = useRef(true);

  // Cleanup on unmount: abort any in-flight requests
  useEffect(() => {
    return () => {
      componentMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (!question) {
      navigate("/doubts", { replace: true });
      return;
    }
    if (streamed.current) return;
    streamed.current = true;

    const run = async () => {
      // Create abort controller for this request
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        let youtubeContext = "";
        if (youtubeUrl) {
          const videoId = extractYouTubeVideoId(youtubeUrl);
          if (videoId) {
            try {
              const resp = await fetch(`/api/youtube-transcript?v=${videoId}&t=${Date.now()}`, {
                signal: controller.signal
              });
              if (resp.ok) {
                const data = await resp.json();
                if (data.transcript && data.transcript.trim().length > 50) {
                  youtubeContext = `\n\nYouTube Video Context:\nTitle: "${data.title || 'Video'}"\nChannel: "${data.channel || 'Unknown'}"\nTranscript:\n${data.transcript.substring(0, 15000)}`;
                } else {
                  youtubeContext = `\n\nYouTube Video Context (Note: Full transcript not available, please explain the video's core topic based on its title and channel):\nTitle: "${data.title || 'Video'}"\nChannel: "${data.channel || 'Unknown'}"`;
                }
              }
            } catch (err) {
              console.error("[AISolution] Failed to fetch youtube transcript:", err);
            }
          }
        }

        const systemPrompt = `You are an expert, patient tutor helping students solve doubts and understand concepts.

When answering:
1. Provide a clear, step-by-step explanation
2. Use analogies and real-world examples
3. Break down complex topics into simpler parts
4. Highlight common mistakes students make
5. Format with markdown: use headers (##), bullet points, numbered lists, and **bold** for emphasis
6. If math is involved, show each step clearly
7. End with a brief summary and suggest related topics to explore
8. CRITICAL: If a YouTube Video Context/Transcript is provided, prioritize it as the primary source of truth. Your explanation and answers must be strictly factual and aligned with the information, details, and concepts presented in the video.
9. CRITICAL: If the user's prompt is a YouTube URL or requests a video summary, provide a highly accurate, structured summary including Main Thesis, Key Takeaways, Detailed Explanations, and Actionable Lessons. Never state that you don't have the context or that the summary is hypothetical, since the full transcript is provided to you.
10. CRITICAL: ALWAYS provide dynamic YouTube reference suggestions. At the end of your explanation, append a "📺 Recommended Videos" section with 1-2 highly relevant YouTube search links based on the topic discussed. Use the markdown format: [Watch on YouTube: <Topic>](https://www.youtube.com/results?search_query=<URL_encoded_topic>)`;

        let full = "";
        await aiStream(
          {
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: (question || "") + youtubeContext },
            ],
            temperature: 0.7,
            maxTokens: 4096,
            signal: controller.signal,
          },
          (token) => {
            if (componentMountedRef.current) {
              full += token;
              setAnswer(full);
            }
          }
        );

        if (!componentMountedRef.current) return;

        if (!full.trim()) {
          setAnswer("I couldn't generate a response. Please try rephrasing your question.");
        }

        // Save doubt session + messages to Firestore for history
        if (user && full.trim()) {
          try {
            const sessionRef = await addDoc(collection(db, "doubt_sessions"), {
              user_id: user.uid,
              question_preview: question!.substring(0, 200),
              created_at: new Date().toISOString(),
            });
            await addDoc(collection(db, "doubt_messages"), {
              doubt_session_id: sessionRef.id,
              role: "user",
              message_text: question + (youtubeUrl ? `\n\nYouTube URL: ${youtubeUrl}` : ""),
              created_at: new Date().toISOString(),
            });
            await addDoc(collection(db, "doubt_messages"), {
              doubt_session_id: sessionRef.id,
              role: "assistant",
              message_text: full,
              created_at: new Date().toISOString(),
            });
          } catch (saveErr) {
            console.error("[AISolution] Save to Firestore error:", saveErr);
          }
        }
      } catch (e: any) {
        if (!componentMountedRef.current) return;
        
        if (e.name === "AbortError") {
          console.log("[AISolution] 🛑 Response cancelled");
        } else {
          console.error("[AISolution] Error:", e);
          setError(e.message);
          toast.error(e.message);
        }
      } finally {
        if (componentMountedRef.current) {
          setLoading(false);
          abortControllerRef.current = null;
        }
      }
    };

    run();
  }, [question, youtubeUrl, navigate, user]);

  const cancelStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
      toast.info("Response cancelled");
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <Link to="/doubts" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Ask another doubt
      </Link>

      {question && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="text-xs text-muted-foreground mb-2">Your Question</div>
          <p className="text-sm text-foreground font-medium">{question}</p>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <Sparkles className="h-5 w-5 text-accent" />
          <span className="font-semibold text-sm text-foreground">Step-by-Step Solution</span>
          {loading && (
            <div className="ml-auto flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <button onClick={cancelStream} className="text-xs text-muted-foreground hover:text-foreground" title="Cancel response">
                <Square className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : answer ? (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{answer}</ReactMarkdown>
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" /> Thinking...
          </div>
        ) : null}
      </div>

      {!loading && !error && (
        <div className="flex gap-3">
          <Link to="/doubts" className="flex-1">
            <Button variant="outline" className="w-full">Ask Another Doubt</Button>
          </Link>
          <Link to="/quiz" className="flex-1">
            <Button className="w-full bg-navy text-highlight hover:bg-navy/90 gap-2">
              <Gamepad2 className="h-4 w-4" /> Practice This Topic
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
};

export default AISolution;
