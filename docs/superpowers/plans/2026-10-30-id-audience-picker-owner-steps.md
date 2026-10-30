# ID and class-email audience picker: owner steps

Paste migration 0092 (Step 1) BEFORE merging this branch. If the code goes live first, the
5-minute timer's query fails. Nothing is sent, but it makes noise in the logs.

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
   audience. If their reminders should keep going, open each class and choose "All live
   students". That is what they get today (live paid students only). Do NOT choose "Everyone
   with an ID" for them: that would also start emailing recorded students.
5. After saving, open Edit on the class again and check the reminder switch is still ON.
   (Editing a class that has no audience switches the reminder OFF, see point 3.) If it is
   OFF, turn it back ON and save.

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

While this test row exists it counts as a real paid live full-course student of Batch 3, so
do the test and the clean-up in one sitting.

Clean up afterwards (SQL editor), in this order. First delete the test person, but only if
no other registration uses them. This must run BEFORE the registration is deleted:

```sql
delete from pz_people p
where p.id in (select person_id from landing_registrations where ref_id='TEST-B3-1')
  and not exists (select 1 from landing_registrations r where r.person_id = p.id and r.ref_id <> 'TEST-B3-1');
```

(To look first, you can run `select person_id from landing_registrations where ref_id='TEST-B3-1';`)
Then delete the test registration:

```sql
delete from landing_registrations where ref_id='TEST-B3-1';
```

Check that the batch is back to 69:

```sql
select count(*) from landing_registrations where page_id='a2456801-cac0-4ac8-b4c0-179db02b013d';
```

## Step 6: two browser checks the code review could not prove

DO NOT SEND anything in this step.

Check A, "Live full course":

1. On the Registrations screen of Batch 3, press the quick filter "Live full course".
2. Press "select everyone in this filter".
3. Press "Email their IDs".
4. Look at the count and the "Getting this email" list. They must hold only live full-course
   students (40 expected). There must be no live Module 1, no live Module 4 and no recorded
   students.

Check B, "Live + Module 1":

1. Close the box. Clear the selection. Press the quick filter "Live + Module 1" and enter 1.
2. Press "select everyone in this filter", then press "Email their IDs". Do NOT send.
3. The "Getting this email" list must show exactly 50 for Batch 3 (40 live full course plus
   10 live Module 1). It must contain no Module 4 student and no recorded student.
4. With that quick filter still on, type a name in the search box. The list must get smaller
   (or stay the same), show no error, and never grow.

If either check shows a wrong count or an error, do NOT press Send. Close the box and tell
Claude.

## Step 7: phone-width check

Make the browser window narrow (about phone width, 390px) and look at the new parts:

- The class card "who gets this" box.
- The quick buttons on the Registrations screen.
- The two lists (getting the email / not getting it).

Everything must be readable, with no sideways scrolling and nothing cut off.
