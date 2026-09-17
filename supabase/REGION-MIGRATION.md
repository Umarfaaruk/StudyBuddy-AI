# Moving the project to `ap-south-1` (Mumbai)

## The short version

**A Supabase project cannot change region.** It is pinned to its hardware at
provision time. Supabase's own docs are explicit about it:

> Each Supabase project is provisioned on hardware in the chosen region, so it
> is bound to a region at the infrastructure level. Therefore, the process to
> change the region of a Supabase Project is to create a new project in the
> desired region and migrate your existing project.
>
> — [Change Project Region](https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z)

So "moving to `ap-south-1`" means: **stand up a second project in Mumbai,
replay the schema, copy the data, repoint the app, retire the old one.**

| | |
|---|---|
| Current project | `dhyiuauinxbmcarfqbfl` "Study Buddy AI" |
| Current region | `ap-southeast-1` (Singapore) |
| Target region | `ap-south-1` (Mumbai) |
| Cost of the new project | **$0/month** (Free tier — verified via the API) |
| Expected latency win | ~60–80 ms per round trip for users in India |

## What this actually buys, measured

Production edge logs put our users on the **Hyderabad (BOM) edge**, talking to
a database in **Singapore**. Mumbai removes roughly **60–80 ms per round trip**.

Worth being honest about the size of that prize: the login path currently makes
a **blocking 310 ms `profile-onboarding-check` query** before anything renders
(`src/components/ProtectedRoute.tsx`), and the dashboard reads the same profile
row **six more times**. Fixing that waterfall is worth more than the region
move, costs nothing in infrastructure risk, and is pure application code. Do
both — but if only one happens, do that one.

## Why this is not a one-click job

### 1. Every user's data hangs off `auth.users.id`

**37 tables in `public` carry a foreign key to `auth.users(id)`** — `profiles`,
`study_sessions`, `quiz_attempts`, `xp_logs`, `complaints`, all of it.

If the new project issues *fresh* UUIDs for the same people, every one of those
rows orphans. Their streaks, XP, quiz history and study plans are all gone even
though the rows copied fine. **The UUIDs must be carried across verbatim.** This
is the single thing most likely to go wrong, and it fails silently.

### 2. Google OAuth is how almost everyone logs in

Current sign-in inventory (15 users):

| | Users | Google linked | Has a password |
|---|---|---|---|
| admin | 2 | 2 | 1 |
| student | 13 | 12 | 1 |

**14 of 15 accounts sign in with Google.** A new project means a new
`https://<new-ref>.supabase.co/auth/v1/callback` URL, which has to be added as
an Authorized redirect URI in **Google Cloud Console**. That console is not
reachable from here — it needs your Google account. Until it is added, Google
sign-in returns `redirect_uri_mismatch` and **nobody can log in**.

Good news buried in that table: **both admins have Google linked**, so admin
access survives the cutover without depending on email delivery.

### 3. Password hashes

Exactly **one student** is password-only. Their bcrypt hash is deliberately not
being copied — moving it means reading a credential hash through a chat
transcript. That one account does a password reset instead. Confirm the new
project can actually send mail (Auth → Emails) before relying on that; the
built-in SMTP is rate-limited to a few messages per hour.

## Who does what

Steps marked **you** need a console I cannot reach.

### Phase 1 — build the new project  ·  DONE 2026-09-17

Target project: `khxxokwbeeedekzpqxpl` (`ap-south-1`). Schema, auth and data are
in and verified — schema objects hash-identical, all 27 populated tables at
matching row counts, zero orphaned `user_id` values, both storage buckets
created, RLS policy set hash-identical to production (`6f580597…`).

One gap, deliberate: `materials.extracted_text` is null on the three largest
rows (100,000 / 35,975 / 35,975 characters of raw PDF extraction). Copying text
that size through this channel character-perfect is not something I could
guarantee, and a silent corruption there is worse than a null. Everything
derived from those PDFs — topics, lessons, flashcards, quizzes, summaries, key
topics — migrated intact. Re-uploading the three PDFs after cutover regenerates
the extraction.

