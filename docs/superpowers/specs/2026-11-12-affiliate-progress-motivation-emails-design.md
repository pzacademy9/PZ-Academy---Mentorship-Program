# Affiliate Progress and Motivation emails: design

Date: 2026-11-12. Piece 4 of the affiliates "Earning" step (pieces 1-3 and the leaderboards are merged). Payouts (Step 3)
stay paused. Everything below was decided by the owner in conversation unless marked **(my call)**.
Parent design: `docs/superpowers/specs/2026-11-07-affiliates-design.md` (section "Emails"). Old behaviour reference:
`Miscellaneous/Affiliates GAS` (Google script v4.2, functions `sendPerformanceEmail_` and `sendMotivationalEmail_`).

## Why

About 188 affiliates promote PZ Academy courses. The old script emailed them a performance update every time their paid
count went up, and a "get started" nudge to those with no sales. The app already sends the Accepted, Dropped and Left
emails. It does not yet send the two that keep affiliates active. These two emails are the owner's main way to keep the
affiliates motivated, with no manual work.

## Goals

- **Progress email:** goes out automatically to an affiliate each time one of their registrations turns Paid.
- **Motivation email:** the owner sends it, in one tap, to affiliates who have no paid sale yet.
- **One optional message box** for all affiliates (an announcement or a link), added to Progress and Accepted emails.
- A non-technical owner can run all of it from one admin screen, with no settings to understand.

## Non-goals / anti-goals

- No payout flow (the "Request payout" button is Step 3). No change to how commission is worked out.
- Never show another affiliate's money. Never email Dropped or Left affiliates.
- Not a new look: the emails look like the old ones (see Decisions).
- Must not email someone twice for the same sale, and must not stop a Paid change from saving if an email fails.

## Decisions (owner)

- **Progress email is automatic.** One email each time one of the affiliate's registrations turns Paid, as the old script did.
- **Look: the same as the old emails** (rich HTML: coloured banner, stat boxes, progress bars, buttons, rank table).
  The Accepted, Dropped and Left emails stay plain letters. Rich emails may land in Promotions or spam more often than plain
  letters: test with one real send before relying on it.
- **Progress email content** (from the old script): hello and the promo code; optional message block; green "You can
  withdraw" banner when the balance reaches PKR 3,500 and blue "Certificate unlocked" banner at 10 paid participants;
  stat boxes (paid, commission, rank, commission rate); progress toward the target; "N more to overtake X" or "You are
  rank 1"; top 10 table; goals with progress bars for the certificate and the withdrawal; WhatsApp support button.
- **Withdraw banner wording:** "Message us on WhatsApp with your payment details" (the old wording), until Step 3 builds
  the Request payout button. At that point the wording changes.
- **Privacy (differs from the old email):** the top 10 follows the public board rule: first name + last initial, team colour
  and paid count only. No other affiliate's money. The affiliate sees only their own commission.
- **Motivation email** (from the old script): hello; "you have not secured any registration yet"; their promo code with the
  line that students get a discount and they earn on every paid registration; what they can earn (certificate, withdrawal,
  target); current leader line; top 5 table (same privacy rule); WhatsApp button. Only for affiliates with status Accepted and
  zero paid sales.
- **Motivation is sent by a button** in Admin, Affiliates: a list of the zero-sale affiliates with tick-boxes, all ticked,
  and a Send button. The same person never gets it twice unless the owner chooses to send again.
- **One message box for all affiliates**, in Admin, Affiliates. Filled = added to every Progress and Accepted email.
  Empty = switched off. Any link in the text becomes a button, as in the old script.
- Sender is the existing affiliates Brevo sender (`affiliates@pharmacozyme.com`, own key, 300 emails a day free).

## Constraints

- Phone-first. The owner checks screens on a phone (390px) and a PC (1440px).
- Plain words in every screen the owner reads. No jargon. One clear button per job.
- The app is on the Vercel free plan: daily crons only. Anything that must run every few minutes goes into a Supabase
  `pg_cron` + `pg_net` job (see the sheet-mirror job, `docs/superpowers/plans/2026-10-30-batch-sheet-mirror-owner-steps.md`).
- The 300 emails a day Brevo limit: a bulk Motivation send to many affiliates must stop cleanly at the limit and say how
  many are left, and a Progress email must never be lost because the limit was hit (retry later).
