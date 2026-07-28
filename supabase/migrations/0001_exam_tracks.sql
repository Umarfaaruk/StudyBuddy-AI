-- ============================================================================
-- 0001 — Exam tracks, syllabus tree, question bank   (Phase 1)
-- ============================================================================
-- ADDITIVE ONLY. Safe to run against the live database: it creates new objects
-- and adds nullable columns, never drops or rewrites existing data.
-- Idempotent — re-running is a no-op.
--
-- Design intent:
--   • Adding a second (or fifth) exam must be pure DATA, never a schema change.
--     Hence one generic self-referencing syllabus tree keyed by exam_track_id,
--     rather than per-exam tables or columns.
--   • Question ANSWERS are never world-readable. The base table is admin-only;
--     students read `questions_public`, a view with the answer and explanation
--     stripped. Grading must happen server-side (Phase 2), because anything RLS
--     lets the browser select can be read straight out of the network tab.
-- ============================================================================

-- ── 1. Exam tracks ─────────────────────────────────────────────────────────
create table if not exists public.exam_tracks (
  id          text primary key,            -- slug: 'jee-main', 'neet'
  name        text not null,               -- 'JEE Main'
  full_name   text,                        -- 'Joint Entrance Examination (Main)'
  description text,
  -- Subjects are modelled as syllabus_nodes, not a column here, so a track with
  -- four subjects needs no schema change.
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── 2. Syllabus tree ───────────────────────────────────────────────────────
-- One table, three levels, parent_id self-reference: subject → chapter → topic.
-- `code` is a stable human-readable key so seeds and imports are idempotent and
-- content can be re-imported without duplicating rows.
create table if not exists public.syllabus_nodes (
  id            uuid primary key default gen_random_uuid(),
  exam_track_id text not null references public.exam_tracks(id) on delete cascade,
  parent_id     uuid references public.syllabus_nodes(id) on delete cascade,
  level         text not null check (level in ('subject', 'chapter', 'topic')),
  name          text not null,
  code          text not null,
  position      integer not null default 0,
  -- Approximate share of the paper. Drives study-plan prioritisation in Phase 2;
  -- nullable because it is an estimate, not an official figure.
  weightage     numeric(5,2),
  -- Syllabus prose for this node. Phase 2.4 retrieves this as RAG context so
  -- tutoring answers can cite the syllabus point they are grounded in.
  content       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (exam_track_id, code)
);

create index if not exists syllabus_nodes_track_idx
  on public.syllabus_nodes (exam_track_id, level, position);
create index if not exists syllabus_nodes_parent_idx
  on public.syllabus_nodes (parent_id, position);

-- ── 3. Question bank ───────────────────────────────────────────────────────
create table if not exists public.questions (
  id               uuid primary key default gen_random_uuid(),
  exam_track_id    text not null references public.exam_tracks(id) on delete cascade,
  -- Points at the deepest node available (topic if known, else chapter).
  syllabus_node_id uuid references public.syllabus_nodes(id) on delete set null,

  question_text    text not null,
  question_type    text not null default 'mcq'
                     check (question_type in ('mcq', 'multi_correct', 'numerical', 'assertion_reason')),
  -- [{ "id": "a", "text": "..." }, ...]  — empty for numerical answers.
  options          jsonb not null default '[]'::jsonb,
  correct_answer   text,            -- option id, or the numeric value as text
  explanation      text,

  difficulty       text not null default 'medium'
                     check (difficulty in ('easy', 'medium', 'hard')),

  -- Previous-year-question provenance.
  is_pyq           boolean not null default false,
  pyq_year         integer check (pyq_year is null or pyq_year between 1980 and 2100),
  pyq_session      text,            -- e.g. 'Jan Shift 1'
  source           text,            -- attribution / licence note for imported content

  -- Nothing reaches students until an admin publishes it.
  status           text not null default 'draft'
                     check (status in ('draft', 'published', 'archived')),

  -- Free-form labels for import batches and ad-hoc filtering.
  tags             jsonb not null default '[]'::jsonb,
  -- Set by the importer so a bad batch can be found and rolled back as a unit.
  import_batch     text,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists questions_track_status_idx
  on public.questions (exam_track_id, status);
create index if not exists questions_node_idx
  on public.questions (syllabus_node_id, difficulty) where status = 'published';
create index if not exists questions_pyq_idx
  on public.questions (exam_track_id, is_pyq, pyq_year) where status = 'published';
create index if not exists questions_batch_idx
  on public.questions (import_batch);

-- ── 4. Student's chosen track ──────────────────────────────────────────────
-- On profiles rather than user_preferences: this is core identity read on almost
-- every screen (dashboard framing, AI grounding), not a tweakable preference.
alter table public.profiles
  add column if not exists exam_track_id    text references public.exam_tracks(id) on delete set null,
  add column if not exists target_exam_date date;

-- ── 5. Row Level Security ──────────────────────────────────────────────────
alter table public.exam_tracks    enable row level security;
alter table public.syllabus_nodes enable row level security;
alter table public.questions      enable row level security;

-- Reference data: world-readable, admin-writable (matches topics/lessons).
drop policy if exists "exam_tracks_read"  on public.exam_tracks;
drop policy if exists "exam_tracks_admin" on public.exam_tracks;
create policy "exam_tracks_read"  on public.exam_tracks for select using (true);
create policy "exam_tracks_admin" on public.exam_tracks for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "syllabus_nodes_read"  on public.syllabus_nodes;
drop policy if exists "syllabus_nodes_admin" on public.syllabus_nodes;
create policy "syllabus_nodes_read"  on public.syllabus_nodes for select using (true);
create policy "syllabus_nodes_admin" on public.syllabus_nodes for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Questions: ADMIN ONLY on the base table. Students never select from it, so
-- correct_answer and explanation cannot leak to the client. See the view below.
drop policy if exists "questions_admin" on public.questions;
create policy "questions_admin" on public.questions for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ── 6. Answer-free public view ─────────────────────────────────────────────
-- security_invoker = off (the default for views) would run as the view owner and
-- bypass the base table's RLS — which is exactly what we want here, but ONLY
-- because the column list deliberately omits correct_answer and explanation.
-- Never add them to this view.
create or replace view public.questions_public as
  select
    q.id,
    q.exam_track_id,
    q.syllabus_node_id,
    q.question_text,
    q.question_type,
    q.options,
    q.difficulty,
    q.is_pyq,
    q.pyq_year,
    q.pyq_session,
    q.tags
  from public.questions q
  where q.status = 'published';

grant select on public.questions_public to authenticated, anon;

-- Supabase's linter flags this view (lint 0010, security_definer_view) at ERROR
-- level. That is expected here, not an oversight. The alternative — an RLS
-- SELECT policy on `questions` plus column-level grants — cannot work, because
-- admins and students both hold the `authenticated` role, so a column grant
-- that hides correct_answer from students would hide it from admins reviewing
-- the bank too. The definer view is the mechanism; the column list is the
-- security boundary.
comment on view public.questions_public is
'SECURITY DEFINER by design. The base table public.questions is admin-only under RLS; this view is the ONLY student-facing read path and deliberately runs as owner to bypass that policy. Its safety rests entirely on the column list: correct_answer and explanation are omitted. NEVER add them. Grading must happen server-side.';

-- ── 7. updated_at triggers ─────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['exam_tracks', 'syllabus_nodes', 'questions'] loop
    if not exists (
      select 1 from pg_trigger where tgname = format('trg_touch_%s', t)
    ) then
      execute format(
        'create trigger trg_touch_%1$s before update on public.%1$s
         for each row execute function public.touch_updated_at();', t);
    end if;
  end loop;
end $$;
