-- 0110_affiliate_monthly_percent_check.sql
-- A safety check for migration 0110. Paste it in the Supabase SQL editor AFTER pasting 0110.
-- It makes throwaway affiliates and throwaway sales, changes their status the way the app does, moves some sales
-- into last month, and checks the percent. At the very end it STOPS ON PURPOSE with a message, which cancels
-- everything it did, so nothing is saved. Read the message in the result box:
--   "ALL CHECKS PASSED. Nothing was saved."  = good
--   "CHECK n FAILED: ..."                    = something is wrong; send the message to Claude
-- It never touches a real affiliate or a real sale.
-- (The old 0109 check is replaced by this one: it expected the all-time count and would now fail on purpose.)

do $$
declare
  v_page   uuid;
  a_aff    uuid;   -- automatic, no history
  b_aff    uuid;   -- automatic, imported with 12 past sales (the November bridge)
  m_aff    uuid;   -- manual 9%
  v_reg    uuid;
  v_ids    uuid[] := '{}';
  v_last_day timestamptz;
  c        record;
  i        integer;
  n        integer;
  v_bridge boolean;
  v_expect integer;
begin
  select id into v_page from public.landing_pages limit 1;
  if v_page is null then
    raise exception 'CHECK STOPPED: there is no landing page to attach a throwaway sale to';
  end if;

  -- A paid sale normally creates a student ID record, and that uses up an ID number even when rolled back.
  -- Switch that one trigger off for this run only (this too is cancelled at the end), so no ID number is used.
  alter table public.landing_registrations disable trigger landing_registrations_person;

  -- The last moment of last month, Pakistan time.
  v_last_day := (date_trunc('month', now() at time zone 'Asia/Karachi') - interval '1 second') at time zone 'Asia/Karachi';
  v_bridge := (now() at time zone 'Asia/Karachi') < timestamp '2026-12-01 00:00:00';
  v_expect := case when v_bridge then 10 else 8 end;

  insert into public.affiliates (name, email, whatsapp, city_country, status, code, token, commission_mode, opening_secured)
  values ('Zz A', 'zz-a-0110@example.invalid', '+920000000001', 'Test', 'accepted', 'ZZ998', 'zz-a-0110-token-00000000000000000', 'automatic', 0)
  returning id into a_aff;
  insert into public.affiliates (name, email, whatsapp, city_country, status, code, token, commission_mode, opening_secured)
  values ('Zz B', 'zz-b-0110@example.invalid', '+920000000002', 'Test', 'accepted', 'ZZ997', 'zz-b-0110-token-00000000000000000', 'automatic', 12)
  returning id into b_aff;
  insert into public.affiliates (name, email, whatsapp, city_country, status, code, token, commission_mode, manual_percent, opening_secured)
  values ('Zz M', 'zz-m-0110@example.invalid', '+920000000003', 'Test', 'accepted', 'ZZ996', 'zz-m-0110-token-00000000000000000', 'manual', 9, 0)
  returning id into m_aff;

  -- 1. Eleven sales for A, all paid this month. None of them can reach 10%: last month is empty, so every one is 8%.
  for i in 1..11 loop
    insert into public.landing_registrations (page_id, row_type, name, email, region, currency, expected_amount, ref_id, affiliate_id)
    values (v_page, 'individual', 'Zz A' || i, 'zz-a' || i || '@example.invalid', 'PK', 'PKR', 10000, 'ZZ0110-A' || i, a_aff)
    returning id into v_reg;
    v_ids := v_ids || v_reg;
    update public.landing_registrations set status = 'paid', amount_received = 10000 where id = v_reg;
  end loop;
  select count(*)::integer into n from public.affiliate_commissions where affiliate_id = a_aff and percent <> 8;
  if n <> 0 then
    raise exception 'CHECK 1 FAILED: sales in the same month must not raise the percent (% of 11 rows were not 8 percent)', n;
  end if;

  -- 2. Move the first ten into last month. The next new sale must now be 10%.
  update public.affiliate_commissions set created_at = v_last_day
   where registration_id in (select unnest(v_ids[1:10]));
  insert into public.landing_registrations (page_id, row_type, name, email, region, currency, expected_amount, ref_id, affiliate_id)
  values (v_page, 'individual', 'Zz A12', 'zz-a12@example.invalid', 'PK', 'PKR', 10000, 'ZZ0110-A12', a_aff) returning id into v_reg;
  update public.landing_registrations set status = 'paid', amount_received = 10000 where id = v_reg;
  select * into c from public.affiliate_commissions where registration_id = v_reg;
  if c.id is null or c.percent <> 10 or c.commission <> 1000 then
    raise exception 'CHECK 2 FAILED: with 10 paid last month the next sale should be 10 percent, PKR 1000 (got percent %, commission %)', c.percent, c.commission;
  end if;

  -- 3. One of last month's sales is cancelled: last month is now 9, so the next sale falls back to 8%.
  update public.landing_registrations set status = 'pending' where id = v_ids[1];
  insert into public.landing_registrations (page_id, row_type, name, email, region, currency, expected_amount, ref_id, affiliate_id)
  values (v_page, 'individual', 'Zz A13', 'zz-a13@example.invalid', 'PK', 'PKR', 10000, 'ZZ0110-A13', a_aff) returning id into v_reg;
  update public.landing_registrations set status = 'paid', amount_received = 10000 where id = v_reg;
  select * into c from public.affiliate_commissions where registration_id = v_reg;
  if c.id is null or c.percent <> 8 then
    raise exception 'CHECK 3 FAILED: with only 9 live paid last month the next sale should be 8 percent (got %)', c.percent;
  end if;

  -- 4. Paid again after being cancelled: the same row comes back at the percent it already had, still one row.
  update public.landing_registrations set status = 'paid', amount_received = 10000 where id = v_ids[1];
  select count(*)::integer into n from public.affiliate_commissions where registration_id = v_ids[1];
  select * into c from public.affiliate_commissions where registration_id = v_ids[1];
  if n <> 1 or c.voided_at is not null or c.percent <> 8 then
    raise exception 'CHECK 4 FAILED: Paid, Pending, Paid should give one live row at the same percent (rows %, percent %)', n, c.percent;
  end if;

  -- 5. Imported with 12 past sales (B): 10% until the end of November 2026, 8% after, if last month is empty.
  insert into public.landing_registrations (page_id, row_type, name, email, region, currency, expected_amount, ref_id, affiliate_id)
  values (v_page, 'individual', 'Zz B1', 'zz-b1@example.invalid', 'PK', 'PKR', 10000, 'ZZ0110-B1', b_aff) returning id into v_reg;
  update public.landing_registrations set status = 'paid', amount_received = 10000 where id = v_reg;
  select * into c from public.affiliate_commissions where registration_id = v_reg;
  if c.id is null or c.percent <> v_expect then
    raise exception 'CHECK 5 FAILED: imported history should give % percent today (got %)', v_expect, c.percent;
  end if;

  -- 6. Manual mode ignores the monthly rule.
  insert into public.landing_registrations (page_id, row_type, name, email, region, currency, expected_amount, ref_id, affiliate_id)
  values (v_page, 'individual', 'Zz M1', 'zz-m1@example.invalid', 'PK', 'PKR', 10000, 'ZZ0110-M1', m_aff) returning id into v_reg;
  update public.landing_registrations set status = 'paid', amount_received = 10000 where id = v_reg;
  select * into c from public.affiliate_commissions where registration_id = v_reg;
  if c.id is null or c.percent <> 9 then
    raise exception 'CHECK 6 FAILED: a manual affiliate at 9 percent should earn 9 percent (got %)', c.percent;
  end if;

  -- Stop on purpose: this cancels everything above, so nothing is saved.
  raise exception 'ALL CHECKS PASSED. Nothing was saved.';
end $$;
