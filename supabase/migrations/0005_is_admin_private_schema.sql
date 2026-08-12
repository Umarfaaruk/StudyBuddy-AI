-- ============================================================================
-- 0005 — Move is_admin() out of the REST-exposed schema, and bound add_xp()
-- ============================================================================
-- Follows 0004. Split out because the approach had to change after testing.
--
-- WHAT DID NOT WORK, and why it matters if you ever revisit this:
--   `REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, authenticated`
--   looks correct and appears to pass, but it is a no-op while PUBLIC still
--   holds the grant (ACL entry `=X/postgres`). Once PUBLIC is revoked too, EVERY
--   admin RLS policy fails with "permission denied for function is_admin" —
--   policy expressions ARE evaluated under the calling role's privileges.
--
-- So the function cannot be un-granted; it has to become unreachable over REST
-- instead. PostgREST only exposes configured schemas, and `private` is not one
-- of them, while policies can still call it.
-- ============================================================================

create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.is_admin(uid uuid)
returns boolean language plpgsql stable security definer
set search_path = '' as $$
begin
  return exists (select 1 from public.profiles p where p.id = uid and p.role = 'admin');
end;
$$;

-- anon needs EXECUTE too: anon-readable tables (questions, exam_tracks,
-- syllabus_nodes) carry admin policies that are evaluated on every read.
grant execute on function private.is_admin(uuid) to anon, authenticated, service_role;

-- Rewrite all 31 referencing policies programmatically, preserving command,
-- roles and permissiveness. Hand-editing 31 policies is how a typo silently
-- widens access.
do $$
declare
  r record;
  new_qual text;
  new_check text;
  stmt text;
begin
  for r in
    select schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual,'') like '%is_admin%' or coalesce(with_check,'') like '%is_admin%')
  loop
    new_qual  := regexp_replace(coalesce(r.qual, ''),       '(public\.)?is_admin\(', 'private.is_admin(', 'g');
    new_check := regexp_replace(coalesce(r.with_check, ''), '(public\.)?is_admin\(', 'private.is_admin(', 'g');

    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);

    stmt := format('create policy %I on %I.%I as %s for %s to %s',
                   r.policyname, r.schemaname, r.tablename,
                   case when r.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end,
                   r.cmd, array_to_string(r.roles, ', '));
    if new_qual  <> '' then stmt := stmt || format(' using (%s)', new_qual); end if;
    if new_check <> '' then stmt := stmt || format(' with check (%s)', new_check); end if;
    execute stmt;
  end loop;
end $$;

-- Refuse to drop the old function if anything still calls it unqualified.
do $$
declare leftover int;
begin
  select count(*) into leftover
  from pg_policies
  where coalesce(qual,'') ~ '(^|[^.])is_admin\('
     or coalesce(with_check,'') ~ '(^|[^.])is_admin\(';
  if leftover > 0 then
    raise exception 'Refusing to drop public.is_admin: % policy(ies) still reference it', leftover;
  end if;
end $$;

drop function if exists public.is_admin(uuid);


-- ── add_xp: bound the amount ───────────────────────────────────────────────
-- Stays callable by authenticated — three app call sites depend on it — so the
-- linter warning for this one remains BY DESIGN. The real defect was that the
-- amount was entirely client-controlled: any signed-in user could POST
-- /rest/v1/rpc/add_xp with p_amount = 1000000 and top the leaderboard.
--
-- Bounds derived from actual data: the largest award ever recorded is 210,
-- across source types study_session / quiz / lesson. 2000 leaves generous room
-- for a long study session while making inflation pointless. Future Phase 2/3
-- sources are whitelisted up front so they don't fail closed on first use.
create or replace function public.add_xp(p_amount integer, p_source text)
returns void language plpgsql security definer
set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'add_xp requires an authenticated user';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 2000 then
    raise exception 'add_xp: p_amount must be between 1 and 2000 (got %)', p_amount;
  end if;

  if p_source is null or p_source not in
     ('study_session', 'quiz', 'lesson', 'diagnostic', 'review', 'practice', 'mock') then
    raise exception 'add_xp: unrecognised p_source %', p_source;
  end if;

  insert into public.xp_logs (user_id, xp_amount, source_type)
  values (v_uid, p_amount, p_source)
  on conflict do nothing;

  update public.profiles
     set total_xp = total_xp + p_amount, updated_at = now()
   where id = v_uid;
end $$;

revoke execute on function public.add_xp(integer, text) from public;
grant  execute on function public.add_xp(integer, text) to authenticated, service_role;
