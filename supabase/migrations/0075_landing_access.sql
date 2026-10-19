-- 0075_landing_access.sql
-- NOTE: the owner pastes this SQL into the Supabase SQL editor (it is not applied by tooling).
-- Safe to run more than once.
--
-- Plan 2a: a Paid landing registration becomes a course enrollment with Live/Recorded
-- access (portal_open) and per-module coverage (enrollment_modules).
--   1. enrollments gets access_level, portal_open, landing_registration_id.
--   2. enrollment_modules (which modules an enrollment covers; no rows = whole course).
--   3. landing_batch_state ("batch finished") and landing_email_log ("sent once" guard).
--   4. landing_jobs.type also allows 'enrollment_sync' and 'email_status'.
--   5. Helpers _module_open_for() / can_access_module().
--   6. Every place that gated on an active enrollment now also requires portal_open
--      and module coverage: lessons read policy (0007), complete_lesson (0007),
--      submit_quiz_attempt (0009), unlock_first_lesson_on_enroll and unlock_next_lesson
--      (0003), notify_enrollment_status_change (0015).
-- Existing enrollments behave exactly as before: portal_open defaults to true and they
-- have no enrollment_modules rows (= whole course).

-- ─── 1. New columns and tables ──────────────────────────────────

alter table public.enrollments
  add column if not exists access_level text check (access_level in ('live', 'recorded')),
  add column if not exists portal_open boolean not null default true,
  add column if not exists landing_registration_id uuid references public.landing_registrations(id) on delete set null;
-- default true + null access_level keeps every existing enrollment behaving exactly as today.
create unique index if not exists enrollments_landing_registration_key
  on public.enrollments (landing_registration_id) where landing_registration_id is not null;

-- Which modules an enrollment covers. NO rows = the whole course.
create table if not exists public.enrollment_modules (
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  module_id     uuid not null references public.modules(id) on delete cascade,
  primary key (enrollment_id, module_id)
);
alter table public.enrollment_modules enable row level security;
drop policy if exists "enrollment_modules: own or admin read" on public.enrollment_modules;
create policy "enrollment_modules: own or admin read" on public.enrollment_modules for select
  using (
    get_my_role() in ('admin', 'super_admin')
    or exists (select 1 from public.enrollments e where e.id = enrollment_id and e.student_id = auth.uid())
  );
-- no insert/update/delete policies: only the service role writes.

-- "Batch finished" state: module_id null = the whole course of that page.
create table if not exists public.landing_batch_state (
  id          uuid primary key default gen_random_uuid(),
  page_id     uuid not null references public.landing_pages(id) on delete cascade,
  module_id   uuid references public.modules(id) on delete cascade,
  finished_at timestamptz not null default now(),
  finished_by uuid references public.profiles(id) on delete set null
);
create unique index if not exists landing_batch_state_course_key on public.landing_batch_state (page_id) where module_id is null;
create unique index if not exists landing_batch_state_module_key on public.landing_batch_state (page_id, module_id) where module_id is not null;
alter table public.landing_batch_state enable row level security; -- zero policies = service role only

-- One row per person per email kind: the "sent once" guard and the email history.
create table if not exists public.landing_email_log (
  registration_id uuid not null references public.landing_registrations(id) on delete cascade,
  kind            text not null check (kind in ('paid', 'underpaid', 'reserved', 'portal_link')),
  to_email        text not null,
  sent_at         timestamptz not null default now(),
  primary key (registration_id, kind)
);
alter table public.landing_email_log enable row level security; -- zero policies = service role only

alter table public.landing_jobs drop constraint if exists landing_jobs_type_check;
alter table public.landing_jobs
  add constraint landing_jobs_type_check check (type in
    ('sheet_append', 'email_received', 'email_members', 'email_admin', 'sheet_status', 'enrollment_sync', 'email_status'));

-- ─── 2. Access helper functions ─────────────────────────────────

-- Internal: does this student have an open, active enrollment that covers this module?
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
  );
$$;
revoke all on function public._module_open_for(uuid, uuid) from public, anon, authenticated;

