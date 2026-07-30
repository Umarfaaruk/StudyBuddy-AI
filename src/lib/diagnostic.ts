/**
 * DIAGNOSTIC ENGINE
 * =================
 * Picks and sequences the short adaptive test that bootstraps a student's
 * per-topic mastery, then turns the result into a prioritised study plan.
 *
 * Two constraints pull against each other:
 *   • COVERAGE — the point of a diagnostic is to find weak spots anywhere in
 *     the syllabus, so it must spread across subjects and chapters rather than
 *     drilling whichever chapter happens to have the most questions.
 *   • ADAPTIVITY — difficulty should track the student so we learn more per
 *     question than a fixed-difficulty set would tell us.
 *
 * Coverage wins on chapter choice, adaptivity wins on difficulty choice. That
 * keeps the breadth guarantee while still calibrating: a student who is strong
 * gets asked harder questions about the same spread of chapters.
 *
 * Adaptivity is resolved CLIENT-SIDE from a pre-fetched pool rather than one
 * server round-trip per question. Questions carry no answers (they come from
 * `questions_public`), so there is nothing to leak, and a diagnostic that
 * stalls on network latency between every question gets abandoned.
 */

import { supabase } from "@/lib/supabase";
import type { Difficulty, PublicQuestion } from "@/lib/examTracks";

/** Target length. Your spec's 15–25 band; 20 is the default. */
export const DIAGNOSTIC_LENGTH = 20;
/** Below this the result is too thin to build a plan from. */
export const DIAGNOSTIC_MIN_QUESTIONS = 8;

const DIFFICULTY_ORDER: Difficulty[] = ["easy", "medium", "hard"];

export interface DiagnosticQuestion extends PublicQuestion {
  /** Chapter/subject label for progress display and result grouping. */
  syllabusName?: string;
  subjectName?: string;
}

export interface DiagnosticPool {
  questions: DiagnosticQuestion[];
  /** True when the bank cannot support a meaningful diagnostic yet. */
  insufficient: boolean;
  availableCount: number;
}

/**
 * Fetch a coverage-balanced pool for one exam track.
 *
 * Over-fetches (3x the target) so the adaptive walk has room to pick a harder
 * or easier question in the chapter it wants, instead of being forced onto
 * whatever difficulty is left.
 */
export async function fetchDiagnosticPool(
  examTrackId: string,
  length = DIAGNOSTIC_LENGTH
): Promise<DiagnosticPool> {
  const { data: rows, error } = await supabase
    .from("questions_public")
    .select("*")
    .eq("exam_track_id", examTrackId)
    .limit(length * 12);
  if (error) throw error;

  const questions = (rows ?? []) as DiagnosticQuestion[];

  // Attach human-readable chapter/subject names in one extra round-trip so the
  // results screen can group by topic without a join per question.
  const nodeIds = [...new Set(questions.map((q) => q.syllabus_node_id).filter(Boolean))] as string[];
  if (nodeIds.length > 0) {
    const { data: nodes } = await supabase
      .from("syllabus_nodes")
      .select("id, name, parent_id")
      .in("id", nodeIds);
    const nameById = new Map((nodes ?? []).map((n: any) => [n.id, n.name]));
    const parentById = new Map((nodes ?? []).map((n: any) => [n.id, n.parent_id]));

    const parentIds = [...new Set([...parentById.values()].filter(Boolean))] as string[];
    let parentNames = new Map<string, string>();
    if (parentIds.length > 0) {
      const { data: parents } = await supabase
        .from("syllabus_nodes").select("id, name").in("id", parentIds);
      parentNames = new Map((parents ?? []).map((p: any) => [p.id, p.name]));
    }

    for (const q of questions) {
      if (!q.syllabus_node_id) continue;
      q.syllabusName = nameById.get(q.syllabus_node_id);
      const pid = parentById.get(q.syllabus_node_id);
      q.subjectName = pid ? parentNames.get(pid) : undefined;
    }
  }

  return {
    questions,
    availableCount: questions.length,
    insufficient: questions.length < DIAGNOSTIC_MIN_QUESTIONS,
  };
}

/**
 * Build the question sequence.
 *
 * Chapters are visited round-robin across subjects (coverage), and within the
 * chosen chapter the difficulty is whatever the running performance calls for
 * (adaptivity). Falls back to the nearest available difficulty rather than
 * skipping a chapter — a thin bank should still produce a usable diagnostic.
 */
