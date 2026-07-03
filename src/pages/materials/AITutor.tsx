import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bot, Send, Sparkles, Loader2, Copy, Check, Square, Trash2, FileText, X, Upload, MessageCircleQuestion, Mic, Paperclip } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { aiStream, aiComplete } from "@/lib/aiService";
import { TUTOR_SYSTEM_PROMPT, getDocSystemPrompt, DOC_ANALYSIS_SYSTEM_PROMPT } from "@/lib/prompts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Material {
  id: string;
  file_name: string;
  summary: string;
  extracted_text: string;
  key_topics: string[];
}

// Max conversation history sent to AI — keeps token count low for long chats
const MAX_HISTORY_MESSAGES = 6;

/**
 * Generate simple key topics from extracted text
 */
function extractSimpleTopics(text: string, fileName: string): string[] {
  const topics: Set<string> = new Set();
  const nameBase = fileName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
  if (nameBase.length > 2) topics.add(nameBase);

  const sentences = text.split(/[.!?\n]+/).slice(0, 30);
  for (const s of sentences) {
    const matches = s.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g);
    if (matches) {
      for (const m of matches) {
        if (m.length > 3 && !["The", "This", "What", "When", "Where", "How", "Why"].includes(m)) {
          topics.add(m);
        }
      }
    }
  }
  return Array.from(topics).slice(0, 8);
}

/**
 * Generate a simple summary from text
 */
function generateSimpleSummary(text: string): string {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15);
  if (sentences.length === 0) return "Study material uploaded for AI-assisted learning.";

  const summary: string[] = [];
  if (sentences[0]) summary.push(sentences[0].trim());
  if (sentences.length > 2) summary.push(sentences[Math.floor(sentences.length / 2)].trim());
  if (sentences.length > 1) summary.push(sentences[sentences.length - 1].trim());

  return summary.map(s => s + ".").join(" ").substring(0, 500);
}

/**
 * AI-powered analysis
 */
async function analyzeWithAI(
  text: string,
  fileName: string
): Promise<{ summary: string; keyTopics: string[] }> {
  const fallback = {
    summary: generateSimpleSummary(text),
    keyTopics: extractSimpleTopics(text, fileName),
  };

  if (text.length < 50) return fallback;

  try {
    // Use first 8 000 chars for analysis — enough for a good summary
    const truncated = text.substring(0, 8000);
    const prompt = `Analyze this study material and return a JSON object with:
1. "summary": A 2-3 sentence summary
2. "keyTopics": An array of 5-8 key topics/concepts

Material (from file "${fileName}"):
"""
${truncated}
"""

Return ONLY valid JSON.`;

    const raw = await aiComplete({
      messages: [
        { role: "system", content: DOC_ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      maxTokens: 512,
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      summary: parsed.summary || fallback.summary,
      keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : fallback.keyTopics,
    };
  } catch (e) {
    console.warn("[AITutor] AI analysis fallback:", e);
    return fallback;
  }
}

/**
 * Extract text from uploaded PDF using pdfjs-dist
 */
async function extractTextFromPDF(file: File): Promise<string> {
  let blobUrl = "";
  try {
    const pdfjsLib = await import("pdfjs-dist");

    // Load worker via blob to bypass browser CORS restrictions for web workers
    const workerUrl = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    console.log(`[PDF] Fetching worker from ${workerUrl}`);
    const response = await fetch(workerUrl);
    if (!response.ok) throw new Error(`Failed to fetch PDF worker from CDN: ${response.statusText}`);
    const blob = await response.blob();
    blobUrl = URL.createObjectURL(blob);
    
    pdfjsLib.GlobalWorkerOptions.workerSrc = blobUrl;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;
    const textParts: string[] = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: any) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (pageText.length > 0) {
          textParts.push(`--- Page ${pageNum} ---\n${pageText}`);
        }
      } catch {}
    }

    return textParts.join('\n\n') || `[PDF: ${file.name}] Could not extract text content.`;
  } catch (err) {
    console.error("[AITutor] PDF extraction failed:", err);
    return `[PDF: ${file.name}] Unable to extract text.`;
  } finally {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
  }
}

