-- 0107_affiliates.sql
-- Affiliates: people who promote PZ Academy with a personal code and private link. They have no login.
-- One row per person, from application to accepted / dropped / left. Service role only (RLS on, no policies).
-- Also: three more documents in site_terms (affiliate terms, rules, privacy). The owner pastes this in the
-- Supabase SQL editor. Safe to run twice.

create table if not exists public.affiliates (
  id                 uuid primary key default gen_random_uuid(),
  status             text not null default 'applied' check (status in ('applied', 'accepted', 'dropped', 'left')),
  name               text not null,
  email              text not null,
  whatsapp           text not null,
  city_country       text not null,
  answers            jsonb not null default '{}',
  code               text unique,
  code_serial        integer,
  token              text unique,
  team               text check (team is null or team in ('Green', 'White', 'Yellow', 'Blue', 'Pink')),
  commission_mode    text not null default 'automatic' check (commission_mode in ('manual', 'automatic')),
  manual_percent     numeric(4,2) check (manual_percent is null or manual_percent between 8 and 10),
  opening_secured    integer not null default 0,
  opening_commission numeric(12,2) not null default 0,
  opening_withdrawn  numeric(12,2) not null default 0,
  is_imported        boolean not null default false,
  terms_accepted_at  timestamptz,
  terms_version      text,
  accepted_at        timestamptz,
  dropped_at         timestamptz,
  left_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- One application per email, whatever the capitals or spaces.
create unique index if not exists affiliates_email_lower_uidx on public.affiliates (lower(email));
create index if not exists affiliates_status_idx on public.affiliates (status, created_at desc);

alter table public.affiliates enable row level security;

-- Running number for new affiliate codes (AK321). The old affiliates reached 320, so new ones start at 321.
create sequence if not exists public.affiliate_code_serial start 321;

create or replace function public.next_affiliate_serial() returns integer
language sql
security definer
set search_path = public
as $$ select nextval('public.affiliate_code_serial')::integer $$;

revoke all on function public.next_affiliate_serial() from public, anon, authenticated;
grant execute on function public.next_affiliate_serial() to service_role;

-- The affiliate documents live next to the general Terms in site_terms.
alter table public.site_terms drop constraint if exists site_terms_key_check;
alter table public.site_terms
  add constraint site_terms_key_check
  check (key in ('general', 'affiliate_terms', 'affiliate_rules', 'affiliate_privacy'));

insert into public.site_terms (key, body) values
  ('affiliate_terms', ''),
  ('affiliate_rules', ''),
  ('affiliate_privacy', '')
on conflict (key) do nothing;
