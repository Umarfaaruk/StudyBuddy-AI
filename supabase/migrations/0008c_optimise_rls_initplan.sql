-- ============================================================================
-- 0008c — hoist auth.uid() out of per-row RLS evaluation, + FK indexes
-- ============================================================================
-- Recovered from the live database (applied version 20260904102429). It had
-- been applied without a file in this repo; see MIGRATIONS.md.
--
-- ── auth_rls_initplan: 128 policies re-evaluated auth.uid() PER ROW ────────
-- Postgres treats a bare auth.uid() in a policy as volatile-per-row, so a scan
-- of N rows calls it N times. Wrapping it in a scalar subquery — (select
-- auth.uid()) — lets the planner hoist it into an InitPlan and evaluate it once
-- per statement.
--
-- Semantically identical: the value cannot change mid-statement. Purely a
-- planner hint, so no policy's meaning is altered.
--
-- Rewritten programmatically because 128 hand-edits is how a typo silently
-- widens access. Already-wrapped expressions are skipped by the negative
-- lookahead on '(select'.
do $$
declare
  r record;
  new_qual text;
  new_check text;
  stmt text;
  changed int := 0;
begin
  for r in
    select schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '')       ~ 'auth\.uid\(\)' or
        coalesce(with_check, '') ~ 'auth\.uid\(\)'
      )
  loop
    -- Only wrap bare calls; leave "(select auth.uid())" alone.
    new_qual  := regexp_replace(coalesce(r.qual, ''),
                   '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'g');
    new_check := regexp_replace(coalesce(r.with_check, ''),
                   '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'g');

    if new_qual = coalesce(r.qual, '') and new_check = coalesce(r.with_check, '') then
      continue;
    end if;

    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);

    stmt := format('create policy %I on %I.%I as %s for %s to %s',
                   r.policyname, r.schemaname, r.tablename,
                   case when r.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end,
                   r.cmd, array_to_string(r.roles, ', '));
    if new_qual  <> '' then stmt := stmt || format(' using (%s)', new_qual); end if;
    if new_check <> '' then stmt := stmt || format(' with check (%s)', new_check); end if;

    execute stmt;
    changed := changed + 1;
  end loop;

  raise notice 'rewrote % policies', changed;
end $$;


-- ── unindexed_foreign_keys: covering indexes ───────────────────────────────
-- A foreign key without a covering index makes the referenced side's DELETE and
-- UPDATE scan the child table. Cheap to add, and these are all columns the app
-- filters on anyway.
create index if not exists analytics_snapshots_user_idx   on public.analytics_snapshots (user_id);
create index if not exists question_responses_question_idx on public.question_responses (question_id);
create index if not exists question_responses_track_idx    on public.question_responses (exam_track_id);
create index if not exists questions_created_by_idx        on public.questions (created_by);
create index if not exists questions_translation_idx       on public.questions (translation_of);
create index if not exists mock_attempts_track_idx         on public.mock_test_attempts (exam_track_id);
create index if not exists mock_tests_node_idx             on public.mock_tests (syllabus_node_id);
create index if not exists mastery_snapshots_node_idx      on public.mastery_snapshots (syllabus_node_id);
create index if not exists syllabus_mastery_node_idx       on public.syllabus_mastery (syllabus_node_id);
create index if not exists concept_reviews_node_idx        on public.concept_reviews (syllabus_node_id);
create index if not exists diagnostic_sessions_track_idx   on public.diagnostic_sessions (exam_track_id);
create index if not exists leads_track_idx                 on public.leads (exam_track_id);
create index if not exists leads_converted_idx             on public.leads (converted_user_id);
create index if not exists referrals_referred_idx          on public.referrals (referred_user_id);
create index if not exists testimonials_user_idx           on public.testimonials (user_id);
create index if not exists profiles_exam_track_idx         on public.profiles (exam_track_id);
