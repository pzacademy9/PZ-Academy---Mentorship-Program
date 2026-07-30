-- ============================================================
-- Migration 0016: Sheet sync columns + sheet_leads
-- Run AFTER 0015. SQL Editor → New query → Run
-- ============================================================

alter table public.courses
  add column sheet_id text;

alter table public.enrollments
  add column payment_shortfall_pkr numeric,
  add column sheet_pending_status public.enrollment_status,
  add column sheet_pending_note text;

create table public.sheet_leads (
  id                     uuid primary key default gen_random_uuid(),
  sheet_id               text not null,
  course_id              uuid not null references public.courses(id),
  row_email              text not null,
  row_name               text,
  row_phone              text,
  payment_confirmation   text not null,
  payment_amount_pkr     numeric,
  raw_row                jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  resolved_at            timestamptz,
  resolved_enrollment_id uuid references public.enrollments(id)
);

alter table public.sheet_leads enable row level security;

create policy "sheet_leads: admin reads"
  on public.sheet_leads
  for select
  using (public.get_my_role() in ('admin', 'super_admin'));

create index sheet_leads_email_idx on public.sheet_leads (row_email) where resolved_at is null;
