-- 0110_affiliate_monthly_percent.sql
-- Affiliate commission percent now follows LAST MONTH, not the all-time count.
--   * Automatic mode: 10 or more paid participants in the previous calendar month (Pakistan time) = 10% for the
--     whole of this month. Fewer than 10 = 8%. Hit 10 again and the next month is 10% again.
--   * Manual mode: unchanged (the percent the owner typed, 8 to 10).
--   * One-time bridge: an imported affiliate with 10 or more past sales (opening_secured) keeps 10% until the end of
--     November 2026. From 1 December 2026 only real sales in this app count.
--   * The percent is still saved on each sale the moment it first turns Paid. Old rows never change.
-- A month is counted by when the sale's commission row was first created (the first time it turned Paid), in
-- Pakistan time (Asia/Karachi, UTC+5, no daylight saving). Cancelled (voided) rows do not count.
-- Replaces one function only. The trigger already points at it. Service role only. Safe to run twice.
-- The same rules are written in TypeScript in src/lib/affiliates/commission.ts: change one, change the other.

create or replace function public.affiliate_snapshot_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aff         record;
  v_last        integer;
  v_month_start timestamp;
  v_percent     numeric(4,2);
  v_amount      numeric(12,2);
  v_currency    text;
  v_commission  numeric(12,2);
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

  if new.status <> 'paid' then
    return new;
  end if;

  -- The amount received is always PKR. Only a sale with no amount received falls back to its price in its own currency.
  if new.amount_received is not null then
    v_amount := new.amount_received; v_currency := 'PKR';
  else
    v_amount := new.expected_amount; v_currency := new.currency;
  end if;

  -- Still Paid, amount corrected: the live commission follows the new amount at the percent already fixed.
  if old.status = 'paid' and new.status = 'paid' then
    update public.affiliate_commissions
       set currency = v_currency, amount_paid = v_amount, commission = round(v_amount * percent / 100, 2),
           commission_pkr = case when v_currency = 'PKR' then round(v_amount * percent / 100, 2) else null end
     where registration_id = new.id and voided_at is null;
    return new;
  end if;

  -- From here: the sale just turned Paid.
  -- Lock the affiliate so two sales turning Paid at the same moment read the same numbers.
  select commission_mode, manual_percent, opening_secured
    into v_aff
    from public.affiliates where id = new.affiliate_id for update;
  if not found then
    return new;
  end if;

  -- Paid again after being cancelled: restore the same row (same percent) with the amount as it is now.
  update public.affiliate_commissions
     set voided_at = null, currency = v_currency, amount_paid = v_amount, commission = round(v_amount * percent / 100, 2),
         commission_pkr = case when v_currency = 'PKR' then round(v_amount * percent / 100, 2) else null end
   where registration_id = new.id and voided_at is not null;
  if found then
    return new;
  end if;

  -- Paid participants in the previous calendar month, Pakistan time.
  v_month_start := date_trunc('month', now() at time zone 'Asia/Karachi');
  select count(*)::integer into v_last
    from public.affiliate_commissions
   where affiliate_id = new.affiliate_id and voided_at is null
     and (created_at at time zone 'Asia/Karachi') >= v_month_start - interval '1 month'
     and (created_at at time zone 'Asia/Karachi') <  v_month_start;

  v_percent := case
    when v_aff.commission_mode = 'manual' then least(10, greatest(8, coalesce(v_aff.manual_percent, 8)))
    when v_aff.opening_secured >= 10 and (now() at time zone 'Asia/Karachi') < timestamp '2026-12-01 00:00:00' then 10
    when v_last >= 10 then 10
    else 8
  end;
  v_commission := round(v_amount * v_percent / 100, 2);

  insert into public.affiliate_commissions
    (registration_id, affiliate_id, currency, amount_paid, percent, commission, commission_pkr)
  values
    (new.id, new.affiliate_id, v_currency, v_amount, v_percent, v_commission,
     case when v_currency = 'PKR' then v_commission else null end)
  on conflict (registration_id) do nothing;

  return new;
end;
$$;

revoke all on function public.affiliate_snapshot_commission() from public, anon, authenticated;
