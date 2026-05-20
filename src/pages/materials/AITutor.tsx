import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, Sparkles, Loader2, Copy, Check, Square, Trash2, Calculator, Atom, BookOpen, Code2, Globe, FileText, X, Upload, Link2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { aiStream } from "@/lib/aiService";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, query, where, getDocs, orderBy, addDoc, updateDoc, doc } from "firebase/firestore";
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



// Sentinel value for "no file selected" in Radix Select (empty string is invalid)
const NO_FILE_VALUE = "__none__";

// Maximum document content to include in the system prompt (avoid token overflow)
const MAX_DOC_CONTEXT_CHARS = 12_000;

const GENERIC_SYSTEM_PROMPT = `You are EduOnx AI Tutor — an expert, patient, and encouraging tutor that helps students learn and master any subject.

Guidelines:
- Give clear, step-by-step explanations
- Use analogies and real-world examples to make concepts intuitive
- Break down complex topics into digestible parts
- Encourage critical thinking by asking follow-up questions
- Highlight common mistakes students make and how to avoid them
- Use markdown formatting: headers (##), bullet points, numbered lists, **bold**, and \`code\` blocks
- If math is involved, show each step clearly
- Be warm and supportive — celebrate understanding
- Keep responses focused and practical (not too long)
- End with a brief summary or key takeaway when explaining concepts`;

const getFileBasedSystemPrompt = (fileName: string, documentContent: string): string => {
  // Truncate document content to avoid exceeding model context limits
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
 * AI Tutor — Enhanced with File Support & Inline Upload
 * 
 * Features:
 * - Generic Q&A mode (standard tutoring)
 * - File-based Q&A (answer questions about uploaded documents)
 * - Inline file upload directly in the tutor
 * - Real-time streaming responses
 * - Context-aware answers from document content
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
      
      // Sort client-side to avoid needing a Firestore composite index
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
   * Handle inline file upload directly in the AI Tutor
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

      // Extract text
      const extractedText = await extractTextFromFile(file);

      // Generate simple topics
      const nameBase = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
      const keyTopics = [nameBase];

      // Save to Firestore
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

      // Refresh materials list and auto-select the new file
      await queryClient.invalidateQueries({ queryKey: ["materials", user.uid] });
      setSelectedMaterialId(materialRef.id);
      setMessages([]);
      toast.success(`${file.name} uploaded and ready! You can now ask questions about it.`);
    } catch (err) {
      console.error("[AITutor] Upload error:", err);
      toast.error("Failed to process file. Please try again.");
    } finally {
      setUploading(false);
      // Reset file input so same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };



  const streamResponse = async (userMessage: string, history: Message[]) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setStreaming(true);

    // Determine system prompt based on whether a file is selected
    const systemPrompt = selectedMaterial
      ? getFileBasedSystemPrompt(selectedMaterial.file_name, selectedMaterial.extracted_text)
      : GENERIC_SYSTEM_PROMPT;

    // Build conversation history for OpenRouter
    const apiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: userMessage },
    ];

    // Add assistant placeholder
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
          // If we get a retry notification, reset accumulated text
          // so the "retrying..." message doesn't persist in the final answer
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

      // Clean any leftover retry status text from final response
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

  const handleStarterClick = (prompt: string) => {
    setQuestion(prompt);
    const userMsg: Message = { role: "user", content: prompt };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    streamResponse(prompt, messages);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" /> AI Tutor
          </h1>
          <p className="text-muted-foreground text-sm">
            {selectedMaterial
              ? `Learning from: ${selectedMaterial.file_name}`
              : "Ask me anything — I'll explain concepts, solve problems, and help you learn."
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
      <div className="px-6 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />

          {materials.length > 0 ? (
            <Select
              value={selectedMaterialId || NO_FILE_VALUE}
              onValueChange={(value) => {
                if (value === NO_FILE_VALUE) {
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
                <SelectItem value={NO_FILE_VALUE}>
                  <span className="text-muted-foreground">Generic Tutor (No File)</span>
                </SelectItem>
                {materials.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.file_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm text-muted-foreground flex-1">
              No files uploaded yet. Upload a PDF to ask questions about it.
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

          {/* Inline Upload Button */}
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
          /* Empty state — subject starters or file info */
          <div className="flex flex-col items-center justify-center h-full space-y-8 py-12">
            {selectedMaterial ? (
              <div className="text-center space-y-3">
                <div className="h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto">
                  <FileText className="h-8 w-8 text-accent" />
                </div>
                <h2 className="text-xl font-bold text-foreground">{selectedMaterial.file_name}</h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  Ask me any questions about this document. I'll answer strictly based on the content.
                </p>
                {selectedMaterial.key_topics.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Key Topics:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {selectedMaterial.key_topics.slice(0, 5).map((topic, idx) => (
                        <span key={idx} className="px-3 py-1 rounded-full bg-primary/10 text-xs text-primary">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="text-center space-y-3">
                  <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">What would you like to learn?</h2>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Upload your materials or type a specific question below. You can ask me to explain concepts, summarize text, or solve complex problems based on your provided data.
                  </p>
                </div>

                {/* Subject starter prompts */}
                <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
                  {[
                    { icon: Calculator, label: "Math", prompt: "Explain how to solve quadratic equations step by step" },
                    { icon: Atom, label: "Physics", prompt: "Explain Newton's laws of motion with real-world examples" },
                    { icon: Code2, label: "Coding", prompt: "Explain the concept of recursion with a simple example" },
                    { icon: Globe, label: "General", prompt: "Help me create a study plan for my upcoming exams" },
                  ].map((s) => (
                    <button
                      key={s.label}
                      onClick={() => handleStarterClick(s.prompt)}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left group"
                    >
                      <s.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <div>
                        <div className="text-xs font-semibold text-foreground">{s.label}</div>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">{s.prompt}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          /* Messages */
          messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
              {msg.role === "assistant" && (
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-xl px-4 py-3 ${msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border"
                  }`}
              >
                {msg.role === "user" ? (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                ) : msg.content ? (
                  <div className="relative group">
                    <div className="prose prose-sm max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                    <button
                      onClick={() => handleCopy(msg.content, idx)}
                      className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-muted"
                      title="Copy response"
                    >
                      {copiedIdx === idx ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
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

      {/* Input Bar */}
      <div className="px-6 pb-6 pt-2 border-t border-border bg-background">
        <div className="flex items-center gap-3">
          <Input
            ref={inputRef}
            placeholder={selectedMaterial
              ? `Ask about ${selectedMaterial.file_name}...`
              : "Ask anything — e.g. 'Explain photosynthesis step by step'"
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
              disabled={!question.trim()}
              className="h-11 w-11 p-0 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          Powered by Llama 3 via Groq · {selectedMaterial ? "Answers based on your document" : "Responses may not always be accurate"}
        </p>
      </div>
    </div>
  );
};

export default AITutor;
