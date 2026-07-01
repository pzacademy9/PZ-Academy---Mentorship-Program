-- ============================================================
-- Migration 0004: Email Queue Table
-- Purpose: Stores pending/sent/failed emails with retry tracking
-- ============================================================

-- Create email_queue table
create table public.email_queue (
  id                uuid primary key default gen_random_uuid(),
  event_type        text not null,
  user_id           uuid references auth.users(id) on delete set null,
  user_email        text not null,
  subject           text not null,
  html_content      text not null,
  status            text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  brevo_message_id  text,
  retry_count       integer not null default 0,
  next_retry_at     timestamptz,
  last_error        text,
  last_error_at     timestamptz,
  created_at        timestamptz not null default now(),
  sent_at           timestamptz,
  created_minute    text not null
);

-- Enable RLS
alter table public.email_queue enable row level security;

-- Create indexes
create index idx_email_queue_status on public.email_queue(status);
create index idx_email_queue_next_retry on public.email_queue(next_retry_at) where status = 'pending';
create index idx_email_queue_created_minute on public.email_queue(created_minute);
create index idx_email_queue_user_id on public.email_queue(user_id);
create index idx_email_queue_user_email on public.email_queue(user_email);

-- RLS Policies
-- Service role has full access
create policy "service_role_all_access" on public.email_queue
  as permissive for all to service_role
  using (true);

-- Authenticated users can see their own emails
create policy "users_see_own_emails" on public.email_queue
  as permissive for select to authenticated
  using (auth.uid() = user_id);
