-- 0109_affiliate_earning_check.sql
-- A safety check for migration 0109. Paste it in the Supabase SQL editor AFTER pasting 0109.
-- It makes a throwaway affiliate and a few throwaway sales, changes their status the way the app does, and checks
-- the commission rows. At the very end it STOPS ON PURPOSE with a message, which cancels everything it did, so
-- nothing is saved. Read the message in the result box:
--   "ALL CHECKS PASSED. Nothing was saved."  = good
--   "CHECK n FAILED: ..."                    = something is wrong; send the message to Claude
-- It never touches a real affiliate or a real sale.

do $$
declare
  v_page uuid;
  v_aff  uuid;
  s1     uuid;  -- first sale, PKR
  s2     uuid;  -- group lead, PKR (the second sale)
  mem    uuid;  -- a member of that group
  s3     uuid;  -- priced in AED, amount received typed in PKR
  s4     uuid;  -- priced in SAR, no amount received yet
  s5     uuid;  -- a test sale
  c      record;
  n      integer;
begin
  select id into v_page from public.landing_pages limit 1;
  if v_page is null then
    raise exception 'CHECK STOPPED: there is no landing page to attach a throwaway sale to';
  end if;

  -- A paid sale normally creates a student ID record, and that uses up an ID number even when rolled back.
  -- Switch that one trigger off for this run only (this too is cancelled at the end), so no ID number is used.
  alter table public.landing_registrations disable trigger landing_registrations_person;

  -- An automatic affiliate who already has 9 paid participants: the next sale is 8%, the one after it 10%.
  insert into public.affiliates (name, email, whatsapp, city_country, status, code, token, commission_mode, opening_secured)
  values ('Zz Check', 'zz-check-0109@example.invalid', '+920000000000', 'Test', 'accepted', 'ZZ999', 'zz-check-0109-token-0000000000000000', 'automatic', 9)
  returning id into v_aff;

  insert into public.landing_registrations (page_id, row_type, name, email, region, currency, expected_amount, ref_id, affiliate_id)
  values (v_page, 'individual', 'Zz One', 'zz1@example.invalid', 'PK', 'PKR', 10000, 'ZZCHK-1', v_aff) returning id into s1;
  insert into public.landing_registrations (page_id, row_type, name, email, region, currency, expected_amount, ref_id, affiliate_id)
  values (v_page, 'lead', 'Zz Lead', 'zz2@example.invalid', 'PK', 'PKR', 5000, 'ZZCHK-2', v_aff) returning id into s2;
  insert into public.landing_registrations (page_id, row_type, name, email, region, currency, expected_amount, lead_registration_id, affiliate_id)
  values (v_page, 'member', 'Zz Member', 'zz2m@example.invalid', 'PK', 'PKR', 5000, s2, v_aff) returning id into mem;
  insert into public.landing_registrations (page_id, row_type, name, email, region, currency, expected_amount, ref_id, affiliate_id)
  values (v_page, 'individual', 'Zz Three', 'zz3@example.invalid', 'AE', 'AED', 100, 'ZZCHK-3', v_aff) returning id into s3;
  insert into public.landing_registrations (page_id, row_type, name, email, region, currency, expected_amount, ref_id, affiliate_id)
  values (v_page, 'individual', 'Zz Four', 'zz4@example.invalid', 'SA', 'SAR', 200, 'ZZCHK-4', v_aff) returning id into s4;
  insert into public.landing_registrations (page_id, row_type, name, email, region, currency, expected_amount, ref_id, affiliate_id, is_test)
  values (v_page, 'individual', 'Zz Test', 'zz5@example.invalid', 'PK', 'PKR', 1000, 'ZZCHK-5', v_aff, true) returning id into s5;

  -- 1. Pending -> Paid: one row, 8%, PKR.
  update public.landing_registrations set status = 'paid', amount_received = 10000 where id = s1;
  select * into c from public.affiliate_commissions where registration_id = s1;
  if c.id is null or c.percent <> 8 or c.commission <> 800 or c.currency <> 'PKR' or c.commission_pkr <> 800 or c.voided_at is not null then
    raise exception 'CHECK 1 FAILED: first sale should be one live row at 8 percent, PKR 800 (got percent %, commission %, currency %)', c.percent, c.commission, c.currency;
  end if;

  -- 2. Paid -> Pending: the commission is cancelled, not deleted.
  update public.landing_registrations set status = 'pending' where id = s1;
  select * into c from public.affiliate_commissions where registration_id = s1;
  if c.id is null or c.voided_at is null then
    raise exception 'CHECK 2 FAILED: a sale that stopped being Paid should keep its row, cancelled';
  end if;

  -- 3. Pending -> Paid again: the same row comes back, still one row.
  update public.landing_registrations set status = 'paid', amount_received = 10000 where id = s1;
  select count(*)::integer into n from public.affiliate_commissions where registration_id = s1;
  select * into c from public.affiliate_commissions where registration_id = s1;
  if n <> 1 or c.voided_at is not null or c.percent <> 8 then
    raise exception 'CHECK 3 FAILED: Paid, Pending, Paid should give one live row at the same percent (rows %, percent %)', n, c.percent;
  end if;

  -- 4. The amount received is corrected while the sale stays Paid: the commission follows, at the same percent.
  update public.landing_registrations set amount_received = 12000 where id = s1;
  select * into c from public.affiliate_commissions where registration_id = s1;
  if c.amount_paid <> 12000 or c.commission <> 960 or c.percent <> 8 then
    raise exception 'CHECK 4 FAILED: a corrected amount should give commission 960 at 8 percent (got amount %, commission %)', c.amount_paid, c.commission;
  end if;

  -- 5. A group: the lead earns, the member does not. And this is the second sale: 9 + 1 = 10, so 10%.
  update public.landing_registrations set status = 'paid', amount_received = 5000 where id in (s2, mem);
  select * into c from public.affiliate_commissions where registration_id = s2;
  if c.id is null or c.percent <> 10 or c.commission <> 500 then
    raise exception 'CHECK 5 FAILED: the second sale should be at 10 percent, PKR 500 (got percent %, commission %)', c.percent, c.commission;
  end if;
  select count(*)::integer into n from public.affiliate_commissions where registration_id = mem;
  if n <> 0 then
    raise exception 'CHECK 5 FAILED: a group member must not earn a commission of its own';
  end if;

  -- 6. Priced in AED but the amount received is typed in PKR: saved as PKR, nothing waits.
  update public.landing_registrations set status = 'paid', amount_received = 7000 where id = s3;
  select * into c from public.affiliate_commissions where registration_id = s3;
  if c.currency <> 'PKR' or c.amount_paid <> 7000 or c.commission_pkr is null or c.commission_pkr <> c.commission then
    raise exception 'CHECK 6 FAILED: an amount received is PKR even for an AED price (got currency %, amount %)', c.currency, c.amount_paid;
  end if;

  -- 7. Priced in SAR and marked Paid with no amount received: saved in SAR, waiting for a manual PKR conversion.
  update public.landing_registrations set status = 'paid' where id = s4;
  select * into c from public.affiliate_commissions where registration_id = s4;
  if c.currency <> 'SAR' or c.amount_paid <> 200 or c.commission_pkr is not null then
    raise exception 'CHECK 7 FAILED: a foreign sale with no amount received should wait, in SAR (got currency %, pkr %)', c.currency, c.commission_pkr;
  end if;

  -- 8. A test sale never earns.
  update public.landing_registrations set status = 'paid', amount_received = 1000 where id = s5;
  select count(*)::integer into n from public.affiliate_commissions where registration_id = s5;
  if n <> 0 then
    raise exception 'CHECK 8 FAILED: a test sale must not earn a commission';
  end if;

  -- 9. Exactly four live rows in all: the first sale, the group lead, the AED sale and the SAR sale.
  select count(*)::integer into n from public.affiliate_commissions where affiliate_id = v_aff and voided_at is null;
  if n <> 4 then
    raise exception 'CHECK 9 FAILED: expected 4 live commission rows, found %', n;
  end if;

  -- Stop on purpose: this cancels everything above, so nothing is saved.
  raise exception 'ALL CHECKS PASSED. Nothing was saved.';
end $$;
