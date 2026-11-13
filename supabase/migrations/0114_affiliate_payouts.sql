-- 0114_affiliate_payouts.sql
-- Payout requests from affiliates. One row per request: how much, where to send it, and whether the owner has paid
-- or rejected it. Only one request can be pending per affiliate at a time. Also widens the affiliate_emails kinds with
-- 'payout_paid' and 'payout_rejected'. Service role only (RLS on, no policies). The owner pastes this in the
-- Supabase SQL editor. Safe to run twice.

begin;

-- ------------------------------------------------------------ the requests
create table if not exists public.affiliate_payouts (
  id             uuid primary key default gen_random_uuid(),
  affiliate_id   uuid not null references public.affiliates(id),
  amount_pkr     numeric(12,2) not null check (amount_pkr >= 3500),
  method         text not null check (method in ('jazzcash', 'easypaisa', 'bank')),
  account_title  text not null,
  account_number text not null,
  status         text not null default 'pending' check (status in ('pending', 'paid', 'rejected')),
  reject_reason  text,
  requested_at   timestamptz not null default now(),
  decided_at     timestamptz,
  constraint affiliate_payouts_reject_reason_check
    check (status <> 'rejected' or (reject_reason is not null and length(btrim(reject_reason)) > 0))
);
alter table public.affiliate_payouts enable row level security;

-- ------------------------------------------------------------ one pending request per affiliate
create unique index if not exists affiliate_payouts_one_pending_uidx
  on public.affiliate_payouts (affiliate_id)
  where status = 'pending';

create index if not exists affiliate_payouts_affiliate_idx
  on public.affiliate_payouts (affiliate_id, requested_at desc);

-- ------------------------------------------------------------ widen the email kinds
alter table public.affiliate_emails drop constraint if exists affiliate_emails_kind_check;
alter table public.affiliate_emails add constraint affiliate_emails_kind_check
  check (kind in ('accepted', 'dropped', 'left', 'progress', 'motivation', 'payout_paid', 'payout_rejected'));

commit;
