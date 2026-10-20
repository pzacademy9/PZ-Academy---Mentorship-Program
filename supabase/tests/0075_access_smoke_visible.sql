-- 0075_access_smoke_visible.sql (same checks; results show as a table because the editor hides notices)
-- Owner runs this in the Supabase SQL editor AFTER migration 0075. Read the notices.
-- Everything happens inside a transaction that is rolled back: no data is left behind.
-- Needs one course with at least 2 modules and one profile that is not enrolled in it.

create temp table smoke_out(msg text) on commit drop;

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
  insert into smoke_out(msg) values (format('[%s] portal_open=false -> module A closed (got %s)', case when r = false then 'PASS' else 'FAIL' end, r));

  select count(*) into v_rows from public.lesson_progress where student_id = v_student;
  insert into smoke_out(msg) values (format('[%s] closed portal unlocked no lessons (progress rows: %s)', case when v_rows = 0 then 'PASS' else 'FAIL' end, v_rows));

  -- Open the portal: whole course, so both modules are open; the trigger unlocks a first lesson
  update public.enrollments set portal_open = true where id = v_enr;
  r := public._module_open_for(v_student, v_mod_a);
  insert into smoke_out(msg) values (format('[%s] portal_open=true, no module rows -> module A open (got %s)', case when r then 'PASS' else 'FAIL' end, r));
  r := public._module_open_for(v_student, v_mod_b);
  insert into smoke_out(msg) values (format('[%s] portal_open=true, no module rows -> module B open (got %s)', case when r then 'PASS' else 'FAIL' end, r));

  select count(*) into v_rows from public.lesson_progress where student_id = v_student and status = 'unlocked';
  insert into smoke_out(msg) values (format('[%s] opening the portal unlocked a first lesson (unlocked rows: %s; 0 is only OK if the course has no lessons)', case when v_rows >= 1 then 'PASS' else 'CHECK' end, v_rows));

  -- Limit the enrollment to module A only
  insert into public.enrollment_modules (enrollment_id, module_id) values (v_enr, v_mod_a);
  r := public._module_open_for(v_student, v_mod_a);
  insert into smoke_out(msg) values (format('[%s] module-limited -> module A open (got %s)', case when r then 'PASS' else 'FAIL' end, r));
  r := public._module_open_for(v_student, v_mod_b);
  insert into smoke_out(msg) values (format('[%s] module-limited -> module B closed (got %s)', case when r = false then 'PASS' else 'FAIL' end, r));

  -- A status other than active closes everything
  update public.enrollments set status = 'expired' where id = v_enr;
  r := public._module_open_for(v_student, v_mod_a);
  insert into smoke_out(msg) values (format('[%s] expired -> module A closed (got %s)', case when r = false then 'PASS' else 'FAIL' end, r));
end $$;

-- Module rows written BEFORE the portal opens: the first unlocked lesson must be in the allowed
-- module (the second one, so a wrong "module 1" unlock would be caught).
do $$
declare
  v_course  uuid;
  v_mod_b   uuid;
  v_student uuid;
  v_enr     uuid;
  v_bad     int;
  v_good    int;
begin
  select m.course_id into v_course
    from public.modules m
   where exists (select 1 from public.lessons l where l.module_id = m.id)
   group by m.course_id
  having count(*) >= 2 limit 1;
  if v_course is null then
    insert into smoke_out(msg) values (format('[SKIP] no course with 2+ modules that have lessons'));
    return;
  end if;

  select m.id into v_mod_b from public.modules m
   where m.course_id = v_course and exists (select 1 from public.lessons l where l.module_id = m.id)
   order by m.order_index desc, m.id limit 1;

  select p.id into v_student from public.profiles p
   where not exists (select 1 from public.enrollments e where e.student_id = p.id and e.course_id = v_course)
   limit 1;
  if v_student is null then
    insert into smoke_out(msg) values (format('[SKIP] no unenrolled profile for that course'));
    return;
  end if;

  insert into public.enrollments (student_id, course_id, status, portal_open)
  values (v_student, v_course, 'pending', false) returning id into v_enr;
  insert into public.enrollment_modules (enrollment_id, module_id) values (v_enr, v_mod_b);

  update public.enrollments set status = 'active', portal_open = true where id = v_enr;

  select count(*) filter (where l.module_id = v_mod_b),
         count(*) filter (where l.module_id <> v_mod_b)
    into v_good, v_bad
    from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id
   where lp.student_id = v_student and lp.status = 'unlocked';
  insert into smoke_out(msg) values (format('[%s] module rows first: unlocked lesson is in the allowed module (allowed: %s, other: %s)',
    case when v_good = 1 and v_bad = 0 then 'PASS' else 'FAIL' end, v_good, v_bad));
end $$;

do $$
begin
  raise exception E'RESULTS (this error is expected, it undoes the test data):
%', (select string_agg(msg, E'
') from smoke_out);
end $$;
