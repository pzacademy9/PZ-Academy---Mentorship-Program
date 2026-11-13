# Affiliate payouts: design

Date: 2026-11-13. Step 3 of `2026-11-07-affiliates-design.md` (Payouts: Request payout, Payouts tab, Mark paid, balances).
Owner is not technical: short plain words in anything the owner reads, phone-first layouts.

## Why

Affiliates earn commission. At PKR 3,500 they may ask to be paid, but today the only route is a WhatsApp message, nothing
records it, and the Balance shown on their page never goes down after a payment. The owner pays by hand (JazzCash,
Easypaisa or bank) and needs one place that holds every request, what was paid, and what was refused.

## Goals

- An affiliate with a balance of PKR 3,500 or more presses **Request payout** on their private page, picks how to be paid,
  types the account details, and confirms. The **whole balance** is requested (owner ruling: no partial amounts).
- The balance drops straight away, so the same money cannot be requested twice.
- The owner sees every request in a new **Payouts** tab (Pending, Paid, Rejected), pays outside the app, then presses
  **Mark paid**, or **Reject** with a required reason. Reject puts the money back in the balance.
- The affiliate sees a **Payout history** on their page (amount, date, method, status, reject reason).
- The affiliate gets an **email** when a payout is marked paid and when it is rejected (owner ruling 2026-11-13).
- Request is by the page button **only**. The Progress email stops saying "message us on WhatsApp to withdraw" and
  points to the private page instead (owner ruling).

- Affiliates becomes its own section, like the Sales Hub (owner request 2026-11-13): opening it swaps the sidebar (PC) and
  the bottom bar (phone) to Applications, Affiliates, Payouts, Leaderboard, Emails and "Back to Admin". The tab strip
  inside the page goes away; the sidebar is the navigation.

## Non-goals and anti-goals

- No partial payouts, no bulk Mark paid, no CSV export, no SMS/WhatsApp notices, no receipts or batch numbers, no
  "turnaround time" promise, no undo of Mark paid (a wrong click is fixed by SQL by the owner).
- Nothing the Stitch screens invented as facts: no "15% commission", "Partner Tier", conversion tiles, "CNIC verified",
  NADRA/FBR/SBP lines, "Live Gateway", "Avg turnaround". Port the layout and real copy only.
- Never move money: the app only records. Failure mode to avoid: an affiliate paid twice, or a balance that is wrong.
- Never show full account numbers to anyone but admins.

## Constraints

- Tables are service-role only (RLS on, no policies); read and written through `createAdminSupabase()`. The owner pastes
  the migration by hand (next free number: 0114). Hand-add `database.types.ts` entries; never regenerate.
- The threshold is `WITHDRAW_PKR = 3500` (today a constant in `rich-emails.ts`). One shared constant; the server enforces it.
- Current balance is `balancePkr()` in `src/lib/affiliates/commission.ts` = opening commission - opening withdrawn + live
  PKR commissions. It is used by the private page (`src/lib/data/affiliate-page.ts`) and the Progress email
  (`src/lib/data/affiliate-progress.ts`). Both must subtract payouts, or the "withdrawal available" banner and the
  button disagree.
- The private page (`/affiliate/[token]`) has no login: the secret link is the key, behind `affiliatePageCallerAllowed()`.
  A leaked link could request a payout to someone else's account. Accepted risk, because every payout is paid by hand:
  the admin card shows the affiliate's name next to the account title so a mismatch is obvious before paying.
- Dropped or left affiliates see the closed page, so they cannot request. A pending request of theirs still shows to the
  admin, who can pay or reject it.
- Phone-first. Colours: backgrounds and borders use `pz-solid-*` / `landing-*` tokens; `pz-deep`, `pz-mid`, `pz-danger` are text only.

## Approaches considered

1. **Payouts table as the only record (chosen).** New table `affiliate_payouts`; balance = opening - opening withdrawn +
   commissions - payouts that are pending or paid. A rejected payout simply stops counting, so the money returns with no
   extra step. Cannot drift from the history list because both read the same rows.
2. **A stored balance number on the affiliate, changed on request and on reject.** Simple to read, but two writes must
   always agree, and one missed write makes the balance wrong for good. Ruled out.
