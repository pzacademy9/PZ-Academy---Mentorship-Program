-- ============================================================
-- Migration 0031: Mentorship session lifecycle (subsystem C)
-- Run AFTER 0030. SQL Editor → New query → Run
-- ============================================================
-- See docs/superpowers/specs/2026-08-12-mentorship-session-lifecycle-design.md.
-- Activates public.sessions (0001), unused until now. Two SECURITY DEFINER
-- RPCs, both with their revoke in THIS migration (not a follow-up fix, per
-- the footgun subsystem B hit): update_own_mentor_availability (mentor sets
-- their weekly pattern) and book_mentorship_sessions (student commits all
-- of a package's session slots in one atomic call).

-- ─── Schema ────────────────────────────────────────────────
alter table public.sessions
  add column booking_id uuid references public.mentorship_bookings(id) on delete set null;

alter table public.mentorship_bookings
  add column sessions_total integer;

-- Free-text lead_time ("24 hours") already exists for display; this is the
-- machine-usable counterpart for real slot-gating math. Not exposed to any
-- UI in this subsystem — fixed default only.
alter table public.mentors
  add column lead_time_hours integer not null default 24;

-- Prevents two students racing for the same mentor+time from both winning.
-- Partial (excludes cancelled) so a cancelled session frees the slot for
-- rebooking.
create unique index sessions_mentor_slot_unique
  on public.sessions (mentor_id, scheduled_at)
  where status <> 'cancelled';

-- ─── update_own_mentor_availability ───────────────────────
-- Mirrors update_own_mentor_profile's shape exactly: full-column-replace,
-- not a merge. p_weekly_ranges is a jsonb array of
-- {day: 0-6, start: "HH:MM", end: "HH:MM"}, wrapped into
-- {"weeklyRanges": [...]} on write so the stored shape is self-describing.
create or replace function public.update_own_mentor_availability(
  p_timezone      text,
  p_weekly_ranges jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.mentors
  set
    timezone         = p_timezone,
    availability_json = jsonb_build_object('weeklyRanges', coalesce(p_weekly_ranges, '[]'::jsonb))
  where profile_id = auth.uid();

  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

grant execute on function public.update_own_mentor_availability(text, jsonb) to authenticated;
revoke execute on function public.update_own_mentor_availability(text, jsonb) from public, anon;

-- ─── book_mentorship_sessions ─────────────────────────────
-- Caller must be the booking's own student. Resolves sessions_total (frozen
-- on the booking on first call, via the same package-name lookup the app
-- layer uses — see resolveSessionsTotal in session-slots.ts, kept in sync
-- manually since there is no shared-language procedure layer here) and
-- requires the submitted slot count to match exactly — the whole
-- "book all N sessions in one sitting" flow, not a partial book. All N
-- inserts happen in this one function invocation, so a unique-constraint
-- violation on any slot (sessions_mentor_slot_unique) aborts the entire
-- call — no partial booking of N-1 sessions.
create or replace function public.book_mentorship_sessions(
  p_booking_id uuid,
  p_slots      timestamptz[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking      record;
  v_mentor       record;
  v_target_count integer;
  v_slot         timestamptz;
  v_created      integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select id, student_id, mentor_slug, package_name, status, sessions_total
  into v_booking
  from public.mentorship_bookings
  where id = p_booking_id and student_id = auth.uid();

  if v_booking.id is null then
    raise exception 'booking not found or not yours';
  end if;

  if v_booking.status <> 'confirmed' then
    raise exception 'booking is not confirmed';
  end if;

  select id, profile_id, session_duration_minutes, lead_time_hours
  into v_mentor
  from public.mentors
  where slug = v_booking.mentor_slug;

  if v_mentor.id is null or v_mentor.profile_id is null then
    raise exception 'mentor is not linked to an account yet';
  end if;

  v_target_count := v_booking.sessions_total;
  if v_target_count is null then
    select coalesce((pkg->>'sessions')::integer, 1)
    into v_target_count
    from public.mentors m, jsonb_array_elements(m.packages) pkg
    where m.id = v_mentor.id and pkg->>'name' = v_booking.package_name
    limit 1;

    if v_target_count is null then
      v_target_count := 1;
    end if;

    update public.mentorship_bookings set sessions_total = v_target_count where id = p_booking_id;
  end if;

  if array_length(p_slots, 1) is distinct from v_target_count then
    raise exception 'expected % session slot(s), got %', v_target_count, coalesce(array_length(p_slots, 1), 0);
  end if;

  foreach v_slot in array p_slots loop
    if v_slot < now() + (v_mentor.lead_time_hours || ' hours')::interval then
      raise exception 'slot % is inside the mentor''s % hour lead time', v_slot, v_mentor.lead_time_hours;
    end if;

    insert into public.sessions (student_id, mentor_id, status, scheduled_at, duration_min, booking_id)
    values (auth.uid(), v_mentor.profile_id, 'confirmed', v_slot, v_mentor.session_duration_minutes, p_booking_id);

    v_created := v_created + 1;
  end loop;

  return v_created;
exception
  when unique_violation then
    raise exception 'one of the selected slots was just booked by someone else — please pick again';
end;
$$;

grant execute on function public.book_mentorship_sessions(uuid, timestamptz[]) to authenticated;
revoke execute on function public.book_mentorship_sessions(uuid, timestamptz[]) from public, anon;
