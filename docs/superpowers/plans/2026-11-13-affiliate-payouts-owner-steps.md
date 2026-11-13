# Affiliate payouts: owner steps

What was built: an affiliate with PKR 3,500 or more can press **Request payout** on their private page. The whole balance
is requested and the balance drops at once. You see every request in **Affiliates > Payouts**, pay by hand outside the app,
then press **Mark paid** (or **Reject** with a reason, which puts the money back). The affiliate gets an email either way.
Affiliates is now its own section with its own menu (sidebar on PC, bottom bar on phone).

Do the steps in order. Nothing works until step 1. Test ONLY on the test affiliate (name Test, code TE324). Never use a
real affiliate. The app never moves money; it only records.

## Step 1. Paste the database change (0114), after the code is live on the site

1. Open the Supabase SQL editor (project whqdasotjlhvrjmgiffk).
2. Paste the whole file `supabase/migrations/0114_affiliate_payouts.sql` and press Run. It is safe to run twice.
3. Paste this check and press Run:

```sql
select
  (select count(*) from public.affiliate_payouts) as payout_rows,
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'affiliate_emails_kind_check') as email_kinds;
```

You should see `payout_rows` = 0, and `email_kinds` is a line that includes both `payout_paid` and `payout_rejected`.
If the first query says the table does not exist, step 1 did not run. Tell me.

## Step 2. Give the test affiliate a balance of about PKR 4,120.75

First write down what the test affiliate has now. Paste and run:

```sql
select id, name, code, email, token, opening_commission, opening_withdrawn
from public.affiliates
where id = '6b618da6-5eff-4db9-9297-3f7b5c2bad9c';
```

Copy the whole result row somewhere safe (a note on your phone is fine). You need `opening_commission` and
`opening_withdrawn` for the clean-up in step 4. The `token` is the secret part of the private page link.

Now set the balance. This changes ONLY the test affiliate. Paste and run:

```sql
update public.affiliates a
set opening_commission = 4120.75 + a.opening_withdrawn
      - coalesce((select sum(coalesce(c.commission_pkr, case when c.currency = 'PKR' then c.commission end))
                  from public.affiliate_commissions c
                  where c.affiliate_id = a.id and c.voided_at is null), 0)
      - coalesce((select sum(p.amount_pkr) from public.affiliate_payouts p
                  where p.affiliate_id = a.id and p.status in ('pending', 'paid')), 0)
where a.id = '6b618da6-5eff-4db9-9297-3f7b5c2bad9c';
```

Run it only once. You should see "Success. 1 row affected".

## Step 3. The live test (all on the test affiliate)

### 3a. Look at the private page

1. Open `https://pz-academy.pharmacozyme.com/affiliate/<token>` (use the `token` you copied in step 2).
2. The Balance card should read **PKR 4,120.75** and show a button **Request payout of PKR 4,120.75**.
3. Check this on your phone AND on the PC. The card must look tidy on both.
4. (Optional, to see the other two card states.) Under 3,500: change the number in step 2 to 1,000, look, then change back.
   You should see a disabled button saying "Available from PKR 3,500". The third state (requested) appears in 3b.

### 3b. Ask for a payout

1. Press **Request payout of PKR 4,120.75**. A sheet opens (phone) or a box opens (PC).
2. Choose **JazzCash**. Account title: `Test Person`. Number: `03001234567`.
3. Check the sheet says the whole balance is paid in one go. Press Confirm.
4. The Balance card should now show PKR 0 and a calm note: "Payout of PKR 4,120.75 requested".
5. Under **Payout history** there is one row: PKR 4,120.75, JazzCash, Pending. The number shows only the mask (last four
   digits), never the full number.
6. Reload the page. Everything should still be the same.

### 3c. See it in Admin

1. Open Admin and press **Affiliates**. The menu changes: Applications, Affiliates, Payouts, Leaderboard, Emails and
   Back to Admin. The tab strip inside the page is gone.
