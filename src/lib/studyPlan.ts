/**
 * STUDY PLAN GENERATION
 * =====================
 * Turns a diagnostic result into a dated, ordered plan: weakest topics first,
 * paced against the exam date.
 *
 * Persists into the EXISTING `study_plans` table rather than a new one — it
 * already carries target_date, subjects and a `schedule` jsonb, and the Study
 * Planner page already reads it. Adding a parallel table would mean two places
 * that mean "the student's plan".
 *
 * Pacing rationale: a plan that ignores the calendar is just a sorted list. With
 * 200 days a student can afford a full pass with revision; with 20 they need
 * triage. So the horizon decides how many topics get scheduled and how much
 * time each gets, rather than always emitting the same shape.
 */

import { supabase } from "@/lib/supabase";
import type { PerTopicResult } from "@/lib/diagnostic";
import { rankWeakestTopics } from "@/lib/diagnostic";

/** Used when the student didn't know their exam date. */
export const DEFAULT_HORIZON_DAYS = 120;

/** Below this score a topic is treated as needing real remediation. */
const WEAK_THRESHOLD = 50;

export interface PlanItem {
  /** ISO date (YYYY-MM-DD) this block is scheduled for. */
  date: string;
  syllabusNodeId: string;
  topic: string;
  subject?: string;
  /** Minutes to spend. */
  minutes: number;
  /** Why this is here — surfaced in the UI so the plan explains itself. */
  reason: string;
  priority: "critical" | "high" | "moderate";
}

export interface GeneratedPlan {
  horizonDays: number;
  items: PlanItem[];
  /** Topics that scored well enough to defer to revision rather than study. */
  deferred: string[];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Build the plan.
 *
 * Pure — takes the horizon rather than reading the clock or the database, so it
 * is testable and the caller controls "today".
 */
export function generateStudyPlan(
  perTopic: PerTopicResult[],
  horizonDays: number,
  startFrom: Date = new Date()
): GeneratedPlan {
  const ranked = rankWeakestTopics(perTopic);

  // With a short runway, spreading thin across everything helps nobody. Cap the
  // scheduled set so the weakest topics actually get enough time to move.
  // Roughly one topic per two available days, floor 3, ceiling everything.
  const capacity = Math.max(3, Math.floor(horizonDays / 2));
  const scheduled = ranked.slice(0, capacity);
  const deferred = ranked.slice(capacity).map((t) => t.name);

  // Weakest topics get more minutes AND come first, because early sessions are
  // when motivation and remaining time are both highest.
  const items: PlanItem[] = scheduled.map((topic, i) => {
    const critical = topic.score < 25;
    const weak = topic.score < WEAK_THRESHOLD;

    const date = new Date(startFrom);
    date.setDate(date.getDate() + i);

    return {
      date: isoDate(date),
      syllabusNodeId: topic.syllabusNodeId,
      topic: topic.name,
      subject: topic.subject,
      minutes: critical ? 90 : weak ? 60 : 40,
      priority: critical ? "critical" : weak ? "high" : "moderate",
      reason: critical
        ? `Scored ${topic.score}% in the diagnostic — start from fundamentals.`
        : weak
          ? `Scored ${topic.score}% — needs focused practice.`
          : `Scored ${topic.score}% — consolidate and move to timed practice.`,
    };
  });

  return { horizonDays, items, deferred };
}

/**
 * Persist a generated plan. Replaces any previous diagnostic-derived plan for
 * this user so the dashboard never shows two competing plans; plans the student
 * built from their own uploaded material are left alone.
 */
export async function saveStudyPlan(
  userId: string,
  plan: GeneratedPlan,
  targetExamDate: string | null
): Promise<void> {
  await supabase
    .from("study_plans")
    .delete()
    .eq("user_id", userId)
    .eq("plan_type", "diagnostic");

  const subjects = [
    ...new Set(plan.items.map((i) => i.subject).filter(Boolean)),
  ] as string[];

  const { error } = await supabase.from("study_plans").insert({
    user_id: userId,
    plan_type: "diagnostic",
    target_date: targetExamDate,
    subjects,
    schedule: plan.items,
    // Legacy column is epoch-ms, not timestamptz — match what the table expects.
    created_at: Date.now(),
  });
  if (error) throw error;
}
