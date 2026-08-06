-- ============================================================
-- Migration 0026: Mentorship booking/application notification triggers
-- Run AFTER 0025.
-- ============================================================
-- Mirrors migration 0015's pattern for enrollments: a status change on
-- mentorship_bookings or mentor_applications produces an in-app notification
-- via the existing public.create_notification() helper. No notification is
-- possible for a submission that was never matched to an account.

create or replace function public.notify_booking_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type  text;
  v_title text;
  v_body  text;
begin
  if new.status = old.status then
    return new;
  end if;
  if new.student_id is null then
    return new;
  end if;

  if new.status = 'confirmed' then
    v_type  := 'booking_confirmed';
    v_title := 'Booking confirmed';
    v_body  := 'Your session with ' || new.mentor_name || ' is confirmed.';
  elsif new.status = 'cancelled' then
    v_type  := 'booking_cancelled';
    v_title := 'Booking cancelled';
    v_body  := coalesce(new.cancellation_reason, 'Your session request could not be confirmed.');
  else
    return new;
  end if;

  perform public.create_notification(new.student_id, v_type, v_title, v_body, '/dashboard/sessions');
  return new;
end;
$$;

drop trigger if exists on_booking_status_notify on public.mentorship_bookings;

create trigger on_booking_status_notify
  after update on public.mentorship_bookings
  for each row
  execute function public.notify_booking_status_change();

create or replace function public.notify_application_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type  text;
  v_title text;
  v_body  text;
begin
  if new.status = old.status then
    return new;
  end if;
  if new.applicant_id is null then
    return new;
  end if;

  if new.status = 'approved' then
    v_type  := 'application_approved';
    v_title := 'Mentor application approved';
    v_body  := 'Your application to become a PZ Academy mentor has been approved.';
  elsif new.status = 'rejected' then
    v_type  := 'application_rejected';
    v_title := 'Mentor application update';
    v_body  := coalesce(new.rejection_reason, 'Your mentor application was not approved this time.');
  else
    return new;
  end if;

  perform public.create_notification(new.applicant_id, v_type, v_title, v_body, '/dashboard/mentor-application');
  return new;
end;
$$;

drop trigger if exists on_application_status_notify on public.mentor_applications;

create trigger on_application_status_notify
  after update on public.mentor_applications
  for each row
  execute function public.notify_application_status_change();
