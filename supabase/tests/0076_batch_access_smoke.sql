-- 0076_batch_access_smoke.sql
-- Owner runs this in the Supabase SQL editor AFTER migration 0076. The result shows as one
-- red error box listing every check; that error is expected and undoes all test data.
-- Needs one course with at least 2 modules and one profile that is not enrolled in it.

create temp table smoke_out(msg text) on commit drop;

do $$
declare
  v_course  uuid;
  v_mod_a   uuid;
  v_mod_b   uuid;
  v_student uuid;
  v_enr     uuid;
  v_before  int;
  v_after   int;
  r1        boolean;
  r2        boolean;
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

  -- 1. Live whole-course enrollment, no open rows: every module closed
  insert into public.enrollments (student_id, course_id, status, portal_open, access_level)
  values (v_student, v_course, 'active', true, 'live') returning id into v_enr;
  r1 := public._module_open_for(v_student, v_mod_a);
  r2 := public._module_open_for(v_student, v_mod_b);
  insert into smoke_out(msg) values (format('[%s] live, no open rows -> A closed, B closed (A=%s, B=%s)',
    case when r1 = false and r2 = false then 'PASS' else 'FAIL' end, r1, r2));

  -- 2. One open row for module A: A open, B closed
  insert into public.enrollment_open_modules (enrollment_id, module_id) values (v_enr, v_mod_a);
  r1 := public._module_open_for(v_student, v_mod_a);
  r2 := public._module_open_for(v_student, v_mod_b);
  insert into smoke_out(msg) values (format('[%s] live, open row for A -> A open, B closed (A=%s, B=%s)',
    case when r1 and r2 = false then 'PASS' else 'FAIL' end, r1, r2));

  -- 3. Recorded enrollment with no open rows: all open
  delete from public.enrollment_open_modules where enrollment_id = v_enr;
  update public.enrollments set access_level = 'recorded' where id = v_enr;
  r1 := public._module_open_for(v_student, v_mod_a);
  r2 := public._module_open_for(v_student, v_mod_b);
  insert into smoke_out(msg) values (format('[%s] recorded, no open rows -> A open, B open (A=%s, B=%s)',
    case when r1 and r2 then 'PASS' else 'FAIL' end, r1, r2));

  -- 3b. Legacy enrollment (null access_level): all open, exactly as before
  update public.enrollments set access_level = null where id = v_enr;
  r1 := public._module_open_for(v_student, v_mod_a);
  r2 := public._module_open_for(v_student, v_mod_b);
  insert into smoke_out(msg) values (format('[%s] null access_level, no open rows -> A open, B open (A=%s, B=%s)',
    case when r1 and r2 then 'PASS' else 'FAIL' end, r1, r2));

  -- 4a. The backfill statement, run for this one Live enrollment, keeps its modules open
  update public.enrollments set access_level = 'live' where id = v_enr;
  insert into public.enrollment_open_modules (enrollment_id, module_id)
  select e.id, m.id
    from public.enrollments e
    join public.modules m on m.course_id = e.course_id
   where e.id = v_enr
     and e.access_level = 'live'
     and e.portal_open
     and (
       not exists (select 1 from public.enrollment_modules em where em.enrollment_id = e.id)
       or exists (select 1 from public.enrollment_modules em where em.enrollment_id = e.id and em.module_id = m.id)
     )
  on conflict do nothing;
  r1 := public._module_open_for(v_student, v_mod_a);
  r2 := public._module_open_for(v_student, v_mod_b);
  insert into smoke_out(msg) values (format('[%s] backfill statement on a live enrollment -> A open, B open (A=%s, B=%s)',
    case when r1 and r2 then 'PASS' else 'FAIL' end, r1, r2));

  -- 5. portal_open flip false -> true inserts exactly one notification
  select count(*) into v_before from public.notifications where user_id = v_student and type = 'portal_open';
  update public.enrollments set portal_open = false where id = v_enr;
  select count(*) into v_after from public.notifications where user_id = v_student and type = 'portal_open';
  insert into smoke_out(msg) values (format('[%s] portal_open true -> false adds no notification (%s -> %s)',
    case when v_after = v_before then 'PASS' else 'FAIL' end, v_before, v_after));
  update public.enrollments set portal_open = true where id = v_enr;
  select count(*) into v_after from public.notifications where user_id = v_student and type = 'portal_open';
  insert into smoke_out(msg) values (format('[%s] portal_open false -> true adds exactly one notification (%s -> %s)',
    case when v_after = v_before + 1 then 'PASS' else 'FAIL' end, v_before, v_after));
end $$;

-- 5b. Opening a module later unlocks its first lesson; no unlock while the portal is closed;
-- pending -> active together with portal_open gives one "approved" bell and no portal_open bell.
do $$
declare
  v_course  uuid;
  v_mod_b   uuid;
  v_first_b uuid;
  v_student uuid;
  v_enr     uuid;
  v_n       int;
  v_appr0   int;
  v_appr1   int;
  v_po0     int;
  v_po1     int;
