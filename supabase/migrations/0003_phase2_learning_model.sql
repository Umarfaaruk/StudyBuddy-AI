-- ============================================================================
-- 0003 — Phase 2 learning model + Phase 1b forward-compat columns
-- ============================================================================
-- ADDITIVE ONLY. Safe against live data; idempotent.
--
-- Adds the per-answer record that Phase 1 threw away. `quiz_attempts` stores
-- only an aggregate score, which cannot support spaced repetition, per-topic
-- mastery, or error-pattern detection — all three need to know what happened on
-- each individual question.
--
-- Also lands three Phase 1b columns NOW rather than later: adding `language` to
-- a question bank that already holds thousands of rows means backfilling and
-- re-verifying every one of them. Cheap now, expensive in three months.
-- ============================================================================

-- ── Phase 1b forward-compat ────────────────────────────────────────────────

-- Groups the exam picker once the list outgrows a flat menu.
alter table public.exam_tracks
  add column if not exists category text,
  -- Default medium of instruction. Government-exam tracks may be 'te'.
  add column if not exists default_language text not null default 'en';

update public.exam_tracks set category = 'Engineering Entrance' where id = 'jee-main' and category is null;
update public.exam_tracks set category = 'Medical Entrance'     where id = 'neet'     and category is null;

-- A Telugu-medium question is a SEPARATE ASSET, not a display toggle, so
-- language belongs on the row. `translation_of` distinguishes "authored in
-- Telugu" from "the Telugu rendering of question X" — conflating those makes
-- the bank impossible to audit later.
alter table public.questions
  add column if not exists language       text not null default 'en',
  add column if not exists translation_of uuid references public.questions(id) on delete set null;

create index if not exists questions_language_idx
  on public.questions (exam_track_id, language, status);

-- Current affairs goes stale; kinematics does not. Only some nodes need a
-- refresh cycle, so this is a flag rather than a separate content table.
alter table public.syllabus_nodes
  add column if not exists language             text not null default 'en',
  add column if not exists is_time_sensitive    boolean not null default false,
  add column if not exists content_refreshed_at timestamptz;

-- ── Per-answer record ──────────────────────────────────────────────────────
-- The atom that mastery, scheduling and error patterns are all derived from.
create table if not exists public.question_responses (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  -- Kept on delete set null: a deleted question must not erase the student's
  -- history, because their mastery scores were computed from it.
  question_id      uuid references public.questions(id) on delete set null,
  -- Denormalised so per-topic rollups never need to join back through
  -- questions — and so history survives the question being deleted.
  syllabus_node_id uuid references public.syllabus_nodes(id) on delete set null,
  exam_track_id    text references public.exam_tracks(id) on delete set null,

  session_type     text not null default 'practice'
                     check (session_type in ('diagnostic', 'practice', 'mock', 'review')),
  session_id       uuid,

  selected_answer  text,
  is_correct       boolean not null,
  time_taken_ms    integer check (time_taken_ms is null or time_taken_ms >= 0),

  -- Phase 2.3. Starts as a student self-tag; automatic classification later.
  error_tag        text check (error_tag is null or error_tag in
                     ('conceptual', 'calculation', 'misread', 'rushed', 'guessed', 'unknown')),

  created_at       timestamptz not null default now()
);

create index if not exists question_responses_user_idx
  on public.question_responses (user_id, created_at desc);
create index if not exists question_responses_topic_idx
  on public.question_responses (user_id, syllabus_node_id, created_at desc);
create index if not exists question_responses_session_idx
  on public.question_responses (session_id);
create index if not exists question_responses_error_idx
  on public.question_responses (user_id, error_tag, created_at desc)
  where error_tag is not null;

-- ── Per-topic mastery ──────────────────────────────────────────────────────
-- Deliberately NOT reusing topic_progress: its `topic_id` is a text key into
-- the legacy user-generated `topics` table. Storing syllabus-node UUIDs in the
-- same column would put two unrelated ID spaces in one field — a bug waiting to
-- happen the first time anything joins on it.
create table if not exists public.syllabus_mastery (
  user_id          uuid not null references auth.users(id) on delete cascade,
  syllabus_node_id uuid not null references public.syllabus_nodes(id) on delete cascade,
  mastery_score    integer not null default 0 check (mastery_score between 0 and 100),
  questions_seen   integer not null default 0,
  questions_correct integer not null default 0,
  avg_time_ms      integer,
  last_practised_at timestamptz,
  updated_at       timestamptz not null default now(),
  primary key (user_id, syllabus_node_id)
);

create index if not exists syllabus_mastery_weak_idx
  on public.syllabus_mastery (user_id, mastery_score);

-- ── Spaced repetition state (SM-2) ─────────────────────────────────────────
-- Mirrors the column shape already proven on `flashcards` (interval / ease /
-- next_review) rather than inventing a second scheduling vocabulary, but keyed
-- by concept instead of card and with proper timestamptz columns.
create table if not exists public.concept_reviews (
  user_id          uuid not null references auth.users(id) on delete cascade,
  syllabus_node_id uuid not null references public.syllabus_nodes(id) on delete cascade,
  interval_days    integer not null default 0,
  ease             numeric(4,2) not null default 2.50 check (ease >= 1.30),
  repetitions      integer not null default 0,
  lapses           integer not null default 0,
  last_reviewed_at timestamptz,
  next_due_at      timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (user_id, syllabus_node_id)
);

-- Drives the "due today" dashboard queue.
create index if not exists concept_reviews_due_idx
  on public.concept_reviews (user_id, next_due_at);

-- ── Diagnostic sessions ────────────────────────────────────────────────────
create table if not exists public.diagnostic_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  exam_track_id    text references public.exam_tracks(id) on delete set null,
  status           text not null default 'in_progress'
                     check (status in ('in_progress', 'completed', 'abandoned')),
  total_questions  integer not null default 0,
  correct_count    integer not null default 0,
  -- Per-topic breakdown snapshotted at completion, so the result page stays
  -- reproducible even after later practice moves the live mastery scores.
  per_topic        jsonb not null default '{}'::jsonb,
  started_at       timestamptz not null default now(),
  completed_at     timestamptz
);

create index if not exists diagnostic_sessions_user_idx
  on public.diagnostic_sessions (user_id, started_at desc);

-- ── RLS: every table here is per-student private ───────────────────────────
alter table public.question_responses   enable row level security;
alter table public.syllabus_mastery     enable row level security;
alter table public.concept_reviews      enable row level security;
alter table public.diagnostic_sessions  enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'question_responses', 'syllabus_mastery', 'concept_reviews', 'diagnostic_sessions'
  ] loop
    execute format('drop policy if exists "%1$s_own" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_own" on public.%1$s for all
         using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
    -- Admins need read access for Phase 3 cohort analytics.
    execute format('drop policy if exists "%1$s_admin_read" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_admin_read" on public.%1$s for select
         using (public.is_admin(auth.uid()));', t);
  end loop;
end $$;

-- ── updated_at triggers ────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['syllabus_mastery', 'concept_reviews'] loop
    if not exists (select 1 from pg_trigger where tgname = format('trg_touch_%s', t)) then
      execute format(
        'create trigger trg_touch_%1$s before update on public.%1$s
         for each row execute function public.touch_updated_at();', t);
    end if;
  end loop;
end $$;
