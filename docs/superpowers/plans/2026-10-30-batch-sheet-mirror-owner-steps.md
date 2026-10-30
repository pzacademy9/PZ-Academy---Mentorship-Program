# Batch sheet mirror: owner steps

Order: do (a), deploy the branch, then (c) and (d).

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

## (d) Schedule the mirror (after deploy)

```sql
select cron.schedule('sheet-mirror','*/15 * * * *', $$ select net.http_get(url := 'https://pz-academy.pharmacozyme.com/api/cron/sheet-mirror', timeout_milliseconds := 60000, headers := jsonb_build_object('Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='session_cron_secret'))); $$);
```

Check it is scheduled:

```sql
select jobname, schedule from cron.job;
```