The original steps, for reference:

1. Create the project in `ap-south-1`, same organisation. *(I can do this.)*
2. Replay all 27 migrations, `0001` → `0017`, in order, via `apply_migration`
   so `supabase_migrations.schema_migrations` is populated correctly too.
   *(I can do this.)* This also re-seeds the content that lives in migrations:
   `exam_tracks`, `syllabus_nodes` (238), `questions` + `question_answers` (80
   each), `mock_tests` — so none of that needs copying.
3. Recreate the two storage buckets, `avatars` and `complaints`, both public.
   *(I can do this.)*
4. Copy the user data, UUIDs preserved, in foreign-key order — ~410 rows across
   22 tables. *(I can do this.)*
5. Re-upload the single existing avatar image. *(1 file — easiest is to just
   re-upload it through the app after cutover.)*
6. Verify: row counts match per table, and zero orphaned `user_id` values.
   *(Queries in "Verification" below.)*

7. Confirm Realtime is live on the four published tables. Migration `0017`
   handles this — see the note below. *(Covered by step 2.)*

There are **no Edge Functions** to move, no `pg_cron` jobs and no database
webhooks (all verified against the live project).

### Realtime was invisible drift — now fixed in `0017`

Realtime on a table is publication membership, not schema, and the dashboard
toggle edits it directly. **Nothing in migrations `0001`–`0016` touched it**, so
replaying them into Mumbai would have produced an identical schema with
Realtime silently **off** on `notifications`, `complaints`, `complaint_history`
and `saved_notes` — breaking the notification bell, the student's complaint
tracker, the complaint reply thread and lesson-note sync, with no error
anywhere.

`0017_enable_realtime_publications.sql` now puts all four under version
control. It is a verified no-op against the current project (all four are
already published) and does the real work on a fresh one.

### Phase 2 — cutover (this is the downtime window)

8. **you** — New project → Authentication → Sign In / Providers → Google: paste
   the **same** Client ID and Client Secret the current project uses. Copy them
   from the old project's dashboard; they are not in this repo.
