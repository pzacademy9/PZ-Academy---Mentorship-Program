-- 0119_portal_access.sql
--
-- Portal access. The owner pastes this WHOLE file into the Supabase SQL
-- editor and runs it once. It is safe to run again.
--
--   1. course_families: a small list of course names (for example "PPC")
--      that portals (courses) are grouped under. Service-role only: RLS is
--      on and there are no policies, so only the server can read or write it.
--   2. courses gets family_id (which group it belongs to) and batch_label
--      (for example "Batch 3"). Both are optional. Nothing is backfilled:
--      the admin sets the group and label by hand.
--   3. duplicate_course(source, title, family, batch_label): copies a course
--      as a NEW unpublished course with its modules, lectures, MCQs and
--      module notes. It copies no students, progress or quiz answers. One
--      call, one transaction: if anything fails, nothing is left behind.
--   4. move_batch_students(page, to_course, dry_run): moves the students of
--      ONE registration page into another course, mapping their opened
--      modules to the same-position module in the new course, and points
--      the page at the new course. With dry_run = true it only counts and
--      changes nothing. Lecture progress is not carried over.
--
-- Nothing here sends an email.

create table if not exists public.course_families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

alter table public.course_families enable row level security;

alter table public.courses
  add column if not exists family_id uuid references public.course_families(id) on delete set null;
alter table public.courses
  add column if not exists batch_label text;

create index if not exists courses_family_id_idx on public.courses (family_id);

