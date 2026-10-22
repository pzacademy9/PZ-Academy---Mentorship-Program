-- 0080_meta_purchase.sql
-- Meta Purchase (Conversions API): once-per-registration guard table and the meta_purchase job type.
-- The owner pastes this into the Supabase SQL editor. Safe to run twice.

create table if not exists public.landing_meta_events (
  registration_id uuid primary key references public.landing_registrations(id) on delete cascade,
  event_id        text not null,
  state           text not null check (state in ('claimed', 'sent', 'skipped_old')),
  value           numeric(12,2),
  currency        text,
  detail          text not null default '',
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
alter table public.landing_meta_events enable row level security; -- zero policies = service role only

alter table public.landing_jobs drop constraint if exists landing_jobs_type_check;
alter table public.landing_jobs
  add constraint landing_jobs_type_check check (type in
    ('sheet_append', 'email_received', 'email_members', 'email_admin', 'sheet_status',
     'enrollment_sync', 'email_status', 'sheet_details', 'meta_purchase'));
