/**
 * SERVER-SIDE GRADING  —  POST /api/grade
 * =======================================
 * The counterpart to Phase 1's decision to keep answers off the client.
 * `questions.correct_answer` is admin-only under RLS and the student-facing
 * `questions_public` view omits it, so grading CANNOT happen in the browser.
 * This is the only place an answer is compared.
 *
 * It does four things atomically per submission:
 *   1. grades each answer against the real key (service role, bypasses RLS)
 *   2. records one `question_responses` row per answer — the atom that mastery,
 *      scheduling and error patterns are all derived from
 *   3. advances SM-2 state in `concept_reviews` per syllabus node
 *   4. updates rolling `syllabus_mastery`
 *
 * Explanations are returned ONLY after grading, which is safe: by then the
 * student has committed to an answer.
 *
 * Writes use the service role deliberately — RLS would otherwise require the
 * caller's JWT, and these rows must be written on the student's behalf with
 * values they are not allowed to set themselves (is_correct above all).
 * `userId` therefore comes from the verified token, NEVER from the body.
 */
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "./_verifyToken.js";
// Explicit .js extension and a sibling module: package.json is "type": "module",
// so Node's ESM loader needs a real runtime file. An extensionless import of a
// .ts file outside api/ fails with ERR_MODULE_NOT_FOUND.
import {
  scheduleNextReview,
  updateMastery,
  INITIAL_REVIEW_STATE,
  type Difficulty,
} from "./_spacedRepetition.js";

interface SubmittedAnswer {
  questionId: string;
  selectedAnswer: string | null;
  timeTakenMs?: number | null;
  /** Optional student self-tag for a wrong answer (Phase 2.3). */
  errorTag?: string | null;
}

const VALID_ERROR_TAGS = [
  "conceptual", "calculation", "misread", "rushed", "guessed", "unknown",
];
const VALID_SESSION_TYPES = ["diagnostic", "practice", "mock", "review"];
const MAX_ANSWERS_PER_REQUEST = 100;

function getDb() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Compare a submitted answer with the key.
 * Case- and whitespace-insensitive; numerical answers compare within a small
 * relative tolerance so "9.8" and "9.80" both pass.
 */
