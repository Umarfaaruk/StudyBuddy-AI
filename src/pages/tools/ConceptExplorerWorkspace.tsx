import { useState } from "react";
import { Atom, Lightbulb, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { aiComplete } from "@/lib/aiService";
import ReactMarkdown from "react-markdown";

export const ConceptExplorerWorkspace = () => {
  const [concept, setConcept] = useState("");
  const [explainLevel, setExplainLevel] = useState<"child" | "student" | "expert">("student");
  const [outputFormat, setOutputFormat] = useState<"analogy" | "roadmap" | "application">("analogy");
  const [generatorResult, setGeneratorResult] = useState("");
  const [isGeneratingConcept, setIsGeneratingConcept] = useState(false);

  const handleGenerateConcept = async () => {
    if (!concept.trim()) {
      toast.error("Please enter a concept or topic first");
      return;
    }
    setIsGeneratingConcept(true);
    setGeneratorResult("");
    try {
      let levelPrompt = "";
      if (explainLevel === "child") {
        levelPrompt = "Explain like I am 5 years old, using extremely simple vocabulary, vivid storytelling, and fun characters or everyday objects.";
      } else if (explainLevel === "student") {
        levelPrompt = "Explain like I am a high school student, using clear academic concepts, relatable teenage analogies, and structured formatting.";
      } else {
        levelPrompt = "Explain like I am a college graduate or professor, using precise terminology, deep conceptual rigor, and professional metaphors.";
      }

      let formatPrompt = "";
      if (outputFormat === "analogy") {
        formatPrompt = "Provide a highly creative, immersive metaphor or analogy that makes this complex concept instantly intuitive. Contrast the metaphor directly with the actual scientific or mathematical mechanisms.";
      } else if (outputFormat === "roadmap") {
        formatPrompt = "Provide a step-by-step learning roadmap or milestones outline, showing exactly what pre-requisites to master first, the core concepts, and advanced topics to study next in sequence.";
      } else {
        formatPrompt = "Provide a detailed guide on real-world industrial, medical, or scientific applications of this concept, demonstrating exactly how it is used in modern careers or technologies.";
      }

      const prompt = `You are a world-class academic tutor and master educator. 
Explain the following concept: "${concept}".
Level: ${levelPrompt}
Focus Format: ${formatPrompt}

Format your output using gorgeous markdown with bullet points, numbered lists, and bold text headers where appropriate. Make the explanation feel premium, highly engaging, and easy to read.`;

      const result = await aiComplete({
        messages: [
          { role: "system", content: "You are an expert tutor specializing in visual analogies and conceptual roadmap breakdowns. Respond in high-quality markdown." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      });
      setGeneratorResult(result);
      toast.success("Explanation generated!");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate concept explanation");
    } finally {
      setIsGeneratingConcept(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-sm font-sans">
      <div className="flex items-center gap-2 pb-3 border-b border-border">
        <Atom className="h-6 w-6 text-accent animate-pulse" />
        <h2 className="font-bold text-lg text-foreground">AI Tutor & Analogy Studio</h2>
      </div>

      <div className="grid md:grid-cols-[1fr_400px] gap-6">
        {/* Left panel: Input options & Generate */}
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="concept-input" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Enter a topic or complex concept
            </label>
            <input
              id="concept-input"
              type="text"
              placeholder="e.g. Quantum Superposition, Recursion in JavaScript, Krebs Cycle..."
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              className="w-full h-11 px-4 text-sm bg-muted/40 border border-border rounded-xl outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/10 text-foreground transition-all"
              onKeyDown={(e) => e.key === "Enter" && handleGenerateConcept()}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Explanation Level */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Explanation Level
              </label>
              <div className="flex flex-col gap-1.5">
                {[
                  { key: "child" as const, label: "Explain Like I'm 5 🧸" },
                  { key: "student" as const, label: "High School Student 🎒" },
                  { key: "expert" as const, label: "College / Professional 🎓" },
                ].map((lvl) => (
                  <button
                    key={lvl.key}
                    onClick={() => setExplainLevel(lvl.key)}
                    className={`text-left px-3 py-2 text-xs rounded-xl border transition-all ${
                      explainLevel === lvl.key
                        ? "bg-accent/10 text-accent border-accent font-semibold"
                        : "bg-background border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Output Mode */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Studio Focus Format
              </label>
              <div className="flex flex-col gap-1.5">
                {[
                  { key: "analogy" as const, label: "Creative Analogy ✨" },
                  { key: "roadmap" as const, label: "Learning Roadmap 🗺️" },
                  { key: "application" as const, label: "Real-World Uses 🚀" },
                ].map((fmt) => (
                  <button
                    key={fmt.key}
                    onClick={() => setOutputFormat(fmt.key)}
                    className={`text-left px-3 py-2 text-xs rounded-xl border transition-all ${
                      outputFormat === fmt.key
                        ? "bg-accent/10 text-accent border-accent font-semibold"
                        : "bg-background border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button
            onClick={handleGenerateConcept}
            disabled={isGeneratingConcept || !concept.trim()}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90 h-11 gap-2 font-semibold rounded-xl"
          >
            {isGeneratingConcept ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating Explanation...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Explore Concept
              </>
            )}
          </Button>
        </div>

        {/* Right panel: Preview / Info */}
        <div className="bg-muted/20 border border-border rounded-2xl p-5 flex flex-col min-h-[400px]">
          {isGeneratingConcept ? (
            <div className="flex-1 flex items-center justify-center flex-col gap-3">
              <Loader2 className="h-8 w-8 text-accent animate-spin" />
              <p className="text-sm text-muted-foreground animate-pulse">Crafting explanation...</p>
            </div>
          ) : generatorResult ? (
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/50">
                <h3 className="font-bold text-sm text-foreground">Generated Output</h3>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatorResult);
                    toast.success("Copied to clipboard!");
                  }}
                  className="text-xs text-muted-foreground hover:text-accent transition-colors"
                >
                  Copy
                </button>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-foreground/90 leading-relaxed font-sans font-normal">
                <ReactMarkdown>{generatorResult}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center">
              <Lightbulb className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground text-center">Your custom explanation or roadmap will display here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConceptExplorerWorkspace;
