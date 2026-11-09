import { Briefcase, Check, GraduationCap } from "lucide-react";

const audiences = [
  {
    icon: GraduationCap,
    title: "Exam aspirants",
    text: "Preparing for JEE, NEET, GATE or a government exam? Get a plan built around your syllabus and exam date, plus timed practice that feels like the real paper.",
    points: ["Syllabus-based study plans", "Timed practice with review", "Daily streaks to stay consistent"],
  },
  {
    icon: Briefcase,
    title: "Job seekers and professionals",
    text: "Building career skills? Learn step by step, practice with quizzes, and ask the AI tutor whenever you get stuck.",
    points: ["Skill-focused lessons", "Practice that fits your schedule", "Clear progress you can see"],
  },
];

const AudienceSection = () => (
  <section id="for-you" className="py-24 bg-background">
    <div className="container max-w-7xl mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-text mb-4">Who it's for</p>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 tracking-tight">
          Built for people with a goal and a deadline
        </h2>
        <p className="text-muted-foreground text-lg">
          Whether you are chasing a rank or a new role, you get a clear next step every day.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 max-w-5xl mx-auto">
        {audiences.map(({ icon: Icon, title, text, points }) => (
          <article
            key={title}
            className="rounded-2xl border border-border bg-card p-7 transition-shadow duration-300 hover:shadow-[0_8px_30px_-6px_hsl(var(--primary)/0.18)]"
          >
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Icon className="h-6 w-6" aria-hidden />
            </div>
            <h3 className="text-xl font-bold text-foreground">{title}</h3>
            <p className="mt-3 text-muted-foreground leading-relaxed">{text}</p>
            <ul className="mt-5 space-y-2.5">
              {points.map((point) => (
                <li key={point} className="flex items-center gap-2.5 text-sm text-foreground">
                  <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
                  {point}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  </section>
);

export default AudienceSection;
