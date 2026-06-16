import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, Type, Minimize2, Maximize2, Copy, Check, X, Loader2 } from "lucide-react";
import { aiComplete } from "@/lib/aiService";
import { toast } from "sonner";

interface Position {
  top: number;
  left: number;
}

const ACTIONS = [
  { key: "enhance", label: "Enhance", icon: Sparkles, prompt: "Rewrite the following text to be more clear, well-structured, and professional. Keep the original meaning intact but improve grammar, flow, and vocabulary. Return ONLY the improved text, no commentary:\n\n" },
  { key: "simplify", label: "Simplify", icon: Minimize2, prompt: "Simplify the following text to be easy to understand for a student. Use simpler words and shorter sentences. Return ONLY the simplified text:\n\n" },
  { key: "expand", label: "Expand", icon: Maximize2, prompt: "Expand the following text with more detail, examples, and explanation. Keep the same topic but make it more comprehensive. Return ONLY the expanded text:\n\n" },
  { key: "summarize", label: "Summarize", icon: Type, prompt: "Summarize the following text into 1-2 concise sentences capturing the key points. Return ONLY the summary:\n\n" },
] as const;

const SnapEnhance = () => {
  const [selectedText, setSelectedText] = useState("");
  const [position, setPosition] = useState<Position | null>(null);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const handleSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() || "";

    if (text.length < 10) {
      if (!loading && !result) {
        setSelectedText("");
        setPosition(null);
      }
      return;
    }

    const range = selection?.getRangeAt(0);
    if (!range) return;

    const rect = range.getBoundingClientRect();
    setSelectedText(text);
    setPosition({
      top: rect.top + window.scrollY - 50,
      left: rect.left + window.scrollX + rect.width / 2,
    });
    setResult("");
  }, [loading, result]);

  useEffect(() => {
    document.addEventListener("mouseup", handleSelection);
    document.addEventListener("keyup", handleSelection);
    return () => {
      document.removeEventListener("mouseup", handleSelection);
      document.removeEventListener("keyup", handleSelection);
    };
  }, [handleSelection]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        if (!loading) {
          setPosition(null);
          setResult("");
          setSelectedText("");
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [loading]);

  const handleAction = async (actionKey: string) => {
    const action = ACTIONS.find((a) => a.key === actionKey);
    if (!action || !selectedText) return;

    setLoading(true);
    setResult("");
    try {
      const response = await aiComplete({
        messages: [{ role: "user", content: action.prompt + selectedText }],
        temperature: 0.5,
        maxTokens: 1024,
      });
      setResult(response);
    } catch (e: any) {
      toast.error(e.message || "Failed to process text");
      setResult("");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard");
  };

  const handleClose = () => {
    setPosition(null);
    setResult("");
    setSelectedText("");
    setLoading(false);
  };

  if (!position || !selectedText) return null;

  return (
    <div
      ref={toolbarRef}
      className="fixed z-[9999] animate-in fade-in zoom-in-95 duration-150"
      style={{
        top: `${position.top}px`,
        left: `${Math.min(Math.max(position.left - 140, 16), window.innerWidth - 296)}px`,
      }}
    >
      {/* Toolbar */}
      <div className="bg-[#0F172A] rounded-xl shadow-2xl shadow-black/30 border border-white/10 p-1.5 flex items-center gap-1">
        {ACTIONS.map((action) => (
          <button
            key={action.key}
            onClick={() => handleAction(action.key)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-all disabled:opacity-40"
            title={action.label}
          >
            <action.icon className="h-3 w-3" />
            {action.label}
          </button>
        ))}
        <button
          onClick={handleClose}
          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 ml-0.5"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Result panel */}
      {(loading || result) && (
        <div className="mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 max-w-[320px] animate-in fade-in slide-in-from-top-1 duration-200">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                {result}
              </p>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#29ABE2] text-white text-xs font-semibold hover:bg-[#1E96CC] transition-colors"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={handleClose}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SnapEnhance;