begin
  select m.course_id into v_course
    from public.modules m
   where exists (select 1 from public.lessons l where l.module_id = m.id)
   group by m.course_id
  having count(*) >= 2 limit 1;
  if v_course is null then
    insert into smoke_out(msg) values ('[SKIP] no course with 2+ modules that have lessons (module-open unlock cases)');
    return;
  end if;
  select m.id into v_mod_b from public.modules m
   where m.course_id = v_course and exists (select 1 from public.lessons l where l.module_id = m.id)
   order by m.order_index desc, m.id limit 1;
  select l.id into v_first_b from public.lessons l where l.module_id = v_mod_b order by l.order_index asc, l.id limit 1;

  select p.id into v_student from public.profiles p
   where not exists (select 1 from public.enrollments e where e.student_id = p.id and e.course_id = v_course)
   limit 1;
  if v_student is null then
    insert into smoke_out(msg) values ('[SKIP] no unenrolled profile (module-open unlock cases)');
    return;
  end if;

  -- portal closed: opening module B unlocks nothing
  insert into public.enrollments (student_id, course_id, status, portal_open, access_level)
  values (v_student, v_course, 'active', false, 'live') returning id into v_enr;
  insert into public.enrollment_open_modules (enrollment_id, module_id) values (v_enr, v_mod_b);
  select count(*) into v_n from public.lesson_progress where student_id = v_student and lesson_id = v_first_b and status = 'unlocked';
  insert into smoke_out(msg) values (format('[%s] portal_open=false, open row for B -> B first lesson stays locked (unlocked rows: %s)',
    case when v_n = 0 then 'PASS' else 'FAIL' end, v_n));

  -- portal open, then B opened later: B's first lesson unlocks
  update public.enrollments set portal_open = true where id = v_enr;
  delete from public.lesson_progress where student_id = v_student;
  delete from public.enrollment_open_modules where enrollment_id = v_enr;
  insert into public.enrollment_open_modules (enrollment_id, module_id) values (v_enr, v_mod_b);
  select count(*) into v_n from public.lesson_progress where student_id = v_student and lesson_id = v_first_b and status = 'unlocked';
  insert into smoke_out(msg) values (format('[%s] live active + portal open, open row for B inserted later -> B first lesson unlocked (unlocked rows: %s)',
    case when v_n = 1 then 'PASS' else 'FAIL' end, v_n));

  -- pending -> active together with portal_open = true: one approved bell, no portal_open bell
  delete from public.enrollments where id = v_enr;
  insert into public.enrollments (student_id, course_id, status, portal_open, access_level)
  values (v_student, v_course, 'pending', false, 'live') returning id into v_enr;
  select count(*) into v_appr0 from public.notifications where user_id = v_student and type = 'enrollment_approved';
  select count(*) into v_po0   from public.notifications where user_id = v_student and type = 'portal_open';
  update public.enrollments set status = 'active', portal_open = true where id = v_enr;
  select count(*) into v_appr1 from public.notifications where user_id = v_student and type = 'enrollment_approved';
  select count(*) into v_po1   from public.notifications where user_id = v_student and type = 'portal_open';
  insert into smoke_out(msg) values (format('[%s] pending -> active with portal_open=true -> one enrollment_approved (%s -> %s), no portal_open bell (%s -> %s)',
    case when v_appr1 = v_appr0 + 1 and v_po1 = v_po0 then 'PASS' else 'FAIL' end, v_appr0, v_appr1, v_po0, v_po1));
end $$;

-- 6. Email log: a status kind cannot repeat, portal_link can
do $$
declare
  v_reg  uuid;
  v_dup  boolean := false;
  v_two  boolean := true;
begin
  select r.id into v_reg from public.landing_registrations r
   where not exists (select 1 from public.landing_email_log l where l.registration_id = r.id and l.kind in ('paid', 'portal_link'))
   limit 1;
  if v_reg is null then
    insert into smoke_out(msg) values ('[SKIP] no registration without paid/portal_link email rows');
    return;
  end if;

  insert into public.landing_email_log (registration_id, kind, to_email) values (v_reg, 'paid', 'smoke@example.invalid');
  begin
    insert into public.landing_email_log (registration_id, kind, to_email) values (v_reg, 'paid', 'smoke@example.invalid');
  exception when unique_violation then
    v_dup := true;
  end;
  insert into smoke_out(msg) values (format('[%s] second (registration, paid) row is rejected (rejected=%s)',
    case when v_dup then 'PASS' else 'FAIL' end, v_dup));

  begin
    insert into public.landing_email_log (registration_id, kind, to_email) values (v_reg, 'portal_link', 'smoke@example.invalid');
    insert into public.landing_email_log (registration_id, kind, to_email) values (v_reg, 'portal_link', 'smoke@example.invalid');
  exception when unique_violation then
    v_two := false;
  end;
  insert into smoke_out(msg) values (format('[%s] two portal_link rows for one registration both insert (ok=%s)',
    case when v_two then 'PASS' else 'FAIL' end, v_two));
end $$;

-- 7. Real data: every existing open Live enrollment still has its covered modules open
do $$
declare
  v_live int;
  v_bad  int;
begin
  select count(*) into v_live from public.enrollments where access_level = 'live' and portal_open and status = 'active';
  select count(*) into v_bad
    from public.enrollments e
    join public.modules m on m.course_id = e.course_id
   where e.access_level = 'live' and e.portal_open and e.status = 'active'
     and (
       not exists (select 1 from public.enrollment_modules em where em.enrollment_id = e.id)
       or exists (select 1 from public.enrollment_modules em where em.enrollment_id = e.id and em.module_id = m.id)
     )
     and not exists (select 1 from public.enrollment_open_modules eom where eom.enrollment_id = e.id and eom.module_id = m.id);
  insert into smoke_out(msg) values (format('[%s] existing live enrollments (%s) missing an open row for a covered module: %s (non-zero is only OK if a Live enrollment was created after the migration and its batch is not finished)',
    case when v_bad = 0 then 'PASS' else 'CHECK' end, v_live, v_bad));
end $$;

do $$
begin
  raise exception E'RESULTS (this error is expected, it undoes the test data):
%', (select string_agg(msg, E'
') from smoke_out);
end $$;
