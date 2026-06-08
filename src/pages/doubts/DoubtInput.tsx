import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Send, Paperclip, X, FileText, Mic, Trash2, Sparkles, Loader2, Copy, Check, Square, Bot,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { aiStream } from "@/lib/aiService";
import ReactMarkdown from "react-markdown";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, "application/pdf", "text/plain"];

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are an expert, patient tutor helping students solve doubts and understand concepts.

When answering:
1. Provide a clear, step-by-step explanation
2. Use analogies and real-world examples
3. Break down complex topics into simpler parts
4. Highlight common mistakes students make
5. Format with markdown: use headers (##), bullet points, numbered lists, and **bold** for emphasis
6. If math is involved, show each step clearly
7. End with a brief summary and suggest related topics to explore
8. Keep responses focused and educational`;

const DoubtInput = () => {
  const { user } = useAuth();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;

    recognitionRef.current.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuestion((prev) => (prev ? `${prev} ${transcript}` : transcript));
      setIsListening(false);
    };

    recognitionRef.current.onerror = (event: any) => {
      setIsListening(false);
      if (event.error === "not-allowed") {
        toast.error("Microphone access denied.");
      } else {
        toast.error("Speech recognition failed. Try again.");
      }
    };

    recognitionRef.current.onend = () => setIsListening(false);
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      toast.error("Voice input is not supported in your browser.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        toast.info("Listening…");
      } catch {
        toast.error("Could not start microphone.");
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast.error("Use images (JPEG, PNG, WebP) or PDF files.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File is too large. Maximum size is 10MB.");
      return;
    }
    setAttachedFile(file);
    if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
      const reader = new FileReader();
      reader.onloadend = () => setFilePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const clearAttachment = () => {
    setAttachedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
    toast.success("Copied to clipboard");
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setStreaming(false);
  };

  const handleSend = async () => {
    if ((!question.trim() && !attachedFile) || streaming) return;

    let userContent = question.trim();
    if (attachedFile) {
      userContent = `[Attached: ${attachedFile.name}]\n\n${userContent}`;
    }

    if (!userContent) return;

    const userMsg: Message = { role: "user", content: userContent };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setQuestion("");
    clearAttachment();

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setStreaming(true);

    // Add empty assistant message for streaming
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const apiMessages = [
        { role: "system" as const, content: SYSTEM_PROMPT },
        ...newHistory.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ];

      let full = "";
      await aiStream(
        {
          messages: apiMessages,
          temperature: 0.7,
          maxTokens: 4096,
          signal: controller.signal,
        },
        (token) => {
          if (token.includes("⏳") && token.includes("retrying")) {
            full = "";
          }
          full += token;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: full };
            return updated;
          });
        }
      );

      // Clean up rate limit messages
      const cleanResponse = full.replace(/\n*⏳\s*\*Rate limited[^*]*\*\n*/g, "").trim();
      if (cleanResponse !== full) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: cleanResponse };
          return updated;
        });
      }

      if (!full.trim()) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "I couldn't generate a response. Please try rephrasing your question.",
          };
          return updated;
        });
      }

      // Save to Firestore for history
      if (user && full.trim()) {
        try {
          if (!sessionIdRef.current) {
            const sessionRef = await addDoc(collection(db, "doubt_sessions"), {
              user_id: user.uid,
              question_preview: userContent.substring(0, 200),
              created_at: new Date().toISOString(),
            });
            sessionIdRef.current = sessionRef.id;
          }
          await addDoc(collection(db, "doubt_messages"), {
            doubt_session_id: sessionIdRef.current,
            role: "user",
            message_text: userContent,
            created_at: new Date().toISOString(),
          });
          await addDoc(collection(db, "doubt_messages"), {
            doubt_session_id: sessionIdRef.current,
            role: "assistant",
            message_text: full,
            created_at: new Date().toISOString(),
          });
        } catch (saveErr) {
          console.error("[DoubtInput] Save error:", saveErr);
        }
      }
    } catch (e: any) {
      if (e.name === "AbortError") return;
      console.error("[DoubtInput] Stream error:", e);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `⚠️ Error: ${e.message}. Please try again.`,
        };
        return updated;
      });
    } finally {
      setStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleClearChat = () => {
    if (streaming) abortControllerRef.current?.abort();
    setMessages([]);
    setQuestion("");
    setStreaming(false);
    sessionIdRef.current = null;
    clearAttachment();
    inputRef.current?.focus();
  };

  const suggestedQuestions = [
    "Explain photosynthesis step by step",
    "How do I solve quadratic equations?",
    "What is Newton's second law?",
    "Explain the water cycle",
  ];

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-24px)] bg-background rounded-3xl overflow-hidden shadow-sm border border-border font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-6 md:px-8 pt-5 pb-3 border-b border-divider bg-card/80">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-cta to-cta/80 flex items-center justify-center shadow-sm">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground tracking-tight">Ask Doubt</h1>
            <p className="text-xs text-muted-foreground">Get step-by-step help from EduOnx AI</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/tools"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/5 transition-colors"
          >
            <Bot className="h-3.5 w-3.5" />
            AI Tutor
          </Link>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 space-y-4 scrollbar-thin py-6">
        {messages.length === 0 ? (
          /* Empty state with suggestions */
          <div className="flex flex-col items-center justify-center h-full space-y-6 py-12 max-w-2xl mx-auto">
            <div className="text-center space-y-3">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-cta to-cta/80 flex items-center justify-center mx-auto shadow-lg shadow-cta/20">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-foreground tracking-tight">
                How can I help you today?
              </h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Type your question below, attach an image or PDF, or try one of these suggestions:
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {suggestedQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setQuestion(q);
                    setTimeout(() => inputRef.current?.focus(), 50);
                  }}
                  className="text-left px-4 py-3 rounded-xl bg-card border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-sm text-muted-foreground hover:text-foreground"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages */
          messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""} max-w-3xl mx-auto w-full`}>
              {msg.role === "assistant" && (
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cta to-cta/80 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-foreground text-background"
                    : "bg-card border border-border shadow-sm"
                }`}
              >
                {msg.role === "user" ? (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                ) : msg.content ? (
                  <div className="relative group">
                    <div className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                    <button
                      onClick={() => handleCopy(msg.content, idx)}
                      className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-muted hover:bg-muted/80"
                      title="Copy response"
                    >
                      {copiedIdx === idx ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                ) : streaming && idx === messages.length - 1 ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Thinking...
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      {/* File preview */}
      {attachedFile && (
        <div className="px-4 md:px-8 pt-2 max-w-3xl mx-auto w-full">
          <div className="flex items-center gap-3 glass-card rounded-xl p-2.5 w-max pr-4">
            {filePreview ? (
              <img src={filePreview} alt="Preview" className="h-10 w-10 rounded-lg object-cover border border-border" />
            ) : (
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center border border-border">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0 pr-2">
              <p className="text-xs font-semibold text-foreground truncate max-w-[200px]">{attachedFile.name}</p>
              <p className="text-[10px] text-muted-foreground">{(attachedFile.size / 1024).toFixed(1)} KB</p>
            </div>
            <button type="button" onClick={clearAttachment} className="p-1 rounded-full hover:bg-muted text-muted-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Input Bar */}
      <div className="px-4 md:px-8 pb-6 pt-3 flex-shrink-0 w-full max-w-4xl mx-auto">
        <div className="flex items-center gap-2 glass-card rounded-full pl-5 pr-2 py-2 focus-within:ring-2 focus-within:ring-ring/25 transition-all">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain"
            className="hidden"
            onChange={handleFileSelect}
          />
          <input
            ref={inputRef}
            type="text"
            placeholder={streaming ? "AI is responding..." : "Ask me anything…"}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && (question.trim() || attachedFile)) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={streaming}
            className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground outline-none py-1.5 disabled:opacity-50"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleListening}
              className={`p-2 rounded-full transition-all ${
                isListening ? "text-destructive bg-destructive/10 animate-pulse" : "text-muted-foreground hover:bg-muted"
              }`}
              title="Voice input"
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-full text-muted-foreground hover:bg-muted transition-all"
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            {streaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="h-9 w-9 ml-1 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90 transition-all shadow-sm"
                title="Stop generating"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!question.trim() && !attachedFile}
                className="h-9 w-9 ml-1 rounded-full bg-foreground text-background flex items-center justify-center hover:bg-foreground/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <Send className="h-3.5 w-3.5 -ml-0.5" />
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          Powered by Llama 3 via Groq · Ask follow-up questions for deeper understanding
        </p>
      </div>
    </div>
  );
};

export default DoubtInput;
