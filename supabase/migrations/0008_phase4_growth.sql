-- ============================================================================
-- 0008 — Phase 4: leads, referrals, institute codes, public opt-in
-- ============================================================================
-- ADDITIVE ONLY. Safe against live data; idempotent.
--
-- Everything here touches UNAUTHENTICATED or PUBLIC surfaces, so the RLS is the
-- feature rather than an afterthought. Two rules drive the whole file:
--   • anon may WRITE a lead but never READ one — otherwise the lead table is a
--     public dump of names, emails and phone numbers.
--   • nothing about a student appears publicly without an explicit, separate
--     opt-in that they set themselves.
-- ============================================================================


-- ── Leads (4.2) ────────────────────────────────────────────────────────────
-- A lead is deliberately NOT a user: no auth row, no profile, no RLS identity.
-- Keeping them apart means an abandoned funnel never litters auth.users, and a
-- later signup can be linked without merging two half-populated accounts.
create table if not exists public.leads (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  phone              text,
  name               text,
  exam_track_id      text references public.exam_tracks(id) on delete set null,
  source             text not null default 'free_test',
  -- The anonymous diagnostic, kept so a converted signup can pre-fill the
  -- student's profile and mastery instead of making them start over.
  answers            jsonb not null default '[]'::jsonb,
  per_topic          jsonb not null default '[]'::jsonb,
  score              numeric(5,2),
  -- Attribution captured at lead time, since the referring link is gone by the
  -- time they eventually sign up.
  referral_code      text,
  cohort_join_code   text,
  converted_user_id  uuid references auth.users(id) on delete set null,
  converted_at       timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists leads_email_idx      on public.leads (lower(email));
create index if not exists leads_created_idx    on public.leads (created_at desc);
create index if not exists leads_unconverted_idx on public.leads (created_at desc)
  where converted_user_id is null;


-- ── Referrals (4.4) ────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists referral_code text unique;

create table if not exists public.referrals (
  id                uuid primary key default gen_random_uuid(),
  referrer_user_id  uuid not null references auth.users(id) on delete cascade,
  -- UNIQUE: a student can only ever be referred once. Without this, two
  -- referrers could both claim the same signup and both be rewarded.
  referred_user_id  uuid not null unique references auth.users(id) on delete cascade,
  referral_code     text not null,
  status            text not null default 'pending'
                      check (status in ('pending', 'qualified', 'rewarded')),
  qualified_at      timestamptz,
  rewarded_at       timestamptz,
  created_at        timestamptz not null default now(),
  -- Self-referral is the most obvious abuse; block it in the schema rather
  -- than trusting every future write path to remember.
  constraint referrals_no_self_ck check (referrer_user_id <> referred_user_id)
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_user_id, status);


-- ── Public opt-in (4.6) ────────────────────────────────────────────────────
-- Two separate flags, mirroring the testimonial consent model: agreeing to
-- appear in a public ranking is not agreeing to appear under your real name.
alter table public.profiles
  add column if not exists public_leaderboard_opt_in boolean not null default false,
  add column if not exists public_display_name       text;


-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.leads     enable row level security;
alter table public.referrals enable row level security;

-- Leads: anon INSERT only. No select policy for anon or authenticated exists,
-- so the table is write-only from the browser — a lead list is exactly the kind
-- of thing that must never be enumerable.
drop policy if exists "leads_public_insert" on public.leads;
create policy "leads_public_insert" on public.leads
  for insert to anon, authenticated with check (true);

drop policy if exists "leads_admin" on public.leads;
create policy "leads_admin" on public.leads for all
  using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()));

-- Referrals: a student sees referrals they made; only the server (service role)
-- and admins may write, so nobody can mark their own referral as qualified.
drop policy if exists "referrals_referrer_read" on public.referrals;
create policy "referrals_referrer_read" on public.referrals for select
  using (referrer_user_id = auth.uid() or referred_user_id = auth.uid());

drop policy if exists "referrals_admin" on public.referrals;
create policy "referrals_admin" on public.referrals for all
  using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()));


-- ── Referral code generation ───────────────────────────────────────────────
-- Uppercase, no O/0 or I/1, so a code survives being read aloud or written down.
create or replace function public.generate_referral_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
begin
  loop
    candidate := '';
    for i in 1..7 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles p where p.referral_code = candidate);
  end loop;
  return candidate;
