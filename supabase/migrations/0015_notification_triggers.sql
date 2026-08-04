-- ============================================================
-- Migration 0015: In-app notification triggers (Phase 6b)
-- Run AFTER 0014. SQL Editor → New query → Run
-- ============================================================
-- public.notifications has existed since 0001 but nothing has ever written to
-- it — the bell in Topbar.tsx is hardcoded to count={0}. This migration makes
-- the database itself produce notifications for events that ARE database state
-- changes, so they cannot be missed:
--
--   * enrollment status → active / reserved / rejected
--   * a lesson becoming unlocked by the drip trigger
--
-- Admin-composed messages and broadcasts are NOT here. They have no row change
-- to react to, so they are inserted by server code via the service-role client.
--
-- Note on RLS: 0002 gives notifications a SELECT and an UPDATE policy for the
-- owning user, and deliberately no INSERT policy — a student must never be able
-- to forge "your payment was approved". These functions are SECURITY DEFINER,
-- so they run as the table owner and bypass RLS; the service-role client used
-- for admin messages bypasses it too. No INSERT policy is needed or wanted.

-- ─── Shared insert helper ───────────────────────────────────

create or replace function public.create_notification(
  p_user_id uuid,
  p_type    text,
  p_title   text,
  p_body    text default null,
  p_link    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (user_id, type, title, body, link)
  values (p_user_id, p_type, p_title, p_body, p_link)
  returning id into v_id;
  return v_id;
end;
$$;

-- ─── Enrollment status changes ──────────────────────────────

create or replace function public.notify_enrollment_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course   courses%rowtype;
  v_title    text;
  v_body     text;
  v_link     text;
  v_type     text;
begin
  -- Only act on a genuine status transition.
  if new.status = old.status then
    return new;
  end if;

  select * into v_course from public.courses where id = new.course_id;
  if v_course.id is null then
    return new;
  end if;

  if new.status = 'active' then
    v_type  := 'enrollment_approved';
    v_title := 'Enrollment approved';
    v_body  := 'Your payment for ' || v_course.title || ' is verified. Your first lesson is unlocked.';
    v_link  := '/portal/' || v_course.slug;

  elsif new.status = 'reserved' then
    v_type  := 'enrollment_reserved';
    v_title := 'Seat reserved';
    v_body  := 'Your seat in ' || v_course.title || ' is held while your payment is completed.';
    v_link  := '/enroll/' || v_course.slug;

  elsif new.status = 'rejected' then
    v_type  := 'enrollment_rejected';
    v_title := 'Payment could not be verified';
    v_body  := coalesce(new.rejection_reason, 'Please review your submission and try again.');
    v_link  := '/enroll/' || v_course.slug;

  elsif new.status = 'expired' then
    v_type  := 'enrollment_expired';
    v_title := 'Enrollment expired';
    v_body  := 'Your enrollment in ' || v_course.title || ' has expired.';
    v_link  := '/courses/' || v_course.slug;

  else
    -- 'pending' (including a resubmission) gets an email, not a bell entry —
    -- the student just performed the action, so telling them about it is noise.
    return new;
  end if;

  perform public.create_notification(new.student_id, v_type, v_title, v_body, v_link);
  return new;
end;
$$;

drop trigger if exists on_enrollment_status_notify on public.enrollments;

create trigger on_enrollment_status_notify
  after update on public.enrollments
  for each row
  execute function public.notify_enrollment_status_change();

-- ─── Lesson unlocked by the drip ────────────────────────────

create or replace function public.notify_lesson_unlocked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id    uuid;
  v_course_title text;
  v_course_slug  text;
  v_lesson_title text;
  v_course_rows  integer;
begin
  -- Only when a lesson becomes unlocked (not on completion, not re-runs).
  if new.status <> 'unlocked' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'unlocked' then
    return new;
  end if;

  -- Scalars, not a %rowtype: Postgres rejects a record variable that shares an
  -- INTO list with other targets ("record variable cannot be part of
  -- multiple-item INTO list").
  select l.title, m.course_id into v_lesson_title, v_course_id
  from public.lessons l
  join public.modules m on m.id = l.module_id
  where l.id = new.lesson_id;

  if v_course_id is null then
    return new;
  end if;

  /*
   * Suppress the very first unlock of a course. That one is produced by
   * unlock_first_lesson_on_enroll() the instant an enrollment goes active, so
   * the student would otherwise get "Enrollment approved" and "New lesson
   * unlocked" in the same second. Counting the student's progress rows for
   * this course is how we tell the two apart: exactly one row means this IS
   * the initial unlock.
   */
  select count(*) into v_course_rows
  from public.lesson_progress lp
  join public.lessons l2 on l2.id = lp.lesson_id
  join public.modules m2 on m2.id = l2.module_id
  where lp.student_id = new.student_id
    and m2.course_id = v_course_id;

  if v_course_rows <= 1 then
    return new;
  end if;

  select title, slug into v_course_title, v_course_slug
  from public.courses where id = v_course_id;

  perform public.create_notification(
    new.student_id,
    'lesson_unlocked',
    'New lesson unlocked',
    coalesce(v_lesson_title, 'Your next lesson') || ' is now available in ' || v_course_title || '.',
    '/portal/' || v_course_slug || '/lessons/' || new.lesson_id
  );
  return new;
end;
$$;

drop trigger if exists on_lesson_progress_notify on public.lesson_progress;

create trigger on_lesson_progress_notify
  after insert or update on public.lesson_progress
  for each row
  execute function public.notify_lesson_unlocked();

-- ─── Read performance ───────────────────────────────────────
-- Every bell render asks for "my unread rows, newest first".

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where is_read = false;
