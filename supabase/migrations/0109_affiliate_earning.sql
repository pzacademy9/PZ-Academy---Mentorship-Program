-- 0109_affiliate_earning.sql
-- Affiliates earn: a sale can be credited to an affiliate (by link or by their promo code), and the commission of
-- every sale is saved as a fixed number the moment the sale becomes Paid (and cancelled if it stops being Paid).
-- Also: one owner promo code for every accepted affiliate, so their code gives students the discount.
-- Service role only (RLS on, no policies). The owner pastes this in the Supabase SQL editor. Safe to run twice.
--
-- Commission rules (the same rules are written in TypeScript in src/lib/affiliates/commission.ts):
--   * one sale = a lead or individual row, is_test = false, carrying an affiliate_id. Member rows never earn.
--   * amount = amount actually paid (amount_received, else expected_amount, which is already after discount).
--   * Manual mode: manual_percent (8 to 10). Automatic mode: 8%, then 10% once opening_secured plus the
--     affiliate's live (not cancelled) snapshots reach 10. The percent is fixed in the snapshot.
--   * money is never converted: commission_pkr is filled for PKR sales only; a foreign sale waits for the
--     owner to convert it by hand (a later step).

-- ------------------------------------------------------------ who gets the credit
alter table public.landing_promo_codes
  add column if not exists owner_affiliate_id uuid references public.affiliates(id) on delete set null;

alter table public.landing_registrations
  add column if not exists affiliate_id uuid references public.affiliates(id) on delete set null;

alter table public.landing_funnel_events
  add column if not exists affiliate_id uuid references public.affiliates(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'landing_registrations_one_credit_chk') then
    alter table public.landing_registrations
      add constraint landing_registrations_one_credit_chk check (agent_id is null or affiliate_id is null);
  end if;
end $$;

create index if not exists landing_registrations_affiliate_idx
  on public.landing_registrations (affiliate_id) where affiliate_id is not null;
create index if not exists landing_funnel_events_affiliate_idx
  on public.landing_funnel_events (affiliate_id) where affiliate_id is not null;
create index if not exists landing_promo_codes_owner_affiliate_idx
  on public.landing_promo_codes (owner_affiliate_id) where owner_affiliate_id is not null;

-- ------------------------------------------------------------ one commission row per sale
create table if not exists public.affiliate_commissions (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.landing_registrations(id) on delete cascade,
  affiliate_id    uuid not null references public.affiliates(id) on delete cascade,
  currency        text not null,
  amount_paid     numeric(12,2) not null,
  percent         numeric(4,2) not null,
  commission      numeric(12,2) not null,
  commission_pkr  numeric(12,2),
  voided_at       timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists affiliate_commissions_affiliate_idx
  on public.affiliate_commissions (affiliate_id, created_at desc);
alter table public.affiliate_commissions enable row level security;

-- ------------------------------------------------------------ the snapshot trigger
create or replace function public.affiliate_snapshot_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aff        record;
  v_live       integer;
  v_percent    numeric(4,2);
  v_amount     numeric(12,2);
  v_commission numeric(12,2);
begin
  if not (new.row_type in ('individual', 'lead') and new.is_test = false and new.affiliate_id is not null) then
    return new;
  end if;

  -- Stopped being Paid: the commission is cancelled, not deleted.
  if old.status = 'paid' and new.status <> 'paid' then
    update public.affiliate_commissions set voided_at = now()
     where registration_id = new.id and voided_at is null;
    return new;
  end if;

  if new.status = 'paid' and old.status <> 'paid' then
    -- Lock the affiliate so two sales turning Paid at the same moment step the percent once.
    select commission_mode, manual_percent, opening_secured
      into v_aff
      from public.affiliates where id = new.affiliate_id for update;
    if not found then
      return new;
    end if;

    -- Paid again after being cancelled: restore the same row (same percent, same amount).
    update public.affiliate_commissions set voided_at = null
     where registration_id = new.id and voided_at is not null;
    if found then
      return new;
    end if;

    select count(*)::integer into v_live
      from public.affiliate_commissions
     where affiliate_id = new.affiliate_id and voided_at is null;

    v_percent := case
      when v_aff.commission_mode = 'manual' then least(10, greatest(8, coalesce(v_aff.manual_percent, 8)))
      when v_live + v_aff.opening_secured >= 10 then 10 else 8
    end;
    v_amount := coalesce(new.amount_received, new.expected_amount);
    v_commission := round(v_amount * v_percent / 100, 2);

    insert into public.affiliate_commissions
      (registration_id, affiliate_id, currency, amount_paid, percent, commission, commission_pkr)
    values
      (new.id, new.affiliate_id, new.currency, v_amount, v_percent, v_commission,
       case when new.currency = 'PKR' then v_commission else null end)
    on conflict (registration_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.affiliate_snapshot_commission() from public, anon, authenticated;

drop trigger if exists landing_registrations_affiliate_commission on public.landing_registrations;
create trigger landing_registrations_affiliate_commission
  after update of status on public.landing_registrations
  for each row
  when (old.status is distinct from new.status)
  execute function public.affiliate_snapshot_commission();

-- ------------------------------------------------------------ per-affiliate numbers, one row per page
create or replace function public.affiliate_link_stats(p_affiliate_id uuid)
returns table (page_id uuid, views integer, registered integer, paid integer)
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select f.page_id as pid, count(distinct f.session_id)::integer as n
      from public.landing_funnel_events f
     where f.affiliate_id = p_affiliate_id and f.type = 'view'
     group by f.page_id
  ),
  s as (
    select r.page_id as pid,
           count(*)::integer as registered,
           (count(*) filter (where r.status = 'paid'))::integer as paid
      from public.landing_registrations r
     where r.affiliate_id = p_affiliate_id
       and r.row_type in ('individual', 'lead')
       and r.is_test = false
     group by r.page_id
  )
  select coalesce(v.pid, s.pid) as page_id,
         coalesce(v.n, 0) as views,
         coalesce(s.registered, 0) as registered,
         coalesce(s.paid, 0) as paid
    from v
    full outer join s on s.pid = v.pid;
$$;

revoke all on function public.affiliate_link_stats(uuid) from public, anon, authenticated;
grant execute on function public.affiliate_link_stats(uuid) to service_role;

-- ------------------------------------------------------------ discount codes for the affiliates already accepted
-- Typed plain the code gives 10%; typed CODE-NN% it gives NN% up to the ceiling (see 0106). A code that does not
-- fit the promo code format, or that already exists, is skipped.
insert into public.landing_promo_codes (code, type, value, is_owner_code, plain_percent, owner_affiliate_id)
select upper(a.code), 'percent', 0, true, 10, a.id
  from public.affiliates a
 where a.status = 'accepted' and a.code is not null
   and upper(a.code) ~ '^[A-Z0-9_-]{2,40}$'
on conflict (code) do nothing;