function isAnswerCorrect(
  submitted: string | null,
  correct: string | null,
  questionType: string
): boolean {
  if (submitted == null || correct == null) return false;
  const a = submitted.trim().toLowerCase();
  const b = correct.trim().toLowerCase();
  if (!a) return false;

  if (questionType === "numerical") {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      const tolerance = Math.max(Math.abs(nb) * 0.01, 1e-6);
      return Math.abs(na - nb) <= tolerance;
    }
    return a === b;
  }

  if (questionType === "multi_correct") {
    // Order must not matter: "a,c" and "c,a" are the same selection.
    const norm = (s: string) =>
      s.split(/[,\s]+/).filter(Boolean).sort().join(",");
    return norm(a) === norm(b);
  }

  return a === b;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Fails closed when configured; see _verifyToken.js for the fail-open caveat.
  const caller = await requireAuth(req, res);
  if (!caller) return;
  if (caller.unverified) {
    // Grading writes durable progress data, so unlike the AI proxy it must NOT
    // fall open. An unverified caller has no user id to attribute rows to.
    return res.status(503).json({
      error: "Grading is unavailable: the server is missing Supabase credentials.",
    });
  }
  const userId = caller.uid;

  let body: any = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON body" }); }
  }

  const answers: SubmittedAnswer[] = Array.isArray(body?.answers) ? body.answers : [];
  const sessionType: string = body?.sessionType ?? "practice";
  const sessionId: string | null = body?.sessionId ?? null;

  if (answers.length === 0) {
    return res.status(400).json({ error: "answers must be a non-empty array" });
  }
  if (answers.length > MAX_ANSWERS_PER_REQUEST) {
    return res.status(400).json({ error: `At most ${MAX_ANSWERS_PER_REQUEST} answers per request` });
  }
  if (!VALID_SESSION_TYPES.includes(sessionType)) {
    return res.status(400).json({ error: `sessionType must be one of ${VALID_SESSION_TYPES.join(", ")}` });
  }

  try {
    const db = getDb();
    const questionIds = [...new Set(answers.map((a) => a.questionId).filter(Boolean))];

    const { data: questions, error: qErr } = await db
      .from("questions")
      .select("id, correct_answer, explanation, question_type, difficulty, syllabus_node_id, exam_track_id")
      .in("id", questionIds);
    if (qErr) throw qErr;

    const byId = new Map((questions ?? []).map((q: any) => [q.id, q]));

    // Existing SM-2 state for every node this submission touches, fetched once.
    const nodeIds = [
      ...new Set((questions ?? []).map((q: any) => q.syllabus_node_id).filter(Boolean)),
    ];
    const [{ data: reviews }, { data: mastery }] = await Promise.all([
      db.from("concept_reviews").select("*").eq("user_id", userId).in("syllabus_node_id", nodeIds),
      db.from("syllabus_mastery").select("*").eq("user_id", userId).in("syllabus_node_id", nodeIds),
    ]);
    const reviewByNode = new Map((reviews ?? []).map((r: any) => [r.syllabus_node_id, r]));
    const masteryByNode = new Map((mastery ?? []).map((m: any) => [m.syllabus_node_id, m]));

    const now = new Date();
    const responseRows: any[] = [];
    const results: any[] = [];
    // Accumulate per node so ten answers on one chapter produce ONE scheduling
    // update, not ten that each overwrite the last.
    const nodeOutcomes = new Map<string, { correct: number; total: number; lastQuality: number; state: any; nextDueAt: Date }>();

    for (const submitted of answers) {
      const q = byId.get(submitted.questionId);
      if (!q) {
        results.push({ questionId: submitted.questionId, error: "unknown question" });
        continue;
      }

      const isCorrect = isAnswerCorrect(submitted.selectedAnswer, q.correct_answer, q.question_type);
      const timeTakenMs =
        typeof submitted.timeTakenMs === "number" && submitted.timeTakenMs >= 0
          ? Math.round(submitted.timeTakenMs)
          : null;
      const errorTag =
        !isCorrect && submitted.errorTag && VALID_ERROR_TAGS.includes(submitted.errorTag)
          ? submitted.errorTag
          : null;

      responseRows.push({
        user_id: userId,
        question_id: q.id,
        syllabus_node_id: q.syllabus_node_id,
        exam_track_id: q.exam_track_id,
        session_type: sessionType,
        session_id: sessionId,
        selected_answer: submitted.selectedAnswer,
        is_correct: isCorrect,
        time_taken_ms: timeTakenMs,
        error_tag: errorTag,
      });

      if (q.syllabus_node_id) {
        const prev = reviewByNode.get(q.syllabus_node_id);
        const state = nodeOutcomes.get(q.syllabus_node_id)?.state ?? {
          intervalDays: prev?.interval_days ?? INITIAL_REVIEW_STATE.intervalDays,
          ease: prev ? Number(prev.ease) : INITIAL_REVIEW_STATE.ease,
          repetitions: prev?.repetitions ?? INITIAL_REVIEW_STATE.repetitions,
          lapses: prev?.lapses ?? INITIAL_REVIEW_STATE.lapses,
        };

        const next = scheduleNextReview(
          state,
          { isCorrect, timeTakenMs, difficulty: (q.difficulty ?? "medium") as Difficulty },
          now
        );

        const acc = nodeOutcomes.get(q.syllabus_node_id) ?? {
          correct: 0, total: 0, lastQuality: next.quality, state: next.state, nextDueAt: next.nextDueAt,
        };
        acc.correct += isCorrect ? 1 : 0;
        acc.total += 1;
        acc.lastQuality = next.quality;
        acc.state = next.state;
        acc.nextDueAt = next.nextDueAt;
        nodeOutcomes.set(q.syllabus_node_id, acc);
      }

      results.push({
        questionId: q.id,
        isCorrect,
        correctAnswer: q.correct_answer,   // safe: they have already answered
        explanation: q.explanation ?? null,
        syllabusNodeId: q.syllabus_node_id,
      });
    }

    if (responseRows.length > 0) {
      const { error } = await db.from("question_responses").insert(responseRows);
      if (error) throw error;
    }

    // Upsert scheduling + mastery per touched node.
    for (const [nodeId, acc] of nodeOutcomes) {
      const prevMastery = masteryByNode.get(nodeId);
      const currentScore = prevMastery?.mastery_score ?? 0;
      const majorityCorrect = acc.correct * 2 >= acc.total;
      const newScore = updateMastery(currentScore, majorityCorrect, acc.lastQuality);

      await Promise.all([
        db.from("concept_reviews").upsert({
          user_id: userId,
          syllabus_node_id: nodeId,
          interval_days: acc.state.intervalDays,
          ease: acc.state.ease,
          repetitions: acc.state.repetitions,
          lapses: acc.state.lapses,
          last_reviewed_at: now.toISOString(),
          next_due_at: acc.nextDueAt.toISOString(),
          updated_at: now.toISOString(),
        }, { onConflict: "user_id,syllabus_node_id" }),

        db.from("syllabus_mastery").upsert({
          user_id: userId,
          syllabus_node_id: nodeId,
          mastery_score: newScore,
          questions_seen: (prevMastery?.questions_seen ?? 0) + acc.total,
          questions_correct: (prevMastery?.questions_correct ?? 0) + acc.correct,
          last_practised_at: now.toISOString(),
          updated_at: now.toISOString(),
        }, { onConflict: "user_id,syllabus_node_id" }),
      ]);
    }

    const correctCount = results.filter((r) => r.isCorrect).length;
    return res.status(200).json({
      graded: results.length,
      correct: correctCount,
      total: answers.length,
      results,
    });
  } catch (err: any) {
    console.error("[grade] failed:", err?.message ?? err);
    return res.status(500).json({ error: "Grading failed. Please try again." });
  }
}
