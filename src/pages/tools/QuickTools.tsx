import { useState, useEffect, useRef, useCallback } from "react";
import {
  Timer, StickyNote, Calculator, ArrowLeftRight, FileText, Focus,
  Play, Pause, RotateCcw, Plus, Trash2, ChevronDown, ChevronUp, Wrench,
  Youtube, BookOpen, HelpCircle, Clock, Headphones, MessageSquare, Copy, Loader2, X, Send, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { aiComplete } from "@/lib/aiService";
import ReactMarkdown from "react-markdown";

// ── Pomodoro Timer Component ─────────────────────────────────────
const PomodoroTimer = () => {
  const [mode, setMode] = useState<"focus" | "break">("focus");
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const focusDuration = 25 * 60;
  const breakDuration = 5 * 60;

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    } else if (timeLeft === 0) {
      if (mode === "focus") {
        setSessions((s) => s + 1);
        toast.success("Focus session complete! Take a break 🎉");
        setMode("break");
        setTimeLeft(breakDuration);
      } else {
        toast.success("Break over — time to focus! 🧠");
        setMode("focus");
        setTimeLeft(focusDuration);
      }
      setIsRunning(false);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, timeLeft, mode]);

  const reset = () => {
    setIsRunning(false);
    setMode("focus");
    setTimeLeft(focusDuration);
  };

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const pct = mode === "focus" ? ((focusDuration - timeLeft) / focusDuration) * 100 : ((breakDuration - timeLeft) / breakDuration) * 100;

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <Timer className="h-5 w-5 text-primary" /> Pomodoro Timer
        </h3>
        <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${mode === "focus" ? "bg-primary/10 text-primary" : "bg-success/10 text-success"}`}>
          {mode === "focus" ? "Focus" : "Break"}
        </span>
      </div>

      {/* Circular progress */}
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-40 w-40">
          <svg className="h-40 w-40 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
            <circle cx="50" cy="50" r="44" fill="none" stroke={mode === "focus" ? "hsl(var(--primary))" : "hsl(var(--success))"} strokeWidth="6"
              strokeDasharray={`${2 * Math.PI * 44}`} strokeDashoffset={`${2 * Math.PI * 44 * (1 - pct / 100)}`}
              strokeLinecap="round" className="transition-all duration-1000" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-foreground tabular-nums">
              {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
            </span>
            <span className="text-xs text-muted-foreground">{sessions} sessions</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => setIsRunning(!isRunning)} size="sm" className="gap-2">
            {isRunning ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> {timeLeft === focusDuration || timeLeft === breakDuration ? "Start" : "Resume"}</>}
          </Button>
          <Button onClick={reset} variant="outline" size="sm" className="gap-2">
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
        </div>
      </div>
    </div>
  );
};

// ── Quick Notes Component ────────────────────────────────────────
const QuickNotes = () => {
  const [notes, setNotes] = useState<{ id: string; text: string; createdAt: number }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("eduonx_quick_notes") || "[]");
    } catch { return []; }
  });
  const [newNote, setNewNote] = useState("");

  const saveNotes = useCallback((n: typeof notes) => {
    setNotes(n);
    localStorage.setItem("eduonx_quick_notes", JSON.stringify(n));
  }, []);

  const addNote = () => {
    if (!newNote.trim()) return;
    const updated = [{ id: Date.now().toString(), text: newNote.trim(), createdAt: Date.now() }, ...notes];
    saveNotes(updated);
    setNewNote("");
    toast.success("Note saved!");
  };

  const deleteNote = (id: string) => {
    saveNotes(notes.filter((n) => n.id !== id));
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <h3 className="font-bold text-foreground flex items-center gap-2">
        <StickyNote className="h-5 w-5 text-cta" /> Quick Notes
      </h3>
      <div className="flex gap-2">
        <Textarea placeholder="Jot down a quick note..." value={newNote} onChange={(e) => setNewNote(e.target.value)}
          className="min-h-[60px] resize-none text-sm" onKeyDown={(e) => e.key === "Enter" && e.ctrlKey && addNote()} />
      </div>
      <Button onClick={addNote} size="sm" disabled={!newNote.trim()} className="gap-2 w-full">
        <Plus className="h-4 w-4" /> Add Note
      </Button>
      <div className="space-y-2 max-h-[250px] overflow-y-auto">
        {notes.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No notes yet. Start jotting!</p>
        ) : notes.map((n) => (
          <div key={n.id} className="bg-muted/50 rounded-lg px-3 py-2 flex items-start gap-2 group">
            <p className="text-sm text-foreground flex-1 whitespace-pre-wrap">{n.text}</p>
            <button onClick={() => deleteNote(n.id)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Calculator Component ─────────────────────────────────────────
const CalcTool = () => {
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const calculate = () => {
    try {
      // Safe eval alternative using Function constructor
      const sanitized = expression.replace(/[^-()\d/*+.^%\s]/g, '');
      const fn = new Function(`return ${sanitized}`);
      const res = fn();
      setResult(String(res));
    } catch {
      setResult("Error");
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <h3 className="font-bold text-foreground flex items-center gap-2">
        <Calculator className="h-5 w-5 text-success" /> Calculator
      </h3>
      <div className="space-y-3">
        <Input placeholder="e.g. (25 * 4) + 100" value={expression} onChange={(e) => setExpression(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && calculate()} className="font-mono text-sm h-11" />
        <Button onClick={calculate} size="sm" className="w-full gap-2" disabled={!expression.trim()}>
          Calculate
        </Button>
        {result !== null && (
          <div className="bg-muted/50 rounded-lg px-4 py-3 text-center">
            <span className="text-xs text-muted-foreground">Result</span>
            <div className="text-2xl font-bold text-foreground font-mono">{result}</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Unit Converter Component ─────────────────────────────────────
const UnitConverter = () => {
  const [value, setValue] = useState("");
  const [category, setCategory] = useState("length");
  const [fromUnit, setFromUnit] = useState("");
  const [toUnit, setToUnit] = useState("");

  const conversions: Record<string, Record<string, number>> = {
    length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, ft: 0.3048, in: 0.0254 },
    weight: { kg: 1, g: 0.001, mg: 0.000001, lb: 0.453592, oz: 0.0283495, ton: 1000 },
    temperature: { C: 1, F: 1, K: 1 }, // Special handling
    volume: { L: 1, mL: 0.001, gal: 3.78541, qt: 0.946353, cup: 0.236588 },
  };

  const units = Object.keys(conversions[category] || {});
  useEffect(() => {
    setFromUnit(units[0] || ""); setToUnit(units[1] || "");
  }, [category]);

  const convert = (): string => {
    const val = parseFloat(value);
    if (isNaN(val) || !fromUnit || !toUnit) return "—";

    if (category === "temperature") {
      if (fromUnit === toUnit) return val.toFixed(2);
      if (fromUnit === "C" && toUnit === "F") return ((val * 9/5) + 32).toFixed(2);
      if (fromUnit === "F" && toUnit === "C") return ((val - 32) * 5/9).toFixed(2);
      if (fromUnit === "C" && toUnit === "K") return (val + 273.15).toFixed(2);
      if (fromUnit === "K" && toUnit === "C") return (val - 273.15).toFixed(2);
      if (fromUnit === "F" && toUnit === "K") return (((val - 32) * 5/9) + 273.15).toFixed(2);
      if (fromUnit === "K" && toUnit === "F") return (((val - 273.15) * 9/5) + 32).toFixed(2);
    }

    const base = val * (conversions[category]?.[fromUnit] ?? 1);
    return (base / (conversions[category]?.[toUnit] ?? 1)).toFixed(4);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <h3 className="font-bold text-foreground flex items-center gap-2">
        <ArrowLeftRight className="h-5 w-5 text-accent" /> Unit Converter
      </h3>
      <div className="flex flex-wrap gap-2 mb-2">
        {Object.keys(conversions).map((cat) => (
          <button key={cat} onClick={() => setCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${
              category === cat ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground hover:border-primary/40"
            }`}
          >{cat}</button>
        ))}
      </div>
      <Input type="number" placeholder="Enter value" value={value} onChange={(e) => setValue(e.target.value)} className="h-10 font-mono" />
      <div className="grid grid-cols-2 gap-2">
        <select value={fromUnit} onChange={(e) => setFromUnit(e.target.value)}
          className="h-10 rounded-lg border border-border bg-card text-foreground text-sm px-3">
          {units.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={toUnit} onChange={(e) => setToUnit(e.target.value)}
          className="h-10 rounded-lg border border-border bg-card text-foreground text-sm px-3">
          {units.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      {value && (
        <div className="bg-muted/50 rounded-lg px-4 py-3 text-center">
          <span className="text-xs text-muted-foreground">Result</span>
          <div className="text-xl font-bold text-foreground font-mono">{convert()} {toUnit}</div>
        </div>
      )}
    </div>
  );
};

