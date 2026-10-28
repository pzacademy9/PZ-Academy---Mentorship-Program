# Batch classes: owner steps

## Step 1: paste migration 0091

Open the Supabase SQL editor, paste the full contents of
`supabase/migrations/0091_batch_classes.sql`, and run it. It only adds columns and
widens one check, so it is safe to run more than once.

## Check (read-only)

Existing sessions must all count as custom, so changing a batch default never touches them.
Run this in the SQL editor:

```sql
select
  (select count(*) from batch_sessions where custom_time and custom_zoom) as custom_rows,
  (select count(*) from batch_sessions) as all_rows;
```

The two numbers must be equal.
