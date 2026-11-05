-- 0105: bulk progress report emails (Admin > batch > Progress reports).
-- One row per "Send to all" round, one row per student in that round. A student's row moves
-- pending -> claimed -> sent / failed / skipped, so pressing Send again never emails anyone twice.
-- Service role only (RLS on, no policies), like every other admin table. Safe to run more than once.

create table if not exists public.progress_report_sends (
  id              uuid primary key default gen_random_uuid(),
  page_id         uuid not null references public.landing_pages (id) on delete cascade,
  created_by      uuid,
  recipient_count integer not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists progress_report_sends_page_idx
  on public.progress_report_sends (page_id, created_at desc);

create table if not exists public.progress_report_recipients (
  id         uuid primary key default gen_random_uuid(),
  send_id    uuid not null references public.progress_report_sends (id) on delete cascade,
  person_id  uuid references public.pz_people (id) on delete set null,
  email      text not null,
  name       text not null default '',
  state      text not null default 'pending'
             check (state in ('pending','claimed','sent','failed','skipped')),
  reason     text not null default '',
  claimed_at timestamptz,
  sent_at    timestamptz,
  unique (send_id, person_id)
);
create index if not exists progress_report_recipients_send_idx
  on public.progress_report_recipients (send_id, state);

alter table public.progress_report_sends enable row level security;
alter table public.progress_report_recipients enable row level security;
