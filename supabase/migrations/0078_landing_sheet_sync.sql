-- 0078_landing_sheet_sync.sql
-- NOTE: the owner pastes this SQL into the Supabase SQL editor (it is not applied by tooling).
-- Safe to run more than once.
--
-- Sheet-to-app sync for landing registrations:
--   1. landing_sheet_snapshots: last values the sync saw in the sheet for each registration.
--   2. landing_sheet_sync_log: one row per field decision made by a scan (applied, skipped, ...).
--   3. landing_pages gets the sync state ('report' = log only, 'live' = apply changes),
--      the last scan time, and a count of rows waiting.
-- Both new tables are service role only (RLS on, zero policies), as in 0071.

create table if not exists public.landing_sheet_snapshots (
  registration_id uuid primary key references public.landing_registrations(id) on delete cascade,
  status          text,
  amount_received numeric(12,2),
  name            text,
  email           text,
  whatsapp        text,
  updated_at      timestamptz not null default now()
);

create table if not exists public.landing_sheet_sync_log (
  id              uuid primary key default gen_random_uuid(),
  page_id         uuid not null references public.landing_pages(id) on delete cascade,
  registration_id uuid references public.landing_registrations(id) on delete set null,
  row_number      int,
  ref_id          text not null default '',
  field           text not null,
  outcome         text not null check (outcome in ('applied','skipped','rejected','unknown-row','duplicate-row','report','kept-app')),
  sheet_value     text,
  app_value       text,
  detail          text not null default '',
  scan_id         uuid not null,
  created_at      timestamptz not null default now()
);

create index if not exists landing_sheet_sync_log_page_scan_idx
  on public.landing_sheet_sync_log (page_id, scan_id);
create index if not exists landing_sheet_sync_log_page_outcome_idx
  on public.landing_sheet_sync_log (page_id, outcome, created_at desc);

alter table public.landing_sheet_snapshots enable row level security;
alter table public.landing_sheet_sync_log enable row level security;

alter table public.landing_pages
  add column if not exists sheet_sync_state text not null default 'report',
  add column if not exists sheet_last_scanned_at timestamptz,
  add column if not exists sheet_sync_waiting integer not null default 0;

alter table public.landing_pages drop constraint if exists landing_pages_sheet_sync_state_check;
alter table public.landing_pages
  add constraint landing_pages_sheet_sync_state_check check (sheet_sync_state in ('report','live'));
