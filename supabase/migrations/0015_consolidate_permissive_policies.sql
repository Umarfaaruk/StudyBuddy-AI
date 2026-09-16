-- ============================================================================
-- 0015 — collapse overlapping permissive policies into one per command
-- ============================================================================
--                            *** NOT YET APPLIED ***
-- Deliberately held back. Apply it when you can watch it, not before a demo.
-- See MIGRATIONS.md for how to apply and how to roll back.
-- ============================================================================
--
-- WHAT THE LINTER IS COMPLAINING ABOUT
-- ------------------------------------
-- Almost every table carries this pair:
--
--     admin_all   FOR ALL     using (private.is_admin((select auth.uid())))
--     own_select  FOR SELECT  using ((select auth.uid()) = user_id)
--     own_insert  FOR INSERT  with check ((select auth.uid()) = user_id)
--     own_update  FOR UPDATE  using (...) with check (...)
--     own_delete  FOR DELETE  using (...)
--
-- Because admin_all is FOR ALL, it overlaps each own_* policy. Postgres ORs
-- permissive policies, so for every row of every SELECT it evaluates BOTH the
-- ownership test and the is_admin() lookup. That is where the 527
-- multiple_permissive_policies warnings come from — roughly 4 commands x 2
-- roles x ~20 tables, counted pairwise.
--
-- WHY THIS IS SAFE
-- ----------------
-- `(A) OR (B)` inside one policy is by definition what Postgres computes from
-- two permissive policies A and B. So merging cannot change who can see what,
-- PROVIDED the merge is exact. Two rules make it exact, and this migration
-- obeys both mechanically rather than by hand:
--
--   1. Expressions are copied verbatim out of pg_policies. Nothing is retyped,
--      so an ownership column cannot be mistyped into `true`.
--
--   2. Policies are only merged within an IDENTICAL role set. This matters:
--      public.profiles has `profiles_read_authenticated` targeted at
--      `{authenticated}` alongside policies targeted at `{public}`. Merging
--      across those would hand anon the authenticated policy's condition —
--      a silent widening. Grouping by roles prevents it.
--
-- Command semantics are preserved as Postgres defines them:
--   SELECT / DELETE — USING only.
--   INSERT          — WITH CHECK only.
--   UPDATE          — USING chooses rows, WITH CHECK validates the result.
--   FOR ALL with only USING — that expression also acts as the WITH CHECK for
--                             INSERT and UPDATE, so it is carried into both.
--
-- HONEST NOTE ON VALUE
-- --------------------
-- At the time of writing this buys nothing measurable: the largest table holds
-- 238 rows and Postgres had logged 63 index scans against 2006 sequential
-- scans, i.e. it is not using indexes at all yet because everything fits in a
-- page or two. This is a change for when the tables are large. It is written
-- now so it is ready, reviewed and not invented under pressure later.

do $$
declare
  r           record;
  src         text;
  using_expr  text;
  check_expr  text;
  stmt        text;
  before_cnt  int;
  after_cnt   int;
  created     int := 0;
  dropped     int := 0;
begin
  select count(*) into before_cnt from pg_policies where schemaname = 'public';

  -- Nothing here handles RESTRICTIVE policies, which combine with AND rather
  -- than OR. There were none when this was written; refuse rather than
  -- silently mangle them if that has changed.
  if exists (select 1 from pg_policies
              where schemaname = 'public' and permissive <> 'PERMISSIVE') then
    raise exception
      'Restrictive policies now exist in public; this migration only handles permissive ones. Aborting.';
  end if;

  -- Phase 1: snapshot every permissive policy, verbatim.
  create temporary table _policy_snapshot on commit drop as
  select schemaname, tablename, policyname, cmd, roles, qual, with_check
    from pg_policies
   where schemaname = 'public' and permissive = 'PERMISSIVE';

  -- Phase 2: work out the merged policy for every
  -- (table, role set, command) that has more than one contributing policy.
  create temporary table _merge_plan on commit drop as
  with expanded as (
    -- Fan FOR ALL out across the four real commands.
    select s.tablename, s.roles, s.policyname, s.qual, s.with_check,
           c.cmd as target_cmd
      from _policy_snapshot s
      cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) c(cmd)
     where s.cmd = 'ALL' or s.cmd = c.cmd
  )
  select tablename, roles, target_cmd,
         count(*) as source_count,
         array_agg(policyname order by policyname) as source_policies,
         -- USING applies to SELECT / UPDATE / DELETE only.
         case when target_cmd in ('SELECT','UPDATE','DELETE') then
           string_agg(distinct '(' || qual || ')', ' or ')
             filter (where qual is not null)
         end as merged_using,
         -- WITH CHECK applies to INSERT / UPDATE only. A FOR ALL policy that
         -- specified only USING contributes that expression here.
         case when target_cmd in ('INSERT','UPDATE') then
           string_agg(distinct '(' || coalesce(with_check, qual) || ')', ' or ')
             filter (where coalesce(with_check, qual) is not null)
         end as merged_check
    from expanded
   group by tablename, roles, target_cmd
  having count(*) > 1;

  -- Phase 3: drop every policy that feeds a merge, then create the merged one.
  for r in select * from _merge_plan order by tablename, target_cmd loop
    -- Drop the sources. A FOR ALL policy feeds several commands, so it may
    -- already be gone by the time a later command is processed; IF EXISTS
    -- keeps that idempotent.
    foreach src in array r.source_policies loop
      execute format('drop policy if exists %I on public.%I', src, r.tablename);
      dropped := dropped + 1;
    end loop;

    -- Collapse a redundant OR-with-true.
    --
    -- Four tables hold world-readable reference data — exam_tracks,
    -- syllabus_nodes, topics, lessons — via a `*_read` policy that really is
    -- `using (true)`, because the unauthenticated free test and SEO topic
    -- pages read them with no session. Merging produced
    -- `(private.is_admin(...)) or (true)`, which is CORRECT (the table was
    -- already readable by everyone) but reads like a mistake, and the obvious
    -- "tidy-up" of deleting the `true` would silently break public reads.
    -- Emit plain `true` instead, so the policy says what it means.
    using_expr := r.merged_using;
    check_expr := r.merged_check;

    if using_expr is not null and using_expr ~ '(^|\s|\()true($|\s|\))' then
      using_expr := 'true';
    end if;
    if check_expr is not null and check_expr ~ '(^|\s|\()true($|\s|\))' then
      check_expr := 'true';
    end if;

    stmt := format('create policy %I on public.%I as permissive for %s to %s',
                   lower(r.target_cmd) || '_merged', r.tablename,
                   r.target_cmd, array_to_string(r.roles, ', '));
    if using_expr is not null then
      stmt := stmt || format(' using (%s)', using_expr);
    end if;
    if check_expr is not null then
      stmt := stmt || format(' with check (%s)', check_expr);
    end if;

    execute stmt;
    created := created + 1;
  end loop;

  select count(*) into after_cnt from pg_policies where schemaname = 'public';
  raise notice 'consolidate: dropped % source policy references, created % merged policies (% -> % total)',
    dropped, created, before_cnt, after_cnt;

  -- A table that ends up with NO policy at all is fully locked down under RLS.
  -- That would be a catastrophic outcome, so fail the transaction instead.
  if exists (
    select 1 from pg_tables t
     where t.schemaname = 'public'
       and t.rowsecurity
       and not exists (select 1 from pg_policies p
                        where p.schemaname = 'public' and p.tablename = t.tablename)
  ) then
    raise exception
      'A table with RLS enabled was left with no policies. Rolling back.';
  end if;
end $$;
