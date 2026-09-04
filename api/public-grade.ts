/**
 * ANONYMOUS GRADING  —  POST /api/public-grade
 * ============================================
 * Scores the no-signup diagnostic (Phase 4.2). Unauthenticated by necessity:
 * the whole point of a lead magnet is that it works before anyone signs up.
 *
 * THIS ENDPOINT IS AN ANSWER-KEY ORACLE IF BUILT NAIVELY, so it is deliberately
 * weaker than /api/grade rather than a copy of it:
 *
 *   • It returns ONLY per-topic aggregates — never per-question correctness,
 *     never the correct answer, never the explanation. Returning per-question
 *     results would let anyone extract the entire answer key by submitting
 *     every question id with a fixed guess and diffing the responses.
 *   • It caps questions per request, so one call cannot sweep the bank.
 *   • It writes NOTHING to a student's progress: no question_responses, no
 *     concept_reviews, no mastery. There is no authenticated user to attribute
 *     any of it to, and accepting a user id from the body would let anyone
 *     write arbitrary progress into someone else's account.
 *
 * The full report is gated behind lead capture on the client, but the gate is a
 * conversion mechanism, not a security boundary — everything this endpoint
 * returns is safe to hand out.
 */
import { createClient } from "@supabase/supabase-js";

/** A free test is 5-10 questions; anything larger is someone probing. */
const MAX_QUESTIONS = 10;

interface SubmittedAnswer {
  questionId: string;
  selectedAnswer: string | null;
}

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

/** Same comparison rules as the authenticated grader, kept deliberately in sync. */
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
      return Math.abs(na - nb) <= Math.max(Math.abs(nb) * 0.01, 1e-6);
    }
    return a === b;
  }
  if (questionType === "multi_correct") {
    const norm = (s: string) => s.split(/[,\s]+/).filter(Boolean).sort().join(",");
    return norm(a) === norm(b);
  }
  return a === b;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON body" }); }
  }

  const answers: SubmittedAnswer[] = Array.isArray(body?.answers) ? body.answers : [];
  if (answers.length === 0) {
    return res.status(400).json({ error: "answers must be a non-empty array" });
  }
  if (answers.length > MAX_QUESTIONS) {
    return res.status(400).json({ error: `At most ${MAX_QUESTIONS} answers per request` });
  }

  try {
    const db = getDb();
    const questionIds = [...new Set(answers.map((a) => a.questionId).filter(Boolean))];

    const [{ data: questions, error: qErr }, { data: keyRows, error: aErr }] =
      await Promise.all([
        db.from("questions")
          .select("id, question_type, syllabus_node_id")
          .in("id", questionIds)
          .eq("status", "published"),
        db.from("question_answers")
          .select("question_id, correct_answer")
          .in("question_id", questionIds),
      ]);
    if (qErr) throw qErr;
    if (aErr) throw aErr;

    const keyById = new Map((keyRows ?? []).map((k: any) => [k.question_id, k.correct_answer]));
    const byId = new Map((questions ?? []).map((q: any) => [q.id, q]));

    // Aggregate per syllabus node. Individual outcomes are computed but never
    // leave this function.
    const perNode = new Map<string, { correct: number; total: number }>();
    let correctCount = 0;

    for (const submitted of answers) {
      const q = byId.get(submitted.questionId);
      if (!q) continue;
      const ok = isAnswerCorrect(
        submitted.selectedAnswer, keyById.get(q.id) ?? null, q.question_type
      );
      if (ok) correctCount++;
      const node = q.syllabus_node_id;
      if (!node) continue;
      const entry = perNode.get(node) ?? { correct: 0, total: 0 };
      entry.total += 1;
      if (ok) entry.correct += 1;
      perNode.set(node, entry);
    }

    // Resolve names so the client can render topic labels without another
    // round-trip (and without needing question ids at all).
    const nodeIds = [...perNode.keys()];
    let nameById = new Map<string, string>();
    let parentNameById = new Map<string, string>();
    if (nodeIds.length > 0) {
      const { data: nodes } = await db
        .from("syllabus_nodes").select("id, name, parent_id").in("id", nodeIds);
      nameById = new Map((nodes ?? []).map((n: any) => [n.id, n.name]));
      const parentIds = [...new Set((nodes ?? []).map((n: any) => n.parent_id).filter(Boolean))];
      if (parentIds.length > 0) {
        const { data: parents } = await db
          .from("syllabus_nodes").select("id, name").in("id", parentIds);
        const pName = new Map((parents ?? []).map((p: any) => [p.id, p.name]));
        for (const n of nodes ?? []) {
          const pid = (n as any).parent_id;
          if (pid) parentNameById.set((n as any).id, pName.get(pid) ?? "");
        }
      }
    }

    const perTopic = [...perNode.entries()].map(([nodeId, v]) => ({
      syllabusNodeId: nodeId,
      name: nameById.get(nodeId) ?? "Unknown topic",
      subject: parentNameById.get(nodeId) || undefined,
      correct: v.correct,
      total: v.total,
      score: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
    }));

    const total = answers.length;
    return res.status(200).json({
      correct: correctCount,
      total,
      score: total > 0 ? Math.round((correctCount / total) * 10000) / 100 : 0,
      perTopic,
    });
  } catch (err: any) {
    console.error("[public-grade] failed:", err?.message ?? err);
    return res.status(500).json({ error: "Could not score your test. Please try again." });
  }
}
