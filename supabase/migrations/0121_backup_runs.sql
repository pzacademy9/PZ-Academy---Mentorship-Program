-- 0121: backup status for the Settings page.
-- The owner pastes this by hand into the Supabase SQL editor.
-- The nightly backup job writes one row here when it finishes (and updates the Sunday row with the
-- restore test result). The Settings page only reads it. Nothing here can restore or change data.
-- RLS is on with no policies: only the service role and the backup job (database login) touch it.
-- No existing data is changed. Safe to re-run.

create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  taken_at timestamptz not null default now(),
  mode text not null check (mode in ('nightly', 'weekly')),
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  restore_ok boolean,
  restore_checked_at timestamptz
);

create index if not exists backup_runs_taken_at_idx on public.backup_runs (taken_at desc);

alter table public.backup_runs enable row level security;
