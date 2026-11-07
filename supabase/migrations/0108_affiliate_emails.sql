-- 0108_affiliate_emails.sql
-- A history of every email sent to an affiliate (accepted, dropped, left): when, to which address,
-- sent or failed, and why it failed. Service role only (RLS on, no policies).
-- Run 0107 first. The owner pastes this in the Supabase SQL editor. Safe to run twice.

create table if not exists public.affiliate_emails (
  id           uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  kind         text not null check (kind in ('accepted', 'dropped', 'left')),
  to_email     text not null,
  status       text not null check (status in ('sent', 'failed')),
  error        text,
  created_at   timestamptz not null default now()
);

create index if not exists affiliate_emails_affiliate_idx on public.affiliate_emails (affiliate_id, created_at desc);

alter table public.affiliate_emails enable row level security;
