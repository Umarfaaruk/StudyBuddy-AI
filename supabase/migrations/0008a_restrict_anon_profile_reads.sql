-- ============================================================================
-- 0008a — stop anon reading every profile (incl. email and referral_code)
-- ============================================================================
-- Recovered from the live database (applied version 20260904093925). It had
-- been applied without a file in this repo; see MIGRATIONS.md. This is one of
-- the more important ones to keep: rebuilding from the repo without it would
-- re-expose every user's email address.
--
-- ── Anon could read every profile, including email ─────────────────────────
-- `profiles_public_read` was FOR SELECT USING (true) to role `public`, which
-- includes anon. The anon key ships inside the JS bundle, so this made all 13
-- users' email addresses readable by anyone who opened the site — and Phase 4
-- added referral_code to the same table, which would have let an attacker
-- attribute signups to arbitrary referrers.
--
-- Restricted to authenticated. Nothing anonymous needs it: the public
-- leaderboard reads through public_most_improved(), which is SECURITY DEFINER
-- and returns only opted-in display names.
--
-- NOTE: signed-in users can still read each other's rows (the in-app
-- leaderboard and Friends depend on it). Narrowing that further needs
-- column-level grants, which cannot distinguish self from others and would also
-- hide a user's own email from them — a separate change, deliberately not
-- bundled here.
drop policy if exists "profiles_public_read" on public.profiles;

create policy "profiles_read_authenticated" on public.profiles
  for select to authenticated using (true);


-- ── generate_referral_code was still callable by anon ──────────────────────
-- Supabase's DEFAULT PRIVILEGES grant EXECUTE on new functions in `public` to
-- anon and authenticated, so REVOKE ... FROM PUBLIC alone left explicit role
-- grants in place. Revoke those by name.
revoke execute on function public.generate_referral_code() from anon, authenticated;
revoke execute on function public.assign_referral_code()   from anon, authenticated, public;

-- The trigger runs as its owner, so it needs no caller grant.
grant execute on function public.generate_referral_code() to service_role;
