-- ============================================================================
-- 0007 — Phase 3: mock tests, cohorts, outcome time series, testimonials
-- ============================================================================
-- ADDITIVE ONLY. Safe against live data; idempotent.
--
-- Goal: make a believable before/after outcome story provable from real usage.
-- That needs three things the app cannot currently do — score a timed test,
-- remember what mastery looked like WEEKS ago, and group students into a batch
-- worth reporting on.
-- ============================================================================


-- ── Cohorts (3.3) ──────────────────────────────────────────────────────────
-- A real entity with its own join code, not a text tag on profiles: Phase 4.5
-- gives coaching centres a signup code that must map to exactly this concept,
-- and a free-text label cannot be joined on reliably.
create table if not exists public.cohorts (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  institute_name text,
  -- Uppercase and human-dictatable over a phone; unique so it can gate signup.
  join_code      text unique,
  starts_on      date,
  ends_on        date,
  notes          text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Many-to-many on purpose: a student can be in a coaching batch AND a pilot
-- group, and collapsing that into one column would lose the pilot.
create table if not exists public.cohort_members (
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (cohort_id, user_id)
);

create index if not exists cohort_members_user_idx on public.cohort_members (user_id);


-- ── Mock tests (3.1) ───────────────────────────────────────────────────────
create table if not exists public.mock_tests (
  id               uuid primary key default gen_random_uuid(),
  exam_track_id    text not null references public.exam_tracks(id) on delete cascade,
  title            text not null,
  scope            text not null default 'full_syllabus'
                     check (scope in ('full_syllabus', 'subject', 'chapter')),
  syllabus_node_id uuid references public.syllabus_nodes(id) on delete cascade,
  question_count   integer not null default 30 check (question_count between 1 and 200),
  duration_minutes integer not null default 60 check (duration_minutes between 1 and 600),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- A scoped test with no node would silently behave as full-syllabus.
  constraint mock_tests_scope_node_ck check (
    (scope = 'full_syllabus' and syllabus_node_id is null)
    or (scope <> 'full_syllabus' and syllabus_node_id is not null)
  )
);

create index if not exists mock_tests_track_idx
  on public.mock_tests (exam_track_id, is_active);

create table if not exists public.mock_test_attempts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  mock_test_id     uuid references public.mock_tests(id) on delete set null,
  exam_track_id    text references public.exam_tracks(id) on delete set null,
  status           text not null default 'in_progress'
                     check (status in ('in_progress', 'completed', 'abandoned')),
  started_at       timestamptz not null default now(),
  submitted_at     timestamptz,
  duration_seconds integer,
  total_questions  integer not null default 0,
  correct_count    integer not null default 0,
  -- Percentage 0-100, STORED rather than derived: a later change to the scoring
  -- rule must not silently rewrite a number the student was already shown.
  score            numeric(5,2),
  per_topic        jsonb not null default '[]'::jsonb,
  -- Percentile AT SUBMISSION TIME, and deliberately a snapshot for the same
  -- reason — recomputing later would move a figure already reported.
  percentile       numeric(5,2),
  created_at       timestamptz not null default now()
);

create index if not exists mock_attempts_user_idx
  on public.mock_test_attempts (user_id, submitted_at desc);
create index if not exists mock_attempts_test_idx
  on public.mock_test_attempts (mock_test_id, status);


-- ── Outcome time series (3.2) ──────────────────────────────────────────────
-- syllabus_mastery holds only the CURRENT value, so "week 1 vs week 6" is
-- unanswerable from it. This is the history that makes the chart possible.
--
-- Daily granularity with a unique key, so capturing twice in a day is
-- idempotent rather than doubling the series.
create table if not exists public.mastery_snapshots (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  syllabus_node_id uuid not null references public.syllabus_nodes(id) on delete cascade,
  mastery_score    integer not null check (mastery_score between 0 and 100),
  captured_on      date not null default current_date,
  created_at       timestamptz not null default now(),
  unique (user_id, syllabus_node_id, captured_on)
);

create index if not exists mastery_snapshots_user_idx
  on public.mastery_snapshots (user_id, captured_on);


-- ── Testimonials (3.5) ─────────────────────────────────────────────────────
-- Separate from `feedback`: feedback is product input, this is marketing
-- material with consent attached. Mixing them would mean trawling feedback for
-- quotes nobody agreed to publish.
create table if not exists public.testimonials (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  quote               text,
  milestone           text check (milestone in ('four_weeks', 'score_jump', 'manual')),
  score_before        numeric(5,2),
  score_after         numeric(5,2),
  -- TWO consents, deliberately separate: agreeing to share a RESULT is not
  -- agreeing to be NAMED. Collapsing them publishes identities nobody opted into.
  consent_to_share    boolean not null default false,
  consent_to_use_name boolean not null default false,
  status              text not null default 'pending'
                        check (status in ('pending', 'approved', 'rejected')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists testimonials_status_idx
  on public.testimonials (status, created_at desc);


-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.cohorts            enable row level security;
alter table public.cohort_members     enable row level security;
alter table public.mock_tests         enable row level security;
alter table public.mock_test_attempts enable row level security;
alter table public.mastery_snapshots  enable row level security;
alter table public.testimonials       enable row level security;

drop policy if exists "cohorts_admin" on public.cohorts;
create policy "cohorts_admin" on public.cohorts for all
  using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()));

drop policy if exists "cohorts_member_read" on public.cohorts;
create policy "cohorts_member_read" on public.cohorts for select
  using (exists (select 1 from public.cohort_members m
                 where m.cohort_id = cohorts.id and m.user_id = auth.uid()));

drop policy if exists "cohort_members_admin" on public.cohort_members;
create policy "cohort_members_admin" on public.cohort_members for all
  using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()));

