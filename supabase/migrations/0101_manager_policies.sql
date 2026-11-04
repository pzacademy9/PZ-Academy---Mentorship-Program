-- Migration 0101: let the manager role use the pages in its areas.
-- Run AFTER 0099 (adds the role) and 0100 (the team table) have both been run.
--
-- Why this exists: some admin pages read these tables with the signed-in person's own
-- access (not the server key), and today those database rules only name admin and
-- super admin. Each rule below keeps its exact existing condition and adds the manager
-- role. Checked against the live database on 2026-11-04 (pg_policies).
--
-- What a manager gets, and why:
--   enrollments  read + update   Registrations / enrollments area (approve payments)
--   profiles     read            Students area (names shown next to enrollments)
--   courses      read            see draft programs in Programs and on enrollments
--   mentors      read            Mentorship area shows mentor names (no write: no Mentors area)
--   sessions     read + update   Mentorship area (booked sessions)
-- Nothing is dropped or created. Managers get no write on mentors, no insert on profiles,
-- and nothing in the settings areas (payment accounts, sheet sync, terms, team).

alter policy "enrollments: admin update" on public.enrollments
  using (get_my_role() = any (array['admin'::user_role, 'super_admin'::user_role, 'manager'::user_role]));

alter policy "enrollments: student own" on public.enrollments
  using ((student_id = auth.uid()) or (get_my_role() = any (array['admin'::user_role, 'super_admin'::user_role, 'manager'::user_role])));

alter policy "profiles: own row read" on public.profiles
  using ((id = auth.uid()) or (get_my_role() = any (array['admin'::user_role, 'super_admin'::user_role, 'manager'::user_role])));

alter policy "courses: public read published" on public.courses
  using ((is_published = true) or (get_my_role() = any (array['admin'::user_role, 'super_admin'::user_role, 'manager'::user_role])));

alter policy "mentors: public read published" on public.mentors
  using ((visibility = 'published'::mentor_visibility) or (get_my_role() = any (array['admin'::user_role, 'super_admin'::user_role, 'manager'::user_role])));

alter policy "sessions: mentor or admin update" on public.sessions
  using ((mentor_id = auth.uid()) or (get_my_role() = any (array['admin'::user_role, 'super_admin'::user_role, 'manager'::user_role])));

alter policy "sessions: student own or mentor own or admin" on public.sessions
  using ((student_id = auth.uid()) or (mentor_id = auth.uid()) or (get_my_role() = any (array['admin'::user_role, 'super_admin'::user_role, 'manager'::user_role])));
