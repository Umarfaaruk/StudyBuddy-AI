-- ============================================================================
-- EduOnx — Supabase / Postgres schema  (Firebase Firestore → Postgres)
-- ============================================================================
-- Run this in the Supabase SQL Editor on a NEW project to stand up the database
-- that replaces the 23 Firestore collections. Safe to run on an empty project.
--
-- Design notes:
--   • Every user-owned table has `user_id uuid references auth.users(id)`.
--   • RLS is ON for every table. Default rule: a user sees only their own rows.
--   • Reference data (topics, lessons) is world-readable, admin-writable.
--   • `on delete cascade` means deleting an auth user wipes all their data in
--     ONE statement — replacing the 18-collection manual cleanup in
--     api/admin-delete-user.ts.
--   • created_at/updated_at default to now(); an updated_at trigger keeps it fresh.
-- ============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ── helpers ────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- is_admin(): used by admin RLS policies. SECURITY DEFINER so the policy can
-- read profiles without recursing through profiles' own RLS.
-- plpgsql (not sql) so the profiles reference is resolved at call time, not at
-- CREATE time — this function is defined before the profiles table exists.
create or replace function public.is_admin(uid uuid)
returns boolean language plpgsql security definer stable as $$
begin
  return exists (select 1 from public.profiles p where p.id = uid and p.role = 'admin');
end;
$$;

-- ============================================================================
-- CORE USER TABLES
-- ============================================================================

-- profiles : 1:1 with auth.users.  Merges old `profiles` + `users` (role/is_admin).
create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  full_name            text,
  email                text,
  avatar_url           text,
  grade_level          text,
  university           text,
  stream               text,
  age                  text,
  bio                  text,
  place                text,
  role                 text not null default 'student',   -- 'student' | 'admin'
  onboarding_completed boolean not null default false,
  total_xp             integer not null default 0,        -- cached aggregate of xp_logs
  xp_reconciled        boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.user_streaks (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  current_streak  integer not null default 0,
  longest_streak  integer not null default 0,
  last_study_date date,
  updated_at      timestamptz not null default now()
);

create table public.user_preferences (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  -- Onboarding answers (read by the Study Planner and admin analytics).
  learner_type        text,
  main_purpose        text,
  current_goal        text,
  goal_urgency        text,
  learning_methods    jsonb default '[]'::jsonb,
  app_count           text,
  pain_points         jsonb default '[]'::jsonb,
  learning_preference text,
  study_time          text,
  storage_location    text,
  auto_organize_pref  text,
  ai_expectations     jsonb default '[]'::jsonb,
  start_time          text,
  biggest_reason      text,
  onboarding_version  integer,
  last_feedback_at    timestamptz,
  updated_at          timestamptz not null default now()
);

create table public.analytics (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- LEARNING CONTENT (reference data: world-readable, admin-writable)
-- ============================================================================

-- topic ids are app-generated strings (carried over from Firestore auto-ids),
-- so topics.id and every topic_id reference are TEXT, not uuid.
create table public.topics (
  id           text primary key default gen_random_uuid()::text,
  user_id      uuid references auth.users(id) on delete cascade,
  title        text not null,
  subject      text,
  is_custom    boolean not null default false,
  material_id  text,
  description  text,
  source           text,        -- 'youtube' for video-derived courses
  youtube_video_id text,
  youtube_title    text,
  youtube_channel  text,
  lesson_count integer not null default 0,
  created_at   timestamptz not null default now()
);

create table public.lessons (
  id         uuid primary key default gen_random_uuid(),
  topic_id   text references public.topics(id) on delete cascade,
  title      text not null,
  content    text,
  position   integer,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- ACTIVITY / PROGRESS
-- ============================================================================

create table public.xp_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  xp_amount   integer not null,
  source_type text not null,                  -- study_session | quiz | lesson | ...
  created_at  timestamptz not null default now()
);
-- DB-level de-dup: an accidental double-write of the same award is rejected,
-- replacing the JS de-dup in src/lib/xp.ts.
create unique index xp_logs_dedup
  on public.xp_logs (user_id, xp_amount, source_type, created_at);
create index xp_logs_user_idx on public.xp_logs (user_id, created_at desc);

create table public.study_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  topic_id         text,
  started_at       timestamptz,
  ended_at         timestamptz,
  duration_seconds integer not null default 0,
  recovered        boolean not null default false,
  created_at       timestamptz not null default now()
);
create index study_sessions_user_idx on public.study_sessions (user_id, created_at desc);

