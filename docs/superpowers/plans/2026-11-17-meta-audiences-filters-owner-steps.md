# Audience filters: what you do

## 1. Paste the update (one time)

1. Open Supabase, then SQL Editor, then a new query.
2. Open the file `supabase/migrations/0116_audience_filters.sql`.
3. Copy the whole file, paste it in, press Run.
4. It is safe to run twice. If it says "Success", you are done.

## What changes for you

- The CRM now remembers, for each registration, whether the person chose
  Live or Recorded, which options they picked, and their region.
- Interested people also keep the time they registered.
- A new list is added for saved audiences.
- Nothing you can see changes yet, and no one is emailed.

## 2. Check it worked

Run this in the SQL Editor. It should show the number 7.

```sql
select count(*) from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'contact_purchases'
      and column_name in ('reg_mode', 'option_keys', 'region'))
    or
    (table_name = 'import_batch_contacts'
      and column_name in ('reg_mode', 'option_keys', 'region', 'registered_at'))
  );
```

Plus one more for the saved audiences list. It should show 1.

```sql
select count(*) from information_schema.tables
where table_schema = 'public' and table_name = 'crm_saved_audiences';
```

## Until you paste it

The Audiences page will say "needs one update first". Old downloads keep
working.

## Older people

People who registered before this update have no Live or Recorded answer
saved. Bringing a landing page into the CRM again fills it in for them.
