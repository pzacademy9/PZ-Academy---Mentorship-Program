-- ============================================================
-- Migration 0047: CRM contacts spine
-- Run AFTER 0046. SQL Editor → New query → Run
-- ============================================================
-- Consolidates ~3000 past buyers currently scattered across 25+ Google
-- Sheets into one addressable store, with per-purchase history so repeat
-- buyers across cohorts collapse into a single contact.
--
-- Every table here is admin-only: RLS is ENABLED with ZERO policies, the
-- service-role-only convention established in 0033. All reads and writes go
-- through createAdminSupabase() behind requireAdmin(). The one public
-- surface (unsubscribe) is a route handler using the service-role client,
-- not a client-side query, so it needs no policy either.

-- ─── 1. Enums ────────────────────────────────────────────────
-- Guarded with `if not exists` so re-running the migration is harmless.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'crm_consent_basis') then
    create type public.crm_consent_basis as enum ('purchase', 'enquiry');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_discovery_source') then
    create type public.crm_discovery_source as enum ('instagram', 'facebook', 'whatsapp', 'other', 'unknown');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_row_type') then
    create type public.crm_row_type as enum ('individual', 'group_leader', 'group_member');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_import_status') then
    create type public.crm_import_status as enum ('draft', 'previewed', 'committed', 'failed');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_merge_status') then
    create type public.crm_merge_status as enum ('pending', 'merged', 'rejected');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_campaign_status') then
    create type public.crm_campaign_status as enum ('draft', 'scheduled', 'sending', 'sent', 'cancelled');
  end if;
end $$;

-- ─── 2. import_batches ───────────────────────────────────────
-- Created before contacts because contact_purchases references it.
create table if not exists public.import_batches (
  id                uuid primary key default gen_random_uuid(),
  sheet_id          text not null,
  sheet_name        text not null default '',
  tab_name          text not null,
  column_mapping    jsonb not null default '{}'::jsonb,
  course_id         uuid references public.courses(id) on delete set null,
  status            public.crm_import_status not null default 'draft',
  rows_total        integer not null default 0,
  rows_imported     integer not null default 0,
  contacts_created  integer not null default 0,
  contacts_merged   integer not null default 0,
  rows_skipped      integer not null default 0,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- ─── 3. contacts ─────────────────────────────────────────────
-- email and phone_e164 are BOTH nullable and BOTH unique. Today every sheet
-- row carries both; slice 2's WhatsApp-ad leads will arrive phone-only.
-- Postgres unique indexes treat NULLs as distinct, so multiple rows may have
-- a null email without colliding — exactly the behaviour wanted.
--
-- phone_raw is kept verbatim even when normalization succeeds, so a bad
-- normalization rule can be re-run later against the original value.
create table if not exists public.contacts (
  id                        uuid primary key default gen_random_uuid(),
  email                     text,
  phone_e164                text,
  phone_raw                 text,
  full_name                 text not null default '',
  profession                text,
  country                   text,
  discovery_source          public.crm_discovery_source not null default 'unknown',
  consent_basis             public.crm_consent_basis not null default 'purchase',
  email_unsubscribed_at     timestamptz,
  whatsapp_unsubscribed_at  timestamptz,
  unsubscribe_token         uuid not null default gen_random_uuid(),
  profile_id                uuid references public.profiles(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create unique index if not exists contacts_email_key on public.contacts (email) where email is not null;
create unique index if not exists contacts_phone_e164_key on public.contacts (phone_e164) where phone_e164 is not null;
create unique index if not exists contacts_unsubscribe_token_key on public.contacts (unsubscribe_token);
create index if not exists contacts_profile_id_idx on public.contacts (profile_id);
create index if not exists contacts_discovery_source_idx on public.contacts (discovery_source);

-- ─── 4. contact_purchases ────────────────────────────────────
-- UNIQUE (source_sheet_id, source_row_ref) is what makes re-import
-- idempotent: re-running a sheet after fixing a column mapping produces no
-- duplicates. With 25 sheets and a mapping step that WILL be got wrong at
-- least once, "fixable by re-running" beats "fixable by hand".
--
-- product_label stays raw and course_id stays nullable on purpose: labels
-- are free text and sheet-specific, and most historical cohorts have no
-- courses row at all. Course mapping is enrichment, never a blocker.
create table if not exists public.contact_purchases (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid not null references public.contacts(id) on delete cascade,
  import_batch_id   uuid references public.import_batches(id) on delete set null,
  source_sheet_id   text not null,
  source_row_ref    text not null,
  product_label     text not null default '',
  course_id         uuid references public.courses(id) on delete set null,
  amount            numeric(12,2),
  currency          text,
  is_early_bird     boolean not null default false,
  row_type          public.crm_row_type not null default 'individual',
  promo_code        text,
  purchased_at      timestamptz,
  created_at        timestamptz not null default now(),
  unique (source_sheet_id, source_row_ref)
);

create index if not exists contact_purchases_contact_id_idx on public.contact_purchases (contact_id);
create index if not exists contact_purchases_batch_idx on public.contact_purchases (import_batch_id);
create index if not exists contact_purchases_course_idx on public.contact_purchases (course_id);
create index if not exists contact_purchases_row_type_idx on public.contact_purchases (row_type);

-- ─── 5. merge_candidates ─────────────────────────────────────
-- The human review queue for duplicates that are probable but not certain.
-- Certain duplicates (identical email or identical phone) are auto-merged at
-- import time and never reach this table.
create table if not exists public.merge_candidates (
  id             uuid primary key default gen_random_uuid(),
  contact_a_id   uuid not null references public.contacts(id) on delete cascade,
  contact_b_id   uuid not null references public.contacts(id) on delete cascade,
  reason         text not null,
  confidence     numeric(3,2) not null default 0,
  status         public.crm_merge_status not null default 'pending',
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  resolved_by    uuid references public.profiles(id) on delete set null,
  check (contact_a_id <> contact_b_id)
);

create index if not exists merge_candidates_status_idx on public.merge_candidates (status);

-- ─── 6. campaigns + campaign_recipients ──────────────────────
-- Defined here rather than in a phase-1b migration so the whole CRM schema
-- applies in one pass. Phase 1b adds only views on top.
create table if not exists public.campaigns (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  subject        text not null default '',
  html_content   text not null default '',
  segment        jsonb not null default '[]'::jsonb,
  status         public.crm_campaign_status not null default 'draft',
  scheduled_at   timestamptz,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- UNIQUE (campaign_id, contact_id) makes double-sending structurally
-- impossible — a retry of a partially-failed send cannot re-enqueue anyone
-- who already has a row.
create table if not exists public.campaign_recipients (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  contact_id      uuid not null references public.contacts(id) on delete cascade,
  email_queue_id  uuid references public.email_queue(id) on delete set null,
  status          text not null default 'pending',
  created_at      timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create index if not exists campaign_recipients_campaign_idx on public.campaign_recipients (campaign_id);

-- ─── 7. updated_at trigger for contacts ──────────────────────
create or replace function public.touch_contacts_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists contacts_touch_updated_at on public.contacts;
create trigger contacts_touch_updated_at
  before update on public.contacts
  for each row execute function public.touch_contacts_updated_at();

-- ─── 8. RLS: enabled, zero policies (service-role only) ──────
alter table public.contacts            enable row level security;
alter table public.contact_purchases   enable row level security;
alter table public.import_batches      enable row level security;
alter table public.merge_candidates    enable row level security;
alter table public.campaigns           enable row level security;
alter table public.campaign_recipients enable row level security;
