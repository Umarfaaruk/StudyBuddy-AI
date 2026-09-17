-- ============================================================================
-- 0005b — bound the XP amount add_xp() will accept
-- ============================================================================
-- Recovered from the live database (applied version 20260812164305). It had
-- been applied without a file in this repo; see MIGRATIONS.md.
--
-- NOTE ON REPLAY ORDER: a later migration (phase4_growth, 0008) adds
-- 'referral' to the allowed p_source list. Replaying history in order
-- therefore reaches the current definition only after that one runs. The live
-- function today accepts 'referral'; this file is the state as of 0005b.
--
-- add_xp stays callable by authenticated (three app call sites depend on it),
-- so the linter warning remains BY DESIGN. What was genuinely wrong is that the
-- amount was entirely client-controlled: anyone could POST /rest/v1/rpc/add_xp
-- with p_amount = 1000000 and top the leaderboard.
--
-- Bounds come from real data: the largest award ever recorded is 210, across
-- source types study_session / quiz / lesson. 2000 leaves generous headroom for
-- a very long study session while making inflation pointless.
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
grant execute on function public.add_xp(integer, text) to authenticated, service_role;
