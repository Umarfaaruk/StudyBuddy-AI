import { Star } from "lucide-react";

const testimonials: { quote: string; name: string; role: string; metric: string }[] = [];
// Testimonials will be populated with real user feedback once available.
// Until then this section renders NOTHING — see the early return below.

/**
 * A "Loved by students everywhere" heading above an empty grid reads as a
 * broken page, and inventing quotes to fill it would be fabricating reviews.
 * So the section hides itself entirely while the list is empty, and comes back
 * on its own as soon as real feedback is added above.
 */
const Testimonials = () => {
  if (testimonials.length === 0) return null;

  return (
    <section className="py-24 bg-background">
      <div className="container max-w-7xl mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4">Success Stories</p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
            Loved by students everywhere.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div key={t.name} className="bg-card border border-border rounded-2xl p-7 flex flex-col">
              <div className="flex gap-1 mb-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-accent text-accent" />
                ))}
              </div>
              <blockquote className="text-foreground text-sm leading-relaxed flex-1 mb-6">
                "{t.quote}"
              </blockquote>
              <div className="bg-secondary/60 rounded-lg px-3 py-2 text-xs font-semibold text-accent mb-4 w-fit">
                {t.metric}
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
