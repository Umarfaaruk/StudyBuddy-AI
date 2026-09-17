# Migrations: repo ↔ live database

## Why this file exists

The live database had **23 applied migrations**; this folder held **13 files**.
Ten migrations had been applied straight to production without ever being
committed, so rebuilding from `supabase/migrations/` alone produced a
*different and weaker* schema than the one running. Among the missing ones:

- the security hardening (`harden_add_xp`, `restrict_anon_profile_reads`,
  `revoke_public_execute_on_definer_functions`, `drop_public_is_admin`)
- two migrations defining RPCs the app calls at runtime
  (`search_exam_context`, `mock_test_percentile`, `cohort_analytics`) — without
  them, AI grounding, mock-test percentiles and the admin cohort view all fail
- the fix that lets JEE and GATE students finish onboarding at all
  (`fix_onboarding_flow_type_check`)

All ten have been recovered from `supabase_migrations.schema_migrations`, which
stores the SQL of every applied migration, and committed with their original
comments intact. Each recovered file says so in its header and records the
version it was applied as.

## File naming

Existing files were **not** renumbered, to avoid churning paths. Recovered
migrations use a letter suffix showing where they belong in sequence, which
also sorts correctly:

```
0004_security_hardening.sql
0004a_revoke_public_execute_on_definer_functions.sql   ← recovered
0005_is_admin_private_schema.sql
0005a_drop_public_is_admin.sql                         ← recovered
0005b_harden_add_xp.sql                                ← recovered
0006_fulltext_retrieval.sql
0006a_exam_context_retrieval_fn.sql                    ← recovered
0007_phase3_proof_instrumentation.sql
0007a_phase3_analytics_functions.sql                   ← recovered
0008_phase4_growth.sql
0008a_restrict_anon_profile_reads.sql                  ← recovered
0008b_onboarding_flow_registry_columns.sql             ← recovered
0008c_optimise_rls_initplan.sql                        ← recovered
0008d_onboarding_track_at_signup.sql                   ← recovered
0009_seed_gate.sql
0010_seed_gate_questions.sql
0011_seed_gate_mock_tests.sql
0012_guardian_consent.sql
0012a_fix_onboarding_flow_type_check.sql               ← recovered
0013_quiz_attempt_score_bounds.sql
0014_index_remaining_foreign_keys.sql
0015_consolidate_permissive_policies.sql               ← NOT APPLIED (held)
0016_restrict_anon_topic_and_lesson_reads.sql
0017_enable_realtime_publications.sql
```

`ls | sort` gives true chronological order: `_` (0x5F) sorts before any
letter, so `0004_…` precedes `0004a_…`.

## Replay order caveats

Two files are superseded by later ones. Replaying in order still reaches the
current state, but reading one in isolation can mislead:

- `0005b_harden_add_xp.sql` whitelists p_source without `'referral'`.
  `0008_phase4_growth.sql` adds it. The live function accepts it today.
- `0008b_onboarding_flow_registry_columns.sql` creates the
  `onboarding_flow_type` CHECK allowing only `NEET`/`GENERAL`.
  `0012a_fix_onboarding_flow_type_check.sql` widens it to include `JEE`
  and `GATE`.

## Not yet applied

Only `0015` is still held. `0016` and `0017` were applied on 2026-09-17 and are
described below for the record.

### 0016 — anon could read students' courses  ·  APPLIED 2026-09-17

`topics_read` and `lessons_read` are `USING (true)` to `{public}`, which
includes `anon`. Measured live: all 9 topics are student-generated (0 seeded)
across 5 students, with 46 lessons. All of it is readable without signing in.
Nothing unauthenticated needs either table — verified against every public
surface. Same class of bug as the `profiles` leak that 0008a fixed.

**Result, measured by querying as each role after applying:**

| role | topics | lessons | exam_tracks | published questions |
|---|---|---|---|---|
| `anon` before | 9 | 46 | 4 | 80 |
| `anon` after | **0** | **0** | 4 | 80 |
| `authenticated` | 9 | 46 | 4 | 80 |

The public free test and topic pages read `exam_tracks` and `questions`, which
are untouched, so nothing anonymous broke.

### 0017 — Realtime publication as code  ·  APPLIED 2026-09-17 (no-op)

Realtime on a table is membership of the `supabase_realtime` publication, which
the dashboard toggle edits directly — it is not schema, and no migration ever
captured it. Four tables are published live (`notifications`, `complaints`,
`complaint_history`, `saved_notes`), every one of them actively subscribed by
app code.

So rebuilding from this folder gave an identical schema with Realtime **off**:
the notification bell, the student complaint tracker, the complaint reply
thread and lesson-note sync would all silently stop refreshing. Found while
planning the `ap-south-1` move (see `REGION-MIGRATION.md`), which is exactly
the rebuild that would have hit it.

Applying it changed nothing, as expected — all four tables were already
published and the count stayed at 4. Its value is on a *fresh* project, where
it is the difference between Realtime working and silently not.

### 0015 — collapse overlapping permissive policies  ·  STILL HELD

Removes the ~527 `multiple_permissive_policies` advisor warnings by merging
`admin_all[ALL]` with each `own_*` policy into one policy per command.
Mechanical: expressions are copied verbatim out of `pg_policies` and merged
only within identical role sets, so it cannot widen access.

Buys nothing measurable yet — the largest table holds 238 rows, and Postgres
had logged 63 index scans against 2006 sequential scans, i.e. it is not using
indexes at all because everything fits in a page or two. Apply it when the
tables are large and you can watch it.

## How to apply

Via the Supabase SQL editor, or the CLI:

```bash
supabase db push            # applies anything not yet recorded
```

Verify afterwards:

```sql
-- every table with RLS still has at least one policy
select t.tablename
  from pg_tables t
 where t.schemaname = 'public' and t.rowsecurity
   and not exists (select 1 from pg_policies p
                    where p.schemaname = 'public' and p.tablename = t.tablename);
-- expect zero rows
```

## Rolling back 0015

It drops and recreates policies, so snapshot them first and keep the output:

```sql
select 'create policy ' || quote_ident(policyname)
    || ' on public.' || quote_ident(tablename)
    || ' as ' || lower(permissive)
    || ' for ' || cmd
    || ' to ' || array_to_string(roles, ', ')
    || coalesce(' using (' || qual || ')', '')
    || coalesce(' with check (' || with_check || ')', '') || ';'
  from pg_policies where schemaname = 'public' order by tablename, policyname;
```

## Things the linter flags that are correct by design

- **`public_most_improved` executable by anon.** Intentional: it powers the
  unauthenticated `/most-improved` board and is SECURITY DEFINER precisely so
  it can return only opted-in display names.
- **`add_xp` executable by authenticated.** Intentional — the app awards XP
  from the browser. It is hardened: the user comes from `auth.uid()` (so you
  cannot grant XP to someone else), the amount is capped at 1–2000, the source
  is whitelisted, and `search_path` is pinned.
- **42 "unused" indexes.** Not dead — unexercised. The database has served 63
  index scans against 2006 sequential scans because every table fits in a page
  or two, so the planner correctly ignores indexes. Dropping them now would
  throw away exactly what is needed once the tables grow. Revisit when the
  biggest table is past ~10k rows and these counters have had real traffic.

## Still to do by hand (no API for it)

**Enable leaked-password protection.** Dashboard → Authentication → Policies →
Password protection → "Prevent use of leaked passwords". Checks new passwords
against HaveIBeenPwned. There is no Management API route reachable from CI for
this, so it cannot be scripted here.
