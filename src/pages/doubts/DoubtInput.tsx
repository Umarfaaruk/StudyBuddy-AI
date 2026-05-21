import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Send, Sparkles, BookOpen, Calculator, Atom, History, Paperclip,
  Image, X, FileText, HelpCircle, Clock, MessageSquare, Copy, Loader2,
  Wrench, Lightbulb, Mic, Share2, Star, MoreVertical, Trash2,
  FolderOpen, ImageIcon, Upload
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, getDocs, limit } from "firebase/firestore";
import { toast } from "sonner";
import ConceptExplorerWorkspace from "../tools/ConceptExplorerWorkspace";
import YoutubeSummarizer from "../tools/YoutubeSummarizer";
import { aiComplete } from "@/lib/aiService";
import ReactMarkdown from "react-markdown";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, "application/pdf", "text/plain"];

const DoubtInput = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"chat" | "concept" | "youtube">("chat");
  const [question, setQuestion] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;

        recognitionRef.current.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setQuestion((prev) => prev ? `${prev} ${transcript}` : transcript);
          setIsListening(false);
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error("Speech recognition error:", event.error);
          setIsListening(false);
          if (event.error === "not-allowed") {
            toast.error("Microphone access denied. Please check your browser permissions.");
          } else {
            toast.error("Failed to recognize speech. Please try again.");
          }
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
        };
      }
    }
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
        toast.info("Listening...");
      } catch (err) {
        console.error("Failed to start listening:", err);
      }
    }
  };



  // Fetch recent doubts from Firestore
  const { data: history } = useQuery({
    queryKey: ["recent-doubts", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      try {
        const q = query(
          collection(db, "doubt_sessions"),
          where("user_id", "==", user.uid),
          orderBy("created_at", "desc"),
          limit(5)
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({
          id: d.id,
          ...d.data()
        } as {
          id: string;
          user_id: string;
          created_at: string;
          [key: string]: any;
        }));
      } catch (indexErr: any) {
        if (indexErr?.code === "failed-precondition" || indexErr?.message?.includes("index")) {
          console.warn("[DoubtInput] Composite index missing, falling back to client-side sort");
          try {
            const qFallback = query(
              collection(db, "doubt_sessions"),
              where("user_id", "==", user.uid)
            );
            const snapFallback = await getDocs(qFallback);
            return snapFallback.docs
              .map((d) => ({ id: d.id, ...d.data() } as { id: string; user_id: string; created_at: string; [key: string]: any }))
              .sort((a, b) => {
                const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return dateB - dateA;
              })
              .slice(0, 5);
          } catch {
            return [];
          }
        }
        console.error("[DoubtInput] Recent doubts fetch error:", indexErr);
        return [];
      }
    },
    enabled: !!user,
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast.error("Unsupported file type. Use images (JPEG, PNG, WebP) or PDF files.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error("File is too large. Maximum size is 10MB.");
      return;
    }

    setAttachedFile(file);

    // Generate preview for images
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
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = () => {
    if (!question.trim() && !attachedFile) return;

    // For image attachments, redirect to camera Q&A flow with the image
    if (attachedFile && ALLOWED_IMAGE_TYPES.includes(attachedFile.type) && filePreview) {
      navigate("/doubts/camera", {
        state: {
          preloadedImage: filePreview,
          preloadedQuestion: question.trim()
        }
      });
      return;
    }

    // For text questions (with or without PDF context), use the standard solution flow
    if (question.trim()) {
      let fullQuestion = question.trim();

      // If a PDF is attached, note it in the question context
      if (attachedFile && attachedFile.type === "application/pdf") {
        fullQuestion = `[Attached file: ${attachedFile.name}]\n\n${fullQuestion}`;
      }

      navigate("/doubts/solution", {
        state: {
          question: fullQuestion
        }
      });
    }
  };

  const handleClearChat = () => {
    setQuestion("");
    setAttachedFile(null);
    setFilePreview(null);
  };

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-24px)] bg-[#FAFAFA] rounded-3xl overflow-hidden shadow-sm border border-gray-200/50 font-sans">
      
      {/* ── Tabs Header ── */}
      <div className="flex items-center justify-center pt-8 pb-4 px-6 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
        <div className="flex bg-gray-100/80 p-1 rounded-xl gap-1">
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-5 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200 ${activeTab === "chat" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"}`}
          >
            Ask Doubt Chat
          </button>
          <button
            onClick={() => setActiveTab("concept")}
            className={`px-5 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200 ${activeTab === "concept" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"}`}
          >
            Concept Explorer
          </button>
          <button
            onClick={() => setActiveTab("youtube")}
            className={`px-5 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200 ${activeTab === "youtube" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"}`}
          >
            YouTube Summarizer
          </button>
        </div>
      </div>

      {activeTab === "chat" && (
        <>
          {/* ── Chat Header ── */}
          <div className="flex items-center justify-between px-8 pt-6 pb-2">
            <div className="flex-1" />
            <h1 className="text-[16px] font-bold text-gray-800 tracking-tight">New Conversation</h1>
            <div className="flex-1 flex justify-end">
              <button
                onClick={handleClearChat}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>
          </div>

      {/* ── Chat Messages Area ── */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 space-y-8 scrollbar-thin py-6">
        {/* AI Greeting */}
        <div className="flex items-start gap-4 max-w-2xl mx-auto w-full">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#F97316] to-[#EA580C] flex items-center justify-center flex-shrink-0 shadow-sm border border-orange-500/20">
            <span className="text-white text-lg drop-shadow-sm">🤖</span>
          </div>
          <div className="pt-0.5 space-y-1">
            <div className="text-[11px] font-bold text-orange-500 uppercase tracking-widest">AI Tutor</div>
            <div className="text-2xl font-bold text-gray-900 tracking-tight leading-tight">How can I help you today?</div>
          </div>
        </div>

        {/* Recent doubts as example messages */}
        {(history?.length ?? 0) > 0 && (
          <div className="space-y-6 max-w-2xl mx-auto w-full">
            {history?.slice(0, 2).map((d) => (
              <div key={d.id} className="w-full">
                {/* User message bubble - right aligned */}
                <div className="flex justify-end w-full">
                  <Link
                    to={`/doubts/session/${d.id}`}
                    className="bg-[#F3F4F6] rounded-2xl rounded-tr-sm px-5 py-3.5 max-w-[85%] sm:max-w-[75%] transition-all hover:bg-[#E5E7EB]"
                  >
                    <p className="text-[15px] text-gray-800 leading-relaxed">{d.question_preview}</p>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state for chat - Clean, no big buttons as requested */}
        {(!history || history.length === 0) && (
          <div className="flex-1"></div>
        )}
      </div>

      {/* ── File attachment preview ── */}
      {attachedFile && (
        <div className="px-4 md:px-8 pt-2 max-w-3xl mx-auto w-full">
          <div className="flex items-center gap-3 bg-white rounded-xl p-2.5 border border-gray-200/60 shadow-sm w-max pr-4">
            {filePreview ? (
              <img src={filePreview} alt="Preview" className="h-10 w-10 rounded-lg object-cover border border-gray-100" />
            ) : (
              <div className="h-10 w-10 rounded-lg bg-gray-50 flex items-center justify-center border border-gray-100">
                <FileText className="h-5 w-5 text-gray-400" />
              </div>
            )}
            <div className="flex-1 min-w-0 pr-2">
              <p className="text-xs font-semibold text-gray-700 truncate max-w-[200px]">{attachedFile.name}</p>
              <p className="text-[10px] text-gray-400 font-medium">{(attachedFile.size / 1024).toFixed(1)} KB</p>
            </div>
            <button onClick={clearAttachment} className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom Input Bar ── */}
      <div className="px-4 md:px-8 pb-6 pt-3 flex-shrink-0 w-full max-w-4xl mx-auto">
        <div className="flex items-center gap-2 bg-white rounded-full border border-gray-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] pl-5 pr-2 py-2 focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus-within:border-gray-300 transition-all duration-300">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain"
            className="hidden"
            onChange={handleFileSelect}
          />

          <input
            type="text"
            placeholder="Ask me anything..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && (question.trim() || attachedFile)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            className="flex-1 bg-transparent text-[15px] text-gray-800 placeholder:text-gray-400 outline-none py-1.5"
          />

          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleListening}
              className={`p-2 rounded-full transition-all duration-200 ${
                isListening 
                  ? "text-red-500 bg-red-50 animate-pulse" 
                  : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              }`}
              title="Voice input"
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all duration-200"
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              onClick={handleSubmit}
              disabled={!question.trim() && !attachedFile}
              className="h-9 w-9 ml-1 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-black disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              <Send className="h-3.5 w-3.5 -ml-0.5" />
            </button>
          </div>
        </div>
      </div>
      </>
      )}

      {activeTab === "concept" && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto">
          <ConceptExplorerWorkspace />
        </div>
      )}

      {activeTab === "youtube" && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto">
          <YoutubeSummarizer />
        </div>
      )}
    </div>
  );
};

export default DoubtInput;
