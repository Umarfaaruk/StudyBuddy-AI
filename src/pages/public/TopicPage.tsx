import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import BrandMark from "@/components/BrandMark";
import { supabase } from "@/lib/supabase";

/**
 * SEO TOPIC PAGE  (Phase 4.7)
 * ===========================
 * Public, crawlable landing page for one syllabus chapter, e.g.
 * /learn/jee-main/physics/kinematics.
 *
 * The same URLs are also emitted as static HTML by scripts/generate-seo.mjs, so
 * a crawler that does not run JavaScript still gets real text and correct
 * metadata. This component is what a human sees once the SPA hydrates over it.
 *
 * Every page funnels to /free-test rather than /signup: the free diagnostic is
 * the lead magnet, and asking a stranger who arrived from a search result to
 * create an account before showing them anything of value is how landing pages
 * lose people.
 *
 * Resolves the chapter by matching SLUGS rather than storing a slug column —
 * the syllabus is a few hundred rows, and a stored slug would be one more thing
 * to keep in sync with the chapter name.
 */

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

interface TopicData {
  chapter: string;
  subject: string;
  trackName: string;
  trackId: string;
  questionCount: number;
  siblings: { name: string; path: string }[];
}

const TopicPage = () => {
  const { trackId = "", subjectSlug = "", chapterSlug = "" } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["seo-topic", trackId, subjectSlug, chapterSlug],
    queryFn: async (): Promise<TopicData | null> => {
      const [{ data: nodes }, { data: track }] = await Promise.all([
        supabase
          .from("syllabus_nodes")
          .select("id, name, parent_id, level, exam_track_id")
          .eq("exam_track_id", trackId),
        supabase.from("exam_tracks").select("id, name").eq("id", trackId).maybeSingle(),
      ]);
      if (!nodes?.length || !track) return null;

      const byId = new Map(nodes.map((n: any) => [n.id, n]));
      const chapter = nodes.find(
        (n: any) =>
          n.level === "chapter" &&
          slugify(n.name) === chapterSlug &&
          slugify(byId.get(n.parent_id)?.name ?? "general") === subjectSlug
      );
      if (!chapter) return null;

      const parent = byId.get((chapter as any).parent_id);

      const { count } = await supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("syllabus_node_id", (chapter as any).id)
        .eq("status", "published");

      // Sibling chapters give crawlers internal links and give readers somewhere
      // to go — a leaf page with one outbound link is a dead end.
      const siblings = nodes
        .filter((n: any) => n.level === "chapter" && n.parent_id === (chapter as any).parent_id)
        .filter((n: any) => n.id !== (chapter as any).id)
        .slice(0, 8)
        .map((n: any) => ({
          name: n.name,
          path: `/learn/${trackId}/${subjectSlug}/${slugify(n.name)}`,
        }));

      return {
        chapter: (chapter as any).name,
        subject: parent?.name ?? "General",
        trackName: (track as any).name,
        trackId,
        questionCount: count ?? 0,
        siblings,
      };
    },
  });

  const title = useMemo(
    () =>
      data
        ? `${data.trackName} ${data.subject} — ${data.chapter} practice questions | StudyBuddy AI`
        : "Practice questions | StudyBuddy AI",
    [data]
  );

  // Keep the tab title correct on CLIENT-SIDE navigations. The prerendered HTML
  // already carries the right <title> on a cold load, but React Router never
  // reloads the document, so an in-app navigation would otherwise keep whatever
  // title the previous page set.
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => { document.title = previous; };
  }, [title]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link to="/"><BrandMark size="md" /></Link>
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Log in
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !data ? (
          <div className="text-center space-y-4 py-12">
            <h1 className="text-xl font-bold text-foreground">Topic not found</h1>
            <p className="text-sm text-muted-foreground">
              That chapter isn&rsquo;t available yet.
            </p>
            <Button asChild><Link to="/free-test">Take the free test</Link></Button>
          </div>
        ) : (
          <>
            <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
              <Link to="/" className="hover:text-foreground">Home</Link>
              <span className="mx-1.5">/</span>
              <span>{data.trackName}</span>
              <span className="mx-1.5">/</span>
              <span>{data.subject}</span>
            </nav>

            <div className="space-y-3">
              <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                {data.trackName} {data.subject} — {data.chapter} practice questions
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Practise {data.questionCount} {data.chapter} question
                {data.questionCount === 1 ? "" : "s"} for {data.trackName} {data.subject},
                with worked explanations and revision scheduled from how you actually
                perform — not on a fixed timer.
              </p>
            </div>

            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center space-y-3">
              <BookOpen className="h-6 w-6 text-primary mx-auto" />
              <h2 className="text-sm font-bold text-foreground">
                Find your weak chapters in 8 questions
              </h2>
              <p className="text-xs text-muted-foreground">
                No signup, no card. See exactly where you&rsquo;re losing marks.
              </p>
              <Button asChild className="h-11 gap-2">
                <Link to="/free-test">Take the free diagnostic <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </div>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                How this works
              </h2>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• A short diagnostic scores you per chapter, not just overall.</li>
                <li>• Weak chapters are scheduled first, paced to your exam date.</li>
                <li>• Answers are grounded in the {data.trackName} syllabus and cite the topic they come from.</li>
                <li>• Revision intervals adapt to whether you answered correctly, and how quickly.</li>
              </ul>
            </section>

            {data.siblings.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  More {data.subject} chapters
                </h2>
                <div className="flex flex-wrap gap-2">
                  {data.siblings.map((s) => (
                    <Link
                      key={s.path}
                      to={s.path}
                      className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card text-foreground hover:border-primary/40 transition-colors"
                    >
                      {s.name}
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default TopicPage;
