/**
 * PRACTICE SESSIONS
 * =================
 * Serves questions from the exam bank for a specific syllabus node — the piece
 * that turns the review queue from a list into something a student can act on.
 *
 * Distinct from the diagnostic in what it optimises for: a diagnostic spreads
 * across the syllabus to *find* weak spots, practice drills *one* concept to
 * fix it. So there is no coverage balancing here, just depth on one node.
 */

import { supabase } from "@/lib/supabase";
import type { DiagnosticQuestion } from "@/lib/diagnostic";

/** Default questions per practice set — short enough to finish in one sitting. */
export const PRACTICE_LENGTH = 10;

export interface PracticeSet {
  questions: DiagnosticQuestion[];
  nodeName: string | null;
  subjectName: string | null;
  /** True when the bank has nothing published for this node. */
  empty: boolean;
}

/**
 * Fetch a practice set for one syllabus node.
 *
 * Ordering is randomised in JS rather than SQL: PostgREST has no ORDER BY
 * RANDOM(), and pulling a wider slice then shuffling avoids serving the same
 * ten questions on every visit, which would turn practice into memorising
 * positions rather than concepts.
 */
export async function fetchPracticeSet(
  examTrackId: string,
  syllabusNodeId: string,
  limit = PRACTICE_LENGTH
): Promise<PracticeSet> {
  const [{ data: rows, error }, { data: node }] = await Promise.all([
    supabase
      .from("questions")
      .select("*")
      .eq("exam_track_id", examTrackId)
      .eq("syllabus_node_id", syllabusNodeId)
      .eq("status", "published")
      .limit(limit * 5),
    supabase
      .from("syllabus_nodes")
      .select("id, name, parent_id")
      .eq("id", syllabusNodeId)
      .maybeSingle(),
  ]);
  if (error) throw error;

  let subjectName: string | null = null;
  if (node?.parent_id) {
    const { data: parent } = await supabase
      .from("syllabus_nodes")
      .select("name")
      .eq("id", node.parent_id)
      .maybeSingle();
    subjectName = parent?.name ?? null;
  }

  const pool = (rows ?? []) as DiagnosticQuestion[];
  for (const q of pool) {
    q.syllabusName = node?.name ?? undefined;
    q.subjectName = subjectName ?? undefined;
  }

  // Fisher-Yates: an unbiased shuffle, unlike sort(() => Math.random() - 0.5)
  // which is neither uniform nor stable across engines.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Bias toward a spread of difficulties so a set is not all easy or all hard.
  const byDifficulty = { easy: [] as DiagnosticQuestion[], medium: [] as DiagnosticQuestion[], hard: [] as DiagnosticQuestion[] };
  for (const q of pool) byDifficulty[q.difficulty]?.push(q);

  const selected: DiagnosticQuestion[] = [];
  const order = ["easy", "medium", "medium", "hard"] as const;
  let cursor = 0;
  while (selected.length < limit) {
    const before = selected.length;
    const bucket = byDifficulty[order[cursor % order.length]];
    const next = bucket.shift();
    if (next) selected.push(next);
    cursor++;
    // Every bucket exhausted — stop rather than spin.
    if (cursor % order.length === 0 && selected.length === before) break;
  }

  return {
    questions: selected,
    nodeName: node?.name ?? null,
    subjectName,
    empty: selected.length === 0,
  };
}
