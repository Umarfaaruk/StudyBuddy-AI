-- ============================================================================
-- Admin Phase-1/2 enabling fields — safe to run on an existing database
-- (does NOT drop anything). Run once in the Supabase SQL Editor.
-- These are also included in schema.sql for fresh setups.
-- ============================================================================
alter table public.profiles       add column if not exists is_active boolean not null default true;
alter table public.doubt_sessions add column if not exists status    text not null default 'pending';
alter table public.feedback       add column if not exists category  text;
