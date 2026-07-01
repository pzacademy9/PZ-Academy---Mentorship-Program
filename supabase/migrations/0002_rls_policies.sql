-- ============================================================
-- Migration 0002: RLS Policies
-- Run AFTER 0001. SQL Editor → New query → Run
-- ============================================================

-- ─── HELPER: get current user role ───────────────────────────

create or replace function public.get_my_role()
returns public.user_role
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ─── ENABLE RLS ON ALL TABLES ────────────────────────────────

alter table public.profiles           enable row level security;
alter table public.courses            enable row level security;
alter table public.modules            enable row level security;
alter table public.lessons            enable row level security;
alter table public.lesson_progress    enable row level security;
alter table public.enrollments        enable row level security;
alter table public.sessions           enable row level security;
alter table public.banners            enable row level security;
alter table public.featured_items     enable row level security;
alter table public.mentors            enable row level security;
alter table public.webinars           enable row level security;
alter table public.attendance         enable row level security;
alter table public.notifications      enable row level security;
alter table public.certificates       enable row level security;
alter table public.gas_sync_log       enable row level security;
alter table public.event_registrations enable row level security;

-- ─── PROFILES ────────────────────────────────────────────────

create policy "profiles: own row read"
  on public.profiles for select
  using (id = auth.uid() or get_my_role() in ('admin', 'super_admin'));

create policy "profiles: own row update"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles: admin insert"
  on public.profiles for insert
  with check (get_my_role() in ('admin', 'super_admin'));

-- ─── COURSES ─────────────────────────────────────────────────

create policy "courses: public read published"
  on public.courses for select
  using (is_published = true or get_my_role() in ('admin', 'super_admin'));

create policy "courses: super_admin write"
  on public.courses for all
  using (get_my_role() = 'super_admin')
  with check (get_my_role() = 'super_admin');

-- ─── MODULES ─────────────────────────────────────────────────

create policy "modules: read if course published or admin"
  on public.modules for select
  using (
    exists (
      select 1 from public.courses c
      where c.id = course_id
        and (c.is_published = true or get_my_role() in ('admin', 'super_admin'))
    )
  );

create policy "modules: super_admin write"
  on public.modules for all
  using (get_my_role() = 'super_admin')
  with check (get_my_role() = 'super_admin');

-- ─── LESSONS ─────────────────────────────────────────────────

create policy "lessons: read if enrolled or admin"
  on public.lessons for select
  using (
    get_my_role() in ('admin', 'super_admin')
    or exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      join public.enrollments e on e.course_id = c.id
      where m.id = module_id
        and e.student_id = auth.uid()
        and e.status = 'active'
    )
  );

create policy "lessons: super_admin write"
  on public.lessons for all
  using (get_my_role() = 'super_admin')
  with check (get_my_role() = 'super_admin');

-- ─── LESSON PROGRESS ─────────────────────────────────────────

create policy "lesson_progress: student own"
  on public.lesson_progress for select
  using (student_id = auth.uid() or get_my_role() in ('admin', 'super_admin'));

create policy "lesson_progress: student write own"
  on public.lesson_progress for insert
  with check (student_id = auth.uid());

create policy "lesson_progress: student update own"
  on public.lesson_progress for update
  using (student_id = auth.uid());

-- ─── ENROLLMENTS ─────────────────────────────────────────────

create policy "enrollments: student own"
  on public.enrollments for select
  using (student_id = auth.uid() or get_my_role() in ('admin', 'super_admin'));

create policy "enrollments: student insert"
  on public.enrollments for insert
  with check (student_id = auth.uid());

create policy "enrollments: admin update"
  on public.enrollments for update
  using (get_my_role() in ('admin', 'super_admin'));

-- ─── SESSIONS ────────────────────────────────────────────────

create policy "sessions: student own or mentor own or admin"
  on public.sessions for select
  using (
    student_id = auth.uid()
    or mentor_id = auth.uid()
    or get_my_role() in ('admin', 'super_admin')
  );

create policy "sessions: student insert"
  on public.sessions for insert
  with check (student_id = auth.uid());

create policy "sessions: mentor or admin update"
  on public.sessions for update
  using (mentor_id = auth.uid() or get_my_role() in ('admin', 'super_admin'));

-- ─── BANNERS ─────────────────────────────────────────────────

create policy "banners: public read active"
  on public.banners for select
  using (
    is_active = true
    and (active_from is null or active_from <= now())
    and (active_until is null or active_until >= now())
    or get_my_role() in ('admin', 'super_admin')
  );

create policy "banners: admin write"
  on public.banners for all
  using (get_my_role() in ('admin', 'super_admin'))
  with check (get_my_role() in ('admin', 'super_admin'));

-- ─── FEATURED ITEMS ──────────────────────────────────────────

create policy "featured_items: public read"
  on public.featured_items for select
  using (is_featured = true or get_my_role() in ('admin', 'super_admin'));

create policy "featured_items: admin write"
  on public.featured_items for all
  using (get_my_role() in ('admin', 'super_admin'))
  with check (get_my_role() in ('admin', 'super_admin'));

-- ─── MENTORS ─────────────────────────────────────────────────

create policy "mentors: public read active"
  on public.mentors for select
  using (is_active = true or get_my_role() in ('admin', 'super_admin'));

create policy "mentors: mentor update own"
  on public.mentors for update
  using (profile_id = auth.uid() or get_my_role() in ('admin', 'super_admin'));

create policy "mentors: admin write"
  on public.mentors for insert
  with check (get_my_role() in ('admin', 'super_admin'));

-- ─── WEBINARS ────────────────────────────────────────────────

create policy "webinars: public read"
  on public.webinars for select
  using (true);

create policy "webinars: admin write"
  on public.webinars for all
  using (get_my_role() in ('admin', 'super_admin'))
  with check (get_my_role() in ('admin', 'super_admin'));

-- ─── ATTENDANCE ───────────────────────────────────────────────

create policy "attendance: student own or admin"
  on public.attendance for select
  using (student_id = auth.uid() or get_my_role() in ('admin', 'super_admin'));

create policy "attendance: admin write"
  on public.attendance for insert
  with check (get_my_role() in ('admin', 'super_admin'));

-- ─── NOTIFICATIONS ───────────────────────────────────────────

create policy "notifications: own"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "notifications: own update"
  on public.notifications for update
  using (user_id = auth.uid());

-- ─── CERTIFICATES ────────────────────────────────────────────

create policy "certificates: student own or admin"
  on public.certificates for select
  using (student_id = auth.uid() or get_my_role() in ('admin', 'super_admin'));

create policy "certificates: admin write"
  on public.certificates for all
  using (get_my_role() in ('admin', 'super_admin'))
  with check (get_my_role() in ('admin', 'super_admin'));

-- ─── GAS SYNC LOG ────────────────────────────────────────────

create policy "gas_sync_log: admin read"
  on public.gas_sync_log for select
  using (get_my_role() in ('admin', 'super_admin'));

-- ─── EVENT REGISTRATIONS ─────────────────────────────────────

create policy "event_registrations: admin read"
  on public.event_registrations for select
  using (get_my_role() in ('admin', 'super_admin'));
