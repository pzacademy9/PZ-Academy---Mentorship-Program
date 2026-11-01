-- 0094: public lookup rate limit + per-batch "show the full ID list" switch.
-- The owner pastes this by hand into the Supabase SQL editor.
-- public_lookup_hits remembers recent public lookups (by a hashed key, never a raw IP).
-- public_lookup_allow(key, limit, window) answers true if the caller may go ahead, and records the hit.
-- landing_pages.ids_list_public is the per-batch switch for sharing the full ID list (default off).
-- public_lookup_hits has RLS on and no policies: only the service role (through the function) touches it.
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

alter table public.landing_pages
  add column if not exists ids_list_public boolean not null default false;
