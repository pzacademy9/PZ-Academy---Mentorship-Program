# Course page admin: owner steps

Branch `course-page-admin`. One database step, then merge.

## 1. Paste the database change (before you merge)

Supabase, SQL editor, new query, paste this, Run:

```sql
alter table public.courses
  add column if not exists page_sections jsonb not null default '[]'::jsonb,
  add column if not exists certificate_image_url text;
```

It only adds two empty boxes to the courses table. Nothing that is there now changes.
Running it twice is safe. (Same as `supabase/migrations/0101_course_page_sections.sql`.)

If you merge first: the site keeps working and course pages look as they do now, but
saving a change to the new "Public Page" card shows "Could not save changes" until
the SQL is pasted.

## 2. Try it on the Vercel preview

1. Admin, Courses, open a course. Scroll to the new **Public Page** card.
2. Paste a YouTube link in "Preview video link".
3. Upload a certificate picture.
4. Add two lines to "What you'll learn" and one question.
5. In "Page sections", move "Questions and answers" to the top, untick "Meet your teacher",
   and type your own heading for one section.
6. Save Changes, then click View Public Page. Check the order, the hidden section,
   your heading, the video and your certificate picture.
7. Open the same page on your phone. Check that long titles and names wrap neatly.
8. Put the sections back the way you want them and save.
