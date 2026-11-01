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

## (e) Migration 0095: show or hide a batch on the portal

**Paste 0095 BEFORE the new code goes live. 0094 must already be live.** The new code reads a column that 0095 adds, so if the new code is live before you paste 0095, the admin landing-pages list and editor AND the portal pages (/progress and each batch page) all fail.

1. Open the Supabase SQL editor.
2. Open `supabase/migrations/0095_portal_visibility.sql`, copy everything in it, paste it and press Run.
3. It is safe to run twice. It changes no existing data (every batch starts as "shown").

What it does, in plain words:
- Adds a "Show on public progress portal" switch to every batch (starts ON). Turning it off hides the batch from /progress, from its own page, from "Find my ID" and from My Progress.
- A batch that is still a draft but already has paid or free students (for example PPC Batch 3) now shows on the portal. Empty drafts stay hidden.
- Updates the "find my ID" search to follow the same rule. It still returns at most 6 rows of first name, PZ ID and batch title only.

The complete SQL to paste is:

```sql
alter table public.landing_pages
  add column if not exists show_in_portal boolean not null default true;

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
     and lp.show_in_portal = true
     and lp.kind in ('course', 'workshop', 'webinar')
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

Check it worked. Paste this and run it:

```sql
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'landing_pages' and column_name = 'show_in_portal') as show_in_portal_column,
  (select count(*) from pg_proc where proname = 'find_enrolled_ids_by_name') as name_search_function,
  (select prosrc like '%show_in_portal%' from pg_proc where proname = 'find_enrolled_ids_by_name') as new_version;
```

Expect one row with `1`, `1` and `true`. `new_version` must be `true`: if it shows `false` or empty, the old search function is still in place. If anything else shows, tell me which column.

## (f) Migration 0096: draft batches stay private until you switch them on

**Safe order: 0095 must already be live. First deploy the new code (push, then wait for the deploy to finish). Then paste 0096 straight away.**

What happens if the order is different:
- New code live BEFORE 0096 is pasted: nothing breaks. Drafts that already have students (PPC Batch 3) are still shown. Any other draft with students would also be public until 0096 is pasted.
- 0096 pasted while the PREVIOUS portal code (the 0095-era one, which still requires the switch to be on) is still the live deploy: every published batch except PPC Batch 3 disappears from /progress and from Find my ID until the new code deploys.

1. Open the Supabase SQL editor.
2. Open `supabase/migrations/0096_portal_draft_private.sql`, copy everything in it, paste it and press Run.
3. It is safe to paste again later. The one-time data step only runs the first time, so a switch an admin made afterwards is never undone.

What it does, in plain words:
- The "Show on public progress portal" switch now has three states: automatic (new batches start here: shown only once the batch is published or closed), switched on, and switched off.
- Every batch that 0095 had set to "on" goes back to automatic, so a draft batch is private until an admin switches it on.
- PPC Batch 3 stays visible because 0096 switches it on.
- The "find my ID" search follows the same rule. It still returns at most 6 rows of first name, PZ ID and batch title only.

The complete SQL to paste is:

```sql
-- The one-time data step runs ONLY while the column is still NOT NULL (i.e. 0096 has not run before),
-- so pasting this file again never undoes a switch an admin made later.
do $$
begin
  if (select is_nullable
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'landing_pages'
         and column_name = 'show_in_portal') = 'NO' then
    update public.landing_pages
       set show_in_portal = null
     where show_in_portal is true
       and slug <> 'ppc-batch-3';

    update public.landing_pages
       set show_in_portal = true
     where slug = 'ppc-batch-3'
       and show_in_portal is distinct from true;
  end if;
end
$$;

alter table public.landing_pages alter column show_in_portal drop not null;
alter table public.landing_pages alter column show_in_portal drop default;

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
     and coalesce(lp.show_in_portal, lp.status in ('published', 'closed'))
     and lp.kind in ('course', 'workshop', 'webinar')
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

Check it worked. Paste this and run it:

```sql
select
  (select count(*) from public.landing_pages where status = 'draft' and show_in_portal is true) as drafts_switched_on,
  (select count(*) from public.landing_pages where status = 'published' and show_in_portal is null) as published_automatic,
  (select prosrc like '%coalesce(lp.show_in_portal%' from pg_proc where proname = 'find_enrolled_ids_by_name') as new_version;
```

Expect `drafts_switched_on` = `1` (PPC Batch 3), `published_automatic` = the number of published batches (any number), and `new_version` = `true`. If `drafts_switched_on` is `0`, the PPC batch has a different slug than `ppc-batch-3`; tell Claude. If `new_version` is `false` or empty, the old search function is still in place; tell Claude.
