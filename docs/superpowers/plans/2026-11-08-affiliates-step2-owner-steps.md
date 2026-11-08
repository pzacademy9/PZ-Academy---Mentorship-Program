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

**Why first:** the new code needs the new columns. If the code goes live before the SQL:
- Students and promo codes keep working (the site falls back to the old columns), but
- an affiliate's link or code is **not credited**, new commission is **not saved**, and the affiliate's private page shows an error.

So paste first, then merge. Never the other way round.

## 1b. Run the safety check (2 minutes, saves nothing)

1. Open `supabase/checks/0109_affiliate_earning_check.sql`, copy everything, paste it in the SQL editor, press Run.
2. It makes a throwaway affiliate and a few throwaway sales, changes their status like the app does, and checks the commission rows. At the very end it **stops on purpose** with a message, which cancels everything, so nothing is saved and no student ID number is used.
3. Read the message in the result box:
   - `ALL CHECKS PASSED. Nothing was saved.` means good.
   - `CHECK n FAILED: ...` means something is wrong. Send me the message and do **not** merge.
4. For about a second the registrations table is locked while it runs. Do it when nobody is registering.

It checks: one commission per sale at 8%; the second sale at 10% (the affiliate in the test already has 9); cancelled when a sale stops being Paid and restored (not doubled) when it turns Paid again; the commission following a corrected amount; group members earning nothing; test sales earning nothing; and foreign-priced sales (below).

## About foreign-priced sales

On this site the **amount received is always in PKR**, even for a course priced in AED or SAR (the status pop-up asks for PKR, because the bank statement is in PKR). So:
- a sale with an amount received is saved as **PKR** commission, with nothing to convert;
- only a sale marked Paid with **no** amount received is saved in its own currency (AED, SAR) and shows on the affiliate's page as "Waiting to be converted to PKR". You convert those by hand in Step 3.

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

- **Foreign commission with no amount received** is saved in its own currency and shown on the affiliate's page as "Waiting to be converted". The screen where you type the PKR value comes in Step 3 (payouts).
- **Sales credited to an affiliate while they were accepted still earn** if they turn Paid after the affiliate is dropped. Tell me if you want that to stop.
- **Sales that were already Paid before this step** are not turned into commission rows. Only sales that turn Paid from now on count. Imported old affiliates keep their old opening amounts.
- **Before any payout:** your affiliates manager must fix the "withdrawn so far" amounts of the imported affiliates, or someone could be paid twice.
- Leaderboards (private and public) and the Progress and Motivation emails are separate builds.
- The page has a light look only. The dark view in the design was a preview switch.
