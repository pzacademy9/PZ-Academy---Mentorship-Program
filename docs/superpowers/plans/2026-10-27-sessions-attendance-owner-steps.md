# Sessions and attendance: your steps

Three short jobs. Do them in this order. Nothing here changes your old attendance tables (`attendance_events` and `attendance_sessions` stay exactly as they are and are not used).

## 1. Add the new tables

1. Open Supabase, then **SQL Editor**, then **New query**.
2. Open the file `supabase/migrations/0089_attendance_sessions.sql`, copy everything in it, and paste it into the query box.
3. Click **Run**. You should see "Success". It is safe to run again if you are unsure.

## 2. Start the 5-minute timer (sends the reminder emails)

The website already has the timer page. This step makes Supabase knock on it every 5 minutes. Your `CRON_SECRET` is already saved in Vercel (your daily job uses it). Use that same value here.

1. In Supabase, open **SQL Editor**, then **New query**.
2. Paste the block below. Replace `PASTE-YOUR-CRON_SECRET-VALUE-HERE` with your real `CRON_SECRET` value (the same one Vercel already has). Keep the quote marks around it.
3. Click **Run**.

```sql
select vault.create_secret('PASTE-YOUR-CRON_SECRET-VALUE-HERE', 'session_cron_secret');

select cron.schedule(
  'session-emails',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://pz-academy.pharmacozyme.com/api/cron/session-emails',
    timeout_milliseconds := 60000,
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'session_cron_secret')
    )
  );
  $$
);
```

Do not share this block after you have pasted your secret into it. Supabase also keeps it in the SQL editor's saved history, so do not share that screen either.

**Check that it ran** (wait about 5 minutes, then run this in a new query):

```sql
select * from cron.job_run_details order by start_time desc limit 5;
```

A row with status `succeeded` means the timer is working. To see what the website answered:

```sql
select status_code, created from net._http_response order by created desc limit 5;
```

`200` is good. `401` means the secret does not match the one in Vercel.

**To stop it:**

```sql
select cron.unschedule('session-emails');
```

If you ever change `CRON_SECRET` in Vercel, stop the timer, then repeat this step with the new value. If the secret name already exists, first run `delete from vault.secrets where name = 'session_cron_secret';`.

## 3. Check the pages work

1. Open `/dashboard/admin/enrollments/registrations`.
2. Pick a batch.
3. Open **Sessions and attendance**.
4. Add a test session, fill in the Zoom link, and look at the attendance grid.

If you see the sessions list and the grid with no error message, it is working.
