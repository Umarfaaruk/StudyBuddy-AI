/**
 * MOCK TESTS  (Phase 3.1 / 3.2)
 * =============================
 * Timed, scored tests over a chosen slice of the syllabus, plus the mastery
 * snapshotting that makes a "week 1 → week 6" chart possible later.
 *
 * Distinct from both earlier surfaces:
 *   • the diagnostic finds weak spots once, adaptively;
 *   • practice drills one concept;
 *   • a mock reproduces exam conditions — fixed length, fixed clock, no
 *     feedback until submission — so its score is comparable ACROSS attempts.
 * That comparability is the whole point: it is the number an outcome claim
 * ("improved 19% in 3 weeks") is built from, so it must be produced the same
 * way every time.
 */

import { supabase } from "@/lib/supabase";
import type { DiagnosticQuestion } from "@/lib/diagnostic";
import type { CollectedAnswer } from "@/components/QuestionPlayer";
import type { PerTopicResult } from "@/lib/diagnostic";

export type MockScope = "full_syllabus" | "subject" | "chapter";

export interface MockTest {
  id: string;
  exam_track_id: string;
  title: string;
  scope: MockScope;
  syllabus_node_id: string | null;
  question_count: number;
  duration_minutes: number;
  is_active: boolean;
}

export interface MockAttemptSummary {
  id: string;
  mock_test_id: string | null;
  score: number | null;
  percentile: number | null;
  correct_count: number;
  total_questions: number;
  submitted_at: string | null;
  duration_seconds: number | null;
}

