# Batch sheet mirror: owner steps

Order: do (a), deploy the branch, then (c), the safety check (d), and only then the schedule (e).

## (a) Paste the migration

Paste `supabase/migrations/0093_batch_sheet_mirror.sql` into the Supabase SQL editor and run it. It is safe to run twice.

## (b) Check it worked

```sql
select column_name from information_schema.columns
where table_name = 'landing_pages' and column_name like 'mirror_%';
```

Expect 4 rows.

## (c) Point the batch at its sheet (after deploy)

```sql
update landing_pages set mirror_sheet_id='1OEl4BIi53bsecA562n7fci659r6I6umBj2cG-t4Bcto' where slug='ppc-batch-3';
```

## (d) Safety check before the schedule (do not skip)

1. Open the batch's "Sheet sync" screen in the admin area.
2. Press "Preview (changes nothing)". It only counts; it saves nothing and sends nothing.
3. Expect about 72 rows matched to existing sign-ups ("match 72 existing") and roughly 19 new ones ("Would add 19"). The rest should show up as problems or notes you can read in the list.
4. Stop here and tell me the numbers before going on.
5. Then press "Sync now" ONCE and read the result shown on the screen. It sends no emails.
6. Only after that looks right, do step (e).

## (e) Schedule the mirror (only after the safety check passes)

```sql
select cron.schedule('sheet-mirror','*/15 * * * *', $$ select net.http_get(url := 'https://pz-academy.pharmacozyme.com/api/cron/sheet-mirror', timeout_milliseconds := 60000, headers := jsonb_build_object('Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='session_cron_secret'))); $$);
```

Check it is scheduled:

```sql
select jobname, schedule from cron.job;
```

## Switching it off or pausing it

Off switch (stops the schedule completely):

```sql
select cron.unschedule('sheet-mirror');
```

Pause for one batch only (the schedule keeps running but skips this batch):

```sql
update landing_pages set mirror_sheet_id = null where slug='ppc-batch-3';
```

To change the schedule, run the `cron.schedule` statement again with the same name `sheet-mirror`. It replaces the old job, so you never end up with two.

## Known limit

If someone edits the email or the "Submitted At" time of a sign-up that is still Pending in the old sheet, the mirror cannot tell it is the same person. It flags that row as a problem ("fix it in the app") instead of adding a copy. Change such details in the app, not in the sheet.
