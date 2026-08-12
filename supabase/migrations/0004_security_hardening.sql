-- ============================================================================
-- 0004 — Security hardening (clears the Supabase advisor board)
-- ============================================================================
-- Addresses every finding from the database linter, including the one ERROR.
-- Additive/corrective; safe against live data.
-- ============================================================================


-- ── 1. ERROR: security_definer_view on questions_public ────────────────────
--
-- The old shape kept `correct_answer` on `questions` and hid it behind a
-- SECURITY DEFINER view. That works, but the safety rested entirely on a column
-- list — one careless `select *` in a future view edit would have leaked the
-- answer key, and the linter is right to flag the pattern.
--
-- Better: answers simply do not live on a table students can read. Moving them
-- to their own admin-only table means `questions` has NO secret columns, so it
-- can be read directly under ordinary RLS and the definer view disappears
-- entirely rather than being explained away.
--
-- Doing this now is deliberate: the bank is empty, so there is no data to
-- backfill and no importer output to reconcile.

create table if not exists public.question_answers (
  question_id    uuid primary key references public.questions(id) on delete cascade,
  correct_answer text,
  explanation    text,
  updated_at     timestamptz not null default now()
);

-- Carry across anything already stored (no-op on an empty bank).
insert into public.question_answers (question_id, correct_answer, explanation)
select id, correct_answer, explanation
from public.questions
where correct_answer is not null or explanation is not null
on conflict (question_id) do nothing;

drop view if exists public.questions_public;

alter table public.questions
  drop column if exists correct_answer,
  drop column if exists explanation;

-- `questions` now holds nothing secret, so published rows are readable directly.
drop policy if exists "questions_read_published" on public.questions;
create policy "questions_read_published" on public.questions
  for select using (status = 'published');

alter table public.question_answers enable row level security;

-- Admins manage answers; the grading endpoint reads them with the service role,
-- which bypasses RLS. No browser role can select this table.
drop policy if exists "question_answers_admin" on public.question_answers;
create policy "question_answers_admin" on public.question_answers
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

comment on table public.question_answers is
'Answer key, deliberately separated from public.questions so that table has no columns requiring concealment. Read server-side only (service role) during grading. Never expose through a view or a policy granting SELECT to anon/authenticated.';

create trigger trg_touch_question_answers
  before update on public.question_answers
  for each row execute function public.touch_updated_at();


-- ── 2. WARN: function_search_path_mutable ──────────────────────────────────
-- An empty search_path forces every reference to be schema-qualified, so a
-- caller cannot shadow `profiles` or `xp_logs` with a temp table and change
-- what a SECURITY DEFINER function operates on. All four bodies already use
-- fully-qualified names, so this is safe.
alter function public.touch_updated_at()            set search_path = '';
alter function public.is_admin(uuid)                set search_path = '';
alter function public.add_xp(integer, text)         set search_path = '';
alter function public.handle_new_user()             set search_path = '';


-- ── 3. WARN: SECURITY DEFINER functions callable over the REST API ─────────
-- PostgREST exposes every function in `public` as an RPC endpoint.
--
-- NOTE: revoking from anon/authenticated alone is a NO-OP here. These functions
-- carry an ACL entry of `=X/postgres`, which is a grant to PUBLIC covering every
-- role; PUBLIC must be revoked explicitly or the endpoint stays open.
--
-- handle_new_user is a TRIGGER function — nothing should ever call it directly.
-- Safe to revoke: PostgreSQL checks EXECUTE on a trigger function when the
-- trigger is CREATED, not each time it fires.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant  execute on function public.handle_new_user() to service_role;

-- is_admin is NOT handled here — see 0005. Revoking it breaks every admin RLS
-- policy ("permission denied for function is_admin"), because policy
-- expressions ARE evaluated under the caller's function privileges. It has to
-- move out of the exposed schema instead.


-- ── 4. WARN: rls_policy_always_true on notifications ───────────────────────
-- `WITH CHECK (true)` let ANY caller — including anon — write a notification to
-- ANY user: a spam and phishing vector, since notifications render attacker-
-- supplied title and message text to the recipient.
--
-- The three legitimate cross-user paths all establish a relationship first:
--   • friend request  — inserts the friendships row, then notifies
--   • friend accept   — updates that row, then notifies
--   • admin           — complaint status updates
-- so requiring a friendship link (either direction) or admin covers every
-- real caller while blocking arbitrary strangers.
drop policy if exists "notif_insert_any" on public.notifications;
create policy "notif_insert_scoped" on public.notifications
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or public.is_admin(auth.uid())
    or exists (
      select 1 from public.friendships f
      where (f.requester_id = auth.uid() and f.addressee_id = notifications.user_id)
         or (f.addressee_id = auth.uid() and f.requester_id = notifications.user_id)
    )
  );


-- ── 5. WARN: public_bucket_allows_listing ──────────────────────────────────
-- Both buckets are public, so getPublicUrl() keeps working without any SELECT
-- policy — the policy's only effect was to let clients enumerate every file in
-- the bucket, including other users' avatars and complaint screenshots.
-- Verified the app reads these solely via getPublicUrl: no .list(), .download()
-- or createSignedUrl calls exist.
drop policy if exists "avatar_read"    on storage.objects;
drop policy if exists "complaint_read" on storage.objects;
