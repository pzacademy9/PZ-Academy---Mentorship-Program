-- Migration 0063: sales workspace core (activity timeline, follow-ups,
-- WhatsApp numbers and the safety settings / blocked-attempt log).
-- No existing enum is altered, so this can run in one transaction.
-- All new tables: RLS on, no policies (service-role access only), like the
-- other CRM tables.

-- Contacts: follow-up scheduling, last outcome, permanent do-not-contact.
alter table public.contacts
  add column if not exists next_followup_at timestamptz,
  add column if not exists last_outcome text
    check (last_outcome in ('replied', 'interested', 'bought', 'not_interested')),
  add column if not exists do_not_contact_at timestamptz;

create index if not exists contacts_owner_followup_idx
  on public.contacts (owner_id, next_followup_at);

-- Sending WhatsApp numbers. One shared budget per number.
create table if not exists public.whatsapp_numbers (
  id               uuid primary key default gen_random_uuid(),
  label            text not null,
  phone_e164       text,
  status           text not null default 'active' check (status in ('active', 'frozen')),
  frozen_until     timestamptz,
  warmup_started_on date not null default ((now() at time zone 'Asia/Karachi')::date),
  daily_cap        integer check (daily_cap is null or daily_cap > 0),
  hourly_cap       integer check (hourly_cap is null or hourly_cap > 0),
  created_at       timestamptz not null default now()
);
alter table public.whatsapp_numbers enable row level security;

create table if not exists public.whatsapp_number_agents (
  number_id  uuid not null references public.whatsapp_numbers(id) on delete cascade,
  agent_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (number_id, agent_id)
);
alter table public.whatsapp_number_agents enable row level security;
create index if not exists whatsapp_number_agents_agent_idx
  on public.whatsapp_number_agents (agent_id);

-- Single-row admin-editable defaults (id is always true).
create table if not exists public.whatsapp_safety_settings (
  id               boolean primary key default true check (id),
  daily_cap        integer not null default 60 check (daily_cap > 0),
  hourly_cap       integer not null default 20 check (hourly_cap > 0),
  hourly_warn_at   integer not null default 15 check (hourly_warn_at > 0),
  spacing_min_s    integer not null default 90 check (spacing_min_s >= 0),
  spacing_max_s    integer not null default 180 check (spacing_max_s >= spacing_min_s),
  burst_size       integer not null default 10 check (burst_size > 0),
  burst_break_min  integer not null default 10 check (burst_break_min >= 0),
  quiet_start_hour integer not null default 21 check (quiet_start_hour between 0 and 23),
  quiet_end_hour   integer not null default 9 check (quiet_end_hour between 0 and 23),
  warmup_start     integer not null default 10 check (warmup_start > 0),
  warmup_step      integer not null default 10 check (warmup_step >= 0),
  freeze_hours     integer not null default 48 check (freeze_hours > 0),
  timezone         text not null default 'Asia/Karachi',
  updated_at       timestamptz not null default now()
);
alter table public.whatsapp_safety_settings enable row level security;
insert into public.whatsapp_safety_settings (id) values (true) on conflict (id) do nothing;

-- Append-only timeline. Also the source of truth for the send limits.
create table if not exists public.contact_activities (
  id             uuid primary key default gen_random_uuid(),
  contact_id     uuid not null references public.contacts(id) on delete cascade,
  agent_id       uuid references public.profiles(id) on delete set null,
  kind           text not null check (kind in (
    'sent', 'replied', 'interested', 'bought', 'not_interested',
    'note', 'claimed', 'reassigned', 'released'
  )),
  body           text,
  number_id      uuid references public.whatsapp_numbers(id) on delete set null,
  is_new_chat    boolean not null default false,
  burst_pos      integer,
  next_unlock_at timestamptz,
  created_at     timestamptz not null default now()
);
alter table public.contact_activities enable row level security;
create index if not exists contact_activities_contact_created_idx
  on public.contact_activities (contact_id, created_at desc);
create index if not exists contact_activities_number_kind_created_idx
  on public.contact_activities (number_id, kind, created_at desc);
create index if not exists contact_activities_agent_kind_created_idx
  on public.contact_activities (agent_id, kind, created_at desc);

-- Log of sends the server refused (and panic freezes), for the admin page.
create table if not exists public.whatsapp_blocked_attempts (
  id         uuid primary key default gen_random_uuid(),
  number_id  uuid references public.whatsapp_numbers(id) on delete set null,
  agent_id   uuid references public.profiles(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  reason     text not null,
  created_at timestamptz not null default now()
);
alter table public.whatsapp_blocked_attempts enable row level security;
create index if not exists whatsapp_blocked_attempts_created_idx
  on public.whatsapp_blocked_attempts (created_at desc);
