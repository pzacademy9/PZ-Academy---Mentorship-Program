-- 0077_participant_messaging.sql
-- NOTE: the owner pastes this SQL into the Supabase SQL editor (it is not applied by tooling).
-- Safe to run more than once.
--
-- Plan 3: messaging a landing page's participants (email and WhatsApp).
--   participant_templates        saved message templates (email subject/body + WhatsApp body)
--   participant_sends            one row per send (channel, message, audience counts)
--   participant_send_recipients  one row per recipient of a send, with its delivery state
--   participant_email_prefs      one row per email address: unsubscribe token + state
-- RLS is on for all four with no policies: only the service role reads or writes them.

create table if not exists public.participant_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  subject       text not null default '',
  email_body    text not null default '',
  whatsapp_body text not null default '',
  created_by    uuid references public.profiles(id),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table public.participant_templates enable row level security;

create table if not exists public.participant_sends (
  id                 uuid primary key default gen_random_uuid(),
  page_id            uuid not null references public.landing_pages(id),
  channel            text not null check (channel in ('email','whatsapp')),
  subject            text not null default '',
  body               text not null,
  template_id        uuid references public.participant_templates(id) on delete set null,
  recipient_count    int not null,
  not_paid_count     int not null default 0,
  not_paid_confirmed boolean not null default false,
  created_by         uuid references public.profiles(id),
  created_at         timestamptz default now()
);
alter table public.participant_sends enable row level security;

create table if not exists public.participant_send_recipients (
  id              uuid primary key default gen_random_uuid(),
  send_id         uuid not null references public.participant_sends(id) on delete cascade,
  registration_id uuid not null references public.landing_registrations(id) on delete cascade,
  is_member       boolean not null default false,
  name            text not null,
  email           text not null default '',
  phone           text not null default '',
  status_at_send  text not null,
  state           text not null default 'pending'
                  check (state in ('pending','claimed','sent','failed','skipped')),
  reason          text not null default '',
  claimed_at      timestamptz,
  sent_at         timestamptz,
  unique (send_id, registration_id)
);
alter table public.participant_send_recipients enable row level security;

create index if not exists participant_send_recipients_send_state_idx
  on public.participant_send_recipients (send_id, state);
create index if not exists participant_send_recipients_registration_idx
  on public.participant_send_recipients (registration_id);

create table if not exists public.participant_email_prefs (
  email           text primary key check (email = lower(email)),
  token           uuid not null unique default gen_random_uuid(),
  unsubscribed_at timestamptz,
  created_at      timestamptz default now()
);
alter table public.participant_email_prefs enable row level security;

-- Smoke test: supabase/tests/0077_participant_messaging_smoke.sql (run separately after this).
