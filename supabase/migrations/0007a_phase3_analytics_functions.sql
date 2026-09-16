-- ============================================================================
-- 0007a — mock_test_percentile() and cohort_analytics()
-- ============================================================================
-- Recovered from the live database (applied version 20260904092658). It had
-- been applied without a file in this repo; see MIGRATIONS.md.
--
-- Both are called by the app: src/lib/mockTests.ts uses mock_test_percentile
-- and src/components/admin/CohortAnalytics.tsx uses cohort_analytics. A
-- database built from the repo's migrations alone would not have had either,
-- so mock-test percentiles and the admin cohort view would have failed at
-- runtime.
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
'Percentile among completed attempts on the same mock test. NULL below p_min_sample - a percentile from a handful of attempts is noise, and this figure is used in outcome claims.';

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
        where ss.created_at > now() - interval '28 days') as sessions_per_week
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
