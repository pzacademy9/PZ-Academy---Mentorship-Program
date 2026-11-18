# Audiences per course: what you do

## 1. Paste the update (one time)

1. Open Supabase, then SQL Editor, then a new query.
2. Open the file `supabase/migrations/0118_interested_per_page.sql`.
3. Copy the whole file, paste it in, and press Run once (it is one statement).
4. It is safe to run twice. If it says "Success", you are done.

## 2. Bring the pages in again

1. Open Audiences in the admin area.
2. Press "Bring in from landing pages".
3. Tick EVERY landing page in the list (you can tick up to 20 pages each
   time you press it; if you have more, press it again for the rest).
4. Press Bring in and wait until it says it is finished.

## What changes for you

- A person who bought one course but only reserved or registered for
  another course now shows as Reserved or Pending for that other course
  (and still shows as Paid for the course they bought).
- A person who bought the same course never shows as Reserved or Pending
  for it.
- Cohorts, "Interested, not paid" for landing pages: the numbers go up,
  because people who bought a different course are now counted too.
- No one is emailed.

## 3. Check it worked

Run this in the SQL Editor. It only reads, it changes nothing. Run it once
BEFORE step 2 and once AFTER, and compare. The numbers should go up
(or stay the same), never down.

```sql
select b.sheet_name, count(ibc.contact_id) as interested_people
from public.import_batches b
left join public.import_batch_contacts ibc on ibc.import_batch_id = b.id
where b.kind = 'closed_interested'
group by b.sheet_name
order by b.sheet_name;
```

## Until you do these

Nothing breaks. Old pages keep the list they had until you press Bring in
for them.
