-- ============================================================================
-- Parental consent for students under 18  (DPDP Act 2023)
-- ============================================================================
-- Most JEE/NEET/GATE-aspirant users are 16-18. The Act requires consent from a
-- parent or guardian before processing a child's personal data.
--
-- WHAT THIS IS: a dated, auditable record of who consented, for which student,
-- against which version of the privacy policy.
--
-- WHAT THIS IS NOT: "verifiable" consent in the full statutory sense. A student
-- ticking a box asserting their parent agreed is a CLAIM, not verification.
-- That is why verified_at is nullable and starts null, and why a token is
-- minted now: confirming with the guardian out-of-band (email link, OTP, or an
-- identity mechanism such as DigiLocker) is a separate step that must follow.
-- Storing a self-declaration in a column called "verified" would have made the
-- system look compliant while being exactly as unverified as before.
-- ============================================================================

-- Date of birth rather than age: an integer age is wrong within a year of being
-- written, and "is this user still a minor" must be answerable at any time.
alter table public.profiles add column if not exists date_of_birth date;

create table if not exists public.guardian_consents (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,

  guardian_name          text not null,
  guardian_email         text not null,
  guardian_relationship  text not null,

  -- Snapshotted so the record stays meaningful if the profile is later edited.
  student_date_of_birth  date not null,
  -- Which policy was agreed to. Consent is to a specific text, not in general.
  policy_version         text not null,

  declared_at            timestamptz not null default now(),
  declared_ip            text,

  -- Out-of-band confirmation. Null until a guardian actually confirms.
  verification_token     uuid not null default gen_random_uuid(),
  verification_sent_at   timestamptz,
  verified_at            timestamptz,
  verification_method    text,

  withdrawn_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- One live consent record per student; re-consenting updates it.
create unique index if not exists guardian_consents_user_idx
  on public.guardian_consents (user_id);

-- Looked up by token when a guardian follows a confirmation link.
create index if not exists guardian_consents_token_idx
  on public.guardian_consents (verification_token);

alter table public.guardian_consents enable row level security;

-- A student may see their own consent record and withdraw it. They may NOT
-- insert or edit one: it is written server-side during onboarding with the
-- service role, so a student cannot forge a consent for themselves.
drop policy if exists guardian_consents_select_own on public.guardian_consents;
create policy guardian_consents_select_own
  on public.guardian_consents for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Deliberately no INSERT or UPDATE policy for authenticated. Writes go through
-- the service role in /api/onboarding/submit.
--
-- No policy for anon at all: guardian_email is a third party's personal data
-- and the most sensitive column here.
