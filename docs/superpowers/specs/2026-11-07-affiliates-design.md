# Affiliates system: design

Date: 2026-11-07. Project 3 of 3 (promo engine and agent codes are merged: PRs #109, #110).
Replaces the old Google Sheets + Apps Script affiliate system
(`Miscellaneous/V2.0-Affiliate Marketing Team Recruitment Form .xlsx`, `Miscellaneous/Affiliates GAS`).
Everything below was decided by the owner in conversation unless marked **(my call)**.

## Why

About 188 affiliates promote PZ Academy courses to their networks and earn commission. Today it runs on a
spreadsheet plus a script that emails them. It breaks when sheets change, cannot show affiliates their own
numbers, and cannot sit beside the new promo code engine. Affiliates are not students and must not need accounts.

## Goals

- Hidden application page (not linked from the main site) with the old form's questions.
- Admin accepts or drops applicants. Accepting creates the code and a private link and emails it.
- Each affiliate has a private page (secret link, no login): code, personal link per open course, views,
  registered and paid counts, percent, commission earned, balance, payout history, leaderboard.
- Commission is a percent of the amount actually paid (after discount), counted only once a registration is Paid.
- A public leaderboard page (no login), shareable in WhatsApp groups, in the style of the progress portal.
- Progress emails like the old script (see "Emails").
- "Request payout" button; admin pays by hand and marks it paid.
- Import the 188 old affiliates with their codes and an opening balance.

## Non-goals / anti-goals

- No affiliate logins or accounts. No money moves through the system.
- Old affiliate codes are never changed or renumbered.
- Not a rebuild of the sales agents system (agents keep logins and their own `PZ-` codes).
- Do not show money amounts on the public leaderboard.

## Decisions (owner)

- **Code format:** first letter of the first name + first letter of the last name, titles ignored
  (Dr, Mr, Ms, Mrs, Prof, Engr and similar), then the next serial number. A one-word name uses its first two
  letters. Serial starts at 321 (old maximum is 320) and is never reused. Admin may edit the code before accepting.
  Old codes follow the same pattern (2 letters + running number; 34 use 3 letters; 21 numbers repeat with
  different letters). They keep their codes exactly.
- **Discount:** a plain affiliate code gives 10%, `CODE-NN%` gives NN% up to the 30% admin ceiling (the engine
  from PR #109). Credit goes to the base code's owner.
- **Commission:** 8 to 10 percent. Each affiliate is in Manual mode (admin types 8 to 10) or Automatic mode.
  **(my guess, owner agreed)** Automatic: 8% until 10 paid participants, then 10%. New affiliates start in Automatic.
  Counts only Paid registrations; percent applies to the amount paid after discount.
- **Payout:** button enabled at a balance of PKR 3,500 or more. Affiliate enters JazzCash/Easypaisa/bank
  details when pressing it. Admin pays outside the system and taps "Mark paid". Certificate stays at 10 participants.
- **Delivery of the private link:** automatic email on accept, plus a copy-link button for WhatsApp.
- **Form questions:** all the old questions, merged into one list (names, email, WhatsApp, city/country,
  student or professional, university/organization, field, commission experience + details, events managed +
  details, familiarity promoting programs, lead/sales experience, four 1-to-5 skill ratings, hours per week,
  LinkedIn (optional), why join). Admin sees every answer when deciding.
- **Teams:** optional color label kept (Green, White, Yellow, Blue, Pink).
- **Leaderboard:** shown to affiliates on their private page and on a public page; periods "All time" and
  "This month". Same look as the progress portal (podium, list, share picture, "Copy for WhatsApp" text).
  **(my call)** Public page shows rank, first name + last initial, team color and paid count only.
- **Emails** (own sender, `affiliates@pharmacozyme.com`, verified, own Brevo account and key,
  300/day free limit, separate from the main and participants accounts): Accepted (code, link, how it works,
  goals, WhatsApp group + support buttons), Dropped, Left, Progress (on each new paid registration: counts,
  commission, rank, progress bar, "N more to overtake X", top 10, withdraw and certificate banners), Motivation
  (no sales yet; admin-triggered), plus an optional admin message block on Accepted and Progress.
  The key lives only in Vercel environment variables, never in the repo.
- **Old history:** imported as an opening balance per affiliate.
- **Views:** bot and preview visits are not counted (already merged).

## Claims and risks (owner approved safer wording, 2026-11-07)

Public copy must not overclaim. Approved wording lives in the Step 1 plan (Task 6). In short: never "official",
"ambassador", "encrypted", a review time, "instant", "weekly", Raast, tiers or a percent other than 8 to 10.
Commission is described as a percent of what the student pays once payment is confirmed. Risks recorded:
(1) commission is on the post-discount paid amount, so students typing a bigger `-NN%` lowers it; (2) the plain 10%
can be set to 0 per person, so the page says "Students get 10% off with your code" only while that is true
(review the wording if the owner ever lowers a plain percent); (3) payout is manual, so no timing is promised;
(4) spam by affiliates: applicants must tick a short affiliate rules text the owner approves, stored as
`rules_accepted_at`; (5) personal data: one privacy line on the form; (6) no application reference numbers.

## Policies (owner request, 2026-11-07)

Three public documents, edited by the owner in the admin Terms screen and shown on the application page:
Affiliate Terms and Conditions, Affiliate Rules (conduct and anti-spam), Affiliate Privacy Policy. Drafts (not legal
advice, lawyer review needed, ten owner choices listed at the end) are in `docs/affiliates/affiliate-policies-draft.md`.
Applications stay closed until all three are published. Each applicant's row records which version they agreed to.

## How it fits the existing system (builder notes, **my calls**)

- Affiliates have no `profiles` row, so they need their own table (`affiliates`) with a unique private token,
  and landing registrations and promo owner codes need an affiliate reference beside the existing agent one.
  Needs a numbered migration (next is 0107) that the owner pastes by hand.
- Reuse the owner-code engine (`promo-resolve.ts`, `promo-suffix.ts`) so affiliate codes behave exactly like agent codes.
- Reuse `brevo-participants.ts` as the pattern for a separate affiliates sender
  (`BREVO_API_KEY_AFFILIATES`, `BREVO_SENDER_EMAIL_AFFILIATES`, `BREVO_SENDER_NAME_AFFILIATES`).
- Commission must be fixed per sale at the moment it becomes Paid (so changing someone's percent later does not
  rewrite history). Detailed in the Step 2 plan.
- Admin: one new "Affiliates" screen with tabs Applications, Affiliates, Payouts, Leaderboard, behind its own
  permission area; sales-hub style access.
- The private page and public leaderboard are public routes keyed by an unguessable token, rate-limited,
  with no indexing (`noindex`).

## Build in 3 steps (each on its own branch, own review, owner pastes each migration)

1. **Foundation:** migration, application page, admin Applications + Affiliates tabs, Accept/Drop with code
   and token and the Accepted/Dropped/Left emails, the old-affiliate import.
2. **Earning:** credit by link and code, commission snapshot, private page, links per course, views/registered/paid,
   leaderboards (private + public + share), Progress and Motivation emails.
3. **Payouts:** Request payout, Payouts tab, Mark paid, balances.

## Left to the builder

Table and column names, token length, import mechanics, layout details, email wording (copy the old tone), tests.
Everything must be phone-first (the owner checks on a phone).
