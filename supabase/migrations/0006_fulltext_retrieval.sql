-- ============================================================================
-- 0006 — Full-text search over the syllabus and question bank  (Phase 2.4)
-- ============================================================================
-- Retrieval substrate for grounded tutoring: pull the relevant syllabus text
-- and past questions into the model's context instead of letting it answer from
-- open recall.
--
-- Postgres FTS rather than vector embeddings, deliberately:
--   • no embedding provider is configured, and adding one means an API key, a
--     per-question embedding cost, and a backfill job for every import;
--   • pgvector would also need every question re-embedded whenever the bank
--     changes.
-- Exam syllabi are terminology-dense ("kinematics", "electrochemistry"), which
-- is exactly where lexical search performs well — a student asking about
-- projectile motion uses the same words the syllabus does. If semantic recall
-- later proves necessary, this migration is additive and can sit alongside it.
--
-- Generated STORED columns keep the vectors correct by construction: there is
-- no trigger to forget and no way for an import to insert an unindexed row.
-- ============================================================================

-- Syllabus: chapter/topic name plus its prose, so a query can match either.
alter table public.syllabus_nodes
  add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(content, ''))
  ) stored;

create index if not exists syllabus_nodes_search_idx
  on public.syllabus_nodes using gin (search_vector);

-- Questions: the stem only. Options are short and noisy ("6 m", "9 m") and
-- would dilute relevance scoring without adding recall.
alter table public.questions
  add column if not exists search_vector tsvector
  generated always as (to_tsvector('english', coalesce(question_text, ''))) stored;

-- Partial index: retrieval only ever reads published rows, so drafts and
-- archived questions do not need to occupy the index.
create index if not exists questions_search_idx
  on public.questions using gin (search_vector)
  where status = 'published';


-- ── Ranked retrieval ───────────────────────────────────────────────────────
-- PostgREST cannot ORDER BY ts_rank, and unranked matches are close to useless:
-- the first row the planner happens to return is not the most relevant chapter.
--
-- SECURITY INVOKER (the default) on purpose. This runs under the caller's own
-- privileges and RLS, so it exposes nothing they could not already select — and
-- it therefore adds no SECURITY DEFINER advisor warning.
--
-- The caller passes an OR-joined tsquery. AND semantics (plainto_/websearch_)
-- cannot work here: a student asking "how do I solve projectile motion" would
-- have to match every term against a chapter literally named "Kinematics", and
-- never would.
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
    -- Previous-year questions first: they are the strongest evidence of how the
    -- exam actually phrases and weights a topic.
    order by q.is_pyq desc, rank desc
    limit greatest(p_question_limit, 0)
  )
  select jsonb_build_object(
    'syllabus',  coalesce((select jsonb_agg(to_jsonb(s)) from syllabus s), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(to_jsonb(p)) from past_questions p), '[]'::jsonb)
  );
$$;

comment on function public.search_exam_context(text, text, integer, integer) is
'Ranked syllabus + past-question retrieval for grounded tutoring (Phase 2.4). SECURITY INVOKER: runs under the caller''s RLS and returns only published content they could already read. Never returns answers — those live in question_answers, which no browser role can select.';