async function extractTextFromFile(file: File): Promise<string> {
  if (file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
    return await file.text();
  }
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    return await extractTextFromPDF(file);
  }
  return `[Document: ${file.name}] This file type requires server-side processing.`;
}

/**
 * AI Tutor — File-Only Mode
 * 
 * Users must upload a file to start asking questions.
 * All answers are strictly based on the uploaded document content.
 */
const AITutor = ({ hideHeader = false }: { hideHeader?: boolean } = {}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  // Material panel is hidden by default — the tutor opens as a clean general chat.
  // The file selector + suggestions only appear when the user chooses to ask
  // about a file (toggles this on, selects, or uploads a document).
  const [showFiles, setShowFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

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

  // Fetch user's uploaded materials
  const { data: materials = [] } = useQuery({
    queryKey: ["materials", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("materials")
        .select("id, file_name, summary, extracted_text, key_topics, uploaded_at")
        .eq("user_id", user.uid)
        .order("uploaded_at", { ascending: false });
      const fetched = (data ?? []).map((m: any) => ({
        id: m.id,
        file_name: m.file_name,
        summary: m.summary || "",
        extracted_text: m.extracted_text || "",
        key_topics: m.key_topics || [],
        _uploaded_at: m.uploaded_at || "",
      }));
      return fetched as unknown as Material[];
    },
    enabled: !!user,
  });

  // NOTE: no auto-select. The tutor intentionally opens as a general chat with
  // no document attached; the user picks a file only when they want to ask
  // about one (via the "Files" toggle or by uploading).

  // Update selected material when ID changes
  useEffect(() => {
    if (selectedMaterialId) {
      const material = materials.find(m => m.id === selectedMaterialId);
      setSelectedMaterial(material || null);
    } else {
      setSelectedMaterial(null);
    }
  }, [selectedMaterialId, materials]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  /**
   * Handle file upload
   */
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !user || files.length === 0) return;
    const file = files[0];

    if (file.size > 50 * 1024 * 1024) {
      toast.error("File is too large (max 50MB)");
      return;
    }

    setUploading(true);
    try {
      toast.info(`Processing ${file.name}...`);
      const extractedText = await extractTextFromFile(file);
      
      toast.info("Analyzing content with AI...");
      const analysis = await analyzeWithAI(extractedText, file.name);
      const { summary, keyTopics } = analysis;

      const { data: materialRow } = await supabase.from("materials").insert({
        user_id: user.uid,
        file_name: file.name,
        content_type: file.type,
        file_size: file.size,
        processing_status: "completed",
        extracted_text: extractedText.substring(0, 100000),
        summary,
        key_topics: keyTopics,
        content_length: extractedText.length,
        uploaded_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
      }).select("id").single();

      await queryClient.invalidateQueries({ queryKey: ["materials", user.uid] });
      if (materialRow?.id) setSelectedMaterialId(materialRow.id);
      setShowFiles(true); // reveal the file panel now that a document is attached
      setMessages([]);
      toast.success(`${file.name} uploaded and ready! You can now ask questions about it.`);
    } catch (err) {
      console.error("[AITutor] Upload error:", err);
      toast.error("Failed to process file. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const streamResponse = async (userMessage: string, history: Message[]) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setStreaming(true);

    // Trim history to last MAX_HISTORY_MESSAGES to keep token count low.
    // The system prompt already contains the full document context, so early
    // messages add cost without helping quality.
    const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);

    const systemPrompt = selectedMaterial
      ? getDocSystemPrompt(selectedMaterial.file_name, selectedMaterial.extracted_text)
      : TUTOR_SYSTEM_PROMPT;

    const apiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...trimmedHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: userMessage },
    ];

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      let full = "";
      await aiStream(
        {
          messages: apiMessages,
          temperature: 0.6,
          maxTokens: 1500,
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
    } catch (e: any) {
      if (e.name === "AbortError") return;
      console.error("[AITutor] Stream error:", e);
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

  const handleSend = () => {
    if (!question.trim() || streaming) return;
    const userMsg: Message = { role: "user", content: question.trim() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setQuestion("");
    streamResponse(userMsg.content, messages);
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setStreaming(false);
  };

  const handleClear = () => {
    if (streaming) abortControllerRef.current?.abort();
    setMessages([]);
    setStreaming(false);
    setSelectedMaterialId(null);
    inputRef.current?.focus();
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
    toast.success("Copied to clipboard");
  };

  return (
    <div className={`flex flex-col w-full overflow-hidden bg-white ${hideHeader ? "h-[480px] rounded-xl" : "h-[calc(100vh-80px)]"}`}>
      {/* Premium Revamped Header */}
      {!hideHeader && (
        <div className="relative overflow-hidden bg-gradient-to-r from-[#29ABE2] via-[#29ABE2] to-[#29ABE2] text-white px-6 py-6 shadow-sm shrink-0">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-16 translate-x-16" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-8 -translate-x-8" />
          
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider text-[#29ABE2] backdrop-blur-sm">
                <Sparkles className="h-3 w-3" /> AI Study Assistant
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
                AI Study Tutor
              </h1>
              <p className="text-[#29ABE2]/90 text-xs md:text-sm max-w-xl">
                {selectedMaterial
                  ? `Ask questions about "${selectedMaterial.file_name}" to unlock concepts, summarize details, or clarify doubts.`
                  : "Upload study materials or select a file to receive personalized tutoring based on your content."}
              </p>
            </div>
            <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
              {messages.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClear}
                  className="bg-white/10 hover:bg-white/20 border-white/20 hover:border-white/30 text-white gap-2 rounded-xl text-xs"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear Chat
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent Files Quick-Select Bar — only when the user opens the file panel */}
      {showFiles && materials.length > 0 && (
        <div className="px-6 py-2.5 bg-gray-50 border-b border-gray-150 flex items-center gap-2 overflow-x-auto select-none shrink-0 scrollbar-none">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0 mr-1">Recent Files:</span>
          {materials.slice(0, 4).map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setSelectedMaterialId(m.id);
                setMessages([]);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                selectedMaterialId === m.id
                  ? "bg-[#29ABE2] text-white shadow-sm"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-[#29ABE2]/30 hover:bg-[#29ABE2]/5"
              }`}
            >
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[120px]">{m.file_name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main Split Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden w-full">
        {/* Left: Chat Container */}
        <div className="flex-1 flex flex-col h-full min-w-0 border-r border-gray-150 bg-white">
          {/* File Selector & Upload Bar — only when the user opens the file panel */}
          {showFiles && (
          <div className="px-6 py-3 border-b border-gray-150 bg-gray-50/50 shrink-0">
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />

              {materials.length > 0 ? (
                <Select
                  value={selectedMaterialId || "__none__"}
                  onValueChange={(value) => {
                    if (value === "__none__") {
                      setSelectedMaterialId(null);
                      setMessages([]);
                    } else {
                      setSelectedMaterialId(value);
                      setMessages([]);
                    }
                  }}
                >
                  <SelectTrigger className="w-full h-9 text-sm bg-white border-gray-200">
                    <SelectValue placeholder="Select a file to ask questions about it" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-gray-400">Choose a document...</span>
                    </SelectItem>
                    {materials.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.file_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm text-gray-400 flex-1">
                  No files uploaded yet. Upload a PDF, TXT, or MD file to get started.
                </span>
              )}

              {selectedMaterialId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedMaterialId(null);
                    setMessages([]);
                  }}
                  className="h-9 w-9 p-0 flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="h-9 gap-1.5 text-xs flex-shrink-0 border-gray-200 bg-white"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {uploading ? "Processing..." : "Upload"}
              </Button>
            </div>
          </div>
          )}

          {/* Hidden upload input — always rendered so the input-bar paperclip works
              even while the file panel is collapsed. */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md"
            className="hidden"
            aria-label="Upload study material file"
            onChange={(e) => handleFileUpload(e.target.files)}
          />

          {/* Chat Messages Area */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-gray-50/20">
            {messages.length === 0 ? (
              /* Empty state / Onboarding guidance */
              <div className="flex flex-col items-center justify-center min-h-full space-y-6 py-8">
                {selectedMaterial ? (
                  <div className="text-center space-y-4 max-w-md mx-auto">
                    <div className="h-16 w-16 rounded-2xl bg-[#29ABE2]/10 flex items-center justify-center mx-auto shadow-sm">
                      <Bot className="h-8 w-8 text-[#29ABE2]" />
                    </div>
                    <div className="space-y-1.5">
                      <h2 className="text-xl font-bold text-gray-900">{selectedMaterial.file_name}</h2>
                      <p className="text-sm text-gray-500">
                        Ask any specific question, summarize pages, or request clarifications on terminology.
                      </p>
                    </div>
                    
                    {selectedMaterial.key_topics.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-gray-100">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Key Topics Detected:</p>
                        <div className="flex flex-wrap gap-1.5 justify-center">
                          {selectedMaterial.key_topics.slice(0, 4).map((topic, idx) => (
                            <span key={idx} className="px-2.5 py-1 rounded-full bg-[#29ABE2]/5 border border-[#29ABE2]/10 text-[11px] font-medium text-[#29ABE2]">
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center space-y-6 w-full max-w-lg mx-auto px-4">
                    <div className="space-y-2">
                      <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[#29ABE2] to-[#29ABE2] flex items-center justify-center mx-auto shadow-md">
                        <Bot className="h-8 w-8 text-white animate-pulse" />
                      </div>
                      <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
                        How can I help you study today?
                      </h2>
                      <p className="text-sm text-gray-500 max-w-md mx-auto">
                        Ask any academic question, clarify complex concepts, or upload study material to specialize my knowledge.
                      </p>
                    </div>

                    {/* Suggestions Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                      {[
                        "Explain photosynthesis step by step",
                        "How do I solve quadratic equations?",
                        "What is Newton's second law?",
                        "Explain the water cycle",
                      ].map((q) => (
                        <button
                          key={q}
                          onClick={() => {
                            setQuestion(q);
                            setTimeout(() => inputRef.current?.focus(), 50);
                          }}
                          className="text-left px-4 py-3.5 rounded-2xl bg-white border border-gray-100 hover:border-[#29ABE2] hover:bg-[#29ABE2]/10 hover:shadow-sm transition-all text-xs font-semibold text-gray-600 hover:text-[#29ABE2]"
                        >
                          {q}
                        </button>
                      ))}
                    </div>

                    {/* Compact Drag and Drop Upload Zone */}
                    <div
                      className={`w-full rounded-2xl border-2 border-dashed p-5 text-center transition-all duration-200 cursor-pointer bg-white/50 ${
                        isDragOver
                          ? "border-[#29ABE2] bg-[#29ABE2]/50 scale-[1.01]"
                          : "border-gray-200 hover:border-[#29ABE2]/60 hover:bg-white"
                      }`}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragOver(true);
                      }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={handleDrop}
                    >
                      <div className="flex items-center justify-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-[#29ABE2] flex items-center justify-center text-white shrink-0">
                          <Upload className="h-5 w-5" />
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-bold text-gray-800">Specialize on your own documents</p>
                          <p className="text-[10px] text-gray-400">
                            Drag &amp; drop or click to upload PDF, TXT, or MD (max 50MB)
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Chat Message List */
              messages.map((msg, idx) => (
                <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role === "assistant" && (
                    <div className="h-8 w-8 rounded-lg bg-[#29ABE2]/10 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                      <Sparkles className="h-4 w-4 text-[#29ABE2]" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                      msg.role === "user"
                        ? "bg-[#29ABE2] text-white shadow-sm"
                        : "bg-white border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.02)] text-gray-800"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : msg.content ? (
                      <div className="relative group pr-4">
                        <div className="prose prose-sm max-w-none text-gray-800 leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                        <button
                          onClick={() => handleCopy(msg.content, idx)}
                          className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-gray-100 hover:bg-gray-200"
                          title="Copy response"
                        >
                          {copiedIdx === idx ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-gray-400" />}
                        </button>
                      </div>
                    ) : streaming && idx === messages.length - 1 ? (
                      <div className="flex items-center gap-2 text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin text-[#29ABE2]" /> Synthesizing answer...
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Panel */}
          <div className="px-6 py-4 border-t border-gray-150 bg-gray-50 shrink-0">
            <div className="flex items-center gap-2 bg-white border border-gray-200 focus-within:ring-2 focus-within:ring-[#29ABE2] focus-within:border-transparent rounded-xl pl-4 pr-1.5 py-1.5 transition-all shadow-sm">
              <input
                ref={inputRef}
                placeholder={
                  streaming
                    ? "AI is responding..."
                    : selectedMaterial
                    ? `Ask about "${selectedMaterial.file_name}"...`
                    : "Ask a general doubt, or select/upload a file to specialize..."
                }
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={streaming}
                className="flex-1 bg-transparent border-none outline-none text-sm text-gray-800 placeholder-gray-400 min-w-0"
                autoFocus
              />
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFiles((v) => !v)}
                  className={`h-8 w-8 p-0 rounded-lg transition-all ${
                    showFiles || selectedMaterial
                      ? "text-[#29ABE2] bg-[#29ABE2]/10 hover:bg-[#29ABE2]/15"
                      : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  }`}
                  title={selectedMaterial ? `Asking about "${selectedMaterial.file_name}" — manage files` : "Ask about a file"}
                  aria-pressed={showFiles}
                >
                  <FileText className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={toggleListening}
                  className={`h-8 w-8 p-0 rounded-lg transition-all ${
                    isListening
                      ? "text-red-500 bg-red-50 animate-pulse hover:bg-red-100 hover:text-red-600"
                      : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  }`}
                  title="Voice input"
                >
                  <Mic className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 w-8 p-0 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  title="Upload study material"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                {streaming ? (
                  <Button
                    onClick={handleStop}
                    variant="outline"
                    className="h-8 w-8 p-0 rounded-lg border-gray-200 hover:text-red-500 hover:bg-red-50"
                  >
                    <Square className="h-3.5 w-3.5" fill="currentColor" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSend}
                    disabled={!question.trim()}
                    className="h-8 w-8 p-0 bg-[#29ABE2] text-white hover:bg-[#29ABE2] rounded-lg shadow-sm"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-2.5">
              {selectedMaterial
                ? `AI Tutor is specialized on "${selectedMaterial.file_name}".`
                : "Ask any general doubt, or upload study material to specialize the AI Tutor."}
            </p>
          </div>
        </div>

        {/* Right: Quick Tools Sidebar — only while the file panel is open or a
            document is selected, so the default tutor view is a clean chat. */}
        {(showFiles || selectedMaterial) && (
        <div className="w-full lg:w-[340px] h-full bg-gray-50/70 overflow-y-auto p-6 space-y-6 shrink-0 border-t lg:border-t-0 border-gray-150">
          {/* Suggested Questions Section */}
          {selectedMaterial && selectedMaterial.key_topics.length > 0 ? (
            <div className="bg-white border border-gray-150 rounded-2xl p-4 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <MessageCircleQuestion className="h-3.5 w-3.5 text-[#29ABE2]" /> Suggested Questions
              </h4>
              <div className="flex flex-col gap-2">
                {selectedMaterial.key_topics.slice(0, 3).map((topic, idx) => {
                  const questionsList = [
                    `What are the key concepts of ${topic}?`,
                    `Can you summarize the main findings of ${topic}?`,
                    `Explain the core theory of ${topic} step-by-step.`,
                  ];
                  const q = questionsList[idx % questionsList.length];
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setQuestion(q);
                        inputRef.current?.focus();
                      }}
                      className="text-left text-xs text-gray-600 hover:text-[#29ABE2] hover:bg-[#29ABE2]/50 p-2.5 rounded-xl border border-gray-100 hover:border-[#29ABE2]/40 transition-all font-medium"
                    >
                      {q}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-150 rounded-2xl p-4 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <MessageCircleQuestion className="h-3.5 w-3.5 text-[#29ABE2]" /> General Doubts
              </h4>
              <div className="flex flex-col gap-2">
                {[
                  { q: "What is the theory of relativity?", label: "Theory of Relativity" },
                  { q: "Explain photosynthesis step-by-step.", label: "Photosynthesis Explained" },
                  { q: "How do binary search trees work?", label: "Binary Search Trees" },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setQuestion(item.q);
                      inputRef.current?.focus();
                    }}
                    className="text-left text-xs text-gray-600 hover:text-[#29ABE2] hover:bg-[#29ABE2]/50 p-2.5 rounded-xl border border-gray-100 hover:border-[#29ABE2]/40 transition-all font-medium"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}


        </div>
        )}
      </div>
    </div>
  );
};

export default AITutor;
