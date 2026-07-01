-- ============================================================
-- Migration 0003: Triggers
-- Run AFTER 0002. SQL Editor → New query → Run
-- ============================================================

-- ─── TRIGGER 1: Auto-create profile on new auth user ─────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, phone, profession, city)
  values (
    new.id,
    'student',
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'profession',
    new.raw_user_meta_data->>'city'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ─── TRIGGER 2: Auto-update updated_at on profiles ───────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- ─── TRIGGER 3: Drip unlock — next lesson on completion ──────
-- When a lesson_progress row is updated to 'completed',
-- this trigger unlocks the next lesson in sequence for that student.
-- Order: next lesson in same module by order_index,
--        then first lesson of next module by order_index.

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

  -- Fallback: first lesson of next module in same course
  if v_next_lesson.id is null then
    select l.* into v_next_lesson
    from public.lessons l
    join public.modules m on m.id = l.module_id
    where m.course_id = v_module.course_id
      and m.order_index > v_module.order_index
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

create trigger on_lesson_completed
  after update on public.lesson_progress
  for each row
  execute function public.unlock_next_lesson();

-- ─── TRIGGER 4: Unlock first lesson on enrollment activation ──
-- When enrollment.status becomes 'active', unlock the first lesson
-- of the first module of that course for that student.

create or replace function public.unlock_first_lesson_on_enroll()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_lesson lessons%rowtype;
begin
  -- Only when status changes TO active
  if new.status <> 'active' or old.status = 'active' then
    return new;
  end if;

  -- Find first lesson of first module
  select l.* into v_first_lesson
  from public.lessons l
  join public.modules m on m.id = l.module_id
  where m.course_id = new.course_id
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

create trigger on_enrollment_activated
  after update on public.enrollments
  for each row
  execute function public.unlock_first_lesson_on_enroll();
