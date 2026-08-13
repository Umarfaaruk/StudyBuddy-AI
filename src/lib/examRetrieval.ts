/**
 * EXAM CONTEXT RETRIEVAL  (Phase 2.4)
 * ===================================
 * Pulls the relevant syllabus entries and past questions into the model's
 * context so an answer is grounded in the real exam rather than open recall,
 * and returns citations so the grounding is visible to the student.
 *
 * Lexical (Postgres FTS) rather than vector search. Exam syllabi are
 * terminology-dense — a student asking about projectile motion uses the same
 * words the syllabus does — which is where lexical retrieval is strongest, and
 * it needs no embedding provider, no per-question cost, and no backfill on every
 * import. See migration 0006 for the full reasoning.
 *
 * Retrieval NEVER returns answers: `question_answers` is unreadable by any
 * browser role, and the retrieval function is SECURITY INVOKER, so it can only
 * surface what the student could already select.
 */

import { supabase } from "@/lib/supabase";

/** Words too common to narrow a search; they only add noise to an OR query. */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "of", "to", "in", "on",
  "for", "with", "is", "are", "was", "were", "be", "been", "how", "what", "why",
  "when", "where", "which", "who", "do", "does", "did", "can", "could", "would",
  "should", "i", "me", "my", "we", "you", "it", "this", "that", "these", "those",
  "please", "help", "explain", "solve", "question", "problem", "answer", "find",
  "calculate", "value", "given", "using", "from", "at", "by", "as", "not",
]);

/** Cap terms so one pasted essay can't build a pathological tsquery. */
const MAX_TERMS = 12;

/**
 * Turn free text into a safe OR-joined tsquery.
 *
 * Every character that carries meaning to `to_tsquery` (& | ! : * ( ) ') is
 * stripped rather than escaped — the input is a student's prose, so no legitimate
 * query needs those operators, and stripping removes the injection surface
 * entirely instead of trying to neutralise it.
 *
 * OR, not AND: a question like "how do I solve projectile motion problems" would
 * have to match every term against a chapter literally named "Kinematics" under
 * AND semantics, and never would. Verified against the live database — the AND
 * form returns zero rows where the OR form correctly ranks Kinematics first.
 */
export function buildTsQuery(text: string): string {
  // Postgres stems "problems" to "problem" before matching, so a literal
  // stopword lookup would let the plural through and put a useless term in the
  // OR query. Compare a crudely de-pluralised form as well — but always EMIT
  // the original word, so "kinematics" is never mangled into "kinematic".
  const isStopword = (w: string) =>
    STOPWORDS.has(w) ||
    (w.endsWith("es") && STOPWORDS.has(w.slice(0, -2))) ||
    (w.endsWith("s") && STOPWORDS.has(w.slice(0, -1)));

  const terms = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !isStopword(w));

  return [...new Set(terms)].slice(0, MAX_TERMS).join(" | ");
}

export interface SyllabusCitation {
  id: string;
  name: string;
  code: string;
  subject: string | null;
  content: string | null;
}

export interface QuestionCitation {
  id: string;
  question_text: string;
  topic: string | null;
  is_pyq: boolean;
  pyq_year: number | null;
  pyq_session: string | null;
}

export interface ExamContext {
  /** Formatted block to append to the system prompt. Empty when nothing matched. */
  contextText: string;
  syllabus: SyllabusCitation[];
  questions: QuestionCitation[];
  /** True when at least one source was retrieved. */
  grounded: boolean;
}

export const EMPTY_EXAM_CONTEXT: ExamContext = {
  contextText: "", syllabus: [], questions: [], grounded: false,
};

/**
 * Retrieve grounding context for a student's question.
 *
 * Never throws: grounding is an enhancement, and a retrieval failure must
 * degrade to an ungrounded answer rather than break the tutor entirely.
 */
export async function retrieveExamContext(
  examTrackId: string | null | undefined,
  question: string
): Promise<ExamContext> {
  if (!examTrackId) return EMPTY_EXAM_CONTEXT;

  const tsQuery = buildTsQuery(question);
  if (!tsQuery) return EMPTY_EXAM_CONTEXT;

  try {
    const { data, error } = await supabase.rpc("search_exam_context", {
      p_exam_track_id: examTrackId,
      p_query: tsQuery,
      p_syllabus_limit: 3,
      p_question_limit: 3,
    });
    if (error) throw error;

    const syllabus = (data?.syllabus ?? []) as SyllabusCitation[];
    const questions = (data?.questions ?? []) as QuestionCitation[];
    if (syllabus.length === 0 && questions.length === 0) return EMPTY_EXAM_CONTEXT;

    return {
      syllabus,
      questions,
      grounded: true,
      contextText: formatContext(syllabus, questions),
    };
  } catch (err) {
    console.error("[examRetrieval] retrieval failed:", err);
    return EMPTY_EXAM_CONTEXT;
  }
}

/** Render retrieved rows into the block the prompt expects. */
function formatContext(
  syllabus: SyllabusCitation[],
  questions: QuestionCitation[]
): string {
  const parts: string[] = [];

  if (syllabus.length > 0) {
    parts.push(
      "SYLLABUS ENTRIES:\n" +
        syllabus
          .map((s) => {
            const path = s.subject ? `${s.subject} › ${s.name}` : s.name;
            // Chapter names alone are thin grounding; include prose when the
            // node has it, trimmed so one long entry can't crowd out the rest.
            const body = s.content?.trim()
              ? `\n    ${s.content.trim().slice(0, 600)}`
              : "";
            return `  - ${path}${body}`;
          })
          .join("\n")
    );
  }

  if (questions.length > 0) {
    parts.push(
      "PAST / BANK QUESTIONS ON THIS TOPIC:\n" +
        questions
          .map((q) => {
            const origin = q.is_pyq
              ? `${q.pyq_year ?? "previous year"}${q.pyq_session ? ` ${q.pyq_session}` : ""}`
              : "practice bank";
            const topic = q.topic ? `, ${q.topic}` : "";
            return `  - (${origin}${topic}) ${q.question_text.slice(0, 400)}`;
          })
          .join("\n")
    );
  }

  return parts.join("\n\n");
}

/** Short human-readable citation labels for the UI. */
export function citationLabels(ctx: ExamContext): string[] {
  return [
    ...ctx.syllabus.map((s) => (s.subject ? `${s.subject} › ${s.name}` : s.name)),
    ...ctx.questions
      .filter((q) => q.is_pyq)
      .map((q) => `${q.pyq_year ?? "PYQ"}${q.pyq_session ? ` ${q.pyq_session}` : ""}`),
  ];
}
