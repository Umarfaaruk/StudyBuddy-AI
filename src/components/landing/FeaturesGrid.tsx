import { Brain, Zap, Timer, BarChart3, Upload, Compass } from "lucide-react";
import DecryptedText from "@/components/ui/DecryptedText";
import { MagicBento } from "@/components/ui/MagicBento";

const features = [
  {
    icon: Brain,
    title: "AI Homework Solver",
    description: "Get step-by-step solutions and explanations for any problem, powered by advanced AI models.",
  },
  {
    icon: Zap,
    title: "Smart Quiz Engine",
    description: "Auto-generated quizzes that adapt to your knowledge gaps and strengthen weak areas.",
  },
  {
    icon: Timer,
    title: "Study Timer & Streaks",
    description: "Build consistent habits with timed study sessions and motivating daily streaks.",
  },
  {
    icon: BarChart3,
    title: "Progress Tracking",
    description: "Visualize your improvement over time with detailed analytics and mastery indicators.",
  },
  {
    icon: Upload,
    title: "Material Upload Learning",
    description: "Upload notes, PDFs, or textbooks — AI reads and creates study material from your content.",
  },
  {
    icon: Compass,
    title: "Personalized Recommendations",
    description: "AI analyzes your performance to suggest exactly what to study next for maximum growth.",
  },
];

const FeaturesGrid = () => (
  <section id="features" className="py-24 bg-background">
    <div className="container max-w-7xl mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4">Core Features</p>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 tracking-tight">
          Everything you need to study smarter
        </h2>
        <div className="text-muted-foreground text-lg min-h-[3.5rem]">
          <DecryptedText 
            text="A complete toolkit designed to transform how you learn, practice, and grow." 
            animateOn="view" 
            revealDirection="start" 
            sequential 
            useOriginalCharsOnly={false} 
          />
        </div>
      </div>

      <div>
        <MagicBento
          cards={features.map(f => ({ 
            ...f, 
            color: 'hsl(var(--card))',
            label: 'Study Tool'
          }))}
          textAutoHide={true}
          enableStars={true}
          enableSpotlight={true}
          enableBorderGlow={true}
          enableTilt={false}
          enableMagnetism={false}
          clickEffect={true}
          spotlightRadius={400}
          particleCount={12}
          glowColor="29, 78, 216"
          disableAnimations={false}
        />
      </div>
    </div>
  </section>
);

export default FeaturesGrid;
