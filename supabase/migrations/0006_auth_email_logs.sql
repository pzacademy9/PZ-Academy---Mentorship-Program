-- ============================================================
-- Migration 0006: Auth Email Logs Table
-- Purpose: Failed email log for admin visibility
-- ============================================================

-- Create auth_email_logs table
create table public.auth_email_logs (
  id                uuid primary key default gen_random_uuid(),
  event_type        text not null,
  user_email        text not null,
  error_message     text not null,
  error_details     jsonb,
  retry_count       integer not null default 0,
  final_attempt_at  timestamptz,
  created_at        timestamptz not null default now()
);

-- Enable RLS
alter table public.auth_email_logs enable row level security;

-- Create indexes
create index idx_auth_email_logs_user_email on public.auth_email_logs(user_email);
create index idx_auth_email_logs_event_type on public.auth_email_logs(event_type);

-- RLS Policies
-- Service role has full access
create policy "service_role_all_access" on public.auth_email_logs
  as permissive for all to service_role
  using (true);

-- Only admins can see all logs
create policy "admins_see_all_logs" on public.auth_email_logs
  as permissive for select to authenticated
  using ((auth.jwt() ->> 'user_role') in ('admin', 'super_admin'));
