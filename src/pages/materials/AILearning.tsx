import { useState, useRef, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, FileText, Send, Sparkles, Loader2, AlertTriangle, Copy, Check, Square } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/lib/supabase";
import { aiStream } from "@/lib/aiService";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
}

/**
 * STUDYBUDDY AI AI LEARNING SYSTEM
 * =========================
 * Streaming Q&A with context-aware responses using OpenRouter (Gemma 3 27B)
 *
 * Features:
 * - Real-time streaming responses
 * - Material-aware context injection
 * - Conversation history for continuity
 * - Abort controller for cancel
 * - Comprehensive PDF content analysis
 */

const AILearning = () => {
  const { id } = useParams();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const componentMountedRef = useRef(true);

  // Cleanup on unmount: abort any in-flight requests
  useEffect(() => {
    return () => {
      componentMountedRef.current = false;
      if (abortControllerRef.current) {
        if (import.meta.env.DEV) console.log("[AILearning] 🧹 Aborting in-flight requests on unmount");
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const { data: material, isLoading: materialLoading } = useQuery({
    queryKey: ["material", id],
    queryFn: async () => {
      if (!id) return null;
      try {
        const { data } = await supabase.from("materials").select("*").eq("id", id).maybeSingle();
        if (data) {
          return {
            id: data.id,
            file_name: data.file_name,
            summary: data.summary || "No summary available",
            key_topics: data.key_topics || [],
            concepts: data.concepts || [],
            content_length: data.content_length || 0,
            extracted_text: data.extracted_text || "",
          };
        }
        return null;
      } catch (error) {
        console.error("[AILearning] Material fetch error:", error);
        return null;
      }
    },
    enabled: !!id,
  });

  // Initialize welcome message
  useEffect(() => {
    if (material && messages.length === 0) {
      const welcomeMsg: Message = {
        role: "assistant",
        content: `# 👋 Welcome to AI Tutor

I've loaded **${material.file_name}**. I'm here to help you understand this material better!

## What I can help with:
- **Summarize**: Get concise overviews of topics
- **Explain**: Deep dives into complex concepts  
- **Answer**: Specific questions about content
- **Examples**: Real-world applications and analogies
- **Study**: Create study guides and key points

## Your material:
**Topics**: ${material.key_topics?.slice(0, 5).join(", ") || "Various"}
**Concepts**: ${material.concepts?.length || 0} key concepts
**Estimated read time**: ${Math.ceil((material.content_length || 5000) / 200)} minutes

Ask me anything about this document! 🚀`,
        timestamp: Date.now(),
      };
      setMessages([welcomeMsg]);
    }
  }, [material, messages.length]);

  // Auto-scroll to latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /**
   * Handle sending a question and streaming response
   */
  const handleSend = async () => {
    if (!question.trim() || streaming || !material) return;

    const userMsg: Message = {
      role: "user",
      content: question.trim(),
      timestamp: Date.now(),
    };
    
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setQuestion("");
    setStreaming(true);

    // Create new abort controller for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const assistantMessage: Message = {
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, assistantMessage]);

    // Build system instruction with material context
    const systemInstruction = `You are an expert AI tutor helping students learn from "${material.file_name}".

IMPORTANT INSTRUCTIONS:
1. Provide clear, beginner-friendly explanations
2. Break down complex topics into digestible parts
3. Use analogies and real-world examples
4. Be encouraging and supportive
5. Ask follow-up questions if something seems unclear
6. Format responses with markdown for better readability
7. Reference specific concepts from the material when relevant
8. When explaining topics, organize into: Summary → Key Concepts → Detailed Explanation → Examples
9. CRITICAL: ALWAYS provide dynamic YouTube reference suggestions. At the end of your explanation, append a "📺 Recommended Videos" section with 1-2 highly relevant YouTube search links based on the topic discussed. Use the markdown format: [Watch on YouTube: <Topic>](https://www.youtube.com/results?search_query=<URL_encoded_topic>)

MATERIAL CONTEXT:
- File: ${material.file_name}
- Key Topics: ${material.key_topics?.join(", ") || "Various topics"}
- Number of Concepts: ${material.concepts?.length || "Unknown"}
- Content Summary: ${material.summary}
${material.extracted_text ? `\n- Extracted Content (first 3000 chars): ${material.extracted_text.substring(0, 3000)}` : ""}

Always provide structured, comprehensive responses that help the student deeply understand each concept.`;

    // Build conversation history (last 6 messages)
    const conversationContext = newMessages
      .filter((m) => m.role !== undefined)
      .slice(-6)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const apiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemInstruction },
      ...conversationContext,
    ];

    try {
      if (import.meta.env.DEV) console.log("[AILearning] 📤 Sending question:", userMsg.content);

      let accumulated = "";

      await aiStream(
        {
          messages: apiMessages,
          temperature: 0.7,
          maxTokens: 4096,
          signal: controller.signal,
        },
        (token: string) => {
          if (componentMountedRef.current) {
            accumulated += token;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...assistantMessage,
                content: accumulated,
              };
              return updated;
            });
          }
        }
      );

      if (componentMountedRef.current) {
        if (import.meta.env.DEV) console.log("[AILearning] ✅ Response complete");
      }
    } catch (e: any) {
      if (!componentMountedRef.current) return;

      if (e.name === "AbortError") {
        if (import.meta.env.DEV) console.log("[AILearning] ⏹️ Response cancelled");
        toast.info("Response cancelled");
      } else {
        console.error("[AILearning] ❌ Error:", e);
        const errorMsg = e.message || "An unexpected error occurred";
        toast.error(errorMsg);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...assistantMessage,
            content: `❌ **Error**: ${errorMsg}\n\nPlease check your internet connection and try again in a moment.`,
          };
          return updated;
        });
      }
    } finally {
      if (componentMountedRef.current) {
        setStreaming(false);
        abortControllerRef.current = null;
      }
    }
  };

  /**
   * Copy message to clipboard
   */
  const copyToClipboard = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
      toast.success("Copied to clipboard!");
    } catch {
      toast.error("Failed to copy");
    }
  };

  /**
   * Cancel streaming response
   */
  const cancelStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setStreaming(false);
    }
  };

  if (materialLoading) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
        <div className="h-6 w-32 bg-muted rounded animate-pulse" />
        <div className="h-10 w-full bg-muted rounded animate-pulse" />
        <div className="h-96 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (!material) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto text-center py-20">
        <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
        <p className="text-muted-foreground text-sm">Material not found.</p>
        <Link
          to="/materials/tutor"
          className="text-accent hover:underline text-sm mt-2 inline-block"
        >
          ← Back to AI Tutor
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <Link
        to="/materials/tutor"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Materials
      </Link>

      <div className="flex items-center gap-3 bg-card border border-border rounded-xl p-4">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground">{material.file_name}</h1>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> AI Tutor powered by Llama 3 via Groq
          </p>
        </div>
      </div>

      {/* Chat Area */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4 min-h-[400px] max-h-[600px] overflow-y-auto">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm relative group ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-none"
                  : "bg-muted text-foreground rounded-bl-none"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm max-w-none dark:prose-invert [&_a]:text-accent [&_a]:underline [&_code]:bg-slate-700 [&_code]:px-2 [&_code]:py-1 [&_code]:rounded [&_pre]:bg-slate-900 [&_pre]:text-slate-100">
                  <ReactMarkdown
                    components={{
                      h1: ({ ...props }) => <h2 className="text-base font-bold mt-3 mb-2" {...props} />,
                      h2: ({ ...props }) => <h3 className="text-sm font-bold mt-2 mb-1" {...props} />,
                      h3: ({ ...props }) => <h4 className="text-xs font-bold mt-2 mb-1" {...props} />,
                      ul: ({ ...props }) => <ul className="list-disc list-inside ml-2" {...props} />,
                      ol: ({ ...props }) => <ol className="list-decimal list-inside ml-2" {...props} />,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
              {msg.role === "assistant" && msg.content && (
                <button
                  onClick={() => copyToClipboard(msg.content, i)}
                  className="absolute -right-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
                  title="Copy response"
                >
                  {copiedIdx === i ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              )}
            </div>
          </div>
        ))}

        {streaming && messages[messages.length - 1]?.content === "" && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-xl rounded-bl-none px-4 py-3 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">AI thinking...</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex gap-2 fixed bottom-6 left-6 right-6 md:left-8 md:right-8 max-w-[calc(100%-3rem)] md:max-w-[calc(1024px-4rem)] mx-auto bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3">
        <Input
          placeholder="Ask a question about this material..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={streaming}
          className="text-sm"
        />
        {streaming ? (
          <Button
            onClick={cancelStream}
            size="icon"
            variant="destructive"
            className="h-10 w-10"
            title="Cancel response"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSend}
            disabled={!question.trim() || streaming}
            size="icon"
            className="h-10 w-10"
            title="Send question"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default AILearning;