/** Active mock tests for a track. */
export async function fetchMockTests(examTrackId: string): Promise<MockTest[]> {
  const { data, error } = await supabase
    .from("mock_tests")
    .select("*")
    .eq("exam_track_id", examTrackId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MockTest[];
}

/**
 * Collect the descendant node ids for a scoped test.
 *
 * A 'subject' scope must include every chapter beneath it, otherwise a subject
 * test would only match questions tagged directly to the subject node — which
 * is almost none of them, since tagging happens at chapter level.
 */
async function resolveScopeNodeIds(
  examTrackId: string,
  scope: MockScope,
  nodeId: string | null
): Promise<string[] | null> {
  if (scope === "full_syllabus" || !nodeId) return null;

  const { data: nodes, error } = await supabase
    .from("syllabus_nodes")
    .select("id, parent_id")
    .eq("exam_track_id", examTrackId);
  if (error) throw error;

  const childrenOf = new Map<string, string[]>();
  for (const n of nodes ?? []) {
    const p = (n as any).parent_id;
    if (!p) continue;
    if (!childrenOf.has(p)) childrenOf.set(p, []);
    childrenOf.get(p)!.push((n as any).id);
  }

  const collected: string[] = [];
  const walk = (id: string) => {
    collected.push(id);
    for (const child of childrenOf.get(id) ?? []) walk(child);
  };
  walk(nodeId);
  return collected;
}

export interface MockQuestionSet {
  questions: DiagnosticQuestion[];
  /** True when the bank cannot fill the requested length. */
  short: boolean;
  requested: number;
}

/**
 * Draw the question set for one attempt.
 *
 * Shuffled so two students sitting the same test do not see identical ordering,
 * and so a repeat attempt is not pure recall of question positions.
 */
export async function buildMockQuestionSet(test: MockTest): Promise<MockQuestionSet> {
  const scopeIds = await resolveScopeNodeIds(
    test.exam_track_id, test.scope, test.syllabus_node_id
  );

  let query = supabase
    .from("questions")
    .select("*")
    .eq("exam_track_id", test.exam_track_id)
    .eq("status", "published")
    .limit(test.question_count * 5);

  if (scopeIds && scopeIds.length > 0) query = query.in("syllabus_node_id", scopeIds);

  const { data: rows, error } = await query;
  if (error) throw error;

  const pool = (rows ?? []) as DiagnosticQuestion[];

  // Fisher-Yates: an unbiased shuffle. sort(() => Math.random() - 0.5) is
  // neither uniform nor stable across engines and would bias which questions a
  // student ever sees.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const selected = pool.slice(0, test.question_count);
  await attachNodeNames(selected);

  return {
    questions: selected,
    short: selected.length < test.question_count,
    requested: test.question_count,
  };
}

/** Attach chapter/subject labels for the results breakdown. */
async function attachNodeNames(questions: DiagnosticQuestion[]): Promise<void> {
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

/* ── Resuming an interrupted attempt ──────────────────────────────────────── */

/**
 * An attempt that was started but never submitted.
 *
 * `startedAt` comes from the SERVER row, not from the browser. That is the
 * whole point: the deadline is derived from it, so closing the tab, editing
 * local storage or changing the system clock cannot buy extra time.
 */
export interface OpenAttempt {
  id: string;
  startedAt: number;
}

/** The most recent unsubmitted attempt at this test, if there is one. */
export async function findOpenAttempt(
  userId: string, mockTestId: string
): Promise<OpenAttempt | null> {
  const { data, error } = await supabase
    .from("mock_test_attempts")
    .select("id, started_at")
    .eq("user_id", userId)
    .eq("mock_test_id", mockTestId)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id as string, startedAt: new Date(data.started_at as string).getTime() };
}

/**
 * Locally cached progress for one attempt.
 *
 * The QUESTION SET is stored, not just the answers. buildMockQuestionSet
 * reshuffles with Math.random() on every call, so a refresh would otherwise
 * produce a different set in a different order and the restored answers would
 * silently attach to the wrong questions — a scoring corruption far worse than
 * simply losing the answers.
 *
 * This is a per-browser convenience only. Nothing here is trusted: the clock
 * comes from the server row, and grading re-reads the answer key server-side.
 */
export interface MockProgress {
  questions: DiagnosticQuestion[];
  answers: CollectedAnswer[];
}

const progressKey = (attemptId: string) => `studybuddy:mock:${attemptId}`;

export function saveMockProgress(attemptId: string, progress: MockProgress): void {
  try {
    localStorage.setItem(progressKey(attemptId), JSON.stringify(progress));
  } catch {
    // Private mode, quota, or storage blocked. Losing the cache costs the
    // student their answers on a refresh; throwing here would cost them the
    // whole test. Degrade quietly.
  }
}

export function loadMockProgress(attemptId: string): MockProgress | null {
  try {
    const raw = localStorage.getItem(progressKey(attemptId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MockProgress;
    if (!Array.isArray(parsed?.questions) || !Array.isArray(parsed?.answers)) return null;
    if (parsed.questions.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearMockProgress(attemptId: string): void {
  try { localStorage.removeItem(progressKey(attemptId)); } catch { /* nothing to do */ }
}

export async function startMockAttempt(
  userId: string, test: MockTest, totalQuestions: number
): Promise<string> {
  const { data, error } = await supabase
    .from("mock_test_attempts")
    .insert({
      user_id: userId,
      mock_test_id: test.id,
      exam_track_id: test.exam_track_id,
      status: "in_progress",
      total_questions: totalQuestions,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * Finalise an attempt.
 *
 * The percentile is computed and STORED at submission rather than derived on
 * read: recomputing later would silently move a number the student was already
 * shown, and these figures feed outcome claims.
 */
export async function completeMockAttempt(params: {
  attemptId: string;
  mockTestId: string;
  correctCount: number;
  totalQuestions: number;
  durationSeconds: number;
  perTopic: PerTopicResult[];
}): Promise<{ score: number; percentile: number | null }> {
  const score = params.totalQuestions > 0
    ? Math.round((params.correctCount / params.totalQuestions) * 10000) / 100
    : 0;

  let percentile: number | null = null;
  try {
    const { data } = await supabase.rpc("mock_test_percentile", {
      p_mock_test_id: params.mockTestId,
      p_score: score,
    });
    percentile = data ?? null;
  } catch (err) {
    // A missing percentile is not worth failing a submission over — the score
    // is the number that matters and it is already computed.
    console.error("[mockTests] percentile unavailable:", err);
  }

  const { error } = await supabase
    .from("mock_test_attempts")
    .update({
      status: "completed",
      submitted_at: new Date().toISOString(),
      duration_seconds: params.durationSeconds,
      correct_count: params.correctCount,
      total_questions: params.totalQuestions,
      score,
      percentile,
      per_topic: params.perTopic,
    })
    .eq("id", params.attemptId);
  if (error) throw error;

  return { score, percentile };
}

/* ── Mastery time series (3.2) ───────────────────────────────────────────── */

/**
 * Snapshot the student's current per-topic mastery.
 *
 * `syllabus_mastery` holds only the CURRENT value, so without this a
 * "week 1 vs week 6" comparison is unanswerable — the earlier value is simply
 * gone. Unique on (user, node, day), so calling it repeatedly in a day is
 * idempotent rather than inflating the series.
 *
 * Never throws: losing a snapshot must not fail the test submission that
 * triggered it.
 */
export async function captureMasterySnapshot(userId: string): Promise<void> {
  try {
    const { data: mastery, error } = await supabase
      .from("syllabus_mastery")
      .select("syllabus_node_id, mastery_score")
      .eq("user_id", userId);
    if (error) throw error;
    if (!mastery?.length) return;

    const today = new Date().toISOString().slice(0, 10);
    const rows = mastery.map((m: any) => ({
      user_id: userId,
      syllabus_node_id: m.syllabus_node_id,
      mastery_score: m.mastery_score,
      captured_on: today,
    }));

    await supabase
      .from("mastery_snapshots")
      .upsert(rows, { onConflict: "user_id,syllabus_node_id,captured_on" });
  } catch (err) {
    console.error("[mockTests] snapshot failed:", err);
  }
}

/** A student's completed attempts, oldest first — the outcome series. */
export async function fetchAttemptSeries(userId: string): Promise<MockAttemptSummary[]> {
  const { data, error } = await supabase
    .from("mock_test_attempts")
    .select("id, mock_test_id, score, percentile, correct_count, total_questions, submitted_at, duration_seconds")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("submitted_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MockAttemptSummary[];
}
