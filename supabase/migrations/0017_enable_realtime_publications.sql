-- ============================================================================
-- 0017 — put the Realtime publication under version control
-- ============================================================================
-- NOT YET APPLIED to the live database. It is a no-op there: all four tables
-- are already in `supabase_realtime`. It exists so a rebuild from this folder
-- matches, which is exactly what a region move is.
--
-- WHY THIS WAS MISSING
-- -------------------
-- Realtime on a table is not schema — it is membership of the
-- `supabase_realtime` publication, which the dashboard toggle edits directly.
-- Nothing in migrations 0001-0016 touches it, so it was invisible drift:
-- replaying every migration into a fresh project produces an identical schema
-- with Realtime silently OFF.
--
-- That is not a cosmetic difference. Four screens subscribe to
-- `postgres_changes` and would simply stop updating, with no error anywhere:
--
--   notifications      → src/contexts/NotificationContext.tsx:55
--                        the bell icon; new notifications never appear
--   complaints         → src/pages/Dashboard.tsx:64
--                        a student watching their own complaint never sees it
--                        move to "in progress" or "closed"
--   complaint_history  → src/pages/Dashboard.tsx:94
--                        the reply thread on an open complaint stops appearing
--   saved_notes        → src/pages/lessons/LessonViewer.tsx:62
--                        notes stop syncing between two open tabs
--
-- Each of those is a feature that looks fine on load and is only broken in a
-- way you notice minutes later, which is the worst kind to ship.
--
-- RLS still applies to Realtime, so adding a table to the publication grants
-- nobody anything: a subscriber receives a change only if their own SELECT
-- policy would have let them read the row. The per-user `filter=` clauses in
-- the code above are a client-side narrowing, not the security boundary.

-- `add table` errors if the table is already a member, so check first. This
-- makes the migration safe to run against the current database (where all four
-- are already members) and against a fresh one (where none are).
do $$
declare
  t text;
begin
  foreach t in array array[
    'notifications',
    'complaints',
    'complaint_history',
    'saved_notes'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I', t
      );
      raise notice 'realtime: added public.% to supabase_realtime', t;
    else
      raise notice 'realtime: public.% already published, left alone', t;
    end if;
  end loop;
end $$;

-- Realtime sends the changed columns for an UPDATE, but a DELETE event carries
-- only the primary key unless the table has REPLICA IDENTITY FULL. All four
-- subscriptions above react by re-reading from the database rather than by
-- using the payload, so the default (primary key) is what we want — FULL costs
-- WAL volume on every write for data these screens never read.
