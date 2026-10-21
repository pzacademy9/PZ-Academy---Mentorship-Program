-- 0079_landing_list_actions.sql
-- Registrations list actions: four "sent again" email kinds and the sheet_details job type.
-- The owner pastes this into the Supabase SQL editor. Safe to run twice.

alter table public.landing_email_log drop constraint if exists landing_email_log_kind_check;
alter table public.landing_email_log
  add constraint landing_email_log_kind_check check (kind in
    ('paid', 'underpaid', 'reserved', 'portal_link',
     'manual_received', 'manual_paid', 'manual_underpaid', 'manual_reserved'));

alter table public.landing_jobs drop constraint if exists landing_jobs_type_check;
alter table public.landing_jobs
  add constraint landing_jobs_type_check check (type in
    ('sheet_append', 'email_received', 'email_members', 'email_admin', 'sheet_status',
     'enrollment_sync', 'email_status', 'sheet_details'));
