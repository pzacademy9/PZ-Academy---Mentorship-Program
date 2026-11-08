# Affiliates Step 2 (Earning): your steps

Plain words. Do them in this order. Nothing here is done for you: you paste the SQL and you press merge.

## What this adds

- Every accepted affiliate gets a working discount code (the 164 already accepted, and every new one when you press Accept).
- A student who uses an affiliate's link or code is credited to that affiliate.
- The moment a sale turns Paid, its commission is saved as a fixed number. If the sale stops being Paid, that commission is cancelled. If it turns Paid again, the same commission comes back.
- Each affiliate has a private page at their secret link, with their numbers, money and a link for every open course.

## 1. Paste the SQL first (before you merge)

1. Open the file `supabase/migrations/0109_affiliate_earning.sql`.
2. Copy everything, paste it in the Supabase SQL editor, press Run. It is safe to run twice.
3. Tell me "pasted". I check three things with read-only questions:
   - the new tables and columns exist,
   - the trigger exists,
   - there are now 164 new affiliate discount codes.

**Why first:** the new code writes to the new columns. If it goes live before the SQL, normal visitors are not affected, but an affiliate link would not be credited until the SQL is pasted.

## 2. Know what switches on

- **164 affiliate codes start giving students a discount** the moment you paste: typed plain, the code gives 10% off. Typed as `CODE-15%`, it gives 15%, up to the 30% limit you set in Promo codes. If you do not want that yet, tell me before you paste and I will change the SQL.
- Those codes show in the **Promo codes** screen as owner codes. Their owner column is blank because the owner is an affiliate, not a sales agent.
- Dropping or marking an affiliate as Left switches their code off. Commission they already earned stays.

## 3. Merge and deploy

I will give you the compare link when you say "push". You open the PR and merge it.

## 4. Live check, together (about 10 minutes)

I do the clicking, you watch. We use a test affiliate and a test student with your own email:

1. Accept a test applicant. Check the welcome email arrives and the code shows in Promo codes.
2. Open a published course page with `?ref=<the code>` and register as a test student. **Do not use the admin "test mode"**: test registrations are never credited, on purpose.
3. In Registrations, mark that registration Paid. Check one commission row appears with the right percent.
4. Mark it Pending, then Paid again. Check there is still only one commission row.
5. Open the affiliate's private link on your phone. Check the numbers match.
6. Clean up: I give you one SQL line to delete the test affiliate and the test registration.

## 5. Before you accept real applicants

All of these must be true:

- 0109 is pasted and the deploy is live.
- The three policy documents are pasted (Terms, Rules, Privacy) so applications are open.
- The live check above passed.

## 6. Still to do later (not in this step)

- **Foreign commission (AED, SAR...)** is saved in its own currency and shown on the affiliate's page as "Waiting to be converted". The screen where you type the PKR value comes in Step 3 (payouts).
- **Before any payout:** your affiliates manager must fix the "withdrawn so far" amounts of the imported affiliates, or someone could be paid twice.
- Leaderboards (private and public) and the Progress and Motivation emails are separate builds.
- The page has a light look only. The dark view in the design was a preview switch.
