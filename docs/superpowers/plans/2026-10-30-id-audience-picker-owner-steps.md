# ID and class-email audience picker: owner steps

## Step 1: paste migration 0092

Open the Supabase SQL editor, paste this one statement, and run it. It only adds one empty
column, so it is safe to run more than once. The full file is
`supabase/migrations/0092_class_audience.sql`.

```sql
alter table public.batch_sessions
  add column if not exists audience jsonb;
```

Then run this check (read-only):

```sql
select count(*) filter (where audience is not null) as with_audience, count(*) as classes from batch_sessions;
```

`with_audience` must be 0. Every class starts with no audience chosen.

## Step 2: read this before you do anything else (behaviour changes)

1. Every class now needs "who gets this email" chosen before it will email anyone.
2. The 5-minute timer skips any class that has no audience chosen. It sends nothing for it.
3. An old class that had email ON and no audience will be switched OFF the first time you
   edit it and save it.
4. This includes the Diabetes Batch 1 classes. They will stop emailing until you choose their
   audience. If their reminders should keep going, open each class and choose "Everyone with
   an ID" (or the right option for that class).

## Step 3: set up PPC Batch 3 (12 classes, all emails are OFF right now)

1. Open the Batch 3 page, then Classes.
2. For each class, find "who gets this" and pick an option.
3. Day 1 is Module 1 content, so pick "Live full course + Module N", where N is the module
   that day teaches. You decide N for each day.
4. Read both lists under the box. For a Module 1 class you should see:
   - Getting the email: 50 (37 live full-course individuals, 3 live group-of-3 people,
     10 live Module 1).
   - Not getting it: 19 (11 recorded full course, 7 recorded Module 1, 1 live Module 4).
5. If the numbers look right, press Save.
6. Only after saving, turn the email ON for that class.

## Step 4: test the ID PDF

1. Open the Registrations screen of the batch.
2. Tick three students and press "Download IDs". The button must say "(3 selected)".
3. Open the PDF. It must hold only those three students.
4. Untick them. Press the quick button "Live full course", then press "Download IDs" again.
5. The button label must say "(filtered)". The PDF must hold only live full-course students
   that have IDs.
6. In the PDF, check that no email address and no phone number appears anywhere.

## Step 5: test "Email their IDs" safely (to yourself only)

1. In the Supabase SQL editor, add a temporary test student that uses your own email:

```sql
insert into landing_registrations (page_id,row_type,name,email,region,currency,option_label,mode,tier_key,status,status_source,ref_id,consent) values ('a2456801-cac0-4ac8-b4c0-179db02b013d','individual','Test Student','pharmacozymeofficial@gmail.com','PK','PKR','Live — Full Course – Individual','live','individual','paid','sheet','TEST-B3-1',true);
```

2. Open the Registrations screen of Batch 3 and refresh. Tick ONLY the "Test Student" row.
3. Press "Email their IDs".
4. Both lists must show (who gets it and who does not). The Send button must stay greyed
   out until you have looked at both lists.
5. Press Send.
6. Open your inbox. The email must show the ID and the greeting.

Clean up afterwards (SQL editor):

```sql
delete from landing_registrations where ref_id='TEST-B3-1';
delete from pz_people where pz_id like 'Test-%';
```

Check that the batch is back to 69:

```sql
select count(*) from landing_registrations where page_id='a2456801-cac0-4ac8-b4c0-179db02b013d';
```

## Step 6: one browser check the code review could not prove

DO NOT SEND anything in this step.

1. On the Registrations screen of Batch 3, press the quick filter "Live full course".
2. Press "select everyone in this filter".
3. Press "Email their IDs".
4. Look at the count and the "Getting this email" list. They must hold only live full-course
   students (40 expected). There must be no live Module 1, no live Module 4 and no recorded
   students.
5. If the count is higher (for example 50, 51 or 69), do NOT press Send. Close the box and
   tell Claude.

## Step 7: phone-width check

Make the browser window narrow (about phone width, 390px) and look at the new parts:

- The class card "who gets this" box.
- The quick buttons on the Registrations screen.
- The two lists (getting the email / not getting it).

Everything must be readable, with no sideways scrolling and nothing cut off.
