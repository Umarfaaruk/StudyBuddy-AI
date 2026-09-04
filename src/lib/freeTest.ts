/**
 * FREE DIAGNOSTIC / LEAD MAGNET  (Phase 4.2)
 * ==========================================
 * The no-signup funnel: a short public test, an immediate partial result, then
 * the full report gated behind an email or phone number.
 *
 * The gate is a CONVERSION mechanism, not a security boundary. Everything the
 * public grader returns is safe to hand out — the gate exists because a partial
 * result is a stronger reason to leave contact details than a full one, not
 * because the rest is secret.
 *
 * Runs entirely anonymously: `questions` allows anon SELECT of published rows,
 * and `leads` allows anon INSERT with no SELECT policy, so the browser can
 * write a lead but can never read the lead list back.
 */

import { supabase } from "@/lib/supabase";
import type { DiagnosticQuestion } from "@/lib/diagnostic";

/** Short enough to finish before losing interest. */
export const FREE_TEST_LENGTH = 8;
/** Weak topics revealed before the gate — enough to intrigue, not to satisfy. */
export const PARTIAL_TOPIC_COUNT = 2;

export interface FreeTestTopicResult {
  syllabusNodeId: string;
  name: string;
  subject?: string;
  correct: number;
  total: number;
  score: number;
}

export interface FreeTestResult {
  correct: number;
  total: number;
  score: number;
  perTopic: FreeTestTopicResult[];
}

/**
 * Draw a public test.
 *
 * Spread across chapters rather than drilling one, since the pitch is "find
 * your weak spots" — eight questions from a single chapter cannot do that.
 */
export async function fetchFreeTestQuestions(
  examTrackId: string,
  length = FREE_TEST_LENGTH
): Promise<DiagnosticQuestion[]> {
  const { data: rows, error } = await supabase
    .from("questions")
    .select("id, exam_track_id, syllabus_node_id, question_text, question_type, options, difficulty, is_pyq, pyq_year, pyq_session, tags")
    .eq("exam_track_id", examTrackId)
    .eq("status", "published")
    .limit(length * 10);
  if (error) throw error;

  const pool = (rows ?? []) as DiagnosticQuestion[];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // One question per chapter first, so the set spans the syllabus before it
  // doubles up anywhere.
  const seen = new Set<string>();
  const spread: DiagnosticQuestion[] = [];
  const leftovers: DiagnosticQuestion[] = [];
  for (const q of pool) {
    const key = q.syllabus_node_id ?? "none";
    if (!seen.has(key)) { seen.add(key); spread.push(q); }
    else leftovers.push(q);
  }
  const selected = [...spread, ...leftovers].slice(0, length);

  await attachNames(selected);
  return selected;
}

async function attachNames(questions: DiagnosticQuestion[]): Promise<void> {
  const nodeIds = [...new Set(questions.map((q) => q.syllabus_node_id).filter(Boolean))] as string[];
  if (nodeIds.length === 0) return;

  const { data: nodes } = await supabase
    .from("syllabus_nodes").select("id, name, parent_id").in("id", nodeIds);
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

/** Score anonymously. Returns aggregates only — see api/public-grade.ts. */
export async function gradeFreeTest(
  answers: { questionId: string; selectedAnswer: string | null }[]
): Promise<FreeTestResult> {
  const res = await fetch("/api/public-grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    throw new Error(body.error || `Scoring failed (${res.status})`);
  }
  return (await res.json()) as FreeTestResult;
}

export interface LeadCapture {
  email?: string;
  phone?: string;
  name?: string;
  examTrackId: string;
  answers: { questionId: string; selectedAnswer: string | null }[];
  result: FreeTestResult;
}

/**
 * Store the lead.
 *
 * Attribution is read from the URL at capture time, because the referring link
 * is long gone by the time someone eventually signs up.
 */
export async function captureLead(lead: LeadCapture): Promise<void> {
  const params = new URLSearchParams(window.location.search);

  const { error } = await supabase.from("leads").insert({
    email: lead.email?.trim() || null,
    phone: lead.phone?.trim() || null,
    name: lead.name?.trim() || null,
    exam_track_id: lead.examTrackId,
    source: "free_test",
    answers: lead.answers,
    per_topic: lead.result.perTopic,
    score: lead.result.score,
    referral_code: params.get("ref") || null,
    cohort_join_code: params.get("code") || null,
  });
  if (error) throw error;
}

/** Weakest topics first — what the partial result teases. */
export function weakestFirst(perTopic: FreeTestTopicResult[]): FreeTestTopicResult[] {
  return [...perTopic].sort((a, b) => a.score - b.score || b.total - a.total);
}
