-- 0075_access_smoke.sql
-- Owner runs this in the Supabase SQL editor AFTER migration 0075. Read the notices.
-- Everything happens inside a transaction that is rolled back: no data is left behind.
-- Needs one course with at least 2 modules and one profile that is not enrolled in it.

begin;

do $$
declare
  v_course  uuid;
  v_mod_a   uuid;
  v_mod_b   uuid;
  v_student uuid;
  v_enr     uuid;
  v_rows    int;
  r         boolean;
begin
  select m.course_id into v_course
    from public.modules m group by m.course_id having count(*) >= 2 limit 1;
  if v_course is null then raise exception 'SETUP: no course with 2+ modules'; end if;

  select id into v_mod_a from public.modules where course_id = v_course order by order_index, id limit 1;
  select id into v_mod_b from public.modules where course_id = v_course and id <> v_mod_a order by order_index, id limit 1;

  select p.id into v_student from public.profiles p
   where not exists (select 1 from public.enrollments e where e.student_id = p.id and e.course_id = v_course)
   limit 1;
  if v_student is null then raise exception 'SETUP: no unenrolled profile for that course'; end if;

  -- Active enrollment but portal closed (this also exercises the INSERT trigger path)
  insert into public.enrollments (student_id, course_id, status, portal_open)
  values (v_student, v_course, 'active', false) returning id into v_enr;

  r := public._module_open_for(v_student, v_mod_a);
  raise notice '[%] portal_open=false -> module A closed (got %)', case when r = false then 'PASS' else 'FAIL' end, r;

  select count(*) into v_rows from public.lesson_progress where student_id = v_student;
  raise notice '[%] closed portal unlocked no lessons (progress rows: %)', case when v_rows = 0 then 'PASS' else 'FAIL' end, v_rows;

  -- Open the portal: whole course, so both modules are open; the trigger unlocks a first lesson
  update public.enrollments set portal_open = true where id = v_enr;
  r := public._module_open_for(v_student, v_mod_a);
  raise notice '[%] portal_open=true, no module rows -> module A open (got %)', case when r then 'PASS' else 'FAIL' end, r;
  r := public._module_open_for(v_student, v_mod_b);
  raise notice '[%] portal_open=true, no module rows -> module B open (got %)', case when r then 'PASS' else 'FAIL' end, r;

  select count(*) into v_rows from public.lesson_progress where student_id = v_student and status = 'unlocked';
  raise notice '[%] opening the portal unlocked a first lesson (unlocked rows: %; 0 is only OK if the course has no lessons)', case when v_rows >= 1 then 'PASS' else 'CHECK' end, v_rows;

  -- Limit the enrollment to module A only
  insert into public.enrollment_modules (enrollment_id, module_id) values (v_enr, v_mod_a);
  r := public._module_open_for(v_student, v_mod_a);
  raise notice '[%] module-limited -> module A open (got %)', case when r then 'PASS' else 'FAIL' end, r;
  r := public._module_open_for(v_student, v_mod_b);
  raise notice '[%] module-limited -> module B closed (got %)', case when r = false then 'PASS' else 'FAIL' end, r;

  -- A status other than active closes everything
  update public.enrollments set status = 'expired' where id = v_enr;
  r := public._module_open_for(v_student, v_mod_a);
  raise notice '[%] expired -> module A closed (got %)', case when r = false then 'PASS' else 'FAIL' end, r;
end $$;

rollback;
