import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, CheckCircle2, AlertTriangle, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useExamTracks, useSyllabusNodes, type Difficulty } from "@/lib/examTracks";
import { useAuth } from "@/contexts/AuthContext";

/**
 * QUESTION BANK IMPORT (admin only)
 * =================================
 * Bulk-loads questions from JSON so a licensed question set can be brought in
 * without hand-entering thousands of rows.
 *
 * Deliberate choices:
 *   • Validates the WHOLE file before writing anything. A half-imported batch
 *     is far more painful to clean up than a rejected one.
 *   • Chapters are matched by `code`, not by name. Names get re-worded; codes
 *     are the stable contract, so re-importing a corrected file updates rather
 *     than duplicating.
 *   • Everything lands as `status = 'draft'`. Nothing reaches a student until
 *     it is explicitly published — an import should never be able to push
 *     unreviewed content live.
 *   • Every row is stamped with the same `import_batch`, so one bad file can be
 *     found and deleted as a unit.
 */

interface ImportRow {
  question_text: string;
  syllabus_code?: string;
  question_type?: string;
  options?: { id: string; text: string }[];
  correct_answer?: string;
  explanation?: string;
  difficulty?: Difficulty;
  is_pyq?: boolean;
  pyq_year?: number;
  pyq_session?: string;
  source?: string;
  tags?: string[];
}

interface ValidationResult {
  valid: ImportRow[];
  errors: { row: number; message: string }[];
}

const VALID_TYPES = ["mcq", "multi_correct", "numerical", "assertion_reason"];
const VALID_DIFFICULTY = ["easy", "medium", "hard"];

const SAMPLE = `[
  {
    "syllabus_code": "jee-phy-kinematics",
    "question_text": "A body starts from rest with uniform acceleration 2 m/s². Distance in 3 s?",
    "question_type": "mcq",
    "options": [
      { "id": "a", "text": "6 m" },
      { "id": "b", "text": "9 m" },
      { "id": "c", "text": "12 m" },
      { "id": "d", "text": "18 m" }
    ],
    "correct_answer": "b",
    "explanation": "s = ut + ½at² = 0 + ½(2)(9) = 9 m",
    "difficulty": "easy",
    "is_pyq": false,
    "tags": ["motion", "sujvat"]
  }
]`;

