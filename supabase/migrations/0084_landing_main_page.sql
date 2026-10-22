-- 0084_landing_main_page.sql
-- Main landing page per course: one page per course can be flagged as the page the public site links to.
-- The owner pastes this into the Supabase SQL editor. Safe to run twice.

alter table public.landing_pages
  add column if not exists is_main_page boolean not null default false;

alter table public.landing_pages drop constraint if exists landing_pages_main_needs_course;
alter table public.landing_pages
  add constraint landing_pages_main_needs_course check (not is_main_page or course_id is not null);

create unique index if not exists landing_pages_main_per_course
  on public.landing_pages (course_id) where is_main_page;

-- Deleting a course nulls landing_pages.course_id (FK on delete set null). That update fires this
-- trigger first, which clears the main flag so the check above does not block the delete.
create or replace function public.landing_pages_clear_main_without_course()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.course_id is null then
    new.is_main_page := false;
  end if;
  return new;
end;
$$;

revoke all on function public.landing_pages_clear_main_without_course() from public, anon, authenticated;

drop trigger if exists landing_pages_clear_main_without_course on public.landing_pages;
create trigger landing_pages_clear_main_without_course
  before update on public.landing_pages
  for each row execute function public.landing_pages_clear_main_without_course();

-- Sets the page's course and main flag in one step. When p_main is true, every other page of
-- that course loses the flag first so the unique index is never violated.
create or replace function public.landing_set_main_page(
  p_page_id   uuid,
  p_course_id uuid,
  p_main      boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_main and p_course_id is null then
    raise exception 'main_needs_course';
  end if;

  if p_main then
    update public.landing_pages
       set is_main_page = false
     where course_id = p_course_id
       and id <> p_page_id
       and is_main_page;

    update public.landing_pages
       set course_id = p_course_id,
           is_main_page = true
     where id = p_page_id;
    if not found then
      raise exception 'page_not_found';
    end if;
  else
    update public.landing_pages
       set course_id = p_course_id,
           is_main_page = false
     where id = p_page_id;
    if not found then
      raise exception 'page_not_found';
    end if;
  end if;
end;
$$;

revoke all on function public.landing_set_main_page(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.landing_set_main_page(uuid, uuid, boolean) to service_role;
