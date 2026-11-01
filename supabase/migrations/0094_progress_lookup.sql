-- 0094: public lookup rate limit.
-- The owner pastes this by hand into the Supabase SQL editor.
-- public_lookup_hits remembers recent public lookups (by a hashed key, never a raw IP).
-- public_lookup_allow(key, limit, window) answers true if the caller may go ahead, and records the hit.
-- public_lookup_hits has RLS on and no policies: only the service role (through the function) touches it.
-- find_enrolled_ids_by_name(query) is the whole public "find my ID" search in one call: at most 5 rows,
-- first name + PZ ID + batch title only (never email, last name or full name).
-- No existing data is changed. Safe to re-run.

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
   limit 5;
$$;

revoke all on function public.find_enrolled_ids_by_name(text) from public;
revoke all on function public.find_enrolled_ids_by_name(text) from anon;
revoke all on function public.find_enrolled_ids_by_name(text) from authenticated;
grant execute on function public.find_enrolled_ids_by_name(text) to service_role;
