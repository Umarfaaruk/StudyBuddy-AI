# Sample content

The question bank currently contains **40 generated sample questions**, loaded to
make Phases 2-4 exercisable before licensed content exists.

They are tagged so they can be removed as a unit:

| field | value |
|---|---|
| `import_batch` | `sample-v1` |
| `source` | `Generated sample content - replace with licensed questions` |
| `is_pyq` | `false` - they are **not** past-year questions |

`is_pyq` is deliberately false on every row. Marking generated questions as
previous-year would fabricate provenance, and that flag is exactly what the
retrieval layer trusts when it tells a student an answer is grounded in a real
paper.

Coverage: Physics 14, Chemistry 13, Mathematics 13, across 34 chapters
(17 easy / 22 medium / 1 hard).

## Removing them

Once real content is imported, delete the sample batch:

```sql
-- question_answers cascades from questions, so this is enough.
delete from public.questions where import_batch = 'sample-v1';
```

Two sample mock tests were also created ("JEE Main - Full Syllabus Practice
Test" and "JEE Main - Physics Only"). They draw from whatever is published, so
they keep working after the sample questions are replaced - delete them only if
you want different scopes:

```sql
delete from public.mock_tests where title like 'JEE Main - %';
```

## Loading your own

Use **Admin -> Question Bank**, which validates the whole file before writing and
imports everything as `draft` for review. Note it writes to two tables:
`questions` and `question_answers` - the answer key is deliberately kept out of
any table a student can read.
