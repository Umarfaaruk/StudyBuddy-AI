/**
 * GRADING CLIENT
 * ==============
 * The single browser-side entry point to POST /api/grade.
 *
 * Centralised because grading is the one operation the client cannot do itself:
 * `questions.correct_answer` is admin-only under RLS and absent from
 * `questions_public`. Every quiz-like surface must go through this, so any
 * change to the contract (auth, batching, error shape) happens in one file.
 */

import { getAuthHeaders } from "@/lib/authHeaders";
import type { CollectedAnswer } from "@/components/QuestionPlayer";
import type { Mistake } from "@/components/MistakeReview";
import type { PerTopicResult } from "@/lib/diagnostic";

export type SessionType = "diagnostic" | "practice" | "mock" | "review";

export interface GradedResult {
  questionId: string;
  isCorrect: boolean;
  correctAnswer: string | null;
  explanation: string | null;
  syllabusNodeId: string | null;
}

export interface GradeResponse {
  graded: number;
  correct: number;
  total: number;
  results: GradedResult[];
}

/**
 * Grade a batch of answers.
 * Throws with the server's message so callers can surface something specific
 * rather than a generic failure.
 */
export async function gradeAnswers(
  answers: CollectedAnswer[],
  sessionType: SessionType,
  sessionId: string | null
): Promise<GradeResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      sessionType,
      sessionId,
      answers: answers.map((a) => ({
        questionId: a.questionId,
        selectedAnswer: a.selectedAnswer,
        timeTakenMs: a.timeTakenMs,
      })),
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    throw new Error(body.error || `Grading failed (${res.status})`);
  }
  return (await res.json()) as GradeResponse;
}

/** Roll graded answers up per syllabus node, for result screens and snapshots. */
export function rollUpByTopic(
  answers: CollectedAnswer[],
  results: GradedResult[]
): PerTopicResult[] {
  const correctById = new Map(results.map((r) => [r.questionId, r.isCorrect]));
  const rollup = new Map<string, PerTopicResult>();

  for (const a of answers) {
    const nodeId = a.question.syllabus_node_id;
    if (!nodeId) continue;
    const entry = rollup.get(nodeId) ?? {
      syllabusNodeId: nodeId,
      name: a.question.syllabusName ?? "Unknown topic",
      subject: a.question.subjectName,
      correct: 0,
      total: 0,
      score: 0,
    };
    entry.total += 1;
    if (correctById.get(a.questionId)) entry.correct += 1;
    rollup.set(nodeId, entry);
  }

  return [...rollup.values()].map((t) => ({
    ...t,
    score: t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0,
  }));
}

/**
 * Build the wrong-answer list for review.
 * Safe to expose the key here — the session is graded and already submitted.
 */
export function buildMistakes(
  answers: CollectedAnswer[],
  results: GradedResult[]
): Mistake[] {
  const byId = new Map(results.map((r) => [r.questionId, r]));
  return answers
    .filter((a) => !byId.get(a.questionId)?.isCorrect)
    .map((a) => {
      const r = byId.get(a.questionId);
      return {
        questionId: a.questionId,
        questionText: a.question.question_text,
        options: a.question.options,
        topic: a.question.syllabusName,
        selectedAnswer: a.selectedAnswer,
        correctAnswer: r?.correctAnswer ?? null,
        explanation: r?.explanation ?? null,
      };
    });
}
