import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, FileText, ArrowRight, Loader2, Search, FolderOpen, Sparkles, LayoutGrid, List, Plus, Library, BookOpenCheck, ExternalLink, Trash2, Clock, AlertTriangle, StickyNote, Database } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { aiComplete } from "@/lib/aiService";
import { getAuthHeaders } from "@/lib/authHeaders";

/**
 * CLIENT-SIDE TEXT EXTRACTION
 * ===========================
 * Uses PDF.js (pdfjs-dist) for robust PDF text extraction.
 * Falls back to basic methods for .txt/.md files.
 */

/**
 * Extract text from a PDF file using pdfjs-dist.
 * Loads the worker from CDN to avoid bundling issues.
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

    console.log(`[PDF] Extracting text from ${totalPages} pages of "${file.name}"`);

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: any) => {
            if ('str' in item) {
              return item.str;
            }
            return '';
          })
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (pageText.length > 0) {
          textParts.push(`--- Page ${pageNum} ---\n${pageText}`);
        }
      } catch (pageErr) {
        console.warn(`[PDF] Error on page ${pageNum}:`, pageErr);
      }
    }

    const fullText = textParts.join('\n\n');

    if (fullText.trim().length > 50) {
      console.log(`[PDF] ✅ Extracted ${fullText.length} chars from "${file.name}"`);
      return fullText;
    }

    return `[PDF Document: ${file.name}] This PDF appears to contain scanned images or non-selectable text. ` +
      `The document has ${totalPages} pages. The AI tutor can help with questions about topics described in the filename.`;
  } catch (err) {
    console.error("[PDF] Extraction failed:", err);
    return `[PDF Document: ${file.name}] Unable to extract text. ` +
      `Please ensure the PDF is not password-protected. ` +
      `The AI tutor can still help with general questions.`;
  } finally {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
  }
}

async function extractTextFromFile(file: File): Promise<string> {
  // Plain text and markdown
  if (file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
    return await file.text();
  }

  // PDF: use pdfjs-dist for proper extraction
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    return await extractTextFromPDF(file);
  }

  // Images
  if (file.type.startsWith("image/")) {
    return `[Image Document: ${file.name}] The AI tutor can help with questions about topics described in the filename or analyze the image content if asked.`;
  }

  return `[Document: ${file.name}] This file type requires server-side processing for full text extraction.`;
}

/**
 * Generate simple key topics from extracted text
 */
