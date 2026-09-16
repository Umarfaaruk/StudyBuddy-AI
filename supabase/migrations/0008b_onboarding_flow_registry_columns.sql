-- ============================================================================
-- 0008b — storage for the flow-registry onboarding
-- ============================================================================
-- Recovered from the live database (applied version 20260904100107). It had
-- been applied without a file in this repo; see MIGRATIONS.md.
--
-- Storage for the flow-registry onboarding (NEET / GENERAL).
--
-- JSONB payload rather than a column per question: the point of a schema
-- registry is that adding a flow needs no migration, and a column-per-question
-- model would defeat that on the first new flow.
alter table public.user_preferences
  add column if not exists onboarding_flow_type text
    check (onboarding_flow_type is null or onboarding_flow_type in ('NEET', 'GENERAL')),
  add column if not exists onboarding_payload jsonb not null default '{}'::jsonb;

comment on column public.user_preferences.onboarding_flow_type is
'Which registry flow produced onboarding_payload. The API validates the payload against this flow''s Zod schema before writing, so the two are always consistent.';