// ── Formula Sheet Component ──────────────────────────────────────
const FormulaSheet = () => {
  const [expanded, setExpanded] = useState<string | null>(null);

  const formulas: Record<string, { formula: string; desc: string }[]> = {
    "Physics": [
      { formula: "v = u + at", desc: "Final velocity" },
      { formula: "s = ut + ½at²", desc: "Displacement" },
      { formula: "F = ma", desc: "Newton's second law" },
      { formula: "E = mc²", desc: "Mass-energy equivalence" },
      { formula: "P = W/t", desc: "Power" },
      { formula: "KE = ½mv²", desc: "Kinetic energy" },
    ],
    "Mathematics": [
      { formula: "x = (-b ± √(b²-4ac)) / 2a", desc: "Quadratic formula" },
      { formula: "A = πr²", desc: "Circle area" },
      { formula: "sin²θ + cos²θ = 1", desc: "Pythagorean identity" },
      { formula: "d/dx [xⁿ] = nxⁿ⁻¹", desc: "Power rule" },
      { formula: "∫xⁿ dx = xⁿ⁺¹/(n+1) + C", desc: "Power integral" },
    ],
    "Chemistry": [
      { formula: "PV = nRT", desc: "Ideal gas law" },
      { formula: "pH = -log[H⁺]", desc: "pH formula" },
      { formula: "Molarity = moles/L", desc: "Concentration" },
      { formula: "ΔG = ΔH - TΔS", desc: "Gibbs free energy" },
    ],
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <h3 className="font-bold text-foreground flex items-center gap-2">
        <FileText className="h-5 w-5 text-destructive" /> Formula Sheet
      </h3>
      <div className="space-y-2">
        {Object.entries(formulas).map(([subject, list]) => (
          <div key={subject} className="border border-border rounded-lg overflow-hidden">
            <button onClick={() => setExpanded(expanded === subject ? null : subject)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors"
            >
              {subject}
              {expanded === subject ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {expanded === subject && (
              <div className="px-4 pb-3 space-y-2">
                {list.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 bg-muted/30 rounded-lg px-3 py-2">
                    <code className="text-sm font-mono text-primary flex-1">{f.formula}</code>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{f.desc}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Focus Mode Toggle Component ──────────────────────────────────
const FocusModeWidget = () => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className={`rounded-xl p-6 space-y-4 border transition-all ${
      isFocused ? "bg-primary/5 border-primary/30" : "bg-card border-border"
    }`}>
      <h3 className="font-bold text-foreground flex items-center gap-2">
        <Focus className="h-5 w-5 text-primary" /> Focus Mode
      </h3>
      <p className="text-sm text-muted-foreground">
        {isFocused ? "Focus mode is active. Distractions minimized. Stay on track! 🎯" : "Activate focus mode to minimize distractions and stay productive."}
      </p>
      <Button onClick={() => { setIsFocused(!isFocused); toast(isFocused ? "Focus mode deactivated" : "Focus mode activated! 🧠"); }}
        className={`w-full gap-2 ${isFocused ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}`}
        variant={isFocused ? "default" : "outline"}
      >
        <Focus className="h-4 w-4" /> {isFocused ? "Exit Focus Mode" : "Enter Focus Mode"}
      </Button>
      {isFocused && (
        <div className="text-xs text-primary font-medium text-center animate-pulse">
          ✨ Stay focused. You've got this!
        </div>
      )}
    </div>
  );
};

// ── Video Notebook Workspace (NotebookLM) Component ────────────────
const VideoNotebookWorkspace = () => {
  const [workspaceUrl, setWorkspaceUrl] = useState("");
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [workspaceVideoData, setWorkspaceVideoData] = useState<{
    id: string;
    title: string;
    channel: string;
    transcript: string;
  } | null>(null);
  const [activeNotebookTool, setActiveNotebookTool] = useState<"briefing" | "study" | "faq" | "timeline" | "podcast" | "chat">("briefing");
  const [notebookOutputs, setNotebookOutputs] = useState<Record<string, string>>({});
  const [generatingTool, setGeneratingTool] = useState<string | null>(null);
  const [notebookChatInput, setNotebookChatInput] = useState("");
  const [notebookChatMessages, setNotebookChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [isNotebookChatSending, setIsNotebookChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const extractYouTubeId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  };

  const handleLoadVideo = async () => {
    const videoId = extractYouTubeId(workspaceUrl);
    if (!videoId) {
      toast.error("Please enter a valid YouTube URL");
      return;
    }

    setIsWorkspaceLoading(true);
    setWorkspaceVideoData(null);
    setNotebookOutputs({});
    setNotebookChatMessages([]);
    try {
      const resp = await fetch(`/api/youtube-transcript?v=${videoId}`);
      if (!resp.ok) {
        throw new Error("Failed to retrieve video transcript");
      }
      const data = await resp.json();
      if (!data.transcript) {
        throw new Error("No transcript or subtitle available for this video");
      }

      setWorkspaceVideoData({
        id: videoId,
        title: data.title || "YouTube Video",
        channel: data.channel || "Unknown Channel",
        transcript: data.transcript
      });
      toast.success("Video workspace loaded successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to load video context");
    } finally {
      setIsWorkspaceLoading(false);
    }
  };

  const generateToolOutput = async (tool: typeof activeNotebookTool) => {
    if (!workspaceVideoData) return;
    if (notebookOutputs[tool]) return; // Already generated

    setGeneratingTool(tool);
    try {
      let prompt = "";
      if (tool === "briefing") {
        prompt = `You are an expert educational researcher. Create a comprehensive "Briefing Document" based on this video transcript.
Summarize the core thesis, outline the key takeaways, and compile a structured, high-level summary of all main ideas.
Format with markdown headers (##), bold text, and brief bullet points. Ensure it is factually aligned with the video transcript.

Video Title: "${workspaceVideoData.title}"
Transcript:
${workspaceVideoData.transcript.substring(0, 15000)}`;
      } else if (tool === "study") {
        prompt = `You are a master teacher. Generate a complete "Study Guide" based on the video transcript.
It must contain:
1. Key Definitions & Concepts (with detailed explanations)
2. 3-5 Essay or Short-Answer Prompts to test comprehension
3. A concluding summary of the intellectual significance of the topic.
Format with clean markdown headings (##) and bold text. Ensure all generated information aligns with the transcript.

Video Title: "${workspaceVideoData.title}"
Transcript:
${workspaceVideoData.transcript.substring(0, 15000)}`;
      } else if (tool === "faq") {
        prompt = `You are an academic advisor. Analyze the video transcript and generate a list of 5-8 Frequently Asked Questions (FAQ) that a student would ask, followed by clear, thorough, and highly accurate answers based strictly on the transcript. Format as markdown.

Video Title: "${workspaceVideoData.title}"
Transcript:
${workspaceVideoData.transcript.substring(0, 15000)}`;
      } else if (tool === "timeline") {
        prompt = `You are a historian and structure planner. Outline a chronological timeline of topics discussed in the video transcript. Group ideas by time periods or logical sequence. Highlight key milestones, transitions, or narrative arcs in the explanation. Format as markdown.

Video Title: "${workspaceVideoData.title}"
Transcript:
${workspaceVideoData.transcript.substring(0, 15000)}`;
      } else if (tool === "podcast") {
        prompt = `You are a professional audio scriptwriter. Create a lively, engaging dialogue script between two podcast hosts (named Alex and Robin) who are discussing and explaining the main points of this video in an accessible, conversational way. Alex asks insightful questions, and Robin explains the details clearly with analogies. Format the script like:
Alex: ...
Robin: ...
Keep it highly educational and engaging!

Video Title: "${workspaceVideoData.title}"
Transcript:
${workspaceVideoData.transcript.substring(0, 15000)}`;
      }

      const res = await aiComplete({
        messages: [
          { role: "system", content: "You are a helpful educational AI assistant representing a NotebookLM-style workspace. Follow instructions strictly and return answers in markdown formatting." },
          { role: "user", content: prompt }
        ],
        temperature: 0.6
      });

      setNotebookOutputs(prev => ({ ...prev, [tool]: res }));
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate tool output");
    } finally {
      setGeneratingTool(null);
    }
  };

  useEffect(() => {
    if (workspaceVideoData && activeNotebookTool !== "chat" && !notebookOutputs[activeNotebookTool]) {
      generateToolOutput(activeNotebookTool);
    }
  }, [activeNotebookTool, workspaceVideoData]);

  const handleSendChatMessage = async () => {
    if (!notebookChatInput.trim() || !workspaceVideoData || isNotebookChatSending) return;

    const userMsg = notebookChatInput.trim();
    setNotebookChatInput("");
    setNotebookChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsNotebookChatSending(true);

    try {
      const historyMsg = notebookChatMessages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content
      }));

      const res = await aiComplete({
        messages: [
          {
            role: "system",
            content: `You are an expert tutor in a NotebookLM-style study environment. You have loaded the transcript of the video: "${workspaceVideoData.title}" by "${workspaceVideoData.channel}".
Answer the user's questions strictly using the video transcript provided below. If the answer is not mentioned in the transcript, explain that you are answering from the video context and do not have additional details outside the video, but try to be as helpful as possible based on the video context.

Transcript:
${workspaceVideoData.transcript.substring(0, 15000)}`
          },
          ...historyMsg,
          { role: "user", content: userMsg }
        ],
        temperature: 0.5
      });

      setNotebookChatMessages(prev => [...prev, { role: "assistant", content: res }]);
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to send message");
    } finally {
      setIsNotebookChatSending(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Youtube className="h-6 w-6 text-red-500 animate-pulse" />
          <h2 className="font-bold text-lg text-foreground">AI Video Notebook (NotebookLM Workspace)</h2>
        </div>
        {workspaceVideoData && (
          <button
            onClick={() => {
              setWorkspaceVideoData(null);
              setWorkspaceUrl("");
              setNotebookOutputs({});
              setNotebookChatMessages([]);
            }}
            className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Clear Workspace
          </button>
        )}
      </div>

      {!workspaceVideoData ? (
        <div className="space-y-4 font-sans">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Paste a YouTube link below to index it. This creates a virtual NotebookLM study workspace where you can generate study guides, briefing documents, interactive timelines, podcast scripts, and chat directly with the video's content.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1 font-sans">
              <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
              <input
                type="url"
                placeholder="Paste YouTube link here... e.g. https://www.youtube.com/watch?v=..."
                value={workspaceUrl}
                onChange={(e) => setWorkspaceUrl(e.target.value)}
                className="w-full h-11 pl-10 pr-3 text-sm bg-muted/30 border border-border rounded-lg outline-none focus:border-primary/40 text-foreground transition-all"
                onKeyDown={(e) => e.key === "Enter" && handleLoadVideo()}
              />
            </div>
            <Button
              onClick={handleLoadVideo}
              disabled={isWorkspaceLoading || !workspaceUrl.trim()}
              className="bg-accent text-accent-foreground hover:bg-accent/90 h-11 px-5 gap-2 font-semibold"
            >
              {isWorkspaceLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>Load Workspace</>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-[280px_1fr] gap-6">
          {/* Left side: Video Info & Tool selector */}
          <div className="space-y-4 border-r border-border/50 pr-4">
            <div className="rounded-lg overflow-hidden bg-black aspect-video relative">
              <iframe
                src={`https://www.youtube.com/embed/${workspaceVideoData.id}`}
                className="absolute inset-0 w-full h-full border-none"
                title={workspaceVideoData.title}
                allowFullScreen
              />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-foreground line-clamp-2 leading-tight" title={workspaceVideoData.title}>
                {workspaceVideoData.title}
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">{workspaceVideoData.channel}</p>
            </div>

            {/* Tool list (buttons) */}
            <div className="space-y-1 pt-2 border-t border-border/40">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/75 font-semibold px-2 mb-1">Notebook Guide Tools</p>
              {[
                { key: "briefing" as const, label: "Briefing Document", icon: FileText, desc: "High-level summary of core ideas" },
                { key: "study" as const, label: "Study Guide", icon: BookOpen, desc: "Key terms & comprehension essay prompts" },
                { key: "faq" as const, label: "FAQ Generator", icon: HelpCircle, desc: "Questions & detailed answers" },
                { key: "timeline" as const, label: "Timeline", icon: Clock, desc: "Chronological flow of discussion topics" },
                { key: "podcast" as const, label: "Audio Overview (Script)", icon: Headphones, desc: "Alex & Robin podcast dialogue" },
                { key: "chat" as const, label: "Ask Workspace Chat", icon: MessageSquare, desc: "Interactive chat with the video context" }
              ].map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.key}
                    onClick={() => setActiveNotebookTool(tool.key)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg flex items-start gap-2.5 transition-all ${
                      activeNotebookTool === tool.key
                        ? "bg-accent/10 text-accent font-semibold border-l-2 border-accent"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs leading-none">{tool.label}</div>
                      <div className="text-[9px] text-muted-foreground/80 mt-1 truncate">{tool.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right side: Tool Output area */}
          <div className="bg-muted/10 border border-border/60 rounded-xl p-4 flex flex-col min-h-[400px]">
            {generatingTool === activeNotebookTool ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
                <p className="text-xs text-muted-foreground animate-pulse">NotebookLM is indexing concepts and drafting content...</p>
              </div>
            ) : activeNotebookTool === "chat" ? (
              /* Chat view */
              <div className="flex flex-col h-full flex-1">
                <div className="flex items-center justify-between pb-3 border-b border-border/40">
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-accent" />
                    Ask anything about this video
                  </div>
                </div>

                {/* Messages list */}
                <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-1 max-h-[300px] scrollbar-thin">
                  {notebookChatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-2">
                      <MessageSquare className="h-8 w-8 opacity-30" />
                      <p className="text-xs text-muted-foreground/80">Ask a question to begin chatting with this YouTube video.</p>
                    </div>
                  ) : (
                    notebookChatMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-lg p-2.5 text-xs whitespace-pre-wrap leading-relaxed ${
                            msg.role === "user"
                              ? "bg-accent text-accent-foreground"
                              : "bg-card border border-border text-foreground prose prose-sm max-w-none dark:prose-invert"
                          }`}
                        >
                          {msg.role === "user" ? (
                            msg.content
                          ) : (
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  {isNotebookChatSending && (
                    <div className="flex justify-start">
                      <div className="bg-card border border-border rounded-lg p-2.5 flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin text-accent" />
                        <span className="text-[10px] text-muted-foreground">NotebookLM is thinking...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Chat input box */}
                <div className="flex gap-2 pt-3 border-t border-border/40 mt-auto">
                  <input
                    type="text"
                    placeholder="Ask about this video... (e.g. 'What is the main takeaway?')"
                    value={notebookChatInput}
                    onChange={(e) => setNotebookChatInput(e.target.value)}
                    className="flex-1 h-9 px-3 text-xs bg-muted/40 border border-border rounded-lg outline-none focus:border-accent/40 text-foreground transition-all"
                    onKeyDown={(e) => e.key === "Enter" && handleSendChatMessage()}
                  />
                  <Button
                    onClick={handleSendChatMessage}
                    disabled={isNotebookChatSending || !notebookChatInput.trim()}
                    size="sm"
                    className="bg-accent text-accent-foreground h-9 px-3"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              /* Standard Markdown output view */
              <div className="flex-1 flex flex-col justify-between font-sans">
                <div className="flex items-center justify-between pb-3 border-b border-border/40 font-sans">
                  <span className="text-xs font-bold text-foreground font-sans">
                    {activeNotebookTool === "briefing" && "Briefing Document"}
                    {activeNotebookTool === "study" && "Study Guide"}
                    {activeNotebookTool === "faq" && "FAQ Generator"}
                    {activeNotebookTool === "timeline" && "Timeline / Milestone Flow"}
                    {activeNotebookTool === "podcast" && "Podcast Dialogue Script"}
                  </span>
                  {notebookOutputs[activeNotebookTool] && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(notebookOutputs[activeNotebookTool]);
                        toast.success("Copied to clipboard!");
                      }}
                      className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors bg-muted/50 hover:bg-muted px-2 py-1 rounded"
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto max-h-[360px] py-3 pr-1 scrollbar-thin mt-2 font-sans font-normal">
                  {notebookOutputs[activeNotebookTool] ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-foreground/90 leading-relaxed font-sans font-normal">
                      <ReactMarkdown>{notebookOutputs[activeNotebookTool]}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-2">
                      <Sparkles className="h-8 w-8 opacity-30 animate-pulse" />
                      <p className="text-xs font-sans">Select a tool to generate analysis.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main Quick Tools Page ────────────────────────────────────────
const QuickTools = () => {
  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8 font-sans">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Wrench className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Quick Tools</h1>
          <p className="text-muted-foreground text-sm">Productivity tools to supercharge your study sessions</p>
        </div>
      </div>

      {/* AI Video Notebook (NotebookLM) Workspace */}
      <VideoNotebookWorkspace />

      {/* Tools grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        <PomodoroTimer />
        <QuickNotes />
        <CalcTool />
        <UnitConverter />
        <FormulaSheet />
        <FocusModeWidget />
      </div>
    </div>
  );
};

export default QuickTools;
