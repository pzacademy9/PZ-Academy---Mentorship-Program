# Website real details: owner steps

Branch `website-real-details`. One database step, then merge.

## 1. Paste the database change (before you merge)

Supabase, SQL editor, new query, paste this, Run:

```sql
alter table public.courses
  add column if not exists topic text,
  add column if not exists starts_at timestamptz;
```

It only adds two empty boxes to the courses table: the topic and the webinar date.
Nothing that is there now changes. Running it twice is safe.
(Same as `supabase/migrations/0102_course_topic_and_date.sql`.)

If you merge first: the site keeps working, but topic buttons and webinar dates do not
show, and saving a topic or webinar date shows "Could not save changes" until the SQL is pasted.

## 2. Try it on the Vercel preview

Seats, Early Bird and start time come from the batch registration page. They need no setup.

1. Open a course that has a live batch open.
   - The strip at the top shows the start date and time.
   - "N seats left" shows only when the batch has a seat limit and 20 or fewer seats remain.
   - While Early Bird runs, it shows the Early Bird price with the normal price crossed out
     and "until <date>". The main price box and the Enroll button stay the same.
   - Try both "Add to calendar" buttons: Google Calendar, and Phone or Outlook (a file).
2. Open the Courses list. That course's card shows "Early Bird" and seats left the same way.
3. Admin, Courses, open two courses. In the Public Page card, type a Topic (same spelling for
   both) and Save. On the Courses list, click the topic button. Only those courses show.
4. Admin, open a webinar. Set "Webinar date and time" (Pakistan time) and Save.
   - The webinar page shows the date and Add to calendar.
   - 3 hours after that time, the webinar moves to Recorded on the Webinars list by itself.
5. Copy a course (Admin, Courses, Copy). The copy keeps page sections, certificate picture,
   topic and webinar date.
