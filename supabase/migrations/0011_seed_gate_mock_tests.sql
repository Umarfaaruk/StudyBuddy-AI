-- ============================================================================
-- Phase 1b — mock tests for the GATE tracks
-- ============================================================================
-- Without these rows /mock renders an empty list for a GATE student: the
-- questions exist but nothing offers them as a timed test.
--
-- question_count is deliberately <= the 20 questions seeded per track. Asking
-- for 30 out of a pool of 20 would silently build a short test and then score
-- it out of the requested count.
-- ============================================================================

insert into public.mock_tests (exam_track_id, title, scope, question_count, duration_minutes, is_active)
select v.track, v.title, 'full_syllabus', v.qcount, v.mins, true
from (values
  ('gate-cs', 'GATE CS - Full Length Mock 1',   15, 30),
  ('gate-cs', 'GATE CS - Quick Sprint',         10, 18),
  ('gate-ec', 'GATE ECE - Full Length Mock 1',  15, 30),
  ('gate-ec', 'GATE ECE - Quick Sprint',        10, 18)
) as v(track, title, qcount, mins)
where not exists (
  select 1 from public.mock_tests m
   where m.exam_track_id = v.track and m.title = v.title
);
