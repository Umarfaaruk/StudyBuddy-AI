import { useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { aiComplete } from "@/lib/aiService";
import { Button } from "@/components/ui/button";
import { Loader2, BrainCircuit, RefreshCw, FileText, ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface FlashcardDoc {
  id: string;
  question: string;
  answer: string;
  next_review: number;
  interval: number;
  ease: number;
  material_id: string;
  user_id: string;
  created_at: number;
}

export default function Flashcards() {
  const { user } = useAuth();
  const location = useLocation();
  const [selectedMaterial, setSelectedMaterial] = useState<any>(location.state?.preselectedMaterial || null);
  const [generating, setGenerating] = useState(false);
  
  // Study State
  const [isFlipped, setIsFlipped] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);

  const { data: materials, isLoading: materialsLoading } = useQuery({
    queryKey: ["user-materials", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("materials").select("*").eq("user_id", user.uid);
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  const { data: flashcards, isLoading: cardsLoading, refetch: refetchCards } = useQuery({
    queryKey: ["flashcards", selectedMaterial?.id],
    queryFn: async () => {
      if (!selectedMaterial?.id || !user) return [];
      const { data } = await supabase
        .from("flashcards")
        .select("*")
        .eq("material_id", selectedMaterial.id)
        .eq("user_id", user.uid);
      return ((data ?? []) as FlashcardDoc[]).sort((a, b) => (a.next_review || 0) - (b.next_review || 0));
    },
    enabled: !!selectedMaterial?.id && !!user,
  });

  const handleGenerate = async () => {
    if (!selectedMaterial || !user) return;
    setGenerating(true);
    let pairs = null;
    let attempt = 0;
    const maxRetries = 3;
    let lastError = null;

    while (attempt < maxRetries && !pairs) {
      try {
        attempt++;
        const prompt = `Extract exactly 10 key flashcard question-answer pairs from the following study material. 
Return ONLY a valid JSON array of objects with "question" and "answer" string keys. Keep answers concise (1-3 sentences).

Content:
${selectedMaterial.extracted_text?.substring(0, 8000) || selectedMaterial.summary}`;

        const res = await aiComplete({
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          maxTokens: 2000,
        });

        let jsonString = res;
        const match = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) {
          jsonString = match[1];
        }

        const startIdx = jsonString.search(/\[\s*\{/);
        const endIdx = jsonString.lastIndexOf(']');
        
        if (startIdx === -1 || endIdx === -1) {
          throw new Error("Failed to locate JSON array in AI output");
        }
        
        jsonString = jsonString.substring(startIdx, endIdx + 1);
        pairs = JSON.parse(jsonString);
      } catch (err) {
        lastError = err;
        console.warn(`Retry ${attempt} failed:`, err);
      }
    }

    try {
      if (!pairs || !Array.isArray(pairs) || pairs.length === 0) {
        throw lastError || new Error("AI returned no flashcard pairs after multiple attempts.");
      }

      const rows = pairs
        .filter((pair: any) => pair.question && pair.answer)
        .map((pair: any) => ({
          user_id: user.uid,
          material_id: selectedMaterial.id,
          question: String(pair.question).trim(),
          answer: String(pair.answer).trim(),
          created_at: Date.now(),
          next_review: Date.now(),
          interval: 0,
          ease: 2.5,
        }));
      if (rows.length > 0) await supabase.from("flashcards").insert(rows);
      toast.success("Flashcards generated!");
      refetchCards();
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate flashcards.");
    } finally {
      setGenerating(false);
    }
  };

  const handleReview = async (quality: "hard" | "good" | "easy") => {
    if (!flashcards || !flashcards[currentCardIndex]) return;
    const card = flashcards[currentCardIndex];
    
    let newInterval = card.interval || 0;
    if (quality === "hard") {
      newInterval = 0;
    } else if (quality === "good") {
      newInterval = newInterval === 0 ? 1 : newInterval * 2;
    } else {
      newInterval = newInterval === 0 ? 3 : newInterval * 3;
    }

    const nextReview = Date.now() + newInterval * 24 * 60 * 60 * 1000;

    try {
      await supabase.from("flashcards").update({
        interval: newInterval,
        next_review: nextReview,
      }).eq("id", card.id);
      
      setIsFlipped(false);
      if (currentCardIndex < flashcards.length - 1) {
        setCurrentCardIndex(prev => prev + 1);
      } else {
        toast.success("You've reviewed all cards for now!");
        refetchCards();
        setCurrentCardIndex(0);
      }
    } catch (e) {
      toast.error("Failed to save progress");
    }
  };

  const goToCard = (direction: "prev" | "next") => {
    if (!flashcards) return;
    setIsFlipped(false);
    if (direction === "prev" && currentCardIndex > 0) {
      setCurrentCardIndex(prev => prev - 1);
    } else if (direction === "next" && currentCardIndex < flashcards.length - 1) {
      setCurrentCardIndex(prev => prev + 1);
    }
  };

  const currentCard = flashcards?.[currentCardIndex];

  if (materialsLoading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-cta/10 flex items-center justify-center">
          <BrainCircuit className="h-5 w-5 text-cta" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Flashcards</h1>
          <p className="text-muted-foreground text-sm">Automated spaced repetition for your uploaded materials</p>
        </div>
      </div>

      {!selectedMaterial ? (
        <div className="grid sm:grid-cols-2 gap-4 mt-6">
          {materials?.map((m: any) => (
            <div key={m.id} className="bg-card border border-border rounded-xl p-5 hover:border-cta/40 cursor-pointer transition-colors" onClick={() => setSelectedMaterial(m)}>
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-cta mt-0.5" />
                <div>
                  <h3 className="font-semibold text-foreground truncate">{m.file_name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">Select to study flashcards</p>
                </div>
              </div>
            </div>
          ))}
          {materials?.length === 0 && (
             <div className="col-span-2 text-center py-12 text-muted-foreground bg-muted/50 rounded-xl border border-dashed border-border">
                <FileText className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm mb-4">No materials uploaded yet.</p>
                <Link to="/materials">
                  <Button variant="outline" size="sm">Upload Material</Button>
                </Link>
             </div>
          )}
        </div>
      ) : (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Studying: {selectedMaterial.file_name}</h2>
            <Button variant="ghost" size="sm" onClick={() => { setSelectedMaterial(null); setCurrentCardIndex(0); setIsFlipped(false); }}>
              Back to Materials
            </Button>
          </div>

          {cardsLoading || generating ? (
            <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center justify-center gap-4 text-center">
              <RefreshCw className="h-8 w-8 text-primary animate-spin" />
              <p className="text-muted-foreground text-sm">{generating ? "AI is generating your flashcards. This may take a minute..." : "Loading cards..."}</p>
            </div>
          ) : !flashcards || flashcards.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center space-y-4">
              <BrainCircuit className="h-12 w-12 text-muted-foreground mx-auto opacity-50" />
              <div>
                <h3 className="font-bold text-foreground">No Flashcards Yet</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
                  Let AI automatically extract the key concepts from this material into a study deck.
                </p>
              </div>
              <Button onClick={handleGenerate} disabled={generating} className="bg-cta text-cta-foreground hover:bg-cta/90">
                Generate Deck Now
              </Button>
            </div>
          ) : currentCard ? (
            <div className="max-w-xl mx-auto space-y-6">
               {/* Progress indicator */}
               <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    Card {currentCardIndex + 1} of {flashcards.length}
                  </span>
                  <div className="flex gap-1">
                    {flashcards.map((_, i) => (
                      <div 
                        key={i} 
                        className={`h-1.5 rounded-full transition-all ${i === currentCardIndex ? 'w-6 bg-cta' : 'w-1.5 bg-border'}`}
                      />
                    ))}
                  </div>
               </div>
               
               {/* The Card — simple conditional render, no broken CSS 3D */}
               <div 
                 onClick={() => setIsFlipped(!isFlipped)}
                 className="relative w-full cursor-pointer select-none"
               >
                 <div className={`w-full min-h-[280px] rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all duration-300 border-2 ${
                   isFlipped 
                     ? 'bg-success/5 border-success/30 shadow-lg shadow-success/5' 
                     : 'bg-card border-border hover:border-cta/40 hover:shadow-lg'
                 }`}>
                    
                    {!isFlipped ? (
                      <>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-cta mb-4 bg-cta/10 px-3 py-1 rounded-full">Question</span>
                        <h3 className="text-xl md:text-2xl font-medium text-foreground leading-relaxed max-w-md">
                          {currentCard.question}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-6 flex items-center gap-1.5">
                          <RotateCcw className="h-3 w-3" /> Tap to reveal answer
                        </p>
                      </>
                    ) : (
                      <>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-success mb-4 bg-success/10 px-3 py-1 rounded-full">Answer</span>
                        <p className="text-lg text-foreground leading-relaxed max-w-md">
                          {currentCard.answer}
                        </p>
                      </>
                    )}
                 </div>
               </div>

               {/* Navigation */}
               <div className="flex items-center justify-between gap-4">
                 <Button 
                   variant="outline" 
                   size="icon" 
                   disabled={currentCardIndex === 0} 
                   onClick={(e) => { e.stopPropagation(); goToCard("prev"); }}
                   className="h-10 w-10"
                 >
                   <ArrowLeft className="h-4 w-4" />
                 </Button>

                 {/* Review controls — shown when flipped */}
                 {isFlipped ? (
                   <div className="flex gap-2 flex-1 justify-center">
                     <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10 flex-1 max-w-[120px]" onClick={(e) => { e.stopPropagation(); handleReview("hard"); }}>
                       Hard
                     </Button>
                     <Button variant="outline" className="border-primary text-primary hover:bg-primary/10 flex-1 max-w-[120px]" onClick={(e) => { e.stopPropagation(); handleReview("good"); }}>
                       Good
                     </Button>
                     <Button variant="outline" className="border-success text-success hover:bg-success/10 flex-1 max-w-[120px]" onClick={(e) => { e.stopPropagation(); handleReview("easy"); }}>
                       Easy
                     </Button>
                   </div>
                 ) : (
                   <span className="text-xs text-muted-foreground">Tap card to flip</span>
                 )}

                 <Button 
                   variant="outline" 
                   size="icon" 
                   disabled={currentCardIndex >= flashcards.length - 1} 
                   onClick={(e) => { e.stopPropagation(); goToCard("next"); }}
                   className="h-10 w-10"
                 >
                   <ArrowRight className="h-4 w-4" />
                 </Button>
               </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
