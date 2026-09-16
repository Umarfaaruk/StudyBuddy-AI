-- ============================================================================
-- 0013 — quiz_attempts.score must be a real count of correct answers
-- ============================================================================
-- `score` is the NUMBER of correct answers (QuizPage computes it as
-- answers.filter(correct).length), not a percentage. Nothing enforced that,
-- so a row could hold score > total_questions, or a negative score.
--
-- The progress dashboard divides one by the other to get an accuracy
-- percentage. A single out-of-range row therefore rendered a headline figure
-- like "RETENTION 750%", which a student reads as the product being broken
-- rather than as one bad row. The client now clamps for display
-- (computeAvgQuizScore), and this is the other half: stop the impossible value
-- from being stored at all.
--
-- Existing rows are repaired before the constraint is added, so this is safe
-- to run against a live table: clamping a corrupt score to the question count
-- is the closest defensible reading of it, and leaving the row to fail the
-- constraint would block every later migration.

-- 1. Repair anything already out of range.
update public.quiz_attempts
   set score = greatest(0, least(score, total_questions))
 where total_questions >= 0
   and (score < 0 or score > total_questions);

-- 2. A total can never be negative either.
update public.quiz_attempts
   set total_questions = 0
 where total_questions < 0;

-- 3. Enforce it from here on.
alter table public.quiz_attempts
  drop constraint if exists quiz_attempts_score_bounds_ck;

alter table public.quiz_attempts
  add constraint quiz_attempts_score_bounds_ck
  check (
    total_questions >= 0
    and score >= 0
    and score <= total_questions
  );

comment on constraint quiz_attempts_score_bounds_ck on public.quiz_attempts is
'score is a count of correct answers, never a percentage, so it must lie between 0 and total_questions. Without this an out-of-range row made the progress dashboard show accuracy figures above 100%.';