create table public.quiz_attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  topic_id        text,
  quiz_id         text,
  topic_title     text,
  score           integer not null default 0,
  total_questions integer not null default 0,
  xp_awarded      integer not null default 0,
  created_at      timestamptz not null default now()
);
create index quiz_attempts_user_idx on public.quiz_attempts (user_id, created_at desc);

-- lesson_progress: was Firestore id `${uid}_${topicId}` with array `completed_lessons`.
-- Normalized to a composite PK; completed lessons kept as an int[] (simplest port).
create table public.lesson_progress (
  user_id          uuid not null references auth.users(id) on delete cascade,
  topic_id         text not null,
  completed_lessons text[] not null default '{}',   -- array of lesson ids
  updated_at       timestamptz not null default now(),
  primary key (user_id, topic_id)
);

create table public.topic_progress (
  user_id          uuid not null references auth.users(id) on delete cascade,
  topic_id         text not null,
  quiz_count       integer not null default 0,
  avg_quiz_score   integer not null default 0,
  mastery_score    integer not null default 0,
  lessons_completed integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (user_id, topic_id)
);

create table public.analytics_snapshots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- MATERIALS / AI TOOLS
-- ============================================================================

create table public.materials (
  id                text primary key default gen_random_uuid()::text,
  user_id           uuid not null references auth.users(id) on delete cascade,
  file_name         text,
  content_type      text,
  file_size         bigint,
  processing_status text,
  uploaded_at       timestamptz,
  processed_at      timestamptz,
  extracted_text    text,
  summary           text,
  key_topics        jsonb default '[]'::jsonb,
  concepts          jsonb default '[]'::jsonb,
  content_length    integer,
  file_data         text,
  created_at        timestamptz not null default now()
);
create index materials_user_idx on public.materials (user_id, created_at desc);

create table public.flashcards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  material_id text,
  question    text,
  answer      text,
  interval    integer default 0,
  ease        numeric default 2.5,
  next_review bigint,                 -- epoch ms
  created_at  bigint                  -- epoch ms
);
create index flashcards_user_idx on public.flashcards (user_id, material_id);

create table public.study_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  plan_type   text,
  material_id text,
  file_name   text,
  target_date timestamptz,
  subjects    jsonb default '[]'::jsonb,
  schedule    jsonb default '[]'::jsonb,
  topic_id    text,
  created_at  bigint                  -- epoch ms
);
create index study_plans_user_idx on public.study_plans (user_id);

create table public.saved_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  lesson_id   text,
  lesson_title text,
  topic_id    text,
  topic_title text,
  text        text,
  created_at  timestamptz not null default now()
);
create index saved_notes_lesson_idx on public.saved_notes (user_id, lesson_id);

-- ============================================================================
-- DOUBTS
-- ============================================================================

create table public.doubt_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  question_preview text,
  created_at       timestamptz not null default now()
);