- Database changes are a numbered migration (next free is 0113) that the owner pastes by hand. Hand-add entries to
  `database.types.ts`, never regenerate it.
- Admin-only screens need a Stitch design before building (CLAUDE.md). None exists for the Motivation list or the message
  box: the plan must hand the owner a phone (390px) AND a PC (1440px) prompt, and wait for the screens.

## How it fits the existing system (builder notes, **my calls**)

- Every registration that turns Paid already creates one row in `affiliate_commissions` through the trigger
  `landing_registrations_affiliate_commission` (migration 0109), whichever way it turned Paid (admin screen, sheet
  mirror, sheet sync). So the Progress email is driven by those rows, not by each code path.
- **Progress sending:** add a "progress email sent at" marker on `affiliate_commissions` rows. A small job (Supabase
  `pg_cron` + `pg_net`, every few minutes, calling a new cron route like `/api/cron/sheet-mirror` does) sends one Progress
  email per affiliate for the not-yet-emailed rows. **If an affiliate has several new Paid rows since the last run, send one
  email, not one per row.** Voided rows (`voided_at` set) are never emailed. Rows created before this ships are marked as
  already emailed in the migration, so the first run does not email every old sale.
- **Motivation sending:** a server action behind the existing affiliates admin guard. "Already sent" comes from the
  `affiliate_emails` history table (add the kinds `progress` and `motivation` to `AffiliateEmailKind`).
- **Message box:** one text value stored once (a single-row settings table or an existing settings table, builder's choice).
  Plain text only, escaped; links turned into buttons only for `https://` addresses.
- Reuse `src/lib/affiliates/send.ts` (`deliver`, logging, never throws), `src/lib/affiliates/emails.ts` (`esc`, `safeUrl`),
  `src/lib/data/affiliate-leaderboard.ts` (rank and board rows), `src/lib/affiliates/leaderboard.ts` (ordering, team rules),
  `src/lib/data/affiliate-page.ts` (earned, balance, monthly percent). Rich email HTML goes in a new file so the plain emails
  stay untouched.
- Email-safe HTML only: inline styles and tables, no scripts. Every value written into the HTML is escaped.
- The commission rate shown is the affiliate's real current percent (8 or 10 from the monthly rule), not a fixed number.

## More calls made after the builder check (**my calls**)

- **Not Accepted at pick-up time (Dropped, Left, waiting):** the row is marked as handled and no email goes. A person who
  is accepted again later does NOT get a catch-up email about old sales.
- **One email covers all new rows.** The Progress email shows current totals only (paid, commission, rank), never a
  per-sale line. The job remembers which rows it covered and marks them all only after the send works, so a retry never
  skips or double counts.
- **Daily limit (300):** the day's count is taken from today's `sent` rows in `affiliate_emails`. Progress emails come
  first. The Motivation bulk send stops at 250 sent in the day, so Progress always has room, and tells the owner how many
  are left for tomorrow. A failed Progress send is retried on the next run, up to 5 tries, then left and shown as failed
  in the affiliate's email history.
- **Motivation "send again":** the list has one switch, "Also show people who already got it", off by default. A failed
  send does not count as sent.
- **Message box in Accepted:** the Accepted email stays a plain letter, so the message is added as plain text with any
  link written out as a normal clickable address. Links become buttons only in the rich Progress email.
- **`affiliate_emails.kind` has a CHECK constraint (migration 0108):** migration 0113 widens it to add `progress` and
  `motivation`. The builder checks that no other table or view lists the kinds.
- **Rank in the email is the all-time rank** (the same as "All time" on the board and "Your rank"), with "N more to
  overtake X" on the same basis. The commission rate shown follows the monthly rule. Say "all time" in the email so it is
  not confused with the month board.
- **A sale that is cancelled and then turns Paid again** (the trigger restores the same row): accepted that it gets no new
  Progress email. The affiliate still sees it on their page. We do not edit the trigger.

## Left to the builder

Table and column names, the exact job interval, email wording beyond the old copy, the layout of the admin screen once the
Stitch screens exist, tests. Test with a real send to one owner-controlled address before any bulk send. The Motivation
bulk send is never run against all affiliates during development: only a test affiliate.

## Open items for the owner (not blocking the design)

- Whether rich emails reach the main inbox: judged after the first real send.
- The old script's per-person message column is dropped on purpose (one message box instead).
