import { useState, useRef, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, Sparkles, Loader2, Copy, Check, Square, Trash2, FileText, X, Upload, Wrench, Youtube, Brain, MessageCircleQuestion, Mic, Paperclip } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { aiStream, aiComplete } from "@/lib/aiService";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, query, where, getDocs, addDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
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

// Maximum document content to include in the system prompt (avoid token overflow)
const MAX_DOC_CONTEXT_CHARS = 12_000;

const GENERAL_SYSTEM_PROMPT = `You are an expert, patient tutor helping students solve doubts and understand concepts.

When answering:
1. Provide a clear, step-by-step explanation
2. Use analogies and real-world examples
3. Break down complex topics into simpler parts
4. Highlight common mistakes students make
5. Format with markdown: use headers (##), bullet points, numbered lists, and **bold** for emphasis
6. If math is involved, show each step clearly
7. End with a brief summary and suggest related topics to explore
8. Keep responses focused and educational`;

const getFileBasedSystemPrompt = (fileName: string, documentContent: string): string => {
  const truncatedContent = documentContent.length > MAX_DOC_CONTEXT_CHARS
    ? documentContent.substring(0, MAX_DOC_CONTEXT_CHARS) +
      `\n\n[... Document truncated. Total length: ${documentContent.length} characters. The above represents the first ${MAX_DOC_CONTEXT_CHARS} characters.]`
    : documentContent;

  return `You are EduOnx AI Tutor specialized in helping students understand their uploaded study materials.

IMPORTANT: You MUST answer questions STRICTLY BASED on the provided document content.
- If the answer is in the document, provide a clear, comprehensive answer from the document
- If the question requires information NOT in the document, say: "This topic is not covered in ${fileName}. Based on the document, here's what I can tell you: [answer from document if relevant]"
- Always cite which part of the document your answer comes from
- Never make up information or go beyond the document scope

Document: ${fileName}
Document Content:
"""
${truncatedContent}
"""

Guidelines for responses:
- Explain concepts in simple, clear language
- Use step-by-step explanations for complex topics
- Provide examples from the document when available
- Ask clarifying follow-up questions if the question is vague
- Use markdown formatting: headers (##), bullet points, numbered lists, **bold**, and \`code\` blocks
- Keep responses focused on the document content
- End with key takeaways from the document`;
};

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
    const truncated = text.substring(0, 15000);
    const prompt = `Analyze this study material and return a JSON object with:
1. "summary": A comprehensive 3-5 sentence summary
2. "keyTopics": An array of 5-10 key topics/concepts covered

Material (from file "${fileName}"):
"""
${truncated}
"""

Return ONLY valid JSON, no markdown or other text.`;

    const raw = await aiComplete({
      messages: [
        { role: "system", content: "You are a document analysis assistant. Return ONLY valid JSON, no other text." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 1024,
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
      const q = query(
        collection(db, "materials"),
        where("user_id", "==", user.uid)
      );
      const docs = await getDocs(q);
      const fetched = docs.docs.map(doc => ({
        id: doc.id,
        file_name: doc.data().file_name,
        summary: doc.data().summary || "",
        extracted_text: doc.data().extracted_text || "",
        key_topics: doc.data().key_topics || [],
        _uploaded_at: doc.data().uploaded_at || "",
      }));
      
      fetched.sort((a, b) => {
        const timeA = a._uploaded_at ? new Date(a._uploaded_at).getTime() : 0;
        const timeB = b._uploaded_at ? new Date(b._uploaded_at).getTime() : 0;
        return timeB - timeA;
      });
      
      return fetched as unknown as Material[];
    },
    enabled: !!user,
  });

  // Auto-select most recently uploaded material if none is selected
  useEffect(() => {
    if (!selectedMaterialId && materials.length > 0) {
      setSelectedMaterialId(materials[0].id);
    }
  }, [materials, selectedMaterialId]);

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

      const materialRef = await addDoc(collection(db, "materials"), {
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
      });

      await queryClient.invalidateQueries({ queryKey: ["materials", user.uid] });
      setSelectedMaterialId(materialRef.id);
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

    const systemPrompt = selectedMaterial
      ? getFileBasedSystemPrompt(selectedMaterial.file_name, selectedMaterial.extracted_text)
      : GENERAL_SYSTEM_PROMPT;

    const apiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({
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
    <div className={`flex flex-col w-full overflow-hidden bg-white ${hideHeader ? "h-[600px] rounded-xl" : "h-[calc(100vh-80px)]"}`}>
      {/* Premium Revamped Header */}
      {!hideHeader && (
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 text-white px-6 py-6 shadow-sm shrink-0">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-16 translate-x-16" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-8 -translate-x-8" />
          
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider text-blue-200 backdrop-blur-sm">
                <Sparkles className="h-3 w-3" /> AI Study Assistant
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
                AI Study Tutor
              </h1>
              <p className="text-blue-100/90 text-xs md:text-sm max-w-xl">
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

      {/* Recent Files Quick-Select Bar */}
      {materials.length > 0 && (
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
                  ? "bg-[#1D4ED8] text-white shadow-sm"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-[#1D4ED8]/30 hover:bg-[#1D4ED8]/5"
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
          {/* File Selector & Upload Bar */}
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
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                className="hidden"
                aria-label="Upload study material file"
                onChange={(e) => handleFileUpload(e.target.files)}
              />
            </div>
          </div>

          {/* Chat Messages Area */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-gray-50/20">
            {messages.length === 0 ? (
              /* Empty state / Onboarding guidance */
              <div className="flex flex-col items-center justify-center h-full space-y-6 py-12">
                {selectedMaterial ? (
                  <div className="text-center space-y-4 max-w-md mx-auto">
                    <div className="h-16 w-16 rounded-2xl bg-[#1D4ED8]/10 flex items-center justify-center mx-auto shadow-sm">
                      <Bot className="h-8 w-8 text-[#1D4ED8]" />
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
                            <span key={idx} className="px-2.5 py-1 rounded-full bg-[#1D4ED8]/5 border border-[#1D4ED8]/10 text-[11px] font-medium text-[#1D4ED8]">
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center space-y-6 max-w-2xl mx-auto w-full px-4">
                    <div className="space-y-2">
                      <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto shadow-md">
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg mx-auto">
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
                          className="text-left px-4 py-3.5 rounded-2xl bg-white border border-gray-100 hover:border-blue-300 hover:bg-blue-50/10 hover:shadow-sm transition-all text-xs font-semibold text-gray-600 hover:text-blue-700"
                        >
                          {q}
                        </button>
                      ))}
                    </div>

                    {/* Compact Drag and Drop Upload Zone */}
                    <div
                      className={`w-full max-w-lg mx-auto rounded-2xl border-2 border-dashed p-5 text-center transition-all duration-200 cursor-pointer bg-white/50 ${
                        isDragOver
                          ? "border-blue-600 bg-blue-50/50 scale-[1.01]"
                          : "border-gray-200 hover:border-blue-400/60 hover:bg-white"
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
                        <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                          <Upload className="h-4.5 w-4.5" />
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
                    <div className="h-8 w-8 rounded-lg bg-[#1D4ED8]/10 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                      <Sparkles className="h-4 w-4 text-[#1D4ED8]" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                      msg.role === "user"
                        ? "bg-[#1D4ED8] text-white shadow-sm"
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
                        <Loader2 className="h-4 w-4 animate-spin text-[#1D4ED8]" /> Synthesizing answer...
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
            <div className="flex items-center gap-2 bg-white border border-gray-200 focus-within:ring-2 focus-within:ring-[#1D4ED8] focus-within:border-transparent rounded-xl pl-4 pr-1.5 py-1.5 transition-all shadow-sm">
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
                    className="h-8 w-8 p-0 bg-[#1D4ED8] text-white hover:bg-[#2563EB] rounded-lg shadow-sm"
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

        {/* Right: Quick Tools Sidebar */}
        <div className="w-full lg:w-[340px] h-full bg-gray-50/70 overflow-y-auto p-6 space-y-6 shrink-0 border-t lg:border-t-0 border-gray-150">
          {/* Suggested Questions Section */}
          {selectedMaterial && selectedMaterial.key_topics.length > 0 ? (
            <div className="bg-white border border-gray-150 rounded-2xl p-4 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <MessageCircleQuestion className="h-3.5 w-3.5 text-blue-500" /> Suggested Questions
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
                      className="text-left text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50/50 p-2.5 rounded-xl border border-gray-100 hover:border-blue-200/40 transition-all font-medium"
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
                <MessageCircleQuestion className="h-3.5 w-3.5 text-blue-500" /> General Doubts
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
                    className="text-left text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50/50 p-2.5 rounded-xl border border-gray-100 hover:border-blue-200/40 transition-all font-medium"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Study Tools Sidebar Widget */}
          <div className="bg-white border border-gray-150 rounded-2xl p-4 shadow-sm space-y-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5 text-blue-500" /> Quick Study Tools
            </h4>
            
            <div className="space-y-3">
              {/* YouTube Summarizer */}
              <div className="group border border-gray-100 rounded-xl p-3 hover:border-blue-200 hover:bg-blue-50/20 transition-all">
                <div className="flex items-start gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                    <Youtube className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-gray-800">YouTube Video Summarizer</h5>
                    <p className="text-[10px] text-gray-400 mt-0.5">Generate notes instantly from study videos.</p>
                    <Link to="/tools" className="text-[10px] font-semibold text-[#1D4ED8] hover:underline inline-flex items-center gap-0.5 mt-1.5">
                      Open Summarizer &rarr;
                    </Link>
                  </div>
                </div>
              </div>

              {/* Concept Explorer / AI Tutor */}
              <div className="group border border-gray-100 rounded-xl p-3 hover:border-blue-200 hover:bg-blue-50/20 transition-all">
                <div className="flex items-start gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-purple-50 text-purple-500 flex items-center justify-center shrink-0">
                    <Brain className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-gray-800">AI Tutor</h5>
                    <p className="text-[10px] text-gray-400 mt-0.5">Drill down and visualize topics with AI maps.</p>
                    <Link to="/tools" className="text-[10px] font-semibold text-[#1D4ED8] hover:underline inline-flex items-center gap-0.5 mt-1.5">
                      Open AI Tutor &rarr;
                    </Link>
                  </div>
                </div>
              </div>

              {/* Snap Enhance */}
              <div className="group border border-gray-100 rounded-xl p-3 hover:border-blue-200 hover:bg-blue-50/20 transition-all">
                <div className="flex items-start gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
                    <Sparkles className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-gray-800">Snap Enhance</h5>
                    <p className="text-[10px] text-gray-400 mt-0.5">Select any text on any page in the app to enhance or simplify it using our global AI toolkit.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AITutor;
