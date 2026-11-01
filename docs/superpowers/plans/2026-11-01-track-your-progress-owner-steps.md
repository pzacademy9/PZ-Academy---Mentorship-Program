# Track Your Progress: owner steps

Do this once, before the "Track Your Progress" page goes live.

## (a) Paste the migration

1. Open the Supabase SQL editor.
2. Open the file `supabase/migrations/0094_progress_lookup.sql`, copy everything in it, paste it into the editor and press Run.
3. It is safe to run twice. It changes no existing data.

What it does, in plain words:
- Adds a small notebook that remembers recent public lookups, so one person cannot search again and again without limit (about 30 lookups per 10 minutes).
- Adds the "find my ID by name" search as one safe function. It returns at most 6 rows (the page shows 5 and uses the 6th to say more people match), with first name, PZ ID and batch title only.

The complete SQL to paste is:

```sql
create table if not exists public.public_lookup_hits (
  id bigserial primary key,
  key text not null,
  hit_at timestamptz not null default now()
);

create index if not exists public_lookup_hits_key_hit_at_idx
  on public.public_lookup_hits (key, hit_at);

alter table public.public_lookup_hits enable row level security;

create or replace function public.public_lookup_allow(p_key text, p_limit int, p_window_secs int)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  -- one call per key at a time, so two simultaneous requests cannot both slip under the limit
  perform pg_advisory_xact_lock(hashtext(p_key));

  delete from public.public_lookup_hits
   where key = p_key
     and hit_at < now() - make_interval(secs => p_window_secs);

  select count(*) into v_count
    from public.public_lookup_hits
   where key = p_key;

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.public_lookup_hits (key) values (p_key);
  return true;
end;
$$;

revoke all on function public.public_lookup_allow(text, int, int) from public;
revoke all on function public.public_lookup_allow(text, int, int) from anon;
revoke all on function public.public_lookup_allow(text, int, int) from authenticated;
grant execute on function public.public_lookup_allow(text, int, int) to service_role;

create or replace function public.find_enrolled_ids_by_name(p_query text)
returns table (first_name text, pz_id text, batch_title text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select substring(btrim(p.display_name) from '^\S+') as first_name,
         p.pz_id::text,
         lp.title::text as batch_title
    from public.pz_people p
    join public.landing_registrations r on r.person_id = p.id
    join public.landing_pages lp on lp.id = r.page_id
   where r.status in ('paid', 'free')
     and r.is_test = false
     and lp.status in ('published', 'closed')
     and p.display_name ilike
         '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
   group by p.display_name, p.pz_id, lp.title
   order by p.display_name, p.pz_id, lp.title
   limit 6;
$$;

revoke all on function public.find_enrolled_ids_by_name(text) from public;
revoke all on function public.find_enrolled_ids_by_name(text) from anon;
revoke all on function public.find_enrolled_ids_by_name(text) from authenticated;
grant execute on function public.find_enrolled_ids_by_name(text) to service_role;
```

## (b) Check it worked

Paste this and run it:

```sql
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'public_lookup_hits') as notebook_table,
  (select count(*) from pg_proc
    where proname = 'public_lookup_allow') as limit_function,
  (select count(*) from pg_proc
    where proname = 'find_enrolled_ids_by_name') as name_search_function;
```

Expect one row with `1`, `1` and `1`. If any shows `0`, tell me which one.

Note: migration 0092 must already be pasted before you paste 0094 (0092 is the one that gives people their permanent PZ IDs). If you are not sure, paste 0092 first.

## (c) Two quick smoke checks

Run each one on its own in the SQL editor.

1. Name search must not list everyone. Run:

```sql
select * from public.find_enrolled_ids_by_name('%%%');
```

It should show 0 rows. If it shows rows, stop and tell me.

2. The lookup limit must say yes twice, then no. Run this line three times in a row:

```sql
select public.public_lookup_allow('x', 2, 60);
```

You should see true, then true, then false. (If you wait more than a minute between runs the count starts again, so run the three quickly.) Then clean up the test rows:

```sql
delete from public.public_lookup_hits where key = 'x';
```

## (d) Pages to look at in the browser

1. `/progress` (the home page): lists the batches. The "Find my ID" box is on this page. Search a name and check it shows first name, PZ ID and batch only, with a Copy button.
2. `/progress/<slug>` (a batch page, for example one batch from the list): shows that batch's attendance and results lists.
3. `/dashboard/progress`: log in as a student with a confirmed email and check your own progress shows.

Note: the old "enter your PZ ID and press Show my progress" check no longer exists. The public pages no longer show one person's record from a typed ID. The "Find my ID" check and the rate-limit check (the "yes twice, then no" step in (c)) stay.