-- For policies and student-facing functions: always about the caller.
-- anon needs execute too: the lessons policy below calls it, and an anon select on
-- lessons must keep returning zero rows rather than raising "permission denied".
-- It returns false for anon because auth.uid() is null.
create or replace function public.can_access_module(p_module uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public._module_open_for(auth.uid(), p_module);
$$;
revoke all on function public.can_access_module(uuid) from public;
grant execute on function public.can_access_module(uuid) to anon, authenticated;

-- ─── 3. Put the helper into every place that checked "active enrollment" ──

-- 3a. Lessons read policy. Latest version is 0007's "lessons: read if unlocked or admin"
-- (admin, or an unlocked/completed progress row). Kept as is, plus the access check.
drop policy if exists "lessons: read if unlocked or admin" on public.lessons;
create policy "lessons: read if unlocked or admin"
  on public.lessons for select
  using (
    get_my_role() in ('admin', 'super_admin')
    or (
      exists (
        select 1 from public.lesson_progress lp
        where lp.lesson_id = lessons.id
          and lp.student_id = auth.uid()
          and lp.status in ('unlocked', 'completed')
      )
      and public.can_access_module(lessons.module_id)
    )
  );

-- 3b. complete_lesson (latest: 0007). Only the enrollment check changed.
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

  -- Must have an active, open enrollment that covers the lesson's module
  if not public.can_access_module((select module_id from public.lessons where id = p_lesson_id)) then
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

-- 3c. submit_quiz_attempt (latest: 0009). Only the enrollment check changed.
create or replace function public.submit_quiz_attempt(p_lesson_id uuid, p_answers integer[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id      uuid;
  v_status         public.progress_status;
  v_attempt_count  integer;
  v_total          integer;
  v_score          integer := 0;
  v_passed         boolean;
  v_course_pct     integer;
  v_correct        integer;
  v_idx            integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select c.id into v_course_id
  from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id
  where l.id = p_lesson_id;

  if v_course_id is null then
    raise exception 'lesson not found';
  end if;

  if not public.can_access_module((select module_id from public.lessons where id = p_lesson_id)) then
    raise exception 'not enrolled';
  end if;

  select status into v_status
  from public.lesson_progress
  where student_id = auth.uid() and lesson_id = p_lesson_id;

  if v_status is null or v_status = 'locked' then
    raise exception 'lesson is locked';
  end if;

  select count(*) into v_attempt_count
  from public.quiz_attempts
  where student_id = auth.uid() and lesson_id = p_lesson_id;

  if v_attempt_count >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'no_attempts_left');
  end if;

  select count(*) into v_total from public.quiz_questions where lesson_id = p_lesson_id;
  if v_total = 0 then
    raise exception 'lesson has no quiz';
  end if;

  -- Score: p_answers[i] (1-indexed, Postgres array convention) corresponds
  -- to the i-th question by order_index, matching the order get_quiz()
  -- returned them in.
  for v_correct, v_idx in
    select q.correct_index, row_number() over (order by q.order_index asc)
    from public.quiz_questions q
    where q.lesson_id = p_lesson_id
  loop
    if p_answers[v_idx] is not null and p_answers[v_idx] = v_correct then
      v_score := v_score + 1;
    end if;
  end loop;

  v_passed := (v_score::numeric / v_total::numeric) >= 0.5;

  insert into public.quiz_attempts (student_id, lesson_id, score, total, passed, attempt_number)
  values (auth.uid(), p_lesson_id, v_score, v_total, v_passed, v_attempt_count + 1);

  if v_passed then
    select public.complete_lesson(p_lesson_id) into v_course_pct;
  end if;

  return jsonb_build_object(
    'ok', true,
    'score', v_score,
    'total', v_total,
    'passed', v_passed,
    'attempt_number', v_attempt_count + 1,
    'attempts_left', 3 - (v_attempt_count + 1),
    'course_pct', v_course_pct
  );
end;
$$;

grant execute on function public.submit_quiz_attempt(uuid, integer[]) to authenticated;

-- 3d. unlock_first_lesson_on_enroll (latest: 0003). Now also fires on INSERT (a Paid
-- landing registration creates an already-active enrollment) and when portal_open flips
-- to true. NOTE: on INSERT, `old` is unassigned in plpgsql, so it is only referenced
-- inside the tg_op = 'UPDATE' block.
create or replace function public.unlock_first_lesson_on_enroll()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_lesson lessons%rowtype;
begin
  -- Only act on an active, open enrollment
  if new.status <> 'active' or not new.portal_open then
    return new;
  end if;

  -- On UPDATE, only when it just became active or just opened
  if tg_op = 'UPDATE' then
    if old.status = 'active' and old.portal_open then
      return new;
    end if;
  end if;

  -- First lesson (module order, lesson order) of the first module this student can open
  select l.* into v_first_lesson
  from public.lessons l
  join public.modules m on m.id = l.module_id
  where m.course_id = new.course_id
    and public._module_open_for(new.student_id, m.id)
  order by m.order_index asc, l.order_index asc
  limit 1;

  if v_first_lesson.id is not null then
    insert into public.lesson_progress (student_id, lesson_id, status)
    values (new.student_id, v_first_lesson.id, 'unlocked')
    on conflict (student_id, lesson_id)
    do update set status = 'unlocked'
    where lesson_progress.status = 'locked';
  end if;

  return new;
end;
$$;

drop trigger if exists on_enrollment_activated on public.enrollments;
create trigger on_enrollment_activated
  after insert or update on public.enrollments
  for each row
  execute function public.unlock_first_lesson_on_enroll();

-- 3e. unlock_next_lesson (latest: 0003). Only the next-module fallback changed, so a
-- module-limited student is not pre-unlocked in modules they did not buy.
create or replace function public.unlock_next_lesson()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson        lessons%rowtype;
  v_module        modules%rowtype;
  v_next_lesson   lessons%rowtype;
begin
  -- Only act when status changes TO completed
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  -- Fetch current lesson + its module
  select * into v_lesson from public.lessons where id = new.lesson_id;
  select * into v_module from public.modules where id = v_lesson.module_id;

  -- Try: next lesson in same module
  select * into v_next_lesson
  from public.lessons
  where module_id = v_module.id
    and order_index > v_lesson.order_index
  order by order_index asc
  limit 1;

  -- Fallback: first lesson of next module in same course that the student can open
  if v_next_lesson.id is null then
    select l.* into v_next_lesson
    from public.lessons l
    join public.modules m on m.id = l.module_id
    where m.course_id = v_module.course_id
      and m.order_index > v_module.order_index
      and public._module_open_for(new.student_id, m.id)
    order by m.order_index asc, l.order_index asc
    limit 1;
  end if;

  -- Unlock the next lesson (upsert)
  if v_next_lesson.id is not null then
    insert into public.lesson_progress (student_id, lesson_id, status)
    values (new.student_id, v_next_lesson.id, 'unlocked')
    on conflict (student_id, lesson_id)
    do update set status = 'unlocked'
    where lesson_progress.status = 'locked';
  end if;

  return new;
end;
$$;

-- 3f. notify_enrollment_status_change (latest: 0015). Added: an active enrollment whose
-- portal is still closed gets no "enrollment approved / first lesson unlocked" bell entry.
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

  -- Active but portal not open yet: nothing to tell the student.
  if new.status = 'active' and not new.portal_open then
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

-- 3g. Student insert policy (latest: 0013). Same checks, plus the new landing columns must
-- be null so a student cannot squat a landing_registration_id or set access_level.
-- (portal_open is left alone: a student inserting portal_open=true is today's behaviour.)
drop policy if exists "enrollments: student insert" on public.enrollments;
create policy "enrollments: student insert"
  on public.enrollments for insert
  with check (
    student_id = auth.uid()
    and status = 'pending'
    and verified_by is null
    and verified_at is null
    and cert_issued = false
    and cert_url is null
    and rejection_reason is null
    and landing_registration_id is null
    and access_level is null
  );

-- 3h. get_quiz (latest: 0009). Student branch also requires module access. Like the
-- existing "locked" case in this function, a denied caller gets an empty result.
create or replace function public.get_quiz(p_lesson_id uuid)
returns table (
  question_id  uuid,
  question     text,
  options      jsonb,
  order_index  integer
)
language sql
stable
security definer
set search_path = public
as $$
  select q.id, q.question, q.options, q.order_index
  from public.quiz_questions q
  where q.lesson_id = p_lesson_id
    and (
      get_my_role() in ('admin', 'super_admin')
      or (
        exists (
          select 1 from public.lesson_progress lp
          where lp.lesson_id = p_lesson_id
            and lp.student_id = auth.uid()
            and lp.status in ('unlocked', 'completed')
        )
        and public.can_access_module((select module_id from public.lessons where id = p_lesson_id))
      )
    )
  order by q.order_index asc;
$$;

grant execute on function public.get_quiz(uuid) to authenticated;

-- 3i. check_quiz_answer (latest: 0010). Same change, same empty-result style.
create or replace function public.check_quiz_answer(p_question_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select q.correct_index
  from public.quiz_questions q
  where q.id = p_question_id
    and (
      get_my_role() in ('admin', 'super_admin')
      or (
        exists (
          select 1 from public.lesson_progress lp
          where lp.lesson_id = q.lesson_id
            and lp.student_id = auth.uid()
            and lp.status in ('unlocked', 'completed')
        )
        and public.can_access_module((select module_id from public.lessons where id = q.lesson_id))
      )
    );
$$;

grant execute on function public.check_quiz_answer(uuid) to authenticated;

-- ─── 4. Smoke test ──────────────────────────────────────────────
-- The same script lives in supabase/tests/0075_access_smoke.sql. Run it separately
-- (it begins a transaction and rolls back, leaving no data).
