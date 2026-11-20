# Portal access: your steps

Do these in order. Stop after any step if something looks odd, and tell me what you see.

## Step 1: Paste the database change

1. Open the file `supabase/migrations/0119_portal_access.sql` in the project folder.
2. Select everything in it and copy it.
3. Open Supabase, then SQL Editor, then a new query. Paste it in.
4. Press Run.
5. It should say it finished with no error. It is safe to run twice, so if you are not sure it worked, run it again.

Nothing is sent to anyone, and no student is touched by this step.

## Step 2: Put the PPC course in a "PPC" group

The group is set on the Portal access screen, so we start from a PPC batch.

1. Open Registrations, then the Batch 3 campaign (or any PPC batch that already has its course).
2. Press "Portal access".
3. In the card "This batch's portal", find "Or a new group name". Type `PPC`.
4. Press "Save group and batch". You should see "Saved."
5. The "PPC" chip now shows under the course name.
6. Open Programs. The PPC course now sits under a "PPC" heading.

## Step 3: Make the Batch 3 portal

1. On the Batch 3 campaign, press "Portal access".
2. In the card "Change or copy portal", press "Duplicate a portal".
3. In the window that opens:
   - "Portal to copy": choose the current PPC course.
   - "Name of the new portal": type `PPC batch 3 portal`.
   - "Group": choose PPC.
   - "Batch label": type `Batch 3`.
4. Press "Copy portal".

This makes a new portal with the same modules, lectures, MCQs and module notes. It starts as Not published. No students are copied and no emails are sent.

This batch now uses the new portal straight away. New sign-ups join it.

If a red message says "This batch is the website's main page for its course. Untick Main page first.", the batch is ticked as the main page for its course. Untick Main page on the batch first, then try again. Nothing was changed.

To switch a batch to a portal that already exists, use the list in the same card ("Portals in the ... group", or "Other portals" when this portal has no group), pick the portal, then press "Use this portal".

## Step 4: Change what differs in the new portal

1. On the Portal access screen, press "Open in Course Builder".
2. Change the YouTube links, MCQs and PDF links that are different for Batch 3.
3. When you are happy, publish it. Students cannot open the portal until it is published. "Move students" stays off until the portal is published.
A portal with a batch label (for example Batch 3) is never shown in the website lists. Its students open it through their portal link. The main course (for example the recorded PPC course) stays on the website as before.

Students are not moved yet. Do Steps 4, 5 and 6 on the same day, and do not open modules or change Paid status until you have moved students. While students are waiting to move, the "Open modules and emails" area on the Portal access screen is replaced by a note that says "Move students first, then open modules here."

People whose paid registration has no recorded choice are held. They need matching first, so match them before you move or open anything. The steps are in `2026-11-19-purchase-choices-owner-steps.md`.

## Step 5: Read the three numbers

1. Go back to Portal access for the Batch 3 campaign.
2. In the card "Move students", read:
   - "N students will move".
   - "N already in this portal".
   - "N modules could not be matched" (this line only shows if there are some).
3. If "modules could not be matched" shows a number, the old portal has more modules than the new one. Check that the new portal has the same modules in the same order as the old one. If any student chose modules the new portal does not have, a red message says "Some students chose modules the new portal does not have. Make the modules match first." and nobody is moved until the modules match.
4. Do not delete the old portal or its modules after a move.

## Step 6: Move the students

1. Press "Move students". A window asks "Move N students?".
2. Read it, then press "Move students" again to confirm. Press Cancel to stop.

What to expect:

- No emails are sent.
- Progress in the old portal does not carry over. Students start fresh in the new portal.
- Students start fresh in the new portal; they may see a "lesson unlocked" notice in the app. No email is sent.
- This batch now points to the new portal.
- The page then says "Moved N students."

## Step 7 (optional): Check the numbers yourself

These only read. They change nothing. Paste each one in the Supabase SQL Editor and press Run. Replace `PAGE-ID-HERE` with the Batch 3 page id (it is the long code in the campaign page address).

Students per course for this batch:

```sql
select c.title, count(*) as students
from public.enrollments e
join public.landing_registrations r on r.id = e.landing_registration_id
join public.courses c on c.id = e.course_id
where r.page_id = 'PAGE-ID-HERE'
group by c.title
order by students desc;
```

Which group and batch each portal is in:

```sql
select c.title, f.name as group_name, c.batch_label
from public.courses c
left join public.course_families f on f.id = c.family_id
order by f.name nulls last, c.title;
```

After a move, the first one should show most students under the new portal.

Paid registrations with no linked enrollment. They are never moved, and a later sheet sync would give them a second enrollment in the copy. This should be 0:

```sql
select count(*) from public.landing_registrations r
where r.page_id = 'PAGE-ID-HERE' and r.status = 'paid'
  and not exists (select 1 from public.enrollments e where e.landing_registration_id = r.id);
```

## If something looks wrong

- Pressing Move a second time: it simply shows 0 students to move and the Move button stays off. Nothing is changed.
- The "Move students" button is greyed out: there is nobody to move (the first number is 0).
- A student in two batches: only the students of the batch you are on are moved. The other batch is not touched.
- The numbers do not look right: do not press Move. Tell me what the three numbers say.
- Marks left on old modules: when nobody is movable (for example the page was pointed at a copy by "Duplicate a portal" and everybody had already moved), the batch's "module finished" marks stay on the old portal's modules. Tell me and I will check them.
- A red message "The database change has not been pasted yet." means Step 1 was not done. Do Step 1, then reload the page.
- A red message appears: copy the words and send them to me.