2. On the phone, the bottom bar changes to the Affiliates items (4 items and a More button).
3. Open **Payouts**. Pending should show 1.
4. The card shows: the name **Test** next to the account title **Test Person**, JazzCash, the full number
   03001234567 with a copy button, and the amount PKR 4,120.75.

### 3d. Mark paid

1. Press **Mark paid** on the card. It moves to Paid.
2. Press the Paid filter, find the card, and try pressing Mark paid again if the button is still there, or open the
   page in a second tab and press it there. Nothing should change the second time (no second email, no error).
3. Open the inbox of hamzaansari4you@gmail.com. A "paid" email should arrive within a minute. Tell me which tab it
   landed in (Primary, Promotions or Spam). The amount must read **PKR 4,120.75**, with the method and the date.
4. Open the private page. The history row now says Paid. The balance is still 0.

### 3e. A second request, then Reject

1. Put the balance back (paste the step 2 SQL again; it works out the right number because paid money is counted).
   The page should again show **Request payout of PKR 4,120.75**.
2. Request again with the same test details as in 3b.
3. In Admin > Payouts press **Reject**. Type a reason (for example "Wrong account number") or pick a quick reason.
   Reject must not work without a reason.
4. The card moves to Rejected. Open the inbox: a "rejected" email arrives with the reason and the words that the amount
   is back in the balance. Check which tab it lands in.
5. Open the private page. The balance is PKR 4,120.75 again, and the history shows Rejected with your reason.

## Step 4. Clean up the test rows

This deletes ONLY the test affiliate's rows. Paste and run:

```sql
delete from public.affiliate_emails
where affiliate_id = '6b618da6-5eff-4db9-9297-3f7b5c2bad9c'
  and kind in ('payout_paid', 'payout_rejected');

delete from public.affiliate_payouts
where affiliate_id = '6b618da6-5eff-4db9-9297-3f7b5c2bad9c';

-- Put back the numbers you wrote down in step 2. Replace the two numbers below.
update public.affiliates
set opening_commission = 0,   -- replace 0 with the opening_commission you copied
    opening_withdrawn  = 0    -- replace 0 with the opening_withdrawn you copied
where id = '6b618da6-5eff-4db9-9297-3f7b5c2bad9c';
```

Then check it is clean:

```sql
select
  (select count(*) from public.affiliate_payouts where affiliate_id = '6b618da6-5eff-4db9-9297-3f7b5c2bad9c') as test_payouts,
  (select count(*) from public.affiliate_emails where affiliate_id = '6b618da6-5eff-4db9-9297-3f7b5c2bad9c' and kind in ('payout_paid', 'payout_rejected')) as test_payout_emails,
  (select opening_commission from public.affiliates where id = '6b618da6-5eff-4db9-9297-3f7b5c2bad9c') as opening_commission,
  (select opening_withdrawn from public.affiliates where id = '6b618da6-5eff-4db9-9297-3f7b5c2bad9c') as opening_withdrawn;
```

You should see 0, 0, and your two original numbers.

## Step 5. Things to know

- **"Request by WhatsApp" no longer exists.** The only way to ask is the button on the private page.
- The **Progress email** no longer says "message us on WhatsApp". It now says to open the page and press Request payout,
  with a link to the page. Its balance now takes payouts off.
- A pending request needs you: **check Affiliates > Payouts once a week** (or more often) and clear the Pending list.
  The card shows the affiliate's name beside the account title. If the two names look like different people, do not pay
  until you have asked the affiliate (the private link has no password, so a leaked link could ask for a payout).
- If a payout is marked wrongly paid, there is no undo button. Tell me and I will give you SQL to fix it.
- If the email cannot be sent, the payout is still saved and you see a short notice. The attempt is listed in the
  affiliate's email history.

## What to look at on your PHONE

1. The new **Affiliates bottom bar**: 4 items plus More, and Back to Admin inside More.
2. The **payout sheet** on the private page: easy to tap, the number keyboard opens for the number, nothing is cut off.
3. The **Payouts cards** in Admin: name, account title, amount, copy button, Mark paid and Reject buttons are big enough
   to press with a thumb, and nothing scrolls sideways.
