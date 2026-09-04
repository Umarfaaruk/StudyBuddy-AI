import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trophy, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import BrandMark from "@/components/BrandMark";
import { supabase } from "@/lib/supabase";

/**
 * PUBLIC "MOST IMPROVED" BOARD  (Phase 4.6)
 * =========================================
 * Social proof for visitors who have not signed up. Distinct from the in-app
 * leaderboard, which ranks XP among peers; this one ranks measured score
 * IMPROVEMENT, because that is the claim the product actually makes.
 *
 * Every row comes from `public_most_improved()`, which only considers students
 * who explicitly opted in and returns a chosen display name plus a delta —
 * never a real name, an email, or a raw attempt. Nobody appears here by
 * default.
 */

interface Row {
  display_name: string;
  improvement: number;
  latest_score: number;
  attempts: number;
}

const PublicLeaderboard = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["public-most-improved"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.rpc("public_most_improved", { p_limit: 10 });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 1000 * 60 * 10,
  });

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

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        <div className="text-center space-y-2">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Trophy className="h-7 w-7 text-primary" />
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground tracking-tight">
            Most improved
          </h1>
          <p className="text-sm text-muted-foreground">
            Measured score improvement between students&rsquo; first and latest mock
            test. Shown with their permission.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !data?.length ? (
          // Say why it is empty. A blank board reads as broken, and inventing
          // placeholder students to fill it would be fabricating social proof.
          <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-2">
            <p className="text-sm font-medium text-foreground">No results published yet</p>
            <p className="text-xs text-muted-foreground">
              This board fills up as students complete their second mock test and
              choose to share their improvement.
            </p>
          </div>
        ) : (
          <ol className="space-y-2">
            {data.map((row, i) => (
              <li
                key={`${row.display_name}-${i}`}
                className="rounded-xl border border-border bg-card p-4 flex items-center gap-4"
              >
                <span className="text-sm font-bold text-muted-foreground tabular-nums w-6 flex-shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground truncate">
                    {row.display_name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    now scoring {row.latest_score}% · {row.attempts} mock tests
                  </div>
                </div>
                <div className="text-sm font-bold text-success tabular-nums flex-shrink-0">
                  +{row.improvement}
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-3">
          <h2 className="text-sm font-bold text-foreground">See where you stand</h2>
          <p className="text-xs text-muted-foreground">
            Take a free 8-question diagnostic — no signup needed.
          </p>
          <Button asChild className="h-11 gap-2">
            <Link to="/free-test">Take the free test <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </main>
    </div>
  );
};

export default PublicLeaderboard;
