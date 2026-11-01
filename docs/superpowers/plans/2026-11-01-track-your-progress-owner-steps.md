# Track Your Progress: owner steps

Do this once, before the "Track Your Progress" page goes live.

## (a) Paste the migration

1. Open the Supabase SQL editor.
2. Open the file `supabase/migrations/0094_progress_lookup.sql`, copy everything in it, paste it into the editor and press Run.
3. It is safe to run twice. It changes no existing data.

What it does, in plain words:
- Adds a small notebook that remembers recent public lookups, so one person cannot search again and again without limit (about 30 lookups per 10 minutes).

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
```

## (b) Check it worked

Paste this and run it:

```sql
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'public_lookup_hits') as notebook_table,
  (select count(*) from pg_proc
    where proname = 'public_lookup_allow') as limit_function;
```

Expect one row with `1` and `1`. If any shows `0`, tell me which one.
