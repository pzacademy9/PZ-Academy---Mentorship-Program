# Audiences by status: what you do

## 1. Paste the update (one time)

1. Open Supabase, then SQL Editor, then a new query.
2. Open the file `supabase/migrations/0117_audience_status.sql`.
3. Copy the whole file, paste it in, and run the whole file in one go (it holds three statements). Press Run once.
4. It is safe to run twice. If it says "Success", you are done.

## 2. Fill in the statuses

1. Open Audiences in the admin area.
2. Press Bring in once more.
3. Wait until it says it is finished.

## What changes for you

- The CRM now remembers whether each interested person is Pending,
  Reserved, Part-paid or Free.
- Recorded or Live for old rows is guessed from the words in their sheet or
  registration text.
- Nothing you can see changes until the new Audiences page is out, and no
  one is emailed.

## 3. Check it worked

Run this in the SQL Editor. It should show the number 1.

```sql
select count(*) from information_schema.columns
where table_schema = 'public'
  and table_name = 'import_batch_contacts'
  and column_name = 'reg_status';
```

## Until you do these

Interested people are counted as Pending. Old downloads keep working.
