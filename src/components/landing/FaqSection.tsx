import { Plus } from "lucide-react";

const faqs = [
  {
    q: "What is StudyBuddy AI?",
    a: "StudyBuddy AI is an AI-powered learning platform. It combines an AI tutor, lessons, personalized quizzes, study streaks and progress tracking in one place.",
  },
  {
    q: "Which exams does it cover?",
    a: "JEE, NEET and GATE today. Telangana and Andhra Pradesh government exam tracks (TGPSC and APPSC) are being added. You can also use it for general subjects and career skills.",
  },
  {
    q: "Is it only for exam preparation?",
    a: "No. It is built for competitive exam preparation and also for job seekers and professionals who want to build career skills.",
  },
  {
    q: "Can the AI tutor make mistakes?",
    a: "Like any AI, it can. Use it to understand ideas faster, and check important facts against your lessons and official study material.",
  },
  {
    q: "Is it free to start?",
    a: "Yes. You can sign up for free and start learning right away with Google or email.",
  },
];

// Native <details> keeps this accessible and working with no JavaScript.
const FaqSection = () => (
  <section id="faq" className="py-24 bg-background">
    <div className="container max-w-3xl mx-auto px-4">
      <div className="text-center mb-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-text mb-4">FAQ</p>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">Questions, answered</h2>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {faqs.map(({ q, a }) => (
          <details key={q} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-left font-semibold text-foreground transition-colors hover:bg-muted/60 [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              {q}
              <Plus className="h-5 w-5 shrink-0 text-primary-text transition-transform duration-200 group-open:rotate-45" aria-hidden />
            </summary>
            <p className="px-6 pb-5 leading-relaxed text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </div>
  </section>
);

export default FaqSection;
