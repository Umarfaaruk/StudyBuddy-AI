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
import { aiComplete } from "@/lib/aiService";
import ReactMarkdown from "react-markdown";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, "application/pdf", "text/plain"];

const DoubtInput = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [question, setQuestion] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);



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

    setQuestion("");
    setAttachedFile(null);
    setFilePreview(null);

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-24px)]">
      {/* ── Chat Header ── */}
      <div className="flex items-center justify-between px-6 md:px-8 pt-6 pb-4">
        <div className="flex-1" />
        <h1 className="text-xl font-bold text-[#0F172A]">New Chat</h1>
        <div className="flex-1 flex justify-end">
          <button
            onClick={handleClearChat}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-white hover:shadow-sm transition-all"
          >
            <Trash2 className="h-4 w-4" />
            Clear chat
          </button>
        </div>
      </div>

      {/* ── Chat Messages Area ── */}
      <div className="flex-1 overflow-y-auto px-6 md:px-8 space-y-6 scrollbar-thin">
        {/* AI Greeting */}
        <div className="flex items-start gap-4">
          <div className="h-11 w-11 rounded-full bg-[#f4a261] flex items-center justify-center flex-shrink-0 shadow-md">
            <span className="text-white text-lg">🤖</span>
          </div>
          <div className="pt-1">
            <div className="text-sm text-gray-400 font-medium">Hi!</div>
            <div className="text-xl font-bold text-[#0F172A]">how can I help?</div>
          </div>
        </div>

        {/* Recent doubts as example messages */}
        {(history?.length ?? 0) > 0 && (
          <div className="space-y-4">
            {history?.slice(0, 2).map((d) => (
              <div key={d.id} className="space-y-4">
                {/* User message bubble - right aligned */}
                <div className="flex justify-end">
                  <Link
                    to={`/doubts/session/${d.id}`}
                    className="bg-white rounded-2xl px-5 py-3 max-w-[70%] shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                  >
                    <p className="text-sm text-[#0F172A]">{d.question_preview}</p>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state for chat */}
        {(!history || history.length === 0) && (
          <div className="mt-8 flex flex-col items-center justify-center space-y-6 text-center">
            <div className="bg-blue-50 p-6 rounded-full">
              <MessageSquare className="h-12 w-12 text-[#1D4ED8]" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-[#0F172A]">Start a new conversation</h2>
              <p className="text-sm text-gray-500 max-w-sm mx-auto">
                Ask me anything about your studies, upload documents or images, and get instant help from your AI Tutor.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mt-8">
              <button onClick={() => setQuestion("Can you explain quantum computing simply?")} className="p-4 bg-white border border-gray-200 rounded-xl text-left hover:shadow-md transition-shadow hover:border-[#1D4ED8]/30">
                <span className="text-lg mb-2 block">⚛️</span>
                <p className="text-sm font-medium text-[#0F172A]">Explain quantum computing</p>
                <p className="text-xs text-gray-400 mt-1">in simple terms</p>
              </button>
              <button onClick={() => setQuestion("How do I structure a persuasive essay?")} className="p-4 bg-white border border-gray-200 rounded-xl text-left hover:shadow-md transition-shadow hover:border-[#1D4ED8]/30">
                <span className="text-lg mb-2 block">📝</span>
                <p className="text-sm font-medium text-[#0F172A]">Essay structure</p>
                <p className="text-xs text-gray-400 mt-1">help me organize my thoughts</p>
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="p-4 bg-white border border-gray-200 rounded-xl text-left hover:shadow-md transition-shadow hover:border-[#1D4ED8]/30">
                <span className="text-lg mb-2 block">📸</span>
                <p className="text-sm font-medium text-[#0F172A]">Upload a math problem</p>
                <p className="text-xs text-gray-400 mt-1">take a picture to solve</p>
              </button>
              <button onClick={() => setQuestion("Help me create a study schedule for finals.")} className="p-4 bg-white border border-gray-200 rounded-xl text-left hover:shadow-md transition-shadow hover:border-[#1D4ED8]/30">
                <span className="text-lg mb-2 block">📅</span>
                <p className="text-sm font-medium text-[#0F172A]">Study schedule</p>
                <p className="text-xs text-gray-400 mt-1">plan my week</p>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── File attachment preview ── */}
      {attachedFile && (
        <div className="px-6 md:px-8 pt-3">
          <div className="flex items-center gap-3 bg-white rounded-xl p-3 border border-gray-200 shadow-sm max-w-md">
            {filePreview ? (
              <img src={filePreview} alt="Preview" className="h-14 w-14 rounded-lg object-cover border border-gray-200" />
            ) : (
              <div className="h-14 w-14 rounded-lg bg-red-50 flex items-center justify-center">
                <FileText className="h-6 w-6 text-red-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#0F172A] truncate">{attachedFile.name}</p>
              <p className="text-xs text-gray-400">{(attachedFile.size / 1024).toFixed(1)} KB · {attachedFile.type.split("/")[1]?.toUpperCase()}</p>
            </div>
            <button onClick={clearAttachment} className="p-1.5 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom Input Bar ── */}
      <div className="px-6 md:px-8 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-2">
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
            className="flex-1 bg-transparent text-sm text-[#0F172A] placeholder:text-gray-400 outline-none py-2"
          />

          <div className="flex items-center gap-1">
            <button
              className="p-2 rounded-xl text-gray-400 hover:text-[#1D4ED8] hover:bg-[#1D4ED8]/5 transition-all"
              title="Voice input"
            >
              <Mic className="h-5 w-5" />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-xl text-gray-400 hover:text-[#1D4ED8] hover:bg-[#1D4ED8]/5 transition-all"
              title="Attach file"
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <button
              onClick={handleSubmit}
              disabled={!question.trim() && !attachedFile}
              className="h-10 w-10 rounded-xl bg-[#1D4ED8] text-white flex items-center justify-center hover:bg-[#2563EB] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoubtInput;
