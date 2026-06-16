import { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Loader2, Sparkles, MessageSquare, GripVertical } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { aiComplete } from "@/lib/aiService";
import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router-dom";
import { addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are EduOnx AI — the intelligent assistant for the EduOnx learning platform.

Your capabilities:
1. **Platform Navigation** — Guide users to features: AI Tutor (/materials/tutor), Practice Arena (/quiz), Lessons (/lessons), Study Timer (/timer), Dashboard (/progress), Leaderboard (/leaderboard), Resources (/materials), Profile (/profile), Settings (/settings), Feedback (/feedback).
2. **General Questions** — Answer any general knowledge, study tips, or educational questions.
3. **Feedback Collection** — If the user wants to give feedback, collect it conversationally and confirm you've recorded it.
4. **Platform Help** — Explain how features work (uploading materials, taking quizzes, study streaks, XP system, badges, etc.)

Guidelines:
- Be concise, friendly, and helpful
- When suggesting a page, format it as: "You can find that at **[Page Name](/route)**"
- If the user asks about uploading files, direct them to AI Tutor or Materials
- Keep responses short (2-4 sentences) unless the user asks for detail
- Use emoji sparingly for warmth 😊
- If the user seems confused, offer quick action suggestions`;

/**
 * EduOnx AI — Floating side chatbot widget
 * 
 * Fixed to the right side of the screen, expands into a chat panel.
 * Handles: general conversation, platform navigation, Q&A, feedback.
 */
const EduOnxAIChat = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Draggable position (like the GlobalTimer) ──────────────────────
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

  // Restore the saved panel position on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("eduonx_chat_pos");
      if (saved) {
        const p = JSON.parse(saved);
        if (typeof p.x === "number" && typeof p.y === "number") {
          // Clamp into the current viewport so the panel is never restored
          // off-screen (e.g. saved on desktop, reopened on a phone).
          setPosition({
            x: Math.max(8, Math.min(window.innerWidth - 80, p.x)),
            y: Math.max(8, Math.min(window.innerHeight - 80, p.y)),
          });
        }
      }
    } catch {}
  }, []);

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragStartRef.current = { x: clientX, y: clientY, posX: rect.left, posY: rect.top };
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!dragStartRef.current) return;
      if ("touches" in e) e.preventDefault(); // stop page scroll while dragging
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      const w = panelRef.current?.offsetWidth ?? 360;
      const newX = Math.max(8, Math.min(window.innerWidth - w - 8, dragStartRef.current.posX + (clientX - dragStartRef.current.x)));
      const newY = Math.max(8, Math.min(window.innerHeight - 80, dragStartRef.current.posY + (clientY - dragStartRef.current.y)));
      setPosition({ x: newX, y: newY });
    };
    const handleEnd = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleEnd);
    document.addEventListener("touchmove", handleMove, { passive: false });
    document.addEventListener("touchend", handleEnd);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchmove", handleMove);
      document.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging]);

  // Persist the panel position whenever it settles (after a drag ends).
  useEffect(() => {
    if (position && !isDragging) {
      try { localStorage.setItem("eduonx_chat_pos", JSON.stringify(position)); } catch {}
    }
  }, [position, isDragging]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);

    try {
      // Check if this is feedback
      const isFeedback = /feedback|suggestion|improve|bug|issue|problem|complaint/i.test(userMsg);

      const apiMessages = [
        { role: "system" as const, content: SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: userMsg },
      ];

      const response = await aiComplete({
        messages: apiMessages,
        temperature: 0.7,
        maxTokens: 512,
      });

      setMessages((prev) => [...prev, { role: "assistant", content: response }]);

      // Auto-save feedback to Firestore if detected
      if (isFeedback && user) {
        try {
          await addDoc(collection(db, "feedback"), {
            userId: user.uid,
            rating: 0,
            comment: `[EduOnx AI Chat] ${userMsg}`,
            name: user.displayName || "User",
            email: user.email || "",
            createdAt: new Date(),
            platform: "web",
            version: "2.0",
            source: "ai_chat",
          });
        } catch {
          // Silently fail — feedback is best-effort
        }
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I'm having trouble right now. Please try again in a moment. 🙏" },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickActions = [
    { label: "📖 Study tips", prompt: "Give me some effective study tips" },
    { label: "🧭 Navigate", prompt: "How do I use the AI Tutor?" },
    { label: "💬 Feedback", prompt: "I want to give feedback about the platform" },
    { label: "❓ Help", prompt: "What features does EduOnx have?" },
  ];

  return (
    <>
      {/* ── Floating FAB Button ───────────────────────────── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-[#29ABE2] to-[#1E96CC] text-white shadow-xl shadow-blue-300/40 flex items-center justify-center hover:scale-110 hover:shadow-2xl hover:shadow-blue-400/50 transition-all duration-300 group md:bottom-8 md:right-8"
          aria-label="Open EduOnx AI chat"
        >
          <Bot className="h-6 w-6 group-hover:rotate-12 transition-transform duration-300" />
          {/* Pulse ring */}
          <span className="absolute inset-0 rounded-full bg-[#29ABE2]/30 animate-ping opacity-30" />
        </button>
      )}

      {/* ── Chat Panel ────────────────────────────────────── */}
      {isOpen && (
        <div
          ref={panelRef}
          className={`fixed z-50 w-[360px] max-w-[calc(100vw-32px)] bg-white rounded-2xl shadow-2xl shadow-gray-300/50 border border-gray-100 flex flex-col overflow-hidden ${
            position ? "" : "bottom-6 right-6 md:bottom-8 md:right-8 animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-300"
          }`}
          style={
            position
              ? { left: position.x, top: position.y, maxHeight: "min(580px, calc(100vh - 100px))", userSelect: isDragging ? "none" : undefined }
              : { maxHeight: "min(580px, calc(100vh - 100px))" }
          }
        >
          {/* Header — doubles as the drag handle (move it anywhere, like the timer) */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#29ABE2] to-[#1E96CC] text-white flex-shrink-0">
            <div
              className="flex items-center gap-2 min-w-0 flex-1 cursor-grab active:cursor-grabbing select-none"
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
              title="Drag to move"
            >
              <GripVertical className="h-4 w-4 text-white/50 -ml-1 shrink-0" />
              <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold leading-tight">EduOnx AI</h3>
                <p className="text-[10px] text-white/70 truncate">Drag to move • Ask anything</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0 ml-2"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin min-h-0">
            {messages.length === 0 ? (
              <div className="space-y-4 py-4">
                <div className="text-center">
                  <div className="h-12 w-12 rounded-2xl bg-[#29ABE2]/10 flex items-center justify-center mx-auto mb-3">
                    <Sparkles className="h-6 w-6 text-[#29ABE2]" />
                  </div>
                  <p className="text-sm font-semibold text-gray-900">Hi! How can I help you? 👋</p>
                  <p className="text-xs text-gray-400 mt-1">Ask questions, navigate the platform, or share feedback</p>
                </div>
                {/* Quick actions */}
                <div className="grid grid-cols-2 gap-2">
                  {quickActions.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => {
                        setInput(action.prompt);
                        setTimeout(() => {
                          setInput(action.prompt);
                          handleSendWithPrompt(action.prompt);
                        }, 50);
                      }}
                      className="text-left px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-[#29ABE2]/5 border border-gray-100 hover:border-[#29ABE2]/20 transition-all text-xs font-medium text-gray-600 hover:text-[#29ABE2]"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "gap-2"}`}>
                  {msg.role === "assistant" && (
                    <div className="h-6 w-6 rounded-md bg-[#29ABE2]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="h-3 w-3 text-[#29ABE2]" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#29ABE2] text-white"
                        : "bg-gray-50 text-gray-700 border border-gray-100"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-xs max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-[#29ABE2] [&_a]:underline">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex gap-2">
                <div className="h-6 w-6 rounded-md bg-[#29ABE2]/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-3 w-3 text-[#29ABE2]" />
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-2 border border-gray-100 flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin text-[#29ABE2]" />
                  <span className="text-[10px] text-gray-400">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-2.5 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                placeholder="Ask EduOnx AI..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={isLoading}
                className="flex-1 h-9 px-3 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:border-[#29ABE2]/40 focus:ring-2 focus:ring-[#29ABE2]/10 text-gray-900 transition-all"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="h-9 w-9 rounded-lg bg-[#29ABE2] text-white flex items-center justify-center hover:bg-[#1E96CC] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // Helper to send a prompt directly (for quick actions)
  function handleSendWithPrompt(prompt: string) {
    if (isLoading) return;
    setMessages((prev) => [...prev, { role: "user", content: prompt }]);
    setInput("");
    setIsLoading(true);

    aiComplete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      maxTokens: 512,
    })
      .then((response) => {
        setMessages((prev) => [...prev, { role: "assistant", content: response }]);
      })
      .catch(() => {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Sorry, something went wrong. Please try again. 🙏" },
        ]);
      })
      .finally(() => setIsLoading(false));
  }
};

export default EduOnxAIChat;