const QuestionBankImport = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: tracks } = useExamTracks();
  const [trackId, setTrackId] = useState("");
  const [raw, setRaw] = useState("");
  const [importing, setImporting] = useState(false);

  const { data: nodes } = useSyllabusNodes(trackId || null);

  /** code → node id, for resolving `syllabus_code` on each row. */
  const codeToId = useMemo(() => {
    const m = new Map<string, string>();
    (nodes ?? []).forEach((n) => m.set(n.code, n.id));
    return m;
  }, [nodes]);

  /** Current published/draft counts, so the admin can see the import land. */
  const { data: counts } = useQuery({
    queryKey: ["question-bank-counts", trackId],
    queryFn: async () => {
      if (!trackId) return null;
      const [all, published] = await Promise.all([
        supabase.from("questions").select("id", { count: "exact", head: true }).eq("exam_track_id", trackId),
        supabase.from("questions").select("id", { count: "exact", head: true }).eq("exam_track_id", trackId).eq("status", "published"),
      ]);
      return { total: all.count ?? 0, published: published.count ?? 0 };
    },
    enabled: !!trackId,
  });

  const validation: ValidationResult | null = useMemo(() => {
    if (!raw.trim()) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return { valid: [], errors: [{ row: 0, message: `Invalid JSON: ${(e as Error).message}` }] };
    }
    if (!Array.isArray(parsed)) {
      return { valid: [], errors: [{ row: 0, message: "Top level must be an array of question objects." }] };
    }

    const valid: ImportRow[] = [];
    const errors: ValidationResult["errors"] = [];

    parsed.forEach((r, i) => {
      const row = r as ImportRow;
      const n = i + 1;
      if (!row?.question_text?.trim()) {
        errors.push({ row: n, message: "question_text is required" });
        return;
      }
      if (row.syllabus_code && !codeToId.has(row.syllabus_code)) {
        errors.push({ row: n, message: `unknown syllabus_code "${row.syllabus_code}"` });
        return;
      }
      if (row.question_type && !VALID_TYPES.includes(row.question_type)) {
        errors.push({ row: n, message: `question_type must be one of ${VALID_TYPES.join(", ")}` });
        return;
      }
      if (row.difficulty && !VALID_DIFFICULTY.includes(row.difficulty)) {
        errors.push({ row: n, message: `difficulty must be easy | medium | hard` });
        return;
      }
      const type = row.question_type ?? "mcq";
      if ((type === "mcq" || type === "multi_correct") && (!row.options || row.options.length < 2)) {
        errors.push({ row: n, message: `${type} needs at least 2 options` });
        return;
      }
      // A question with no answer can never be graded, so it is not importable.
      if (!row.correct_answer?.toString().trim()) {
        errors.push({ row: n, message: "correct_answer is required" });
        return;
      }
      valid.push(row);
    });

    return { valid, errors };
  }, [raw, codeToId]);

  const handleImport = async () => {
    if (!trackId || !validation) return;
    if (validation.errors.length > 0) {
      toast.error("Fix the validation errors before importing.");
      return;
    }
    if (validation.valid.length === 0) {
      toast.error("Nothing to import.");
      return;
    }

    setImporting(true);
    const batch = `import-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    try {
      const rows = validation.valid.map((r) => ({
        exam_track_id: trackId,
        syllabus_node_id: r.syllabus_code ? codeToId.get(r.syllabus_code) ?? null : null,
        question_text: r.question_text.trim(),
        question_type: r.question_type ?? "mcq",
        options: r.options ?? [],
        difficulty: r.difficulty ?? "medium",
        is_pyq: r.is_pyq ?? false,
        pyq_year: r.pyq_year ?? null,
        pyq_session: r.pyq_session ?? null,
        source: r.source ?? null,
        tags: r.tags ?? [],
        status: "draft",
        import_batch: batch,
        created_by: user?.uid ?? null,
      }));

      // Two-table write: answers live in the admin-only `question_answers`
      // table so `questions` has no column students must not read. Insert
      // questions first with RETURNING so each answer can be keyed to its id.
      //
      // Chunked so a large file doesn't exceed the request size limit.
      const CHUNK = 200;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const { data: created, error } = await supabase
          .from("questions")
          .insert(slice)
          .select("id");
        if (error) throw error;

        const answerRows = (created ?? []).map((q: { id: string }, j: number) => ({
          question_id: q.id,
          correct_answer: String(validation.valid[i + j].correct_answer),
          explanation: validation.valid[i + j].explanation ?? null,
        }));
        if (answerRows.length > 0) {
          const { error: aErr } = await supabase
            .from("question_answers")
            .insert(answerRows);
          // A question with no answer can never be graded, so surface this
          // loudly rather than leaving unusable rows behind silently.
          if (aErr) throw new Error(`Questions imported but answers failed: ${aErr.message}`);
        }
        inserted += slice.length;
      }
      if (inserted !== rows.length) {
        throw new Error(`Only ${inserted} of ${rows.length} rows were written.`);
      }

      toast.success(`Imported ${rows.length} question(s) as drafts. Batch: ${batch}`);
      setRaw("");
      queryClient.invalidateQueries({ queryKey: ["question-bank-counts", trackId] });
    } catch (err) {
      console.error("[QuestionBankImport]", err);
      toast.error((err as Error).message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-[#0F172A] flex items-center justify-center flex-shrink-0">
          <Database className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">Question Bank Import</h3>
          <p className="text-sm text-gray-500">
            Bulk-load questions as JSON. Everything imports as a <strong>draft</strong> —
            review and publish before students can see it.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Exam track</label>
        <select
          value={trackId}
          onChange={(e) => setTrackId(e.target.value)}
          className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
        >
          <option value="">Select a track…</option>
          {(tracks ?? []).map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        {counts && (
          <p className="text-xs text-gray-500">
            {counts.total} question(s) in this track · {counts.published} published
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Questions (JSON array)</label>
          <button
            type="button"
            onClick={() => setRaw(SAMPLE)}
            className="text-xs text-blue-600 hover:underline"
          >
            Insert sample
          </button>
        </div>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={12}
          spellCheck={false}
          placeholder="Paste a JSON array of question objects…"
          className="w-full rounded-lg border border-gray-200 p-3 font-mono text-xs"
        />
        <p className="text-xs text-gray-500">
          <code>syllabus_code</code> must match a chapter code for the selected track
          (e.g. <code>jee-phy-kinematics</code>). Rows without one import unlinked
          and can be tagged later.
        </p>
      </div>

      {validation && (
        <div className="rounded-lg border border-gray-200 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            {validation.errors.length === 0 ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-emerald-700 font-medium">
                  {validation.valid.length} question(s) ready to import
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span className="text-amber-700 font-medium">
                  {validation.errors.length} problem(s) — nothing will be imported until these are fixed
                </span>
              </>
            )}
          </div>
          {validation.errors.length > 0 && (
            <ul className="text-xs text-gray-600 space-y-1 max-h-40 overflow-y-auto">
              {validation.errors.slice(0, 25).map((e, i) => (
                <li key={i}>
                  <span className="font-mono">row {e.row}</span>: {e.message}
                </li>
              ))}
              {validation.errors.length > 25 && (
                <li className="text-gray-400">…and {validation.errors.length - 25} more</li>
              )}
            </ul>
          )}
        </div>
      )}

      <Button
        onClick={handleImport}
        disabled={importing || !trackId || !validation || validation.errors.length > 0 || validation.valid.length === 0}
        className="gap-2 bg-[#0F172A] text-white hover:bg-[#0F172A]/90"
      >
        <Upload className="h-4 w-4" />
        {importing ? "Importing…" : "Import as drafts"}
      </Button>
    </div>
  );
};

export default QuestionBankImport;
