import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Quote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAttemptSeries } from "@/lib/mockTests";

/**
 * TESTIMONIAL CAPTURE  (Phase 3.5)
 * ================================
 * Asks for a quote at the moment it is most likely to be genuine and generous —
 * right after a student sees a result they are pleased with.
 *
 * Two milestones, both evidence-based rather than time-served alone:
 *   • a significant score jump between first and latest mock, or
 *   • four weeks of use with at least two mocks to compare.
 *
 * Consent is captured as TWO separate flags. Agreeing to share a RESULT is not
 * agreeing to be NAMED, and collapsing them would publish identities nobody
 * opted into. Nothing is publishable until an admin approves it either.
 */

const SCORE_JUMP_THRESHOLD = 10;   // percentage points
const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000;

const TestimonialPrompt = ({ latestScore }: { latestScore?: number }) => {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [quote, setQuote] = useState("");
  const [shareResult, setShareResult] = useState(false);
  const [useName, setUseName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const { data: eligibility } = useQuery({
    queryKey: ["testimonial-eligibility", user?.uid, latestScore],
    queryFn: async () => {
      if (!user) return null;

      // Never ask twice.
      const { data: existing } = await supabase
        .from("testimonials").select("id").eq("user_id", user.uid).limit(1).maybeSingle();
      if (existing) return null;

      const attempts = await fetchAttemptSeries(user.uid);
      if (attempts.length < 2) return null;

      const first = attempts[0];
      const last = attempts[attempts.length - 1];
      const before = Number(first.score ?? 0);
      const after = Number(last.score ?? 0);
      const jump = after - before;

      const firstAt = first.submitted_at ? new Date(first.submitted_at).getTime() : Date.now();
      const fourWeeks = Date.now() - firstAt >= FOUR_WEEKS_MS;

      if (jump >= SCORE_JUMP_THRESHOLD) {
        return { milestone: "score_jump" as const, before, after, jump };
      }
      if (fourWeeks) {
        return { milestone: "four_weeks" as const, before, after, jump };
      }
      return null;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 10,
  });

  if (!eligibility || dismissed) return null;

  if (done) {
    return (
      <div className="rounded-2xl border border-success/30 bg-success/5 p-4 text-sm text-foreground">
        Thank you — that really helps.
      </div>
    );
  }

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("testimonials").insert({
        user_id: user.uid,
        quote: quote.trim() || null,
        milestone: eligibility.milestone,
        score_before: eligibility.before,
        score_after: eligibility.after,
        consent_to_share: shareResult,
        consent_to_use_name: useName,
        status: "pending",
      });
      if (error) throw error;
      setDone(true);
    } catch (err) {
      console.error("[TestimonialPrompt] submit failed:", err);
      toast.error("Couldn't save that — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-primary/25 bg-primary/5 p-5 space-y-3 relative">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-2">
        <Quote className="h-4 w-4 text-primary flex-shrink-0" />
        <h2 className="text-sm font-bold text-foreground">
          {eligibility.milestone === "score_jump"
            ? `Your score is up ${Math.round(eligibility.jump)} points`
            : "You've been at this for a month"}
        </h2>
      </div>

      <p className="text-xs text-muted-foreground">
        Would you share a sentence about how it&rsquo;s going? Entirely optional,
        and nothing is published without your say-so.
      </p>

      <Textarea
        value={quote}
        onChange={(e) => setQuote(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="What's working for you?"
        className="text-sm bg-background"
      />

      <div className="space-y-2">
        <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox" checked={shareResult}
            onChange={(e) => setShareResult(e.target.checked)}
            className="h-4 w-4 mt-0.5 rounded border-border flex-shrink-0"
          />
          <span>
            You may share my score improvement
            ({Math.round(eligibility.before)}% → {Math.round(eligibility.after)}%).
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox" checked={useName}
            onChange={(e) => setUseName(e.target.checked)}
            className="h-4 w-4 mt-0.5 rounded border-border flex-shrink-0"
          />
          <span>You may use my name alongside it.</span>
        </label>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={submit}
          disabled={saving || (!quote.trim() && !shareResult)}
        >
          {saving ? "Saving…" : "Send"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
          Not now
        </Button>
      </div>
    </section>
  );
};

export default TestimonialPrompt;