drop policy if exists "cohort_members_own_read" on public.cohort_members;
create policy "cohort_members_own_read" on public.cohort_members for select
  using (user_id = auth.uid());

drop policy if exists "mock_tests_read" on public.mock_tests;
create policy "mock_tests_read" on public.mock_tests for select using (is_active);

drop policy if exists "mock_tests_admin" on public.mock_tests;
create policy "mock_tests_admin" on public.mock_tests for all
  using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()));

-- Per-student tables: own rows, plus admin for cohort analytics.
do $$
declare t text;
begin
  foreach t in array array['mock_test_attempts', 'mastery_snapshots', 'testimonials'] loop
    execute format('drop policy if exists "%1$s_own" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_own" on public.%1$s for all
         using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
    execute format('drop policy if exists "%1$s_admin" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_admin" on public.%1$s for all
         using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()));', t);
  end loop;
end $$;


-- ── updated_at triggers ────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['cohorts', 'mock_tests', 'testimonials'] loop
    if not exists (select 1 from pg_trigger where tgname = format('trg_touch_%s', t)) then
      execute format(
        'create trigger trg_touch_%1$s before update on public.%1$s
         for each row execute function public.touch_updated_at();', t);
    end if;
  end loop;
end $$;


-- ── Percentile estimate ────────────────────────────────────────────────────
-- Percentile among completed attempts on the SAME mock test.
--
-- Returns NULL below a minimum sample: a "92nd percentile" derived from three
-- attempts is noise dressed as a statistic, and this number is destined for
-- marketing claims, so it must refuse to exist rather than mislead.
create or replace function public.mock_test_percentile(
  p_mock_test_id uuid,
  p_score        numeric,
  p_min_sample   integer default 5
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when count(*) < p_min_sample then null
    else round(100.0 * count(*) filter (where a.score < p_score) / nullif(count(*), 0), 2)
  end
  from public.mock_test_attempts a
  where a.mock_test_id = p_mock_test_id
    and a.status = 'completed'
    and a.score is not null;
$$;

comment on function public.mock_test_percentile(uuid, numeric, integer) is
'Percentile among completed attempts on the same mock test. NULL below p_min_sample — a percentile from a handful of attempts is noise, and this figure is used in outcome claims.';


-- ── Cohort analytics (3.4) ─────────────────────────────────────────────────
-- SECURITY INVOKER: runs under the caller's RLS, so it returns cross-student
-- aggregates only for admins (whose admin policies grant the reads) and adds no
-- SECURITY DEFINER advisor warning.
create or replace function public.cohort_analytics(p_cohort_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with members as (
    select user_id from public.cohort_members where cohort_id = p_cohort_id
  ),
  attempts as (
    select a.user_id, a.score, a.submitted_at,
           row_number() over (partition by a.user_id order by a.submitted_at asc)  as first_rn,
           row_number() over (partition by a.user_id order by a.submitted_at desc) as last_rn
    from public.mock_test_attempts a
    join members m on m.user_id = a.user_id
    where a.status = 'completed' and a.score is not null
  ),
  first_last as (
    select
      (select avg(score) from attempts where first_rn = 1) as avg_first_score,
      (select avg(score) from attempts where last_rn  = 1) as avg_latest_score,
      (select count(distinct user_id) from attempts)       as students_with_attempts
  ),
  -- Most-improved topics: earliest vs latest snapshot per student per topic,
  -- averaged across the cohort.
  topic_delta as (
    select s.syllabus_node_id,
           avg(s.mastery_score) filter (where s.rn_last = 1)
             - avg(s.mastery_score) filter (where s.rn_first = 1) as delta,
           count(distinct s.user_id) as n_students
    from (
      select ms.*,
             row_number() over (partition by ms.user_id, ms.syllabus_node_id order by ms.captured_on asc)  as rn_first,
             row_number() over (partition by ms.user_id, ms.syllabus_node_id order by ms.captured_on desc) as rn_last
      from public.mastery_snapshots ms
      join members m on m.user_id = ms.user_id
    ) s
    where s.rn_first = 1 or s.rn_last = 1
    group by s.syllabus_node_id
  ),
  engagement as (
    select
      (select avg(current_streak) from public.user_streaks us join members m on m.user_id = us.user_id) as avg_streak,
      (select count(*)::numeric / greatest(count(distinct ss.user_id), 1) / 4.0
         from public.study_sessions ss join members m on m.user_id = ss.user_id
        where ss.created_at > now() - interval '28 days')                                               as sessions_per_week
  )
  select jsonb_build_object(
    'cohort_id', p_cohort_id,
    'member_count', (select count(*) from members),
    'students_with_attempts', (select students_with_attempts from first_last),
    'avg_first_score',  round((select avg_first_score  from first_last), 2),
    'avg_latest_score', round((select avg_latest_score from first_last), 2),
    'avg_score_change', round((select avg_latest_score - avg_first_score from first_last), 2),
    'avg_streak',        round((select avg_streak from engagement), 1),
    'sessions_per_week', round((select sessions_per_week from engagement), 2),
    'most_improved_topics', coalesce((
      select jsonb_agg(x order by x.delta desc)
      from (
        select n.name as topic, parent.name as subject,
               round(td.delta, 1) as delta, td.n_students
        from topic_delta td
        join public.syllabus_nodes n on n.id = td.syllabus_node_id
        left join public.syllabus_nodes parent on parent.id = n.parent_id
        where td.delta is not null
        order by td.delta desc
        limit 5
      ) x
    ), '[]'::jsonb)
  );
$$;

comment on function public.cohort_analytics(uuid) is
'Per-cohort outcome and engagement aggregates for the admin analytics view (Phase 3.4). SECURITY INVOKER, so non-admins reading it see only their own rows and therefore no cohort aggregate.';
