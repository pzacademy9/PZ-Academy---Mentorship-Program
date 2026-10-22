-- 0082_payment_country_accounts_fn.sql
-- Replaces a country's account list in ONE transaction, so a failure never leaves the country
-- empty (the Supabase client cannot run a multi-statement transaction). Order = array order,
-- sort = index * 10. The country must exist and every key must exist in payment_accounts,
-- with no repeats. Service role only.
-- The owner pastes this into the Supabase SQL editor. Safe to run twice.

create or replace function public.landing_set_country_accounts(
  p_region_key   text,
  p_account_keys text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keys     text[] := coalesce(p_account_keys, '{}'::text[]);
  v_distinct integer;
  v_known    integer;
begin
  perform 1 from public.payment_countries where region_key = p_region_key;
  if not found then
    raise exception 'unknown country %', p_region_key;
  end if;

  select count(distinct k) into v_distinct from unnest(v_keys) as k;
  select count(*) into v_known from public.payment_accounts where key = any(v_keys);
  if v_distinct <> cardinality(v_keys) or v_known <> v_distinct then
    raise exception 'unknown or repeated account key';
  end if;

  delete from public.payment_country_accounts where region_key = p_region_key;

  insert into public.payment_country_accounts (region_key, account_key, sort)
  select p_region_key, k.account_key, (k.ord - 1)::integer * 10
    from unnest(v_keys) with ordinality as k(account_key, ord);
end;
$$;

revoke all on function public.landing_set_country_accounts(text, text[]) from public, anon, authenticated;
grant execute on function public.landing_set_country_accounts(text, text[]) to service_role;
