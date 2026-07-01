-- ============================================================
-- Migration 0005: Email Metrics Table
-- Purpose: Stores Brevo webhook events (delivery, open, click, bounce, complaint)
-- ============================================================

-- Create email_metrics table
create table public.email_metrics (
  id                 uuid primary key default gen_random_uuid(),
  email_queue_id     uuid references public.email_queue(id) on delete set null,
  user_email         text not null,
  event_type         text not null,
  event_timestamp    timestamptz not null,
  brevo_message_id   text,
  ip_address         text,
  user_agent         text,
  bounce_type        text,
  complaint_type     text,
  created_at         timestamptz not null default now()
);

-- Enable RLS
alter table public.email_metrics enable row level security;

-- Create indexes
create index idx_email_metrics_user_email on public.email_metrics(user_email);
create index idx_email_metrics_event_type on public.email_metrics(event_type);
create index idx_email_metrics_email_queue_id on public.email_metrics(email_queue_id);
create index idx_email_metrics_brevo_message_id on public.email_metrics(brevo_message_id);

-- RLS Policies
-- Service role has full access
create policy "service_role_all_access" on public.email_metrics
  as permissive for all to service_role
  using (true);

-- Authenticated users can see their own metrics
create policy "users_see_own_metrics" on public.email_metrics
  as permissive for select to authenticated
  using (user_email = auth.jwt() ->> 'email');
