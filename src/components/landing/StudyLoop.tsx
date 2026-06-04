import { BookOpen, Target, TrendingUp } from "lucide-react";

const steps = [
  {
    icon: BookOpen,
    step: "01",
    title: "Learn with AI",
    description: "Ask questions, upload materials, and get instant explanations tailored to your level.",
  },
  {
    icon: Target,
    step: "02",
    title: "Practice & Strengthen",
    description: "Take adaptive quizzes that focus on your weak areas and reinforce what you know.",
  },
  {
    icon: TrendingUp,
    step: "03",
    title: "Track & Compete",
    description: "Monitor your progress, earn XP, and climb leaderboards with friends.",
  },
];

const StudyLoop = () => (
  <section className="py-24 bg-muted/50">
    <div className="container max-w-7xl mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-soft mb-4">The Study Loop</p>
        <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
          A Smarter Way to Study Daily.
        </h2>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {steps.map((s, i) => (
          <div key={s.step} className="relative text-center">
            {i < steps.length - 1 && (
              <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-px border-t-2 border-dashed border-soft/30" />
            )}
            <div className="h-16 w-16 rounded-2xl bg-card border border-border flex items-center justify-center mx-auto mb-6 shadow-sm">
              <s.icon className="h-7 w-7 text-accent" />
            </div>
            <div className="text-xs font-bold text-soft mb-2 uppercase tracking-widest">Step {s.step}</div>
            <h3 className="text-xl font-bold text-white mb-2">{s.title}</h3>
            <p className="text-sm text-soft max-w-xs mx-auto leading-relaxed">{s.description}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default StudyLoop;
