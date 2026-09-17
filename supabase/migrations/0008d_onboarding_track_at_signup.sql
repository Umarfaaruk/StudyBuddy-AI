-- ============================================================================
-- 0008d — remember the exam track chosen AT onboarding
-- ============================================================================
-- Recovered from the live database (applied version 20260904103557). It had
-- been applied without a file in this repo; see MIGRATIONS.md.
--
-- Records which exam track the student chose AT onboarding, separately from
-- profiles.exam_track_id which they can change later. Without this, a track
-- switch rewrites history and the answers no longer explain themselves — a JEE
-- payload would sit against a profile that now reads NEET.
alter table public.user_preferences
  add column if not exists exam_track_id_at_onboarding text
    references public.exam_tracks(id) on delete set null;

comment on column public.user_preferences.exam_track_id_at_onboarding is
'Exam track selected during onboarding. Deliberately distinct from profiles.exam_track_id, which the student may change later — this preserves the context the stored answers were given in.';
