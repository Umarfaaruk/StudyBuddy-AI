import { useEffect, useState, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, Gamepad2, Loader2, Square } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import ReactMarkdown from "react-markdown";
import { aiStream } from "@/lib/aiService";
import { getAuthHeaders } from "@/lib/authHeaders";
import { getDoubtSystemPrompt } from "@/lib/prompts";
import { useStudentExamContext } from "@/lib/examTracks";
import { retrieveExamContext, citationLabels } from "@/lib/examRetrieval";
import GroundingCitations from "@/components/GroundingCitations";
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
 * - Supabase persistence for doubt history
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

  // Ground the answer in the student's exam. `isLoading` gates the stream below
  // so the very first (and only) run already has the right system prompt —
  // starting generic and "fixing" it later would be too late, the answer is
  // already streaming.
  const { data: examCtx, isLoading: examLoading } = useStudentExamContext();

  // Sources the answer was grounded in (Phase 2.4). Shown beneath the answer so
  // the grounding is verifiable rather than merely claimed in the prompt.
  const [citations, setCitations] = useState<string[]>([]);

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
    // Wait for the exam context before the one-shot stream fires.
    if (examLoading) return;
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
                signal: controller.signal,
                headers: await getAuthHeaders(),
              });
              if (resp.ok) {
                const data = await resp.json();
                if (data.transcript && data.transcript.trim().length > 50) {
                  // Cap transcript at 8 000 chars (was 15 000) — saves ~350 tokens per call
                  const transcript = data.transcript.substring(0, 8000);
                  youtubeContext = `\n\nYouTube Video Context:\nTitle: "${data.title || 'Video'}"\nChannel: "${data.channel || 'Unknown'}"\nTranscript:\n${transcript}`;
                } else {
                  youtubeContext = `\n\nYouTube Video Context (transcript unavailable — answer based on title and channel):\nTitle: "${data.title || 'Video'}"\nChannel: "${data.channel || 'Unknown'}"`;
                }
              }
            } catch (err) {
              console.error("[AISolution] Failed to fetch youtube transcript:", err);
            }
          }
        }

        // Retrieve syllabus text and past questions BEFORE streaming: the
        // grounding has to be in the system prompt from the first token, since
        // an answer cannot be re-grounded once it has started.
        //
        // A YouTube-derived question is left ungrounded — the transcript is
        // already the authoritative source the student chose, and injecting
        // syllabus text alongside it would put two sources in tension.
        const retrieved = youtubeContext
          ? null
          : await retrieveExamContext(examCtx?.examTrackId, question || "");

        if (retrieved?.grounded && componentMountedRef.current) {
          setCitations(citationLabels(retrieved));
        }

        const systemPrompt = examCtx?.track
          ? getDoubtSystemPrompt({
              examName: examCtx.track.name,
              daysRemaining: examCtx.daysRemaining,
              examContext: retrieved?.contextText || undefined,
            })
          : getDoubtSystemPrompt(null);

        let full = "";
        await aiStream(
          {
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: (question || "") + youtubeContext },
            ],
            temperature: 0.6,
            maxTokens: 2000,
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

        // Save doubt session + messages for history
        if (user && full.trim()) {
          try {
            const { data: session } = await supabase
              .from("doubt_sessions")
              .insert({ user_id: user.uid, question_preview: question!.substring(0, 200) })
              .select("id")
              .single();
            if (session?.id) {
              await supabase.from("doubt_messages").insert([
                {
                  doubt_session_id: session.id,
                  user_id: user.uid,
                  role: "user",
                  message_text: question + (youtubeUrl ? `\n\nYouTube URL: ${youtubeUrl}` : ""),
                },
                { doubt_session_id: session.id, user_id: user.uid, role: "assistant", message_text: full },
              ]);
            }
          } catch (saveErr) {
            console.error("[AISolution] Save error:", saveErr);
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
    // `systemPrompt` is intentionally omitted: the `streamed` ref makes this a
    // one-shot effect, and re-running it on a prompt change would restart an
    // in-flight answer. `examLoading` is what gates the single run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, youtubeUrl, navigate, user, examLoading]);

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
          <>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{answer}</ReactMarkdown>
            </div>
            <GroundingCitations labels={citations} />
          </>
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