-- ---------------------------------------------------------------------------
-- duplicate_course
-- ---------------------------------------------------------------------------
create or replace function public.duplicate_course(
  p_source      uuid,
  p_title       text,
  p_family      uuid,
  p_batch_label text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_base  text;
  v_slug  text;
  v_n     int := 1;
  v_new   uuid;
begin
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'A name is needed for the new portal';
  end if;
  if not exists (select 1 from public.courses where id = p_source) then
    raise exception 'The portal to copy was not found';
  end if;
  if p_family is not null
     and not exists (select 1 from public.course_families where id = p_family) then
    raise exception 'That group was not found';
  end if;

  -- slug from the title, then -2, -3 ... until it is free
  v_base := btrim(regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g'), '-');
  if v_base = '' then
    v_base := 'portal';
  end if;
  v_slug := v_base;
  loop
    exit when not exists (select 1 from public.courses where slug = v_slug);
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  -- the course itself: every content column except identity, slug, title,
  -- status, publishing, owner, group and the unique sync id
  insert into public.courses (
    slug, title, type, description, price_pkr, status, thumbnail_url,
    portal_url, is_published, tagline, banner_url, level, duration_weeks,
    features, outcomes, register_url, mentor_name, mentor_title, mentor_bio,
    mentor_avatar_url, faqs, duration_text, timings, public_video_url,
    page_sections, certificate_image_url, topic, starts_at,
    family_id, batch_label
  )
  select
    v_slug, v_title, c.type, c.description, c.price_pkr, 'draft', c.thumbnail_url,
    c.portal_url, false, c.tagline, c.banner_url, c.level, c.duration_weeks,
    c.features, c.outcomes, c.register_url, c.mentor_name, c.mentor_title, c.mentor_bio,
    c.mentor_avatar_url, c.faqs, c.duration_text, c.timings, c.public_video_url,
    c.page_sections, c.certificate_image_url, c.topic, c.starts_at,
    p_family, nullif(btrim(coalesce(p_batch_label, '')), '')
  from public.courses c
  where c.id = p_source
  returning id into v_new;

  -- old id -> new id maps, made up front so no row order is relied on
  drop table if exists pg_temp._dup_mod;
  create temp table _dup_mod on commit drop as
    select id as old_id, gen_random_uuid() as new_id
    from public.modules where course_id = p_source;

  drop table if exists pg_temp._dup_les;
  create temp table _dup_les on commit drop as
    select l.id as old_id, gen_random_uuid() as new_id
    from public.lessons l
    where l.module_id in (select old_id from _dup_mod);

  insert into public.modules (id, course_id, title, order_index)
  select mm.new_id, v_new, m.title, m.order_index
  from public.modules m
  join _dup_mod mm on mm.old_id = m.id;

  insert into public.module_notes (module_id, resource_urls, documents)
  select mm.new_id, n.resource_urls, n.documents
  from public.module_notes n
  join _dup_mod mm on mm.old_id = n.module_id;

  insert into public.lessons (
    id, module_id, title, content_type, video_url, video_url_2, text_content,
    pdf_url, pdf_file_id, resource_urls, documents, order_index
  )
  select
    ll.new_id, mm.new_id, l.title, l.content_type, l.video_url, l.video_url_2,
    l.text_content, l.pdf_url, l.pdf_file_id, l.resource_urls, l.documents,
    l.order_index
  from public.lessons l
  join _dup_les ll on ll.old_id = l.id
  join _dup_mod mm on mm.old_id = l.module_id;

  insert into public.quiz_questions (lesson_id, question, options, correct_index, order_index)
  select ll.new_id, q.question, q.options, q.correct_index, q.order_index
  from public.quiz_questions q
  join _dup_les ll on ll.old_id = q.lesson_id;

  return v_new;
end;
$$;

revoke all on function public.duplicate_course(uuid, text, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- move_batch_students
-- ---------------------------------------------------------------------------
create or replace function public.move_batch_students(
  p_page      uuid,
  p_to_course uuid,
  p_dry_run   boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old        uuid;
  v_to_move    int;
  v_already    int;
  v_unmatched  int;
  v_moved      int := 0;
begin
  select course_id into v_old from public.landing_pages where id = p_page;
  if not found then
    raise exception 'Registration page not found';
  end if;
  if v_old is null then
    raise exception 'This registration has no portal yet';
  end if;
  if v_old = p_to_course then
    raise exception 'This registration already uses that portal';
  end if;
  if not exists (select 1 from public.courses where id = p_to_course) then
    raise exception 'The new portal was not found';
  end if;
  if not exists (select 1 from public.modules where course_id = p_to_course) then
    raise exception 'The new portal has no modules yet';
  end if;

  -- same position (order_index, then id) in the old and the new course
  drop table if exists pg_temp._mv_map;
  create temp table _mv_map on commit drop as
    select o.id as old_id, n.id as new_id
    from (
      select id, row_number() over (order by order_index, id) as rk
      from public.modules where course_id = v_old
    ) o
    left join (
      select id, row_number() over (order by order_index, id) as rk
      from public.modules where course_id = p_to_course
    ) n on n.rk = o.rk;

  -- this page's students on the old course who are not yet in the new one
  drop table if exists pg_temp._mv_set;
  create temp table _mv_set on commit drop as
    select e.id
    from public.enrollments e
    where e.course_id = v_old
      and e.landing_registration_id in (
        select id from public.landing_registrations where page_id = p_page
      )
      and not exists (
        select 1 from public.enrollments t
        where t.student_id = e.student_id and t.course_id = p_to_course
      );

  select count(*) into v_to_move from _mv_set;

  -- already there: this page's students already on the new course, plus
  -- those left out because the student has a place in the new course
  select count(*) into v_already
  from public.enrollments e
  where e.landing_registration_id in (
          select id from public.landing_registrations where page_id = p_page
        )
    and (
      e.course_id = p_to_course
      or (e.course_id = v_old and e.id not in (select id from _mv_set))
    );

  select count(*) into v_unmatched from _mv_map where new_id is null;

  if not p_dry_run then
    -- open modules and chosen modules: old module -> matching new module
    insert into public.enrollment_open_modules (enrollment_id, module_id, opened_at)
    select o.enrollment_id, mp.new_id, o.opened_at
    from public.enrollment_open_modules o
    join _mv_map mp on mp.old_id = o.module_id and mp.new_id is not null
    where o.enrollment_id in (select id from _mv_set)
    on conflict do nothing;

    delete from public.enrollment_open_modules
    where enrollment_id in (select id from _mv_set)
      and module_id in (select old_id from _mv_map);

    insert into public.enrollment_modules (enrollment_id, module_id)
    select o.enrollment_id, mp.new_id
    from public.enrollment_modules o
    join _mv_map mp on mp.old_id = o.module_id and mp.new_id is not null
    where o.enrollment_id in (select id from _mv_set)
    on conflict do nothing;

    delete from public.enrollment_modules
    where enrollment_id in (select id from _mv_set)
      and module_id in (select old_id from _mv_map);

    -- the batch's finished-module marks follow the same map; marks on a
    -- module with no counterpart are dropped. A mark with no module (an old
    -- whole-course mark) is left alone.
    update public.landing_batch_state s
    set module_id = mp.new_id
    from _mv_map mp
    where s.page_id = p_page and s.module_id = mp.old_id and mp.new_id is not null;

    delete from public.landing_batch_state
    where page_id = p_page
      and module_id in (select old_id from _mv_map where new_id is null);

    update public.enrollments
    set course_id = p_to_course
    where id in (select id from _mv_set);
    get diagnostics v_moved = row_count;

    update public.landing_pages
    set course_id = p_to_course
    where id = p_page;
  end if;

  return jsonb_build_object(
    'to_move', v_to_move,
    'already_there', v_already,
    'unmatched_modules', v_unmatched,
    'moved', v_moved
  );
end;
$$;

revoke all on function public.move_batch_students(uuid, uuid, boolean) from public, anon, authenticated;
