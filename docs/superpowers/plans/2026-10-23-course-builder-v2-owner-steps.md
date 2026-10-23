# Course Builder v2: your steps

## 1. What changes for staff
- Every lesson now has one screen: video, written text, notes link and quiz all together.
- A lesson can have a second video.
- Each session (module) of a full course has a Notes area for links and PDFs.
- You can paste many quiz questions at once instead of typing one by one.
- The course outline shows coloured dots per lesson and a header that says "Ready" when everything is filled in. You can also copy a whole course or a single session.

## 2. Before you deploy: run the database update
1. Open Supabase, project whqdasotjlhvrjmgiffk, then SQL Editor.
2. Open the file `supabase/migrations/0085_course_builder_v2.sql`, copy all of it, paste it, and press Run.
3. It needs the earlier update 0075, which is already done. It is safe to run twice.
   If the site is deployed before you run this, the staff builder will look empty. Nothing is lost. Run the update, then refresh. Do not re-add sessions.
4. Side effect to expect: the 4 Hypertension lessons (and any other text lesson that has a video link) become Video lessons. Their written text is still shown.

## 3. Deploy
Merge the branch `course-builder-v2` and let Vercel deploy it. You decide when.

## 4. Click-through check (after deploy)
1. Use a student account that is enrolled in Hypertension (check Enrollments first); if none is, enroll your own test account on a draft copy first. Open the Hypertension course. Each lesson should show its video and its text. The 9 Diabetes (draft) video lessons will also show their short outline text under the video.
2. Open PPC: still 12 videos, 10 questions per day, and notes.
3. Open MDC: still 4 days and 20 questions.
4. In the admin Course Builder, make a new 2-day test course.
5. Add a video to a lesson, then add a second video.
6. Add a notes link to a session.
7. Use the paste box to add 5 questions at once. Watch the dots turn green and the header say Ready.
8. Press Publish on a course where one session has no quiz. It should warn you before publishing.
9. Copy the test course. Check the copy opens and has the same lessons.
10. Delete both test courses (the original and the copy).

## 5. Things it does not do
- Google Drive videos do not work. Use YouTube or Vimeo links only.
- Copying a course does not copy uploaded PDFs. It tells you how many to upload again.
- Module notes exist only on full courses, not on short ones.
- Pasting many questions only adds questions. It never changes or removes existing ones.
- Copy module on a course that already has students shows the copy to them at once; the app asks you to confirm.
