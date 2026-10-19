-- 0076_landing_batch_access.sql
-- NOTE: the owner pastes this SQL into the Supabase SQL editor (it is not applied by tooling).
-- Safe to run more than once.
--
-- Plan 2b: "Batch finished" for ONE module opens only that module for a whole-course
-- Live buyer.
--   1. enrollment_open_modules: which modules are open for a Live enrollment. The one-time
--      backfill (existing Live enrollments keep what they can open today, and existing
--      "whole course finished" batch rows become one row per module) runs only when this
--      table is first created, so a second paste never reopens anything.
--   2. landing_email_log gets its own id and a state/claimed_at pair; the "sent once"
--      guard is now a partial unique index on the status kinds only, so portal_link
--      emails can repeat.
--   3. _module_open_for(): unchanged except that a Live enrollment must also have an
--      open row for the module. Recorded, null access_level and legacy enrollments are
--      gated exactly as before.
--   4. Bell: an active enrollment whose portal_open flips false to true gets a
--      "Your portal is open" notification.

-- ─── 1. enrollment_open_modules + one-time backfills ────────────

do $$
begin
  if to_regclass('public.enrollment_open_modules') is null then

    create table public.enrollment_open_modules (
      enrollment_id uuid not null references public.enrollments(id) on delete cascade,
      module_id     uuid not null references public.modules(id) on delete cascade,
      opened_at     timestamptz not null default now(),
      primary key (enrollment_id, module_id)
    );
    alter table public.enrollment_open_modules enable row level security;
    create policy "enrollment_open_modules: own or admin read" on public.enrollment_open_modules for select
      using (
        get_my_role() in ('admin', 'super_admin')
        or exists (select 1 from public.enrollments e where e.id = enrollment_id and e.student_id = auth.uid())
      );
    -- no insert/update/delete policies: only the service role writes.

    -- Backfill: every open Live enrollment keeps today's access (its covered modules;
    -- no enrollment_modules rows = all modules of the course).
    insert into public.enrollment_open_modules (enrollment_id, module_id)
    select e.id, m.id
      from public.enrollments e
      join public.modules m on m.course_id = e.course_id
     where e.access_level = 'live'
       and e.portal_open
       and (
         not exists (select 1 from public.enrollment_modules em where em.enrollment_id = e.id)
         or exists (select 1 from public.enrollment_modules em where em.enrollment_id = e.id and em.module_id = m.id)
       )
    on conflict do nothing;

    -- Expand every existing whole-course "batch finished" row into one row per module of
    -- that page's course (pages without a course are skipped). The null row is kept.
    insert into public.landing_batch_state (page_id, module_id, finished_at, finished_by)
    select s.page_id, m.id, s.finished_at, s.finished_by
      from public.landing_batch_state s
      join public.landing_pages lp on lp.id = s.page_id
      join public.modules m on m.course_id = lp.course_id
     where s.module_id is null
       and lp.course_id is not null
    on conflict do nothing;

  end if;
end $$;

-- ─── 2. landing_email_log: own id, claim state, status kinds unique ──

alter table public.landing_email_log
  add column if not exists id         uuid not null default gen_random_uuid(),
  add column if not exists state      text not null default 'sent',
  add column if not exists claimed_at timestamptz not null default now();

alter table public.landing_email_log drop constraint if exists landing_email_log_state_check;
alter table public.landing_email_log
  add constraint landing_email_log_state_check check (state in ('claimed', 'sent'));

-- Swap the primary key (registration_id, kind) for (id), only if it is not already (id).
do $$
begin
  if not exists (
    select 1
      from pg_index i
     where i.indrelid = 'public.landing_email_log'::regclass
       and i.indisprimary
       and (select array_agg(a.attname::text)
              from pg_attribute a
             where a.attrelid = i.indrelid and a.attnum = any(i.indkey)) = array['id']::text[]
  ) then
    alter table public.landing_email_log drop constraint if exists landing_email_log_pkey;
    alter table public.landing_email_log add primary key (id);
  end if;
end $$;

-- "Sent once" guard: status kinds only. portal_link rows may repeat.
create unique index if not exists landing_email_log_status_once
  on public.landing_email_log (registration_id, kind)
  where kind in ('paid', 'underpaid', 'reserved');

-- ─── 3. Access helper: Live enrollments need a per-module open row ──

create or replace function public._module_open_for(p_student uuid, p_module uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.modules m
      join public.enrollments e on e.course_id = m.course_id
     where m.id = p_module
       and e.student_id = p_student
       and e.status = 'active'
       and e.portal_open
       and (
         not exists (select 1 from public.enrollment_modules em where em.enrollment_id = e.id)
         or exists (select 1 from public.enrollment_modules em where em.enrollment_id = e.id and em.module_id = m.id)
       )
       and (
         e.access_level is distinct from 'live'
         or exists (select 1 from public.enrollment_open_modules eom where eom.enrollment_id = e.id and eom.module_id = m.id)
       )
  );
$$;
revoke all on function public._module_open_for(uuid, uuid) from public, anon, authenticated;

-- ─── 3b. Opening a module later unlocks its first lesson ────────
-- unlock_next_lesson only runs when a lesson is completed, so a module opened afterwards
-- (batch finished for module B) would otherwise stay locked. Re-runnable: create or replace
-- plus drop/create trigger. Does nothing while the portal is closed (the portal_open flip
-- is handled by unlock_first_lesson_on_enroll).
create or replace function public.unlock_first_lesson_on_module_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enr    enrollments%rowtype;
  v_lesson uuid;
begin
  select * into v_enr from public.enrollments where id = new.enrollment_id;
  if v_enr.id is null or v_enr.status <> 'active' or not v_enr.portal_open then
    return new;
  end if;
  if not public._module_open_for(v_enr.student_id, new.module_id) then
    return new;
  end if;

  select l.id into v_lesson
    from public.lessons l
   where l.module_id = new.module_id
   order by l.order_index asc, l.id
   limit 1;

  if v_lesson is not null then
    insert into public.lesson_progress (student_id, lesson_id, status)
    values (v_enr.student_id, v_lesson, 'unlocked')
    on conflict (student_id, lesson_id)
    do update set status = 'unlocked'
    where lesson_progress.status = 'locked';
  end if;
  return new;
end;
$$;

drop trigger if exists on_open_module_inserted on public.enrollment_open_modules;
create trigger on_open_module_inserted
  after insert on public.enrollment_open_modules
  for each row
  execute function public.unlock_first_lesson_on_module_open();

-- ─── 4. Bell when the portal opens ──────────────────────────────

create or replace function public.notify_portal_opened()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course courses%rowtype;
begin
  -- Only an already-active enrollment whose portal just opened. (A status change to
  -- active is announced by notify_enrollment_status_change; avoid a duplicate bell.)
  if tg_op <> 'UPDATE'
     or old.status <> 'active' or new.status <> 'active'
     or old.portal_open or not new.portal_open then
    return new;
  end if;

  select * into v_course from public.courses where id = new.course_id;
  if v_course.id is null then
    return new;
  end if;

  perform public.create_notification(
    new.student_id,
    'portal_open',
    'Your portal is open',
    'Your access to ' || v_course.title || ' is now open.',
    '/portal/' || v_course.slug
  );
  return new;
end;
$$;

drop trigger if exists on_enrollment_portal_opened on public.enrollments;
create trigger on_enrollment_portal_opened
  after update on public.enrollments
  for each row
  execute function public.notify_portal_opened();

-- Smoke test: supabase/tests/0076_batch_access_smoke.sql (run separately after this).
