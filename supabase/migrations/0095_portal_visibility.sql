-- 0095: public portal visibility switch.
-- The owner pastes this by hand into the Supabase SQL editor.
-- REQUIRES 0094 to be live first (it replaces the find_enrolled_ids_by_name function made there).
-- Adds landing_pages.show_in_portal (default true) so an admin can hide a batch from the public portal.
-- A batch is visible on the portal when show_in_portal is true AND its kind is course, workshop or webinar
-- AND (it is published or closed, OR it has at least one paid/free non-test registration).
-- find_enrolled_ids_by_name follows the same rule: the query below already requires an enrolled
-- registration, so the old status filter is dropped and show_in_portal + kind are required instead.
-- It still returns at most 6 rows of first name + PZ ID + batch title only.
-- No existing data is changed. Safe to re-run.

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

-- Check (run after pasting): expect show_in_portal_column = 1, name_search_function = 1 and new_version = true
-- (new_version false means the old function is still in place).
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'landing_pages' and column_name = 'show_in_portal') as show_in_portal_column,
  (select count(*) from pg_proc where proname = 'find_enrolled_ids_by_name') as name_search_function,
  (select prosrc like '%show_in_portal%' from pg_proc where proname = 'find_enrolled_ids_by_name') as new_version;
