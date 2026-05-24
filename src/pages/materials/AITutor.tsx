import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, Sparkles, Loader2, Copy, Check, Square, Trash2, FileText, X, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { aiStream } from "@/lib/aiService";
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
 * Extract text from uploaded PDF using pdfjs-dist
 */
async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

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
  }
}

/**
 * Extract text from any supported file type
 */
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
const AITutor = () => {
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
      const nameBase = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
      const keyTopics = [nameBase];

      const materialRef = await addDoc(collection(db, "materials"), {
        user_id: user.uid,
        file_name: file.name,
        content_type: file.type,
        file_size: file.size,
        processing_status: "completed",
        extracted_text: extractedText.substring(0, 100000),
        summary: extractedText.substring(0, 200) + "...",
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
    if (!selectedMaterial) {
      toast.error("Please upload or select a file first");
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setStreaming(true);

    const systemPrompt = getFileBasedSystemPrompt(selectedMaterial.file_name, selectedMaterial.extracted_text);

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
    if (!selectedMaterial) {
      toast.error("Please upload or select a file first to ask questions.");
      return;
    }
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
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Bot className="h-6 w-6 text-[#1D4ED8]" /> AI Tutor
          </h1>
          <p className="text-gray-500 text-sm">
            {selectedMaterial
              ? `Learning from: ${selectedMaterial.file_name}`
              : "Upload a file to start asking questions about it."
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleClear} className="gap-2 text-xs">
              <Trash2 className="h-3.5 w-3.5" /> Clear Chat
            </Button>
          )}
        </div>
      </div>

      {/* File Selector & Upload */}
      <div className="px-6 pb-3 border-b border-gray-200">
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
              <SelectTrigger className="w-full h-9 text-sm">
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
            className="h-9 gap-1.5 text-xs flex-shrink-0"
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

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-4">
        {messages.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full space-y-6 py-12">
            {selectedMaterial ? (
              <div className="text-center space-y-3">
                <div className="h-16 w-16 rounded-2xl bg-[#1D4ED8]/10 flex items-center justify-center mx-auto">
                  <FileText className="h-8 w-8 text-[#1D4ED8]" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">{selectedMaterial.file_name}</h2>
                <p className="text-sm text-gray-500 max-w-md">
                  Ask me any questions about this document. I'll answer strictly based on the content.
                </p>
                {selectedMaterial.key_topics.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase">Key Topics:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {selectedMaterial.key_topics.slice(0, 5).map((topic, idx) => (
                        <span key={idx} className="px-3 py-1 rounded-full bg-[#1D4ED8]/10 text-xs text-[#1D4ED8]">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Upload prompt - large drag-and-drop zone */
              <div
                className={`w-full max-w-lg mx-auto rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-200 cursor-pointer ${
                  isDragOver
                    ? "border-[#1D4ED8] bg-[#1D4ED8]/5 scale-[1.02]"
                    : "border-gray-200 hover:border-[#1D4ED8]/40 hover:bg-gray-50"
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
              >
                <div className="h-16 w-16 rounded-2xl bg-[#1D4ED8]/10 flex items-center justify-center mx-auto mb-4">
                  <Upload className="h-8 w-8 text-[#1D4ED8]" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Upload your study material</h2>
                <p className="text-sm text-gray-500 max-w-sm mx-auto mb-4">
                  Drop a PDF, TXT, or Markdown file here, or click to browse. The AI Tutor will answer questions based on your uploaded content.
                </p>
                <div className="flex items-center justify-center gap-3 text-xs text-gray-400">
                  <span className="px-2 py-1 rounded-lg bg-gray-100">PDF</span>
                  <span className="px-2 py-1 rounded-lg bg-gray-100">TXT</span>
                  <span className="px-2 py-1 rounded-lg bg-gray-100">MD</span>
                  <span className="text-gray-300">•</span>
                  <span>Max 50MB</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Messages */
          messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
              {msg.role === "assistant" && (
                <div className="h-8 w-8 rounded-lg bg-[#1D4ED8]/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <Sparkles className="h-4 w-4 text-[#1D4ED8]" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-xl px-4 py-3 ${msg.role === "user"
                  ? "bg-[#1D4ED8] text-white"
                  : "bg-white border border-gray-100 shadow-sm"
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
                      className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-gray-100"
                      title="Copy response"
                    >
                      {copiedIdx === idx ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-gray-400" />}
                    </button>
                  </div>
                ) : streaming && idx === messages.length - 1 ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Thinking...
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Bar */}
      <div className="px-6 pb-6 pt-2 border-t border-gray-200 bg-[#F3F4F6]">
        <div className="flex items-center gap-3">
          <Input
            ref={inputRef}
            placeholder={selectedMaterial
              ? `Ask about ${selectedMaterial.file_name}...`
              : "Upload a file first to start asking questions..."
            }
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={streaming || !selectedMaterial}
            className="flex-1 h-11"
            autoFocus
          />
          {streaming ? (
            <Button onClick={handleStop} variant="outline" className="h-11 w-11 p-0">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={!question.trim() || !selectedMaterial}
              className="h-11 w-11 p-0 bg-[#1D4ED8] text-white hover:bg-[#2563EB]"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-[10px] text-gray-400 text-center mt-2">
          Powered by Llama 3 via Groq · Answers based on your uploaded document
        </p>
      </div>
    </div>
  );
};

export default AITutor;
