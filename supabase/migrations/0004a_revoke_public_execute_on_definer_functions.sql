-- ============================================================================
-- 0004a — revoke PUBLIC execute on SECURITY DEFINER functions
-- ============================================================================
-- Recovered from the live database (applied version 20260812163912). It had
-- been applied without a file in this repo; see MIGRATIONS.md.
--
-- Revoking from anon/authenticated alone was ineffective: the ACL entry
-- `=X/postgres` is a grant to PUBLIC, which covers every role. PUBLIC must be
-- revoked explicitly, then privileges granted back only where needed.
--
-- Safe for triggers: PostgreSQL checks EXECUTE on a trigger function when the
-- trigger is CREATED, not each time it fires, so existing triggers keep working.

revoke execute on function public.is_admin(uuid)            from public;
revoke execute on function public.handle_new_user()         from public;
revoke execute on function public.add_xp(integer, text)     from public;

-- is_admin is only ever needed inside RLS policy evaluation, which is done
-- internally — verified empirically that revoking EXECUTE does not break it.
grant execute on function public.is_admin(uuid) to service_role;

-- handle_new_user is a trigger function; nothing should call it directly.
grant execute on function public.handle_new_user() to service_role;

-- The app awards XP as a signed-in user, so authenticated keeps EXECUTE.
-- anon does not: with no auth.uid() the insert violates NOT NULL anyway, it
-- just did so *after* being allowed to run.
grant execute on function public.add_xp(integer, text) to authenticated, service_role;