3. **Reuse `opening_withdrawn` (add to it when paid).** Hides the history and cannot represent "pending" or a rejection.
   Ruled out.

## Design

**Data** (migration 0114, safe to paste twice): table `affiliate_payouts` with id, affiliate_id (references affiliates),
amount_pkr, method (`jazzcash`, `easypaisa`, `bank`), account_title, account_number, status (`pending`, `paid`,
`rejected`), reject_reason, requested_at, decided_at. A partial unique index allows only one `pending` row per
affiliate. Checks: amount at least 3,500; a rejected row has a reason. Also add the email kinds `payout_paid` and
`payout_rejected` to `affiliate_emails_kind_check` (same pattern as migration 0113).

**Request (affiliate):** `POST /api/affiliates/payout` with the private token, method, title, number. Server: rate
limit, find the live affiliate, lock the affiliate row, recompute the balance (same rules as the page, minus payouts),
refuse under 3,500, insert one pending row for the **whole** balance, return the new state. Validation (builder may
tighten): title 2 to 80 characters; JazzCash/Easypaisa number is 11 digits starting 03 (spaces and dashes removed); bank
is a 24-character Pakistani IBAN (`PK` + 22). Errors are plain sentences.

**Navigation:** `Sidebar` gets an Affiliates hub mode, entered when the path is under `/dashboard/admin/affiliates`, the way `isSalesHubPath` enters Sales Hub mode (`src/components/dashboard/Sidebar.tsx`, `nav.ts`). Hub items link to `/dashboard/admin/affiliates?tab=<applications|affiliates|payouts|leaderboard|emails>`; the page reads `searchParams.tab` and `AffiliatesAdmin` shows that section (default applications) with no tab strip. Same 4-plus-More bottom bar rule as the Sales Hub. The main admin menu keeps its single Affiliates entry. Rejected alternative: five separate routes, which would split the large `AffiliatesAdmin` component for no gain the owner asked for.

**Admin:** a **Payouts** section in `AffiliatesAdmin`. Phone: one card per request.
PC: a table. Filter Pending / Paid / Rejected with counts, a search box (name, code), a copy button for the account
number, the affiliate's name beside the account title. `POST /api/admin/affiliates/payouts` with `{ id, action: "paid" }`
or `{ id, action: "reject", reason }`. Acts only on a row that is still `pending` (a second click is a harmless no-op).
After the change the server sends the email; if the email fails the action stays done and the admin sees a short
"payout saved, email could not be sent" notice. Each email attempt is logged in `affiliate_emails`.

**Affiliate page:** the Balance card has three states (under 3,500: disabled button with "Available from PKR 3,500";
ready: **Request payout of PKR X**; pending: balance 0 and a calm "Payout of PKR X requested" note) and a bottom sheet
(phone) / dialog (PC) with method choice, account title, account number, the line "The whole balance is paid in one
go", and Confirm. Below it, **Payout history**. The account number is shown masked there (last four).

**Emails** (Progress-email look, calm wording, no exclamation marks): "paid" (amount, method, date) and "rejected"
(amount, the reason, "the amount is back in your balance", link to the page). Subjects are personal, like the Progress
email. The Progress email's withdrawal block changes from "message us on WhatsApp" to "open your page and press Request
payout" with a link to the private page; its balance subtracts payouts.

**Designs (Stitch project "PZ Academy Workshops Platform", 13117286791417011091):**
"Affiliate Balance & Payout States - PZ Academy" (phone, `81a5e0d155a948eaae609b940311b58e`),
"Affiliate Portal - Desktop (1440px)" (`68a34be97b7843e1af71738317096e0b`),
"Affiliates Admin - Payouts (Mobile 390px)" (`f21ccfd2d12d4adba4802de38ab1543b`),
"Affiliates Admin - Payouts (Desktop 1440px)" (`2c4a9e70b8654eea880bcf92b255c8f2`).
Port the layout and copy exhaustively except the non-goals above; re-skin to this app's tokens.

## Left to the builder

File and function names, how the balance sum is shared (one TS helper used by the page, the Progress email and the
request route), the exact SQL for the lock, validation details, the quick-reason chips on Reject (keep the Stitch
ones that are factual: wrong name, wrong account number, other), test layout, owner-steps file (paste 0114, then check
one request on a test affiliate with the owner's own email; never email real affiliates during development).
