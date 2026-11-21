# Check-in window and "Reminder set": owner steps

You can change how long check-in stays open for each batch and for each class. The class page
also now tells you when a reminder is set to go out.

## Step 1: paste migration 0120

Open the Supabase SQL editor for project whqdasotjlhvrjmgiffk, paste all of this, and run it.
It only adds new columns, so it is safe to run more than once. The full file is
`supabase/migrations/0120_checkin_window.sql`.

```sql
-- 0120: editable check-in window. Page default (minutes before/after class start/end)
-- plus optional per-class override (null = use the page default).

alter table public.landing_pages
  add column if not exists checkin_open_minutes int not null default 15
    constraint landing_pages_checkin_open_minutes_check check (checkin_open_minutes between 0 and 180),
  add column if not exists checkin_close_minutes int not null default 15
    constraint landing_pages_checkin_close_minutes_check check (checkin_close_minutes between 0 and 180);

alter table public.batch_sessions
  add column if not exists checkin_open_minutes int null
    constraint batch_sessions_checkin_open_minutes_check check (checkin_open_minutes is null or checkin_open_minutes between 0 and 180),
  add column if not exists checkin_close_minutes int null
    constraint batch_sessions_checkin_close_minutes_check check (checkin_close_minutes is null or checkin_close_minutes between 0 and 180);
```

## Step 2: what to look at afterwards

1. Setup page of a batch (Registrations, the batch, Classes, Setup). In the defaults box you
   should see "Check-in opens (minutes before)" and "Check-in closes (minutes after)". Both
   start at 15. Change one if you want, press Save, and reload to see it stay.
2. Edit a class. Find the "Check-in window" group. "Same as the batch" is the normal choice.
   Pick "Set for this class" to type minutes for just that class.
3. The Attendance tab of a class. The note near the top should show the real number of
   minutes, not always 15.
4. The public check-in page of a class (the link students use). Its text should show the same
   number of minutes.
5. The Links and emails tab of a class. If a reminder is set, you should see "Reminder set.
   Goes out" and the time. Open "Who got the emails": before anything is sent it should say
   "Reminder set for" and the time, then "Nothing sent yet."

## Step 3: until you paste the SQL

Nothing breaks. The app keeps working with 15 minutes before and 15 minutes after for every
class. You only need the SQL first if you want to change the minutes to something other than
15. Paste it, then change the minutes.
