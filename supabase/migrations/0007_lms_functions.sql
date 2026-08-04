-- ============================================================
-- Migration 0007: LMS Core functions + RLS hardening (Phase 2)
-- Run AFTER 0003. SQL Editor → New query → Run
-- ============================================================
-- Closes two security holes from 0002 and adds the controlled
-- entry points the student LMS uses:
--   1. locked lesson content was readable by any active-enrolled
--      student (RLS checked enrollment only, not progress).
--   2. students could self-mark ANY lesson completed, skipping drip.
-- Content is now gated on a per-student progress row, completion
-- goes through complete_lesson(), and curriculum titles come from
-- a definer RPC that returns NO content.

-- ─── RPC: course curriculum (titles + lock status, NO content) ─
-- Used by the portal nav tree and (later) the course-detail
-- curriculum accordion. Safe to expose: never returns lesson body.

create or replace function public.course_curriculum(p_course_id uuid)
returns table (
  module_id     uuid,
  module_title  text,
  module_order  integer,
  lesson_id     uuid,
  lesson_title  text,
  lesson_order  integer,
  content_type  public.lesson_content_type,
  status        public.progress_status
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.title,
    m.order_index,
    l.id,
    l.title,
    l.order_index,
    l.content_type,
    coalesce(lp.status, 'locked')::public.progress_status
  from public.modules m
  join public.lessons l on l.module_id = m.id
  left join public.lesson_progress lp
    on lp.lesson_id = l.id
   and lp.student_id = auth.uid()
  where m.course_id = p_course_id
  order by m.order_index asc, l.order_index asc;
$$;

grant execute on function public.course_curriculum(uuid) to authenticated, anon;

-- ─── RPC: complete a lesson (controlled drip entry point) ─────
-- Only the owner may complete, only when the lesson is currently
-- 'unlocked' and the enrollment is active. Flipping to 'completed'
-- fires on_lesson_completed (0003) which unlocks the next lesson.
-- Returns course completion % after the update.

create or replace function public.complete_lesson(p_lesson_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id uuid;
  v_status    public.progress_status;
  v_total     integer;
  v_done      integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Resolve the course for this lesson
  select c.id into v_course_id
  from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id
  where l.id = p_lesson_id;

  if v_course_id is null then
    raise exception 'lesson not found';
  end if;

  -- Must have an active enrollment in the lesson's course
  if not exists (
    select 1 from public.enrollments e
    where e.course_id = v_course_id
      and e.student_id = auth.uid()
      and e.status = 'active'
  ) then
    raise exception 'not enrolled';
  end if;

  -- Current progress must be 'unlocked' (not locked, not already completed)
  select status into v_status
  from public.lesson_progress
  where student_id = auth.uid() and lesson_id = p_lesson_id;

  if v_status is null or v_status = 'locked' then
    raise exception 'lesson is locked';
  end if;

  if v_status = 'unlocked' then
    update public.lesson_progress
      set status = 'completed', completed_at = now()
      where student_id = auth.uid() and lesson_id = p_lesson_id;
  end if;
  -- if already 'completed', idempotent no-op

  -- Course completion %
  select count(*) into v_total
  from public.lessons l
  join public.modules m on m.id = l.module_id
  where m.course_id = v_course_id;

  select count(*) into v_done
  from public.lesson_progress lp
  join public.lessons l on l.id = lp.lesson_id
  join public.modules m on m.id = l.module_id
  where m.course_id = v_course_id
    and lp.student_id = auth.uid()
    and lp.status = 'completed';

  if v_total = 0 then
    return 0;
  end if;
  return floor((v_done::numeric / v_total::numeric) * 100)::integer;
end;
$$;

grant execute on function public.complete_lesson(uuid) to authenticated;

-- ─── RLS: gate lesson CONTENT on a per-student progress row ────
-- Replaces the enrollment-only policy. Content rows are now only
-- selectable if admin, or the caller has an unlocked/completed
-- progress row for that lesson. Locked lessons have no such row.
-- (Curriculum titles come from course_curriculum RPC above.)

drop policy if exists "lessons: read if enrolled or admin" on public.lessons;

create policy "lessons: read if unlocked or admin"
  on public.lessons for select
  using (
    get_my_role() in ('admin', 'super_admin')
    or exists (
      select 1 from public.lesson_progress lp
      where lp.lesson_id = lessons.id
        and lp.student_id = auth.uid()
        and lp.status in ('unlocked', 'completed')
    )
  );

-- ─── RLS: make lesson_progress read-only to students ──────────
-- Writes now happen via triggers (definer) and complete_lesson()
-- (definer). Removing direct student insert/update closes the
-- self-unlock hole. Keep select-own.

drop policy if exists "lesson_progress: student write own"  on public.lesson_progress;
drop policy if exists "lesson_progress: student update own" on public.lesson_progress;
