-- 0081_payment_countries.sql
-- Central payment accounts per country: one list per region key (PK, UAE, KSA, PH, IN, INTL)
-- instead of an account picker on every landing page. A page region keeps its own label,
-- currency, class time and timezone; only the accounts come from here.
-- Service role only (RLS on, zero policies), same as landing_meta_events.
-- The owner pastes this into the Supabase SQL editor. Safe to run twice.

create table if not exists public.payment_countries (
  region_key text primary key check (region_key ~ '^[A-Z]{2,6}$'),
  name       text not null check (char_length(name) between 1 and 80),
  sort       integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_country_accounts (
  region_key  text not null references public.payment_countries(region_key) on update cascade on delete cascade,
  account_key text not null references public.payment_accounts(key) on update cascade on delete cascade,
  sort        integer not null default 0,
  primary key (region_key, account_key)
);

alter table public.payment_countries enable row level security; -- zero policies = service role only
alter table public.payment_country_accounts enable row level security;

insert into public.payment_countries (region_key, name, sort) values
  ('PK',   'Pakistan',             10),
  ('UAE',  'United Arab Emirates', 20),
  ('KSA',  'Saudi Arabia',         30),
  ('PH',   'Philippines',          40),
  ('IN',   'India',                50),
  ('INTL', 'International',        60)
on conflict (region_key) do nothing;

insert into public.payment_country_accounts (region_key, account_key, sort) values
  ('PK',   'faysal',    10),
  ('PK',   'easypaisa', 20),
  ('UAE',  'mashreq',   10),
  ('KSA',  'anb',       10),
  ('PH',   'pnb_ph',    10),
  ('PH',   'gcash',     20),
  ('IN',   'pnb_in',    10),
  ('INTL', 'paypal',    10)
on conflict (region_key, account_key) do nothing;