export function buildAdaptiveSequence(
  pool: DiagnosticQuestion[],
  length = DIAGNOSTIC_LENGTH
): DiagnosticQuestion[] {
  if (pool.length === 0) return [];

  // Group by chapter, then by difficulty, so selection is O(1) per pick.
  const byChapter = new Map<string, Map<Difficulty, DiagnosticQuestion[]>>();
  for (const q of pool) {
    const chapter = q.syllabus_node_id ?? "unassigned";
    if (!byChapter.has(chapter)) byChapter.set(chapter, new Map());
    const diffMap = byChapter.get(chapter)!;
    const d = q.difficulty;
    if (!diffMap.has(d)) diffMap.set(d, []);
    diffMap.get(d)!.push(q);
  }

  // Interleave chapters by subject so consecutive questions rarely share a
  // subject — a run of ten Physics questions makes the test feel narrow and
  // tells us nothing about Chemistry until the student has already tired.
  const chapters = [...byChapter.keys()];
  const bySubject = new Map<string, string[]>();
  for (const ch of chapters) {
    const sample = byChapter.get(ch)!.values().next().value?.[0];
    const subject = sample?.subjectName ?? "other";
    if (!bySubject.has(subject)) bySubject.set(subject, []);
    bySubject.get(subject)!.push(ch);
  }
  const interleaved: string[] = [];
  const subjectQueues = [...bySubject.values()];
  let added = true;
  while (added) {
    added = false;
    for (const queue of subjectQueues) {
      const next = queue.shift();
      if (next) { interleaved.push(next); added = true; }
    }
  }

  const sequence: DiagnosticQuestion[] = [];
  const used = new Set<string>();
  let difficultyIdx = 1; // start at medium — most informative first probe

  for (let i = 0; i < length && interleaved.length > 0; i++) {
    const chapter = interleaved[i % interleaved.length];
    const diffMap = byChapter.get(chapter);
    if (!diffMap) continue;

    // Preferred difficulty, then nearest available.
    const preference = [
      DIFFICULTY_ORDER[difficultyIdx],
      DIFFICULTY_ORDER[Math.max(0, difficultyIdx - 1)],
      DIFFICULTY_ORDER[Math.min(2, difficultyIdx + 1)],
    ];

    let picked: DiagnosticQuestion | undefined;
    for (const d of preference) {
      const bucket = diffMap.get(d);
      picked = bucket?.find((q) => !used.has(q.id));
      if (picked) break;
    }
    // Nothing left at any preferred difficulty in this chapter — take anything.
    if (!picked) {
      for (const bucket of diffMap.values()) {
        picked = bucket.find((q) => !used.has(q.id));
        if (picked) break;
      }
    }
    if (!picked) continue;

    used.add(picked.id);
    sequence.push(picked);
  }

  return sequence;
}

/**
 * Step the difficulty after an answer.
 * Exported so the UI owns the running state and this stays pure/testable.
 */
export function nextDifficultyIndex(current: number, wasCorrect: boolean): number {
  return wasCorrect ? Math.min(2, current + 1) : Math.max(0, current - 1);
}

/* ── Session lifecycle ───────────────────────────────────────────────────── */

export async function startDiagnosticSession(
  userId: string,
  examTrackId: string,
  totalQuestions: number
): Promise<string> {
  const { data, error } = await supabase
    .from("diagnostic_sessions")
    .insert({
      user_id: userId,
      exam_track_id: examTrackId,
      status: "in_progress",
      total_questions: totalQuestions,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export interface PerTopicResult {
  syllabusNodeId: string;
  name: string;
  subject?: string;
  correct: number;
  total: number;
  /** Percentage correct for this diagnostic, 0–100. */
  score: number;
}

/**
 * Close the session and snapshot the per-topic breakdown.
 *
 * The snapshot is stored on the session rather than read live from
 * syllabus_mastery so the result page stays reproducible: later practice moves
 * the live scores, and a student revisiting their diagnostic should see what it
 * actually said at the time.
 */
export async function completeDiagnosticSession(
  sessionId: string,
  perTopic: PerTopicResult[],
  correctCount: number
): Promise<void> {
  const { error } = await supabase
    .from("diagnostic_sessions")
    .update({
      status: "completed",
      correct_count: correctCount,
      per_topic: perTopic,
      completed_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
  if (error) throw error;
}

/** Weakest topics first — what the study plan is ordered by. */
export function rankWeakestTopics(perTopic: PerTopicResult[]): PerTopicResult[] {
  return [...perTopic].sort((a, b) => a.score - b.score || b.total - a.total);
}
