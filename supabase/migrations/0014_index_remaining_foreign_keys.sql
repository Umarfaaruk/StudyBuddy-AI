-- ============================================================================
-- 0014 — covering indexes for the 13 foreign keys that still lacked one
-- ============================================================================
-- APPLIED to the live database as `index_remaining_foreign_keys`
-- (version 20260916125348). Kept here so a rebuild from this folder matches.
--
-- A foreign key with no index on its own column makes the PARENT side's DELETE
-- and UPDATE scan the whole child table to check for referencing rows, and
-- makes the app's own filters on that column a sequential scan.
--
-- 0008c_optimise_rls_initplan already covered 16 of these; these 13 are the
-- remainder, including columns on tables added after it ran.
--
-- The first one is not hypothetical: the admin panel's "delete a closed
-- complaint" action relies on complaint_history cascading from complaints.id,
-- and without an index on complaint_history.complaint_id that cascade scans
-- the whole history table on every delete.

-- Cascade target for the complaint delete action.
create index if not exists complaint_history_complaint_idx
  on public.complaint_history (complaint_id);
create index if not exists complaint_history_user_idx
  on public.complaint_history (user_id);

-- Admin panel lists complaints joined to their reporting user.
create index if not exists complaints_user_idx
  on public.complaints (user_id);

-- Doubt history and a doubt's message thread both filter by user.
create index if not exists doubt_sessions_user_idx
  on public.doubt_sessions (user_id);
create index if not exists doubt_messages_user_idx
  on public.doubt_messages (user_id);

-- Admin feedback tab, and the weekly-feedback check on every dashboard load.
create index if not exists feedback_user_idx
  on public.feedback (user_id);

-- Friends page reads or=(requester_id.eq.X,addressee_id.eq.X); requester_id
-- was already indexed, addressee_id was the missing half.
create index if not exists friendships_addressee_idx
  on public.friendships (addressee_id);
create index if not exists follows_following_idx
  on public.follows (following_id);

-- Lesson viewer fetches a topic's lessons on every lesson navigation.
create index if not exists lessons_topic_idx
  on public.lessons (topic_id);

-- LessonList separates a student's own generated courses from the seeded ones.
create index if not exists topics_user_idx
  on public.topics (user_id);

-- Notifications raised BY another user (friend requests, accepts).
create index if not exists notifications_from_user_idx
  on public.notifications (from_user_id);

-- Practice and diagnostic roll responses up per syllabus concept.
create index if not exists question_responses_node_idx
  on public.question_responses (syllabus_node_id);

-- Added by 0008d, indexed here.
create index if not exists user_preferences_track_at_onboarding_idx
  on public.user_preferences (exam_track_id_at_onboarding);
