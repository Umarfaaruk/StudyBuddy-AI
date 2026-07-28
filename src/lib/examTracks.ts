/**
 * EXAM TRACKS — data access for the exam-prep model
 * ==================================================
 * One generic shape serves every exam. Adding EAPCET (or anything else) is a
 * row in `exam_tracks` plus its syllabus rows — no code and no schema change.
 *
 * The syllabus is a self-referencing tree (subject → chapter → topic) stored
 * flat in `syllabus_nodes`; `buildSyllabusTree` assembles it client-side, which
 * is far cheaper than a recursive CTE per page for a tree of this size (a few
 * hundred nodes) and lets React Query cache the whole thing as one entry.
 *
 * Questions are read through `questions_public`, a view that omits
 * `correct_answer` and `explanation`. Never query `questions` from the browser:
 * anything RLS lets the client select can be read out of the network tab, and
 * that would hand students the answer key.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export type SyllabusLevel = "subject" | "chapter" | "topic";
export type Difficulty = "easy" | "medium" | "hard";

export interface ExamTrack {
  id: string;
  name: string;
  full_name: string | null;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface SyllabusNode {
  id: string;
  exam_track_id: string;
  parent_id: string | null;
  level: SyllabusLevel;
  name: string;
  code: string;
  position: number;
  weightage: number | null;
  content: string | null;
}

/** A syllabus node with its descendants attached. */
export interface SyllabusTreeNode extends SyllabusNode {
  children: SyllabusTreeNode[];
}

/** A question as the BROWSER may see it — no answer, no explanation. */
export interface PublicQuestion {
  id: string;
  exam_track_id: string;
  syllabus_node_id: string | null;
  question_text: string;
  question_type: "mcq" | "multi_correct" | "numerical" | "assertion_reason";
  options: { id: string; text: string }[];
  difficulty: Difficulty;
  is_pyq: boolean;
  pyq_year: number | null;
  pyq_session: string | null;
  tags: string[];
}

/* ── Queries ─────────────────────────────────────────────────────────────── */

/** All selectable exam tracks. Reference data — cached aggressively. */
export function useExamTracks() {
  return useQuery({
    queryKey: ["exam-tracks"],
    queryFn: async (): Promise<ExamTrack[]> => {
      const { data, error } = await supabase
        .from("exam_tracks")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60 * 60, // an hour; this changes about never
  });
}

/** Flat syllabus rows for one track. */
export function useSyllabusNodes(examTrackId: string | null | undefined) {
  return useQuery({
    queryKey: ["syllabus-nodes", examTrackId],
    queryFn: async (): Promise<SyllabusNode[]> => {
      if (!examTrackId) return [];
      const { data, error } = await supabase
        .from("syllabus_nodes")
        .select("*")
        .eq("exam_track_id", examTrackId)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!examTrackId,
    staleTime: 1000 * 60 * 60,
  });
}

/**
 * Assemble flat rows into a tree. Pure and dependency-free so it can be unit
 * tested and reused server-side (Phase 2's plan generator needs the same shape).
 */
export function buildSyllabusTree(nodes: SyllabusNode[]): SyllabusTreeNode[] {
  const byId = new Map<string, SyllabusTreeNode>();
  for (const n of nodes) byId.set(n.id, { ...n, children: [] });

  const roots: SyllabusTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id) {
      // A node whose parent is missing (partial import, deleted parent) is
      // promoted to root rather than silently dropped — losing syllabus
      // content without a trace is worse than showing it slightly misplaced.
      const parent = byId.get(node.parent_id);
      if (parent) parent.children.push(node);
      else roots.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRec = (list: SyllabusTreeNode[]) => {
    list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/** Syllabus for a track, already assembled into a tree. */
export function useSyllabusTree(examTrackId: string | null | undefined) {
  const { data: nodes, ...rest } = useSyllabusNodes(examTrackId);
  return { ...rest, data: nodes ? buildSyllabusTree(nodes) : undefined };
}

/* ── The signed-in student's track ───────────────────────────────────────── */

export interface StudentExamContext {
  examTrackId: string | null;
  targetExamDate: string | null;
  track: ExamTrack | null;
  /** Whole days until the exam. Negative once the date has passed. */
  daysRemaining: number | null;
}

/**
 * Whole days from today until `isoDate`, both normalised to local midnight so a
 * countdown never flickers by one because of the current time of day.
 */
export function daysUntil(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return null;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffMs = startOfDay(target).getTime() - startOfDay(new Date()).getTime();
  return Math.round(diffMs / 86_400_000);
}

/**
 * The current student's exam track and countdown. Returns nulls (never throws)
 * when the student has not chosen one, so callers can render a neutral state.
 */
export function useStudentExamContext() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["student-exam-context", user?.uid],
    queryFn: async (): Promise<StudentExamContext> => {
      const empty: StudentExamContext = {
        examTrackId: null, targetExamDate: null, track: null, daysRemaining: null,
      };
      if (!user) return empty;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("exam_track_id, target_exam_date")
        .eq("id", user.uid)
        .maybeSingle();
      if (error) throw error;
      if (!profile?.exam_track_id) return empty;

      const { data: track } = await supabase
        .from("exam_tracks")
        .select("*")
        .eq("id", profile.exam_track_id)
        .maybeSingle();

      return {
        examTrackId: profile.exam_track_id,
        targetExamDate: profile.target_exam_date,
        track: track ?? null,
        daysRemaining: daysUntil(profile.target_exam_date),
      };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });
}
