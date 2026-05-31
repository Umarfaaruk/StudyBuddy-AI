import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Send, Paperclip, X, FileText, Mic, Trash2, Wrench, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, "application/pdf", "text/plain"];

const DoubtInput = () => {
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      window.SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;

    recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setQuestion((prev) => (prev ? `${prev} ${transcript}` : transcript));
      setIsListening(false);
    };

    recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
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

  const handleSubmit = () => {
    if (!question.trim() && !attachedFile) return;

    if (attachedFile && ALLOWED_IMAGE_TYPES.includes(attachedFile.type) && filePreview) {
      navigate("/doubts/camera", {
        state: { preloadedImage: filePreview, preloadedQuestion: question.trim() },
      });
      return;
    }

    if (question.trim()) {
      let fullQuestion = question.trim();
      if (attachedFile?.type === "application/pdf") {
        fullQuestion = `[Attached file: ${attachedFile.name}]\n\n${fullQuestion}`;
      }
      navigate("/doubts/solution", { state: { question: fullQuestion } });
    }
  };

  const handleClearChat = () => {
    setQuestion("");
    clearAttachment();
  };

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-24px)] bg-background rounded-3xl overflow-hidden shadow-sm border border-border font-sans">
      <div className="flex items-center justify-between px-6 md:px-8 pt-6 pb-3 border-b border-divider bg-card/80">
        <div>
          <h1 className="text-base font-bold text-foreground tracking-tight">Ask Doubt</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Get step-by-step help from EduOnx AI</p>
        </div>
        <button
          type="button"
          onClick={handleClearChat}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>

      <Link
        to="/tools"
        className="mx-6 md:mx-8 mt-4 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 hover:bg-primary/10 transition-colors"
      >
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Wrench className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">YouTube Summarizer & Concept Explorer</p>
          <p className="text-xs text-muted-foreground">Available in Quick Tools — not duplicated here</p>
        </div>
        <Sparkles className="h-4 w-4 text-primary shrink-0" />
      </Link>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 space-y-6 scrollbar-thin py-6">
        <div className="flex items-start gap-4 max-w-2xl mx-auto w-full">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cta to-cta/80 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="pt-0.5 space-y-1">
            <div className="text-[11px] font-bold text-cta uppercase tracking-widest">AI Tutor</div>
            <div className="text-xl font-bold text-foreground tracking-tight leading-tight">
              How can I help you today?
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto w-full pl-14">
          <p className="text-sm text-muted-foreground leading-relaxed glass-card p-4 rounded-2xl">
            Type your question below, attach an image or PDF, or use voice input. For YouTube summaries and concept maps, open{" "}
            <Link to="/tools" className="text-primary font-medium hover:underline">Quick Tools</Link>.
          </p>
        </div>
      </div>

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
            type="text"
            placeholder="Ask me anything…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && (question.trim() || attachedFile)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground outline-none py-1.5"
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
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!question.trim() && !attachedFile}
              className="h-9 w-9 ml-1 rounded-full bg-foreground text-background flex items-center justify-center hover:bg-foreground/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              <Send className="h-3.5 w-3.5 -ml-0.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoubtInput;
