-- ============================================================================
-- 0005a — drop the public copy of is_admin()
-- ============================================================================
-- Recovered from the live database (applied version 20260812164146). It had
-- been applied without a file in this repo; see MIGRATIONS.md.
--
-- Every policy now calls private.is_admin, verified by probing authenticated
-- and anon reads across 12 tables. The app never called is_admin as an RPC
-- (only add_xp), so removing the public copy breaks nothing and closes the
-- REST endpoint the linter flagged.
do $$
declare leftover int;
begin
  select count(*) into leftover
  from pg_policies
  where coalesce(qual,'') ~ '(^|[^.])is_admin\('
     or coalesce(with_check,'') ~ '(^|[^.])is_admin\(';
  if leftover > 0 then
    raise exception 'Refusing to drop public.is_admin: % policy(ies) still reference it unqualified', leftover;
  end if;
end $$;

drop function if exists public.is_admin(uuid);