9. **you** — [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   → your OAuth 2.0 Client → **Authorized redirect URIs** → add
   `https://<new-ref>.supabase.co/auth/v1/callback`.
   **Keep the old URI in place** until the cutover is proven — that is the
   rollback path.
10. **you** — New project → Authentication → URL Configuration → set **Site URL**
   to the production domain and add the redirect allow-list entries the app
   uses: `/onboarding` and `/login` (see `AUTH_ORIGIN` in
   `src/contexts/AuthContext.tsx`).
11. **you** — New project → Authentication → Password protection → enable
    **leaked password protection**. It is off on the current project; this is a
    free moment to fix that.
12. **you** — Vercel → Settings → Environment Variables, tick Production,
    Preview *and* Development for each:

    | Variable | New value |
    |---|---|
    | `VITE_SUPABASE_URL` | `https://<new-ref>.supabase.co` |
    | `VITE_SUPABASE_ANON_KEY` | new project's publishable/anon key |
    | `SUPABASE_URL` | `https://<new-ref>.supabase.co` |
    | `SUPABASE_SERVICE_ROLE_KEY` | new project's service-role key |
    | `SUPABASE_SECRET_KEY` | new project's secret key, if that form is used |

    Nothing else changes — the project ref is **not hardcoded anywhere** in this
    repo (verified by grep). `GROQ_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`,
    `SUPADATA_API_KEY` and `YOUTUBE_API_KEY` are untouched.

    Reveal each key in the Supabase dashboard *before* copying it. A key copied
    while still masked carries real bullet characters, and `vite.config.ts`
    will refuse the build with a non-ASCII error rather than ship a broken
    bundle.

    **Change all of them in one go, and do not leave `SUPABASE_URL` pointing
    at the old project.** Every serverless function resolves its target as
    `process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL`
    (`api/_verifyToken.js:28`, `api/grade.ts:51`, `api/public-grade.ts:35`,
    `api/admin-delete-user.ts:20`). So if `VITE_SUPABASE_URL` is moved to
    Mumbai while `SUPABASE_URL` still names Singapore, nothing errors — the
    browser writes to Mumbai and `/api/grade`, `/api/public-grade` and
    `/api/admin-delete-user` keep writing to Singapore. That is a split brain
    that silently scatters new rows across two databases, and it is far more
    expensive to unpick than a few minutes of downtime. The same applies to
    the key pair.

13. **you** — Redeploy on Vercel. The env vars are inlined at build time, so a
    redeploy is mandatory; changing them alone does nothing.
14. Have the one password-only student reset their password.
15. Everyone else: sign out and sign in again with Google. Existing sessions do
    not carry across — JWTs are signed with the old project's secret.

### Phase 3 — after it is proven

16. Watch it for a day or two. **Do not delete the old project** — it is the
    rollback.
17. Then: remove the old callback URI from Google Cloud Console, and pause or
    delete the old project.

## Rollback

Because nothing is destructive until step 17, rollback is: put the old values
back in Vercel and redeploy. The old project keeps running untouched
throughout, old sessions and all. Keep the old Google redirect URI registered
until you are past step 16 — pulling it early is what would make rollback
painful.

## Verification

Run against **both** projects and diff the output.

```sql
-- 1. Row counts per table
select relname, n_live_tup
from pg_stat_user_tables
where schemaname = 'public' and n_live_tup > 0
order by relname;

-- 2. Auth inventory: totals must match, and the UUIDs must be the SAME UUIDs
select count(*) as users,
       count(*) filter (where encrypted_password is not null
                          and encrypted_password <> '') as with_password,
       count(*) filter (where email_confirmed_at is not null) as confirmed
from auth.users;

select provider, count(*) from auth.identities group by provider order by 1;

-- 3. Orphan check — the failure mode that matters. Must return zero rows.
select 'profiles' as t, count(*) from public.profiles p
  where not exists (select 1 from auth.users u where u.id = p.id)
union all select 'study_sessions', count(*) from public.study_sessions s
  where not exists (select 1 from auth.users u where u.id = s.user_id)
union all select 'quiz_attempts', count(*) from public.quiz_attempts q
  where not exists (select 1 from auth.users u where u.id = q.user_id)
union all select 'xp_logs', count(*) from public.xp_logs x
  where not exists (select 1 from auth.users u where u.id = x.user_id);

-- 4. Migration history landed
select count(*) from supabase_migrations.schema_migrations;

-- 5. Realtime is on. Must return all four rows on the new project.
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
```

Then, in the app itself: log in with Google, confirm the dashboard shows the
right streak and XP, open a mock test, and submit a complaint — that last one
exercises RLS, storage and the admin queue in one go.

## The CLI route, for reference

The official path is `supabase db dump` + `psql`, documented under
[Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
It needs the Supabase CLI, **Docker Desktop** and `psql` installed locally.

For this project it is the harder option: the schema is fully described by the
27 migration files in this folder, the content is re-seeded by those same
migrations, and only ~410 rows of user data actually need copying. Replaying
migrations also leaves the new project with a clean, correct migration history
instead of a flattened `pg_dump` schema — worth having.

## Serverless function region (`bom1`)

The database is only half of the distance problem. Vercel defaults new projects
to `iad1` (Washington DC), and this project was left there — so every call to
`/api/*` crossed the Atlantic and then some, twice.

`vercel.json` now pins `"regions": ["bom1"]` (Mumbai) at the project level.

The reason it is a blanket setting rather than a per-function one is
`api/_verifyToken.js`: **every** authenticated endpoint calls
`supabase.auth.getUser(token)` before doing anything else, so every one of them
pays a Supabase round trip on its critical path regardless of what else it
talks to.

| function | also talks to | why `bom1` |
|---|---|---|
| `grade`, `public-grade`, `admin-delete-user`, `send-weekly-emails` | Supabase only | co-located with the database |
| `ndli.js` | `ndl.iitkgp.ac.in`, openlibrary.org | NDLI is hosted at IIT Kharagpur, in India |
| `youtube-transcript.ts` | supadata.ai, googleapis.com | both are globally fronted |
| `groq.ts` | `api.groq.com` (US) | see below |

`groq.ts` is the one that looks like it should stay in the US, since Groq is
there. It should not. From `iad1` it pays the DC↔Singapore auth hop *plus* the
user's Hyderabad↔DC hop; from `bom1` the auth hop is local and the only long
leg is Mumbai→Groq, paid once. Measure before reverting this — but the auth
call is what decides it, not the Groq call.

Note the two are independent: `bom1` is already better than `iad1` while the
database is still in Singapore (Mumbai↔Singapore is far shorter than
DC↔Singapore). It gets better again once the cutover above is done.

Vercel's Hobby plan allows a single chosen region; more than one needs Pro. If
a deploy ever reports a region other than `bom1`, check that first — confirm
with `regions` on the deployment, not from the dashboard's default.

## Drift: the old project is live until the moment you cut over

Phase 1 copied the data. The Singapore project has been serving users ever
since, so anything written after the copy exists **only** in Singapore. Phase 2
is therefore not "flip the env vars" — it is "re-sync, then flip", and the
re-sync has to be the last thing before the flip.

Checked and re-synced 2026-09-17 09:0x UTC:

| check | Singapore | Mumbai | action |
|---|---|---|---|
| all 27 populated tables | — | — | 26 matched exactly |
| `study_sessions` | 136 | 135 | one row copied, `md5 cf34afee39a8c1b81c1c1d5fa3b68e02` verified |
| `auth.users` / `auth.identities` | 15 / 16 | 15 / 16 | no new signups |
| `supabase_realtime` members | `complaint_history, complaints, notifications, saved_notes` | identical | none |
| security advisors | 3 WARN | same 3 WARN | none — pre-existing, not migration artifacts |

The row-count comparison that found it, run against both projects:

```sql
select table_name,
       (xpath('/row/cnt/text()', xml_count))[1]::text::bigint as n
from (
  select table_name,
         query_to_xml(format('select count(*) as cnt from public.%I', table_name),
                      false, true, '') as xml_count
  from information_schema.tables
  where table_schema='public' and table_type='BASE TABLE'
) t
where (xpath('/row/cnt/text()', xml_count))[1]::text::bigint > 0
order by table_name;
```

Re-run it immediately before step 12 and copy whatever has appeared since.
`study_sessions`, `xp_logs`, `quiz_attempts`, `study_plans` and `notifications`
are the tables that move on ordinary use. `study_sessions` has no triggers, so
a plain insert is safe; check `pg_trigger` before hand-inserting into any table
that does, or the insert will double-count XP.

The window only closes when the new project is the one being written to, so do
steps 12 and 13 back to back and keep usage off the app in between.

## Known values for the target project

- ref: `khxxokwbeeedekzpqxpl` · region `ap-south-1` · Postgres 17.6.1.166
- `VITE_SUPABASE_URL`: `https://khxxokwbeeedekzpqxpl.supabase.co`
- `VITE_SUPABASE_ANON_KEY` (publishable, ships in the bundle by design —
  the legacy `anon` JWT and the new-style key both work):
  `sb_publishable_pmRYL6fcCCzZyA6nbG_E5g_EEs6bBL_`
- The service-role / secret key is deliberately **not** recorded here. Copy it
  from the dashboard at cutover time.

## Cutover log — 2026-09-17

Recorded because the failure mode here cost several rounds and is easy to
repeat.

**The env vars and the redeploy both went to the wrong Vercel project.** The
account has 15 projects, several with adjacent names (`study-buddy-ai`,
`truefit3d`, `true-fit-3d`). Everything looked like it had worked: the vars
saved, the redeploy ran, the app kept serving. Nothing errored.

Three reads showed it had not:

| signal | reading |
|---|---|
| `study-buddy-ai` latest production deployment | unchanged at 09:05:07, built from the previous commit |
| Mumbai `auth.sessions` | 0 — the project had never seen a login |
| Singapore `auth.sessions` after a fresh private-window sign-in | 34 → 35 at 09:15:05 |

That third row is the one that settles it, and it is the check worth keeping:
**sign in, then look for the new session row.** A session appearing in the old
project proves the client is still pointed there, whatever the dashboard says.
Row counts alone cannot show this — they were identical throughout.

Note `auth.sessions` never migrates. JWTs are signed per-project, so sessions
cannot carry across and everyone re-authenticates at cutover regardless. That
makes the session table a clean, zero-consequence probe for which project the
app is actually talking to.

Verify against the project id (`prj_JEMsVsnW0xRNabpVjL6NXjEMy6jv`), not the
project name.

Drift at the moment of the flip: all 27 populated tables identical on both
projects, `study_sessions` 136/136.

### If env vars were saved to the wrong project, remove them there

A stray `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` left on an
unrelated project is a real exposure, not just clutter: the service-role key
bypasses RLS entirely, so that project's functions could read or write every
row of this one's data. Delete those five variables from whichever project
received them by mistake.

## The region cannot be changed in place — why there are two projects

Asked and worth answering in the repo, because two projects side by side in the
dashboard looks like a mistake.

Supabase's own troubleshooting page,
[Change Project Region](https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z):

> Each Supabase project is provisioned on hardware in the chosen region, so it
> is **bound to a region at the infrastructure level**. Therefore, the process
> to change the region of a Supabase Project is to create a new project in the
> desired region and migrate your existing project.

And [Project Transfers](https://supabase.com/docs/guides/platform/project-transfer)
closes the other door:

> project transfers … **cannot be used to transfer between different regions**.

There is no region setting. The second project *is* the migration — which is
also why the Management API takes `region` only at create time and offers
nothing to alter it later. The same page confirms the rest of Phase 2
independently: third-party auth client id/secret pairs must be copied by hand,
and the API URL and keys are changed via env vars on the web host.

## The Vercel↔Supabase integration owns the env vars

This is what actually blocked the cutover, after the wrong-project mix-up was
sorted out. **Setting `SUPABASE_URL` or the secret key by hand does not work
while the integration is connected** — the integration manages those variables
and puts its own values back. `api/_verifyToken.js` already hinted at it:

> The Vercel↔Supabase Marketplace integration injects `SUPABASE_SECRET_KEY`,
> while a hand-configured project typically uses `SUPABASE_SERVICE_ROLE_KEY`.

Order matters, and it is not the obvious one:

1. Supabase → **old** project → Settings → Integrations → Vercel → disconnect
   the Vercel project. This removes the managed variables.
2. Supabase → **new** project → Settings → Integrations → Vercel → connect the
   same Vercel project. It writes `SUPABASE_URL` and the secret key itself,
   pointing at the new project, and keeps doing so through key rotation.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` **by hand** — the
   integration never creates those, they are this app's own names.
4. Rebuild.

Do not connect the new project before disconnecting the old one; two Supabase
projects cannot both manage one Vercel project's variables.

### Verifying it without signing in

`VITE_SUPABASE_URL` is inlined into the `App-*.js` chunk at build time, and
Vite names chunks by content hash. So a build whose only source change is a
`.md` file **must** produce the same `App-*.js` hash unless an env var moved.

That is how the failed attempt was caught: two consecutive docs-only commits
both produced `App-DwUzG00u.js`, proving the Supabase URL had not changed —
without needing a login, and without fighting Vercel Authentication on the
asset URLs. The hash is in the deployment's build log.

## Target project readiness, verified 2026-09-17

| check | Singapore | Mumbai |
|---|---|---|
| indexes (name + definition, md5) | 114 · `b39be651db14f5ed5c701ab936b5d0da` | **identical** |
| `multiple_permissive_policies` | 527 WARN | 527 WARN — pre-existing design |
| `unused_index` | 51 INFO | 59 INFO — higher only because it has served no queries |
| security advisors | 3 WARN | same 3 WARN |

No missing indexes and no unindexed foreign keys on the target, so the cutover
cannot make queries plan worse.