end $$;

revoke execute on function public.generate_referral_code() from public;
grant execute on function public.generate_referral_code() to service_role;

-- Backfill + assign on creation, so every student always has a shareable code
-- and the UI never has to handle a null.
update public.profiles set referral_code = public.generate_referral_code()
where referral_code is null;

create or replace function public.assign_referral_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.referral_code is null then
    new.referral_code := public.generate_referral_code();
  end if;
  return new;
end $$;

drop trigger if exists trg_assign_referral_code on public.profiles;
create trigger trg_assign_referral_code
  before insert on public.profiles
  for each row execute function public.assign_referral_code();


-- ── Public "most improved" board (4.6) ─────────────────────────────────────
-- SECURITY DEFINER is required here and is the ONE place it is justified: the
-- board must be readable by anon, but computing it needs to read mock attempts
-- belonging to other students, which RLS correctly forbids. The safety comes
-- from the function body, not the caller:
--   • only profiles with public_leaderboard_opt_in = true are considered;
--   • only public_display_name is returned, never the real name or email;
--   • only a score delta is exposed, never raw attempt rows.
create or replace function public.public_most_improved(p_limit integer default 10)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select a.user_id, a.score, a.submitted_at,
           row_number() over (partition by a.user_id order by a.submitted_at asc)  as rn_first,
           row_number() over (partition by a.user_id order by a.submitted_at desc) as rn_last
    from public.mock_test_attempts a
    join public.profiles p on p.id = a.user_id
    where a.status = 'completed'
      and a.score is not null
      and p.public_leaderboard_opt_in = true
  ),
  deltas as (
    select r.user_id,
           max(r.score) filter (where r.rn_last = 1)
             - max(r.score) filter (where r.rn_first = 1) as delta,
           max(r.score) filter (where r.rn_last = 1)      as latest_score,
           count(*)                                        as attempts
    from ranked r
    group by r.user_id
    having count(*) >= 2
  )
  select coalesce(jsonb_agg(x order by x.improvement desc), '[]'::jsonb)
  from (
    select coalesce(p.public_display_name, 'Anonymous') as display_name,
           round(d.delta, 1)        as improvement,
           round(d.latest_score, 1) as latest_score,
           d.attempts
    from deltas d
    join public.profiles p on p.id = d.user_id
    where d.delta > 0
    order by d.delta desc
    limit greatest(p_limit, 0)
  ) x;
$$;

comment on function public.public_most_improved(integer) is
'Public social proof board. SECURITY DEFINER by necessity — it must read other students'' attempts, which RLS forbids for the caller. Safety is enforced in the body: opt-in students only, display name only, aggregate delta only. Never add email, real name, or raw attempt rows.';

grant execute on function public.public_most_improved(integer) to anon, authenticated;


-- ── add_xp: allow referral rewards ─────────────────────────────────────────
-- Reuses the existing XP mechanic rather than inventing a second currency, as
-- specified. Bounds and the authenticated-only grant are unchanged.
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
     ('study_session', 'quiz', 'lesson', 'diagnostic', 'review', 'practice', 'mock', 'referral') then
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


-- ── Follow-up applied after RLS probing (see migration 0009 notes) ─────────
-- Probing with `set role anon` surfaced two problems this file created or
-- worsened, both fixed immediately:
--
-- 1. `profiles_public_read` (PRE-EXISTING) was FOR SELECT USING (true) to role
--    `public`, so anon could read every profile including email — and this
--    migration added referral_code to that same table. Replaced with an
--    authenticated-only read policy. Nothing anonymous needs it: the public
--    board goes through public_most_improved().
--
-- 2. REVOKE ... FROM PUBLIC on generate_referral_code was insufficient, because
--    Supabase's DEFAULT PRIVILEGES grant EXECUTE on new public functions to
--    anon and authenticated explicitly. Those grants must be revoked by name.
drop policy if exists "profiles_public_read" on public.profiles;

create policy "profiles_read_authenticated" on public.profiles
  for select to authenticated using (true);

revoke execute on function public.generate_referral_code() from anon, authenticated;
revoke execute on function public.assign_referral_code()   from anon, authenticated, public;
grant  execute on function public.generate_referral_code() to service_role;
