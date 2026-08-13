-- ============================================================
-- Migration 0032: book_mentorship_sessions fixes (final review, subsystem C)
-- Run AFTER 0031. SQL Editor → New query → Run
-- ============================================================
-- Two fixes to book_mentorship_sessions (0031), same signature
-- (p_booking_id uuid, p_slots timestamptz[]) returns integer, same
-- security definer / search_path — this is `create or replace`, not a new
-- function, so the existing grant/revoke from 0031 still applies unchanged
-- and does not need to be repeated here:
--
--   grant execute on function public.book_mentorship_sessions(uuid, timestamptz[]) to authenticated;
--   revoke execute on function public.book_mentorship_sessions(uuid, timestamptz[]) from public, anon;
--
-- 1. `select ... into v_booking` now takes `for update`, locking the booking
--    row so two racing calls for the same booking are serialized before the
--    sessions_total-freeze check that follows it.
-- 2. A new guard immediately after the "booking is not confirmed" check:
--    if the booking already has any non-cancelled session, refuse to create
--    more. Mirrors createSessionForBooking's "already-scheduled" refusal on
--    the admin path (Task 7) — without this, a student could call
--    /api/sessions/book repeatedly against their own already-fully-booked
--    confirmed booking and mint unlimited extra confirmed sessions.
--
-- Every other line of the function body (sessions_total resolution/freeze
-- fallback, slot-count check, lead-time check, insert loop, unique_violation
-- handler) is unchanged from 0031.

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
  where id = p_booking_id and student_id = auth.uid()
  for update;

  if v_booking.id is null then
    raise exception 'booking not found or not yours';
  end if;

  if v_booking.status <> 'confirmed' then
    raise exception 'booking is not confirmed';
  end if;

  if exists (
    select 1 from public.sessions
    where booking_id = p_booking_id and status <> 'cancelled'
  ) then
    raise exception 'sessions already scheduled for this booking';
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
