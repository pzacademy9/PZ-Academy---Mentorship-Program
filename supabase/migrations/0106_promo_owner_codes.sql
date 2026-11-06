-- 0106_promo_owner_codes.sql
-- Owner codes: a person's own promo code. Typed plain it gives plain_percent; typed as CODE-NN% it gives NN%
-- (never above the highest percent below). The sale is credited to the code's owner.
-- Service role only. The owner pastes this in the Supabase SQL editor. Safe to run twice.

alter table public.landing_promo_codes
  add column if not exists is_owner_code boolean not null default false,
  add column if not exists plain_percent numeric(5,2) not null default 10,
  add column if not exists max_percent   numeric(5,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'landing_promo_codes_plain_percent_chk') then
    alter table public.landing_promo_codes
      add constraint landing_promo_codes_plain_percent_chk check (plain_percent between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'landing_promo_codes_max_percent_chk') then
    alter table public.landing_promo_codes
      add constraint landing_promo_codes_max_percent_chk check (max_percent is null or max_percent between 1 and 100);
  end if;
end $$;
-- Not a database rule on purpose: owner_agent_id is set to null when the agent is deleted, and a check
-- here would block that delete. The app treats an owner code with no owner as an ordinary code.

-- One row: the highest percent anyone may type after a code.
create table if not exists public.landing_promo_settings (
  id          boolean primary key default true check (id),
  max_percent numeric(5,2) not null default 30 check (max_percent between 1 and 100),
  updated_at  timestamptz not null default now()
);
insert into public.landing_promo_settings (id, max_percent) values (true, 30) on conflict (id) do nothing;
alter table public.landing_promo_settings enable row level security;
