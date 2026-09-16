-- ============================================================================
-- 0012a — onboarding_flow_type CHECK had fallen behind FLOW_TYPES
-- ============================================================================
-- Recovered from the live database (applied version 20260905190210). It had
-- been applied without a file in this repo; see MIGRATIONS.md. Note this
-- SUPERSEDES the CHECK created in 0008b — replaying in order gives the right
-- final state.
--
-- The constraint allowed only 'NEET' and 'GENERAL'. Every JEE student and every
-- GATE student who finished onboarding hit
--
--   new row for relation "user_preferences" violates check constraint
--
-- which /api/onboarding/submit turned into a 500 and the UI showed as "Could
-- not save your answers. Please try again." Retrying never helped, because the
-- answers were valid and the database was refusing the flow name.
--
-- Two flows were added in code (JEE, then GATE) without anyone touching this
-- list, and no test exercised an authenticated submit, so it stayed silent.
-- tests/e2e-authenticated.mjs now submits a GATE flow end to end, so the same
-- drift fails loudly next time.
--
-- THIS LIST MIRRORS FLOW_TYPES IN api/_onboardingSchemas.js. Adding a flow
-- there means changing it here in the same commit.
-- ============================================================================

alter table public.user_preferences
  drop constraint if exists user_preferences_onboarding_flow_type_check;

alter table public.user_preferences
  add constraint user_preferences_onboarding_flow_type_check
  check (
    onboarding_flow_type is null
    or onboarding_flow_type = any (array['JEE', 'NEET', 'GATE', 'GENERAL'])
  );
