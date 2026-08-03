/**
 * REVIEW QUEUE + ERROR PATTERNS
 * =============================
 * The two read-side features of Phase 2: what is due for review today (2.2) and
 * what kind of mistakes the student keeps making (2.3).
 *
 * Both deliberately read from tables the grading endpoint already populates, so
 * neither needs its own write path. `concept_reviews.next_due_at` is maintained
 * server-side by SM-2; `question_responses.error_tag` is a student self-tag.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

/* ── 2.2 Due for review ──────────────────────────────────────────────────── */

export interface DueConcept {
  syllabusNodeId: string;
  name: string;
  subject?: string;
  nextDueAt: string;
  intervalDays: number;
  lapses: number;
  /** Whole days overdue. 0 means due today. */
  daysOverdue: number;
}

/**
 * Concepts due now or overdue, most overdue first.
 *
 * Overdue items are included rather than hidden: a queue that only shows "today"
 * silently drops everything a student missed while away, which is exactly the
 * material SM-2 says they are closest to forgetting.
 */
export function useDueReviews(limit = 20) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["due-reviews", user?.uid],
    queryFn: async (): Promise<DueConcept[]> => {
      if (!user) return [];
      const nowIso = new Date().toISOString();

      const { data: rows, error } = await supabase
        .from("concept_reviews")
        .select("syllabus_node_id, next_due_at, interval_days, lapses")
        .eq("user_id", user.uid)
        .lte("next_due_at", nowIso)
        .order("next_due_at", { ascending: true })
        .limit(limit);
      if (error) throw error;
      if (!rows?.length) return [];

      // Resolve names in one query rather than per row.
      const nodeIds = rows.map((r: any) => r.syllabus_node_id);
      const { data: nodes } = await supabase
        .from("syllabus_nodes")
        .select("id, name, parent_id")
        .in("id", nodeIds);
      const nodeById = new Map((nodes ?? []).map((n: any) => [n.id, n]));

      const parentIds = [
        ...new Set((nodes ?? []).map((n: any) => n.parent_id).filter(Boolean)),
      ] as string[];
      let parentName = new Map<string, string>();
      if (parentIds.length) {
        const { data: parents } = await supabase
          .from("syllabus_nodes").select("id, name").in("id", parentIds);
        parentName = new Map((parents ?? []).map((p: any) => [p.id, p.name]));
      }

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      return rows.map((r: any) => {
        const node = nodeById.get(r.syllabus_node_id);
        const due = new Date(r.next_due_at);
        const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
        const overdue = Math.max(
          0,
          Math.round((startOfToday.getTime() - dueDay.getTime()) / 86_400_000)
        );
        return {
          syllabusNodeId: r.syllabus_node_id,
          name: node?.name ?? "Unknown topic",
          subject: node?.parent_id ? parentName.get(node.parent_id) : undefined,
          nextDueAt: r.next_due_at,
          intervalDays: r.interval_days,
          lapses: r.lapses,
          daysOverdue: overdue,
        };
      });
    },
    enabled: !!user,
    // Short: crossing midnight or finishing a review should change this promptly.
    staleTime: 1000 * 60 * 2,
  });
}

/* ── 2.3 Error patterns ──────────────────────────────────────────────────── */

export type ErrorTag =
  | "conceptual" | "calculation" | "misread" | "rushed" | "guessed" | "unknown";

/** Student-facing labels. Kept here so the vocabulary is defined once. */
export const ERROR_TAG_LABELS: Record<ErrorTag, string> = {
  conceptual: "Concept gap",
  calculation: "Calculation or sign slip",
  misread: "Misread the question",
  rushed: "Rushed it",
  guessed: "Guessed",
  unknown: "Not sure",
};

/** How each pattern is described once it becomes a habit rather than a one-off. */
const PATTERN_PHRASING: Record<ErrorTag, string> = {
  conceptual: "concept gaps",
  calculation: "calculation or sign errors",
  misread: "misread questions",
  rushed: "rushed mistakes",
  guessed: "guesses",
  unknown: "untagged mistakes",
};

export interface ErrorPattern {
  tag: ErrorTag;
  topic: string;
  count: number;
  /** Ready-to-render sentence, e.g. "4 sign errors in Kinematics this week". */
  message: string;
}

/**
 * Aggregate self-tagged mistakes into per-topic patterns.
 *
 * A pattern needs at least `minCount` occurrences in the window. One wrong
 * answer is noise; telling a student they have "a pattern" off a single mistake
 * would make the whole feature untrustworthy, and they would stop reading it.
 */
export function useErrorPatterns(windowDays = 7, minCount = 2) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["error-patterns", user?.uid, windowDays],
    queryFn: async (): Promise<ErrorPattern[]> => {
      if (!user) return [];
      const since = new Date();
      since.setDate(since.getDate() - windowDays);

      const { data: rows, error } = await supabase
        .from("question_responses")
        .select("error_tag, syllabus_node_id")
        .eq("user_id", user.uid)
        .eq("is_correct", false)
        .not("error_tag", "is", null)
        .gte("created_at", since.toISOString());
      if (error) throw error;
      if (!rows?.length) return [];

      // Count (tag, topic) pairs.
      const counts = new Map<string, { tag: ErrorTag; nodeId: string; count: number }>();
      for (const r of rows as any[]) {
        if (!r.syllabus_node_id) continue;
        const key = `${r.error_tag}|${r.syllabus_node_id}`;
        const entry = counts.get(key) ?? {
          tag: r.error_tag as ErrorTag, nodeId: r.syllabus_node_id, count: 0,
        };
        entry.count += 1;
        counts.set(key, entry);
      }

      const significant = [...counts.values()].filter((c) => c.count >= minCount);
      if (!significant.length) return [];

      const { data: nodes } = await supabase
        .from("syllabus_nodes")
        .select("id, name")
        .in("id", [...new Set(significant.map((s) => s.nodeId))]);
      const nameById = new Map((nodes ?? []).map((n: any) => [n.id, n.name]));

      const windowPhrase =
        windowDays === 7 ? "this week" : `in the last ${windowDays} days`;

      return significant
        .sort((a, b) => b.count - a.count)
        .map((s) => {
          const topic = nameById.get(s.nodeId) ?? "an unknown topic";
          return {
            tag: s.tag,
            topic,
            count: s.count,
            message: `${s.count} ${PATTERN_PHRASING[s.tag]} in ${topic} ${windowPhrase}`,
          };
        });
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });
}