function extractSimpleTopics(text: string, fileName: string): string[] {
  const topics: Set<string> = new Set();

  // Extract from filename (remove extension, split on common separators)
  const nameBase = fileName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
  if (nameBase.length > 2) topics.add(nameBase);

  // Extract capitalized phrases (likely headings/topics)
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
 * AI-POWERED ANALYSIS via server AI proxy
 * Generates comprehensive summary, key topics, and concept hierarchy
 * Falls back to basic extraction if API unavailable
 */
async function analyzeWithAI(
  text: string,
  fileName: string
): Promise<{ summary: string; keyTopics: string[]; concepts: { name: string; importance: string }[] }> {
  const fallback = {
    summary: generateSimpleSummary(text),
    keyTopics: extractSimpleTopics(text, fileName),
    concepts: extractSimpleTopics(text, fileName).map((t, i) => ({
      name: t,
      importance: i < 3 ? "critical" : "important",
    })),
  };

  if (text.length < 50) return fallback;

  try {
    const truncated = text.substring(0, 15000);
    const prompt = `Analyze this study material and return a JSON object with:
1. "summary": A comprehensive 3-5 sentence summary
2. "keyTopics": An array of 5-10 key topics/concepts covered
3. "concepts": An array of objects with "name" and "importance" ("critical", "important", or "supplementary")

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
      concepts: Array.isArray(parsed.concepts) ? parsed.concepts : fallback.concepts,
    };
  } catch (e) {
    console.warn("[MaterialUpload] AI analysis fallback:", e);
    return fallback;
  }
}

const MaterialUpload = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeFileTab, setActiveFileTab] = useState<"all" | "pdf" | "image" | "text" | "notes">("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: savedNotes, isLoading: isNotesLoading } = useQuery({
    queryKey: ["saved-notes", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      try {
        const { data, error } = await supabase
          .from("saved_notes")
          .select("*")
          .eq("user_id", user.uid)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data ?? []) as Array<{
          id: string;
          user_id: string;
          lesson_id: string;
          lesson_title: string;
          topic_id: string;
          topic_title: string;
          text: string;
          created_at: string;
        }>;
      } catch (err) {
        console.error("Failed to fetch saved notes:", err);
        return [];
      }
    },
    enabled: !!user,
  });

  const handleDeleteNote = async (id: string) => {
    // Optimistic: remove from cache immediately
    queryClient.setQueryData(
      ["saved-notes", user?.uid],
      (old: any[] | undefined) => (old || []).filter((n: any) => n.id !== id)
    );
    try {
      await supabase.from("saved_notes").delete().eq("id", id);
      toast.success("Note deleted");
    } catch (error) {
      toast.error("Failed to delete note");
      queryClient.invalidateQueries({ queryKey: ["saved-notes", user?.uid] });
    }
  };

  type MaterialItem = {
    id: string;
    file_name: string;
    content_type: string;
    file_size: number;
    processing_status: string;
    extracted_text: string;
    summary: string;
    key_topics: string[];
    content_length: number;
    file_data?: string;
    uploaded_at?: any;
    user_id: string;
  };

  const { data: materials, isLoading } = useQuery({
    queryKey: ["materials", user?.uid],
    queryFn: async (): Promise<MaterialItem[]> => {
      if (!user) return [];
      const { data } = await supabase
        .from("materials")
        .select("*")
        .eq("user_id", user.uid)
        .order("uploaded_at", { ascending: false });
      return (data ?? []) as MaterialItem[];
    },
    enabled: !!user,
    refetchInterval: uploading ? 3000 : false, // Auto-refresh while uploading
  });

  const handleUpload = async (files: FileList | null) => {
    if (!files || !user) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 50 * 1024 * 1024) {
          toast.error(`${file.name} is too large (max 50MB)`);
          continue;
        }

        setUploadProgress(`Processing ${file.name}...`);
        toast.info(`Processing ${file.name}...`);

        const uploadTimestamp = new Date().toISOString();

        // Step 1: Create the material row with "processing" status
        const { data: materialRow } = await supabase.from("materials").insert({
          user_id: user.uid,
          file_name: file.name,
          content_type: file.type,
          file_size: file.size,
          processing_status: "processing",
          uploaded_at: uploadTimestamp,
        }).select("id").single();
        const materialId = materialRow?.id as string;

        // Optimistic update: immediately add the new file to the cache so it shows in the UI
        const optimisticEntry: MaterialItem = {
          id: materialId,
          file_name: file.name,
          content_type: file.type,
          file_size: file.size,
          processing_status: "processing",
          extracted_text: "",
          summary: "",
          key_topics: [],
          content_length: 0,
          uploaded_at: uploadTimestamp,
          user_id: user.uid,
        };
        queryClient.setQueryData<MaterialItem[]>(
          ["materials", user.uid],
          (old) => [optimisticEntry, ...(old || [])]
        );

        try {
          // Step 2: Extract text client-side (PDF.js for PDFs)
          setUploadProgress(`Extracting text from ${file.name}...`);
          const extractedText = await extractTextFromFile(file);

          let fileData = null;
          if (file.type.startsWith("image/")) {
            setUploadProgress(`Optimizing image ${file.name}...`);
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = document.createElement('img');
            const reader = new FileReader();
            fileData = await new Promise<string>((resolve) => {
              reader.onload = (ev) => {
                img.onload = () => {
                  const maxDim = 1200;
                  let width = img.width;
                  let height = img.height;
                  if (width > maxDim || height > maxDim) {
                    if (width > height) {
                      height = Math.round((height * maxDim) / width);
                      width = maxDim;
                    } else {
                      width = Math.round((width * maxDim) / height);
                      height = maxDim;
                    }
                  }
                  canvas.width = width;
                  canvas.height = height;
                  ctx?.drawImage(img, 0, 0, width, height);
                  resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.src = ev.target?.result as string;
              };
              reader.readAsDataURL(file);
            });
          }

          setUploadProgress(`Analyzing ${file.name} with AI...`);
          const analysis = await analyzeWithAI(extractedText, file.name);
          const { summary, keyTopics } = analysis;

          // Step 3: Update the material with extracted content & mark as completed
          await supabase.from("materials").update({
            processing_status: "completed",
            extracted_text: extractedText.substring(0, 100000), // Cap at 100K chars for larger PDFs
            summary: summary,
            key_topics: keyTopics,
            content_length: extractedText.length,
            file_data: fileData,
            concepts: keyTopics.map((t, i) => ({
              name: t,
              importance: i < 3 ? "critical" : "important",
            })),
            processed_at: new Date().toISOString(),
          }).eq("id", materialId);

          // Update the optimistic entry in cache with the completed data
          queryClient.setQueryData<MaterialItem[]>(
            ["materials", user.uid],
            (old) => (old || []).map(m =>
              m.id === materialId
                ? {
                    ...m,
                    processing_status: "completed",
                    extracted_text: extractedText.substring(0, 100000),
                    summary,
                    key_topics: keyTopics,
                    content_length: extractedText.length,
                    file_data: fileData ?? undefined,
                  }
                : m
            )
          );

          toast.success(`${file.name} processed successfully! ${extractedText.length > 100 ? `(${Math.round(extractedText.length / 1000)}K chars extracted)` : ''}`);
        } catch (err: any) {
          console.error("[Upload] Processing error:", err);

          // Still mark as completed with minimal data so AI tutor can work
          try {
            await supabase.from("materials").update({
              processing_status: "completed",
              summary: `Study material: ${file.name}`,
              key_topics: [file.name.replace(/\.[^.]+$/, "")],
              content_length: file.size,
              processed_at: new Date().toISOString(),
            }).eq("id", materialId);
          } catch { }

          // Update optimistic entry for error case too
          queryClient.setQueryData<MaterialItem[]>(
            ["materials", user.uid],
            (old) => (old || []).map(m =>
              m.id === materialId
                ? { ...m, processing_status: "completed", summary: `Study material: ${file.name}` }
                : m
            )
          );

          toast.warning(`${file.name} uploaded with limited processing.`);
        } finally {
          queryClient.invalidateQueries({ queryKey: ["materials", user.uid] });
        }
      }
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  };

  const handleDelete = async (id: string) => {
    // Optimistic: remove from cache immediately for instant UI feedback
    queryClient.setQueryData<MaterialItem[]>(
      ["materials", user?.uid],
      (old) => (old || []).filter(m => m.id !== id)
    );
    try {
      await supabase.from("materials").delete().eq("id", id);
      toast.success("File deleted");
    } catch (error) {
      toast.error("Failed to delete file");
      queryClient.invalidateQueries({ queryKey: ["materials", user?.uid] });
    }
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredMaterials = (materials ?? []).filter((m) =>
    m.file_name.toLowerCase().includes(search.toLowerCase())
  );

  // Filter by file type tab
  const tabFilteredMaterials = filteredMaterials.filter((m) => {
    if (activeFileTab === "all") return true;
    if (activeFileTab === "pdf") return m.content_type?.includes("pdf") || m.file_name?.endsWith(".pdf");
    if (activeFileTab === "image") return m.content_type?.startsWith("image/");
    if (activeFileTab === "text") return m.content_type === "text/plain" || m.file_name?.endsWith(".txt") || m.file_name?.endsWith(".md");
    return true;
  });

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return "Unknown";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return "Unknown";
    }
  };

  const getFileTypeLabel = (material: any) => {
    if (material?.content_type?.includes("pdf")) return "PDF";
    if (material?.content_type?.startsWith("image/")) return "Image";
    if (material?.content_type === "text/plain" || material?.file_name?.endsWith(".txt")) return "Text";
    if (material?.file_name?.endsWith(".md")) return "Markdown";
    if (material?.file_name?.endsWith(".docx")) return "Word";
    return "File";
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.md,image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} aria-label="Upload study materials" />

      {/* ── TOP SECTION: Hero Banner + Stat Cards ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Purple Gradient Banner */}
        <div className="lg:col-span-3 bg-gradient-to-br from-[#29ABE2] to-[#29ABE2] rounded-2xl p-6 md:p-8 relative overflow-hidden min-h-[200px] flex flex-col justify-between">
          {/* Decorative elements */}
          <div className="absolute top-4 left-4 w-14 h-14 rounded-full border-2 border-dashed border-white/30 flex items-center justify-center">
            <BookOpenCheck className="h-6 w-6 text-white/80" />
          </div>
          <div className="absolute -bottom-6 -right-6 w-32 h-32 rounded-full bg-white/5" />
          <div className="absolute top-1/2 right-12 w-20 h-20 rounded-full bg-white/5" />

          <div className="mt-16 md:mt-12 space-y-2">
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Resource Library</h1>
            <p className="text-white/60 text-sm max-w-md leading-relaxed">
              Upload materials and start learning with your personalized AI assistant
            </p>
          </div>

          <div className="mt-6">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 bg-white text-[#29ABE2] font-semibold text-sm px-5 py-2.5 rounded-full hover:bg-white/90 transition-all shadow-lg shadow-[#29ABE2]/25 disabled:opacity-60"
            >
              <Upload className="h-4 w-4" />
              Upload Files
            </button>
          </div>
        </div>

        {/* Right column: 4 stat cards in 2x2 grid */}
        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
          {/* Total Files */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-[#29ABE2]/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-[#29ABE2]" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{materials?.length ?? 0}</div>
            <div className="text-xs text-gray-500 mt-0.5">Total Files</div>
          </div>

          {/* Collections */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <FolderOpen className="h-5 w-5 text-amber-500" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{savedNotes?.length ?? 0}</div>
            <div className="text-xs text-gray-500 mt-0.5">Collections</div>
          </div>

          {/* Storage */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-rose-50 flex items-center justify-center">
                <Database className="h-5 w-5 text-rose-500" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{formatSize(materials?.reduce((s, m) => s + (m.file_size ?? 0), 0) ?? 0)}</div>
            <div className="text-xs text-gray-500 mt-0.5">Storage</div>
            <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-500" style={{ width: `${Math.min(((materials?.reduce((s, m) => s + (m.file_size ?? 0), 0) ?? 0) / (50 * 1024 * 1024)) * 100, 100).toFixed(0)}%` }} />
            </div>
          </div>

          {/* AI Indexed */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-[#29ABE2]/10 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-[#29ABE2]" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{materials?.filter(m => m.processing_status === "completed" || m.processing_status === "ready").length ?? 0}</div>
            <div className="text-xs text-gray-500 mt-0.5">AI Indexed</div>
          </div>
        </div>
      </div>

      {/* ── SEARCH + VIEW CONTROLS ─────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Recent Materials</h2>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded-md transition-all ${viewMode === "grid" ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-600"}`}>
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setViewMode("list")} className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-600"}`}>
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              placeholder="Search files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 h-9 w-full sm:w-52 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#29ABE2]/20 focus:border-[#29ABE2]/40 transition-all"
            />
          </div>
        </div>
      </div>

      {/* ── FILE TYPE TABS ─────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: "all" as const, label: "All Files", count: filteredMaterials.length },
          { key: "pdf" as const, label: "PDFs", count: filteredMaterials.filter(m => m.content_type?.includes("pdf") || m.file_name?.endsWith(".pdf")).length },
          { key: "image" as const, label: "Images", count: filteredMaterials.filter(m => m.content_type?.startsWith("image/")).length },
          { key: "text" as const, label: "Text", count: filteredMaterials.filter(m => m.content_type === "text/plain" || m.file_name?.endsWith(".txt") || m.file_name?.endsWith(".md")).length },
          { key: "notes" as const, label: "Saved Notes", count: savedNotes?.length ?? 0 },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveFileTab(tab.key)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeFileTab === tab.key
                ? "bg-[#29ABE2] text-white shadow-md shadow-[#29ABE2]/20"
                : "bg-white text-gray-500 border border-gray-200 hover:text-gray-700 hover:border-[#29ABE2]/30"
            }`}
          >
            {tab.label}{tab.count > 0 && <span className="ml-1.5 opacity-80">({tab.count})</span>}
          </button>
        ))}
      </div>

      {/* ── MATERIALS GRID / LIST ──────────────────────────────── */}
      {isLoading ? (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
              <div className="h-44 bg-gray-100 animate-pulse" />
              <div className="p-4 space-y-2">
                <div className="h-4 w-3/4 bg-gray-100 animate-pulse rounded-lg" />
                <div className="h-3 w-1/2 bg-gray-100 animate-pulse rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : activeFileTab === "notes" ? (
        isNotesLoading ? (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
                <div className="h-4 w-32 bg-gray-100 animate-pulse rounded-lg" />
                <div className="h-16 bg-gray-100 animate-pulse rounded-lg" />
              </div>
            ))}
          </div>
        ) : !savedNotes || savedNotes.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl bg-white/50">
            <StickyNote className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-sm font-semibold text-gray-500">No saved notes found</p>
            <p className="text-xs text-gray-400 mt-1">Jot down quick notes while studying lessons to see them here.</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {savedNotes.map((n) => (
              <div key={n.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 relative group hover:shadow-md hover:border-[#29ABE2]/20 transition-all flex flex-col justify-between min-h-[180px]">
                {confirmDeleteId === n.id && (
                  <div className="absolute inset-0 z-20 bg-white/95 backdrop-blur-sm border border-red-200 rounded-2xl flex flex-col items-center justify-center gap-3 p-4 animate-in fade-in-0 zoom-in-95 duration-200">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                    <p className="text-xs font-medium text-gray-700 text-center">Delete note?</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)} className="text-xs h-7 rounded-lg">Cancel</Button>
                      <Button size="sm" onClick={() => { handleDeleteNote(n.id); setConfirmDeleteId(null); }} className="text-xs h-7 bg-red-500 text-white hover:bg-red-600 gap-1 rounded-lg">
                        <Trash2 className="h-3 w-3" /> Delete
                      </Button>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => setConfirmDeleteId(n.id)}
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all z-10"
                  title="Delete note"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold">
                    <StickyNote className="h-3.5 w-3.5 text-[#29ABE2]" />
                    <span>Saved Note</span>
                  </div>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap line-clamp-4 leading-relaxed">{n.text}</p>
                </div>
                <div className="space-y-1 pt-3 border-t border-gray-100 mt-auto">
                  <div className="text-[10px] text-gray-400 truncate" title={`${n.topic_title || 'Topic'} · ${n.lesson_title || 'Lesson'}`}>
                    {n.topic_id ? (
                      <Link to={`/lessons/${n.topic_id}`} className="text-[#29ABE2] hover:underline font-semibold">
                        {n.topic_title || 'Go to Lesson'}
                      </Link>
                    ) : (
                      <span>{n.topic_title || 'General'}</span>
                    )}
                    <span className="opacity-60"> · {n.lesson_title || 'Lesson'}</span>
                  </div>
                  <div className="text-[9px] text-gray-400 flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" /> {new Date(n.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="hidden md:grid grid-cols-[1fr_200px_100px_40px] gap-3 px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              <span>Note Content</span>
              <span>From Course/Lesson</span>
              <span>Date</span>
              <span></span>
            </div>
            {savedNotes.map((n) => (
              <div key={n.id} className="flex items-center gap-4 bg-white border border-gray-100 rounded-2xl p-4 hover:shadow-md hover:border-[#29ABE2]/20 transition-all group relative">
                {confirmDeleteId === n.id && (
                  <div className="absolute inset-0 z-20 bg-white/95 backdrop-blur-sm border border-red-200 rounded-2xl flex items-center justify-center gap-3 p-4 animate-in fade-in-0 zoom-in-95 duration-200">
                    <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    <p className="text-xs font-medium text-gray-700">Delete note?</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)} className="text-xs h-7 rounded-lg">Cancel</Button>
                      <Button size="sm" onClick={() => { handleDeleteNote(n.id); setConfirmDeleteId(null); }} className="text-xs h-7 bg-red-500 text-white hover:bg-red-600 gap-1 rounded-lg">
                        <Trash2 className="h-3 w-3" /> Delete
                      </Button>
                    </div>
                  </div>
                )}
                <StickyNote className="h-5 w-5 text-[#29ABE2] flex-shrink-0" />
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{n.text}</p>
                </div>
                <div className="w-[200px] text-xs text-gray-500 truncate">
                  {n.topic_id ? (
                    <Link to={`/lessons/${n.topic_id}`} className="text-[#29ABE2] hover:underline font-semibold block truncate">
                      {n.topic_title || 'Go to Course'}
                    </Link>
                  ) : (
                    <span className="block truncate font-semibold">{n.topic_title || 'General'}</span>
                  )}
                  <span className="text-[10px] opacity-75 truncate block">{n.lesson_title || 'Lesson'}</span>
                </div>
                <div className="w-[100px] text-xs text-gray-400">
                  {new Date(n.created_at).toLocaleDateString()}
                </div>
                <button
                  onClick={() => setConfirmDeleteId(n.id)}
                  className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all z-10"
                  title="Delete note"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )
      ) : tabFilteredMaterials.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl bg-white/50">
          <FolderOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-sm font-semibold text-gray-500">
            {filteredMaterials.length === 0 ? "No files uploaded yet" : `No ${activeFileTab} files found`}
          </p>
          <p className="text-xs text-gray-400 mt-1">Upload your study materials to get started</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-5 inline-flex items-center gap-2 bg-[#29ABE2] text-white font-semibold text-sm px-5 py-2.5 rounded-full hover:bg-[#29ABE2] transition-all shadow-md shadow-[#29ABE2]/20"
          >
            <Upload className="h-4 w-4" /> Upload File
          </button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* Add New Material Card */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="bg-white border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-[#29ABE2]/40 hover:bg-[#29ABE2]/[0.02] transition-all min-h-[310px] group"
          >
            <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center group-hover:bg-[#29ABE2]/10 transition-colors">
              <Plus className="h-7 w-7 text-gray-400 group-hover:text-[#29ABE2] transition-colors" />
            </div>
            <span className="text-sm font-semibold text-gray-400 group-hover:text-[#29ABE2] transition-colors">Add New Material</span>
            <span className="text-[11px] text-gray-400">PDF, TXT, Images</span>
          </div>

          {/* Material Cards */}
          {tabFilteredMaterials.map((f) => (
            <div key={f.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative group hover:shadow-lg hover:border-[#29ABE2]/20 transition-all">
              {/* Delete confirmation overlay */}
              {confirmDeleteId === f.id && (
                <div className="absolute inset-0 z-20 bg-white/95 backdrop-blur-sm border border-red-200 rounded-2xl flex flex-col items-center justify-center gap-3 p-4 animate-in fade-in-0 zoom-in-95 duration-200">
                  <AlertTriangle className="h-6 w-6 text-red-500" />
                  <p className="text-xs font-medium text-gray-700 text-center">Delete "{f.file_name}"?</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)} className="text-xs h-7 rounded-lg">Cancel</Button>
                    <Button size="sm" onClick={() => { handleDelete(f.id); setConfirmDeleteId(null); }} className="text-xs h-7 bg-red-500 text-white hover:bg-red-600 gap-1 rounded-lg">
                      <Trash2 className="h-3 w-3" /> Delete
                    </Button>
                  </div>
                </div>
              )}

              {/* Delete button (hover reveal) */}
              <button
                onClick={() => setConfirmDeleteId(f.id)}
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/40 text-white/70 opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all z-10"
                title="Delete file"
                aria-label={`Delete ${f.file_name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>

              {/* Dark Thumbnail Area */}
              <div className="h-44 bg-[#0F172A] relative overflow-hidden">
                {/* Gradient decorative overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#29ABE2]/20 via-transparent to-[#29ABE2]/10" />
                <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-[#0F172A] to-transparent" />

                {/* Image preview or file icon */}
                {f.content_type?.startsWith("image/") && f.file_data ? (
                  <img src={f.file_data} alt={f.file_name} className="h-full w-full object-cover opacity-60" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <FileText className="h-12 w-12 text-white/10" />
                  </div>
                )}

                {/* File type badge */}
                <div className="absolute top-3 left-3">
                  <span className="bg-[#29ABE2]/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wide">
                    {getFileTypeLabel(f)} Document
                  </span>
                </div>
              </div>

              {/* Card content below thumbnail */}
              <div className="p-4 space-y-2">
                {/* Title */}
                <h3 className="text-sm font-semibold text-gray-900 truncate" title={f.file_name}>
                  {f.file_name}
                </h3>

                {/* Meta info */}
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                  <Clock className="h-3 w-3" />
                  <span>{formatDate(f.uploaded_at)}</span>
                  <span className="text-gray-300">•</span>
                  <span>{formatSize(f.file_size)}</span>
                </div>

                {/* AI status + Learn button */}
                <div className="flex items-center justify-between pt-1">
                  {(f.processing_status === "ready" || f.processing_status === "completed") ? (
                    <div className="flex items-center gap-1 text-[11px] text-[#29ABE2] font-medium">
                      <Sparkles className="h-3 w-3" />
                      <span>AI Summary Available</span>
                    </div>
                  ) : (
                    <span className="text-[10px] font-semibold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full uppercase">{f.processing_status}</span>
                  )}
                  {(f.processing_status === "ready" || f.processing_status === "completed") && (
                    <Link to={`/materials/learn/${f.id}`}>
                      <button className="text-[11px] font-semibold text-[#29ABE2] hover:text-[#29ABE2] flex items-center gap-1 transition-colors">
                        Learn <ArrowRight className="h-3 w-3" />
                      </button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── List View ── */
        <div className="space-y-2">
          {/* List header */}
          <div className="hidden md:grid grid-cols-[1fr_100px_100px_80px_120px_80px] gap-3 px-5 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            <span>File Name</span>
            <span>Type</span>
            <span>Size</span>
            <span>Date</span>
            <span>Status</span>
            <span></span>
          </div>
          {tabFilteredMaterials.map((f) => (
            <div key={f.id} className="flex items-center gap-4 bg-white border border-gray-100 rounded-2xl p-4 hover:shadow-md hover:border-[#29ABE2]/20 transition-all group relative">
              {/* Delete confirmation overlay for list view */}
              {confirmDeleteId === f.id && (
                <div className="absolute inset-0 z-20 bg-white/95 backdrop-blur-sm border border-red-200 rounded-2xl flex items-center justify-center gap-3 p-4 animate-in fade-in-0 zoom-in-95 duration-200">
                  <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                  <p className="text-xs font-medium text-gray-700">Delete "{f.file_name}"?</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)} className="text-xs h-7 rounded-lg">Cancel</Button>
                    <Button size="sm" onClick={() => { handleDelete(f.id); setConfirmDeleteId(null); }} className="text-xs h-7 bg-red-500 text-white hover:bg-red-600 gap-1 rounded-lg">
                      <Trash2 className="h-3 w-3" /> Delete
                    </Button>
                  </div>
                </div>
              )}

              {/* File icon */}
              <div className="h-10 w-10 rounded-xl bg-[#0F172A] flex items-center justify-center flex-shrink-0">
                {f.content_type?.startsWith("image/") && f.file_data ? (
                  <img src={f.file_data} alt={f.file_name} className="h-full w-full object-cover rounded-xl" />
                ) : (
                  <FileText className="h-5 w-5 text-white/40" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">{f.file_name}</div>
                <div className="text-[10px] text-gray-400 flex items-center gap-2 mt-0.5">
                  <span className="font-bold text-[#29ABE2] bg-[#29ABE2]/10 px-1.5 py-0.5 rounded">{getFileTypeLabel(f)}</span>
                  <span>{formatSize(f.file_size)}</span>
                  <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" /> {formatDate(f.uploaded_at)}</span>
                </div>
              </div>

              {(f.processing_status === "ready" || f.processing_status === "completed") ? (
                <div className="flex items-center gap-1 text-[11px] text-[#29ABE2] font-medium">
                  <Sparkles className="h-3 w-3" /> AI Ready
                </div>
              ) : (
                <span className="text-[10px] font-semibold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full uppercase">{f.processing_status}</span>
              )}

              {(f.processing_status === "ready" || f.processing_status === "completed") && (
                <Link to={`/materials/learn/${f.id}`}>
                  <button className="text-xs font-semibold text-[#29ABE2] hover:text-[#29ABE2] flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#29ABE2]/20 hover:bg-[#29ABE2]/5 transition-all">
                    Learn <ArrowRight className="h-3 w-3" />
                  </button>
                </Link>
              )}

              <button
                onClick={() => setConfirmDeleteId(f.id)}
                className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                title="Delete file"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── NDLI Digital Library Search ────────────────────────── */}
      <NDLISearch />

      {/* Upload progress indicator */}
      {uploading && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 p-4 shadow-xl shadow-gray-200/50 flex items-center gap-3 z-50 rounded-2xl">
          <div className="h-8 w-8 rounded-xl bg-[#29ABE2]/10 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-[#29ABE2]" />
          </div>
          <span className="text-sm font-medium text-gray-700">{uploadProgress || "Processing file..."}</span>
        </div>
      )}
    </div>
  );
};

// ── NDLI / Open Library Search Component ──────────────────────────
interface NDLIItem {
  id: string;
  title: string;
  author: string;
  type: string;
  description: string;
  thumbnail: string | null;
  url: string;
  readUrl: string | null;
  year: string | null;
  subject: string | null;
  language: string;
  pages: number | null;
  editions: number;
  publisher: string | null;
  hasFullText: boolean;
}

interface NDLILinks {
  schoolSearch: string;
  higherEdSearch: string;
  researchSearch: string;
}

const NDLISearch = () => {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | "ebook" | "notebook">("all");
  const [results, setResults] = useState<NDLIItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [ndliLinks, setNdliLinks] = useState<NDLILinks | null>(null);
  const [fallbackMsg, setFallbackMsg] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim() || query.trim().length < 2) return;
    setLoading(true);
    setSearched(true);
    setFallbackMsg(null);

    try {
      const resp = await fetch(`/api/ndli?q=${encodeURIComponent(query.trim())}&type=${type}&page=1`, {
        headers: await getAuthHeaders(),
      });
      const data = await resp.json();

      setResults(data.items || []);
      setNdliLinks(data.ndliLinks || null);
      if (data.fallback) {
        setFallbackMsg(data.message || "Search temporarily unavailable.");
      }
    } catch {
      setResults([]);
      setFallbackMsg("Search failed. Please try again.");
      setNdliLinks({
        schoolSearch: `https://ndl.iitkgp.ac.in/se_search?q=${encodeURIComponent(query.trim())}`,
        higherEdSearch: `https://ndl.iitkgp.ac.in/he_search?q=${encodeURIComponent(query.trim())}`,
        researchSearch: `https://ndl.iitkgp.ac.in/re_search?q=${encodeURIComponent(query.trim())}`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 md:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Library className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Digital Library</h2>
          <p className="text-xs text-muted-foreground">Search eBooks from Open Library & NDLI — read free books to learn new things</p>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search eBooks, textbooks, journals…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-10 h-10"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "ebook"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border whitespace-nowrap transition-colors capitalize ${type === t
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-foreground hover:border-primary/40"
                }`}
            >
              {t === "all" ? "All Books" : "Free eBooks"}
            </button>
          ))}
          <Button onClick={handleSearch} disabled={loading || !query.trim()} className="gap-2 flex-shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </Button>
        </div>
      </div>

      {/* Results */}
      {searched && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : results.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground">{results.length} books found</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {results.map((item) => (
                  <div
                    key={item.id}
                    className="bg-muted/30 border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-sm transition-all group flex gap-3"
                  >
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt="" className="h-20 w-14 rounded object-cover flex-shrink-0 bg-muted shadow-sm" />
                    ) : (
                      <div className="h-20 w-14 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <BookOpenCheck className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">{item.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.author}{item.year ? ` · ${item.year}` : ""}
                      </div>
                      {item.subject && <div className="text-[10px] text-muted-foreground line-clamp-1">{item.subject}</div>}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${item.hasFullText
                          ? "bg-green-500/10 text-green-600"
                          : "bg-muted text-muted-foreground"
                          }`}>
                          {item.type}
                        </span>
                        {item.pages && (
                          <span className="text-[10px] text-muted-foreground">{item.pages} pages</span>
                        )}
                        {item.editions > 1 && (
                          <span className="text-[10px] text-muted-foreground">{item.editions} editions</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        {item.hasFullText && item.readUrl ? (
                          <a href={item.readUrl} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" className="h-7 text-[11px] gap-1 bg-green-600 hover:bg-green-700 text-white">
                              <BookOpenCheck className="h-3 w-3" /> Read Free
                            </Button>
                          </a>
                        ) : null}
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" /> Details
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <Library className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-sm text-muted-foreground">No results found for "{query}"</p>
            </div>
          )}

          {/* Fallback message */}
          {fallbackMsg && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 text-sm text-amber-600">
              {fallbackMsg}
            </div>
          )}

          {/* NDLI Supplementary Links */}
          {ndliLinks && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3">
              <div>
                <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Library className="h-4 w-4 text-primary" />
                  Also search on NDLI (National Digital Library of India)
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Access Indian academic resources, textbooks, and research papers
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={ndliLinks.schoolSearch} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-2 text-xs h-8">
                    <ExternalLink className="h-3 w-3" /> School Education
                  </Button>
                </a>
                <a href={ndliLinks.higherEdSearch} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-2 text-xs h-8">
                    <ExternalLink className="h-3 w-3" /> Higher Education
                  </Button>
                </a>
                <a href={ndliLinks.researchSearch} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-2 text-xs h-8">
                    <ExternalLink className="h-3 w-3" /> Research Papers
                  </Button>
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MaterialUpload;