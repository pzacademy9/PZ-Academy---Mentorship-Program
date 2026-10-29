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

## Step 2: check it in the browser (after the paste)

Use a test batch only, never a real one.

1. Open a test webinar batch, go to its Classes page, and set up one class. It should save without errors.
2. Make a test workshop with 2 days and set both days up. Open the attendance link and the feedback link for each day in a narrow browser window (about phone width). All four must open and look tidy.
3. Open an OLD feedback link you sent before this change. It must still open as it did.
4. Open the Today panel in the narrow window. Everything must be readable without sideways scrolling.
5. Press "Open combined feedback report" once and read the warning. The report shows student names and comments, so only press OK if you want that link to exist.
6. Pick a cover picture from the library for a class, then open its attendance page. The picture should appear at the top of the page. With no cover chosen, the page should look exactly as before.

Small things to eyeball while you are there:

- The day boxes in the calendar at 390px width: numbers and names should not be squeezed or cut off.
- The cover picker: it should open on the right library folder.
- The feedback email button: it should ask "are you sure" before sending anything.
