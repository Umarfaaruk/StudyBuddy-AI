-- ============================================================================
-- 0006a — search_exam_context(): grounded retrieval for the AI tutor
-- ============================================================================
-- Recovered from the live database (applied version 20260813163811). It had
-- been applied without a file in this repo; see MIGRATIONS.md.
--
-- This one matters: src/lib/examRetrieval.ts calls this RPC. A database built
-- from the repo's migrations alone would not have had it, and AI grounding
-- would have failed at runtime.
create or replace function public.search_exam_context(
  p_exam_track_id text,
  p_query         text,
  p_syllabus_limit integer default 3,
  p_question_limit integer default 3
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with tsq as (
    select to_tsquery('english', p_query) as q
  ),
  syllabus as (
    select n.id, n.name, n.content, n.code,
           parent.name as subject,
           ts_rank(n.search_vector, tsq.q) as rank
    from public.syllabus_nodes n
    cross join tsq
    left join public.syllabus_nodes parent on parent.id = n.parent_id
    where n.exam_track_id = p_exam_track_id
      and n.search_vector @@ tsq.q
    order by rank desc, n.position
    limit greatest(p_syllabus_limit, 0)
  ),
  past_questions as (
    select q.id, q.question_text, q.is_pyq, q.pyq_year, q.pyq_session,
           node.name as topic,
           ts_rank(q.search_vector, tsq.q) as rank
    from public.questions q
    cross join tsq
    left join public.syllabus_nodes node on node.id = q.syllabus_node_id
    where q.exam_track_id = p_exam_track_id
      and q.status = 'published'
      and q.search_vector @@ tsq.q
    order by q.is_pyq desc, rank desc
    limit greatest(p_question_limit, 0)
  )
  select jsonb_build_object(
    'syllabus',  coalesce((select jsonb_agg(to_jsonb(s)) from syllabus s), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(to_jsonb(p)) from past_questions p), '[]'::jsonb)
  );
$$;

comment on function public.search_exam_context(text, text, integer, integer) is
'Ranked syllabus + past-question retrieval for grounded tutoring (Phase 2.4). SECURITY INVOKER: runs under the caller''s RLS and returns only published content they could already read. Never returns answers.';
