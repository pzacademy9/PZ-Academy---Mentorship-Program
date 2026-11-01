-- 0096: draft batches stay private on the public portal until an admin switches them on.
-- The owner pastes this by hand into the Supabase SQL editor.
-- REQUIRES 0095 to be live first (it adds landing_pages.show_in_portal).
-- show_in_portal becomes three-valued:
--   NULL  = automatic: shown only when the batch is published or closed (new rows start here)
--   true  = an admin switched it on: shown once published/closed, or once it has enrolled students
--   false = an admin switched it off: always hidden
-- One-time data step: every row that 0095 left at true goes back to NULL (automatic), except the
-- PPC Batch 3 page (slug ppc-batch-3), which is switched on so it stays visible. Rows at false stay false.
-- find_enrolled_ids_by_name follows the same rule. It still returns at most 6 rows of
-- first name + PZ ID + batch title only.
-- Safe to re-run: the data step only happens the first time, so pasting again changes nothing.

-- The one-time data step runs ONLY while the column is still NOT NULL (i.e. 0096 has not run before),
-- so pasting this file again never undoes a switch an admin made later. Inside that step the
-- column is made nullable FIRST (the updates below write NULL), then the data is changed.
-- If an earlier paste failed, it was rolled back, the column is still NOT NULL, and this paste works.
do $$
declare
  v_nullable text;
begin
  select is_nullable into v_nullable
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'landing_pages'
     and column_name = 'show_in_portal';

  if v_nullable = 'NO' then
    execute 'alter table public.landing_pages alter column show_in_portal drop not null';

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

-- Harmless repeats (already done inside the block on the first run).
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

-- Check (run after pasting): expect drafts_switched_on = 1 (PPC Batch 3), published_automatic = the number
-- of published batches left on automatic, and new_version = true (false means the old function is still in place).
select
  (select count(*) from public.landing_pages where status = 'draft' and show_in_portal is true) as drafts_switched_on,
  (select count(*) from public.landing_pages where status = 'published' and show_in_portal is null) as published_automatic,
  (select prosrc like '%coalesce(lp.show_in_portal%' from pg_proc where proname = 'find_enrolled_ids_by_name') as new_version;