create table public.doubt_messages (
  id               uuid primary key default gen_random_uuid(),
  doubt_session_id uuid references public.doubt_sessions(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  role             text,                 -- 'user' | 'assistant'
  message_text     text,
  created_at       timestamptz not null default now()
);
create index doubt_messages_session_idx on public.doubt_messages (doubt_session_id, created_at);

-- ============================================================================
-- NOTIFICATIONS  (realtime source)
-- ============================================================================

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  from_user_id uuid references auth.users(id) on delete set null,
  title        text not null,
  message      text,
  type         text,                -- streak | quiz | badge | study | system
  icon         text,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ============================================================================
-- FEEDBACK / COMPLAINTS
-- ============================================================================

create table public.feedback (             -- old field was camelCase userId → user_id
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  rating     integer,
  comment    text,
  name       text,
  email      text,
  platform   text,
  version    text,
  source     text,
  created_at timestamptz not null default now()
);

-- App-generated string ids (e.g. "CMP-123456"), so id is text.
create table public.complaints (
  id               text primary key,
  user_id          uuid references auth.users(id) on delete set null,
  title            text,
  category         text,
  description      text,
  screenshot       text,
  priority         text,
  status           text not null default 'Pending',
  admin_notes      text default '',
  resolution_notes text default '',
  fix_summary      text,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.complaint_history (
  id           text primary key,
  complaint_id text references public.complaints(id) on delete cascade,
  old_status   text,
  new_status   text,
  changed_by   text,           -- 'user' | 'admin' (free-form actor label)
  notes        text,
  user_id      uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ============================================================================
-- SOCIAL GRAPH
-- ============================================================================

create table public.follows (
  follower_id  uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id)
);

create table public.friendships (          -- old: friends_list (requester/addressee)
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending',   -- pending | accepted | blocked
  created_at   timestamptz not null default now(),
  unique (requester_id, addressee_id)
);

-- ============================================================================
-- updated_at triggers
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_streaks','user_preferences','analytics','lesson_progress',
    'topic_progress','saved_notes','complaints'
  ] loop
    execute format(
      'create trigger trg_touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;

-- ============================================================================
-- add_xp RPC : replaces Firestore increment() in studySession.ts / awardXP.
-- Inserts an xp_log (ignoring exact duplicates) and bumps the cached total.
-- ============================================================================
create or replace function public.add_xp(p_amount integer, p_source text)
returns void language plpgsql security definer as $$
begin
  insert into public.xp_logs (user_id, xp_amount, source_type)
  values (auth.uid(), p_amount, p_source)
  on conflict do nothing;
  update public.profiles set total_xp = total_xp + p_amount, updated_at = now()
  where id = auth.uid();
end $$;

-- ============================================================================
-- ROW-LEVEL SECURITY
-- ============================================================================
-- Enable RLS everywhere.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_streaks','user_preferences','analytics','topics','lessons',
    'xp_logs','study_sessions','quiz_attempts','lesson_progress','topic_progress',
    'analytics_snapshots','materials','flashcards','study_plans','saved_notes',
    'doubt_sessions','doubt_messages','notifications','feedback','complaints',
    'complaint_history','follows','friendships'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- ── Own-row policies (the dominant pattern) ────────────────────────────────
-- Each user can do anything to rows where user_id = auth.uid().
do $$
declare t text;
begin
  foreach t in array array[
    'user_streaks','user_preferences','analytics','xp_logs','study_sessions',
    'quiz_attempts','lesson_progress','topic_progress','analytics_snapshots',
    'materials','flashcards','study_plans','saved_notes','doubt_sessions',
    'doubt_messages','notifications'
  ] loop
    execute format($f$
      create policy "own_select" on public.%1$I for select using (auth.uid() = user_id);
      create policy "own_insert" on public.%1$I for insert with check (auth.uid() = user_id);
      create policy "own_update" on public.%1$I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
      create policy "own_delete" on public.%1$I for delete using (auth.uid() = user_id);
      create policy "admin_all"  on public.%1$I for all using (public.is_admin(auth.uid()));
    $f$, t);
  end loop;
end $$;

-- ── profiles : owner can read/update self; everyone can read basic profile
--    (needed for leaderboard/friends); admin full. ──────────────────────────
create policy "profiles_self_rw"   on public.profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_public_read" on public.profiles for select using (true);
create policy "profiles_admin_all"  on public.profiles for all using (public.is_admin(auth.uid()));

-- ── Reference data : world-readable; admin OR the owner of a custom topic
--    can write (users generate their own AI courses).
create policy "topics_read"  on public.topics  for select using (true);
create policy "topics_admin" on public.topics  for all using (public.is_admin(auth.uid()));
create policy "topics_own"   on public.topics  for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "lessons_read"  on public.lessons for select using (true);
create policy "lessons_admin" on public.lessons for all using (public.is_admin(auth.uid()));
create policy "lessons_own"   on public.lessons for all
  using (exists (select 1 from public.topics t where t.id = topic_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.topics t where t.id = topic_id and t.user_id = auth.uid()));

-- ── feedback / complaints : user inserts & reads own; admin reads all ───────
create policy "feedback_insert" on public.feedback for insert with check (auth.uid() = user_id);
create policy "feedback_own"    on public.feedback for select using (auth.uid() = user_id);
create policy "feedback_admin"  on public.feedback for all using (public.is_admin(auth.uid()));

create policy "complaints_insert" on public.complaints for insert with check (auth.uid() = user_id);
create policy "complaints_own"    on public.complaints for select using (auth.uid() = user_id);
create policy "complaints_admin"  on public.complaints for all using (public.is_admin(auth.uid()));
create policy "complaint_hist_admin"  on public.complaint_history for all using (public.is_admin(auth.uid()));
create policy "complaint_hist_read"   on public.complaint_history for select
  using (exists (select 1 from public.complaints c where c.id = complaint_id and c.user_id = auth.uid()));
create policy "complaint_hist_insert" on public.complaint_history for insert with check (auth.uid() = user_id);

-- ── follows : you manage rows where you are the follower; anyone can read ───
create policy "follows_read"   on public.follows for select using (true);
create policy "follows_insert" on public.follows for insert with check (auth.uid() = follower_id);
create policy "follows_delete" on public.follows for delete using (auth.uid() = follower_id);

-- ── friendships : either party can see/act on the row ──────────────────────
create policy "friend_read"   on public.friendships for select
  using (auth.uid() in (requester_id, addressee_id));
create policy "friend_insert" on public.friendships for insert with check (auth.uid() = requester_id);
create policy "friend_update" on public.friendships for update
  using (auth.uid() in (requester_id, addressee_id));
create policy "friend_delete" on public.friendships for delete
  using (auth.uid() in (requester_id, addressee_id));

-- notifications : allow a user to create a notification FOR ANOTHER user
-- (e.g. friend requests). Owner still controls read/update/delete via own_* above.
create policy "notif_insert_any" on public.notifications for insert with check (true);

-- ============================================================================
-- AUTO-CREATE profile row on signup (replaces setDoc in AuthContext.signUp)
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.email,
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do nothing;
  insert into public.user_streaks (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- STORAGE : avatars bucket (run after creating the bucket in the dashboard,
-- or via storage.create_bucket). Path convention: avatars/<uid>/...
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('avatars','avatars', true), ('complaints','complaints', true)
on conflict (id) do nothing;

create policy "avatar_read"   on storage.objects for select using (bucket_id = 'avatars');
create policy "avatar_write"  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar_update" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar_delete" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- complaints: users upload screenshots under complaints/<uid>/...; anyone can read
create policy "complaint_read"  on storage.objects for select using (bucket_id = 'complaints');
create policy "complaint_write" on storage.objects for insert
  with check (bucket_id = 'complaints' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- ENABLE REALTIME (for the 4 onSnapshot files: notifications + others)
-- ============================================================================
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.complaints;
alter publication supabase_realtime add table public.complaint_history;
alter publication supabase_realtime add table public.saved_notes;

-- ============================================================================
-- DONE. Next: point the app's data layer at these tables (see migration guide).
-- ============================================================================
