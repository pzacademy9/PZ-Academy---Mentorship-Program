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
Publishing a batch portal puts it on the website only if it is the newest in its group. The older portal then leaves the website listings by itself, before you move students in Step 6. That is expected. Students of the older batch keep their own portal, and their links keep working. The newest portal stays on the website as the recorded course. Check its price and status in Course Builder.