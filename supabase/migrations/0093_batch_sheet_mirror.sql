-- 0093: batch sheet mirror. The owner pastes this by hand into the Supabase SQL editor.
-- Mirrors a batch's registrations FROM a Google Sheet INTO the app on a schedule.
-- landing_pages gets four mirror_* columns (target sheet, last run time, last result, running lock).
-- landing_mirror_rows remembers which sheet row belongs to which registration, and the status/amount last written.
-- landing_mirror_rows has RLS on and no policies: only the service role touches it.
-- No data is deleted or rewritten. Safe to re-run.

alter table public.landing_pages
  add column if not exists mirror_sheet_id text,
  add column if not exists mirror_last_run_at timestamptz,
  add column if not exists mirror_last_result jsonb,
  add column if not exists mirror_running_at timestamptz;

create table if not exists public.landing_mirror_rows (
  page_id uuid not null references public.landing_pages(id) on delete cascade,
  row_key text not null,
  registration_id uuid not null references public.landing_registrations(id) on delete cascade,
  last_status text not null,
  last_amount numeric,
  last_seen_at timestamptz not null default now(),
  primary key (page_id, row_key)
);

alter table public.landing_mirror_rows enable row level security;
