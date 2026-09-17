-- ============================================================================
-- 0016 — stop anon reading students' own courses and lessons
-- ============================================================================
--                     *** APPLIED to production 2026-09-17 ***
-- Held back only because the RLS batch was deferred; unlike 0015 this one has
-- real value today. See MIGRATIONS.md.
-- ============================================================================
--
-- THE PROBLEM
-- -----------
-- public.topics and public.lessons carry two policies each:
--
--     topics_read   FOR SELECT  to {public}  using (true)
--     lessons_read  FOR SELECT  to {public}  using (true)
--
-- `{public}` includes `anon`, and the anon key ships inside the JS bundle. So
-- anyone who opens the site can read every row of both tables without signing
-- in.
--
-- That would be fine if these held only seeded reference content, which is
-- presumably the assumption the policies were written under. They do not.
-- Measured on the live database:
--
--     custom_topics                9
--     seeded_topics                0
--     students_with_custom_courses 5
--     lessons_in_custom_topics    46
--
-- Every row is a student's own AI-generated course — the material they chose to
-- study and the lesson text generated from their uploads. All of it is
-- currently world-readable.
--
-- This is the same mistake 0008a fixed for public.profiles, where
-- `profiles_public_read USING (true)` was exposing every user's email.
--
-- WHY RESTRICTING TO authenticated IS SAFE
-- ----------------------------------------
-- Nothing unauthenticated reads either table. Verified by reading every public
-- surface in the app:
--
--     src/pages/public/TopicPage.tsx  -> exam_tracks, questions, syllabus_nodes
--     src/pages/public/FreeTest.tsx   -> exam_tracks, questions (via lib)
--     src/pages/public/PublicLeaderboard.tsx -> public_most_improved() RPC
--     scripts/generate-seo.mjs        -> neither table
--
-- topics and lessons are read only from authenticated screens: the dashboard
-- (useDashboardData), LessonList, LessonViewer, StudyPlanner and
-- ProgressDashboard.
--
-- WHAT THIS DOES NOT FIX
-- ----------------------
-- Signed-in students can still read each other's courses, because the
-- replacement policy is `to authenticated using (true)` — the same compromise
-- 0008a documented for profiles. Narrowing it to owner-only would need the
-- read split into "seeded content" vs "mine", which means a flag or a separate
-- table, and would change what the Academy tab can show. That is a product
-- decision, deliberately not bundled here. This migration closes the
-- anonymous hole, which needs no such decision.

-- ── topics ────────────────────────────────────────────────────────────────
drop policy if exists "topics_read" on public.topics;

create policy "topics_read_authenticated" on public.topics
  for select to authenticated using (true);

-- ── lessons ───────────────────────────────────────────────────────────────
drop policy if exists "lessons_read" on public.lessons;

create policy "lessons_read_authenticated" on public.lessons
  for select to authenticated using (true);

-- The owner and admin policies (topics_own / topics_admin / lessons_own /
-- lessons_admin) are left untouched: they are FOR ALL and still grant a
-- student full control of their own rows.
