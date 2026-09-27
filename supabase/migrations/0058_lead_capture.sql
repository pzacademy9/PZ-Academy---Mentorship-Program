-- 0058_lead_capture.sql
--
-- Sales Lead Capture Mini-System: a no-login, token-gated mobile page lets
-- an agent paste WhatsApp chat text and save a lead in ~15 seconds. Every
-- table here is service-role-only (RLS enabled, zero policies — the
-- convention established in 0033/0047): all reads and writes go through
-- createAdminSupabase() behind the per-agent token check in application
-- code, never through a client-side Supabase query.
--
-- "campaigns" is already taken by the email-campaign CRM (0047) — this
-- system's lead-source tagging uses lead_campaigns instead so the two never
-- collide.

-- ─── 1. agents ───────────────────────────────────────────────
create table if not exists public.agents (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  token       text not null unique,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.agents enable row level security;

-- ─── 2. lead_campaigns ───────────────────────────────────────
create table if not exists public.lead_campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.lead_campaigns enable row level security;

-- ─── 3. leads ────────────────────────────────────────────────
-- phone is required and stored normalized (E.164 via lib/crm/phone.ts) —
-- it is the one field the app never trusts extraction for, since a
-- WhatsApp chat's phone number is the chat's own number, not something
-- typed in the message text.
create table if not exists public.leads (
  id                 uuid primary key default gen_random_uuid(),
  name               text,
  email              text,
  phone              text not null,
  profession         text,
  lead_campaign_id   uuid references public.lead_campaigns(id) on delete set null,
  agent_id           uuid references public.agents(id) on delete set null,
  status             text not null default 'new',
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists leads_phone_idx on public.leads (phone);
create index if not exists leads_agent_id_idx on public.leads (agent_id);

alter table public.leads enable row level security;

-- Reuses public.set_updated_at() from 0003 — no need to redefine it.
drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();
