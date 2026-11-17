# Promo codes: percent after any code, delete, PDF downloads

Date: 2026-11-17. Size: small-to-medium change, three parts, no migration.

## Why
The owner wants ordinary promo codes to work like owner codes (agent/affiliate): typing `CODE-NN%` applies NN% automatically.
They also want to delete codes, and download code lists as PDF to share in groups.

## Goals
1. Every ordinary code accepts `CODE-NN%`, held to the same ceiling as owner codes (`landing_promo_settings.max_percent`, default 30).
2. Admin can delete a code that nobody has used.
3. PDF downloads from the Promo codes admin page: Ordinary, Sales agents, Affiliates.

## Non-goals
- No change to owner-code rules, commission, or credit.
- No per-code tick box for the suffix (owner ruled: all codes).
- No delete for agent or affiliate codes (managed from their own screens).
- No server-side PDF, no new migration.

## Anti-goals
- A deleted code must never orphan a registration's sales credit.
- A shared PDF must never leak private data (use counts, internal limits, status).

## Part 1: suffix on ordinary codes
- Resolver (`src/lib/landing/registration/promo-resolve.ts`): when the exact typed text matches no code, parse the suffix; today the base must be a live owner code. Change: the base may be any code that is not a live owner code (ordinary) OR a live owner code.
- An ordinary code asked for NN% is treated as a percent code of NN% (type percent, value NN, fixedAmounts empty, own cap ignored). The ceiling is the global max only (ordinary codes have no own max).
- Over the ceiling: refused with the existing `over_max` message.
- Typed plain, an ordinary code behaves exactly as today (fixed or percent as stored).
- Everything else in `applyPromo` still applies: active, dates, max uses, one per email, page and option limits. A code that is off, expired, or used up stays refused with a suffix.
- The registration stores the typed text as the code string, as for owner codes; `usedCount` counts as today.
- Risk the owner accepted: anyone who knows a public code can type a higher percent up to the ceiling. Ceiling is the only guard; the admin can lower it.

## Part 2: delete
- New `DELETE /api/admin/landing-promo-codes/[id]`, admin only (same guard as PATCH).
- Refuse when the code is an owner code (agent or affiliate), or when any `landing_registrations.promo_code_id` points to it (count, including test rows). Server re-checks at delete time; the UI check is only a convenience.
- FK is `on delete set null`, so the server check is the only protection for credit. Message in plain words.
- UI: Delete button on the code card or edit sheet for eligible codes only, with a confirm step (dialog: Escape closes, focus returns). Used codes show no Delete and keep the on/off switch. Short note beside the switch: "Used codes cannot be deleted. Switch off instead."

## Part 3: PDF downloads (my call: in the browser, jsPDF)
Why browser: jsPDF is already a dependency (`src/lib/pzid/batch-pdf.ts`), and the Vercel free plan is near its CPU limit, so no server work.
Three download buttons on the Promo codes page, near the ceiling box:
1. **Ordinary codes** (public): active, not expired, not used up, not owner codes. Per line: code, discount ("10% off" or "PKR 2,000 off"), where it works ("All courses" or course names), last date if set. Header "PZ Academy promo codes" and the date made. No suffix line, no use counts.
2. **Sales agents**, 3. **Affiliates**: a choice at download: "Share in a group" (name and code only) or "For me" (adds the discount typed plain and on/off status). My call: one button per list that opens a two-option choice, so the owner decides each time.
Files are named with the date. Agent and affiliate names appear in the PDF; the owner chose this knowingly for the share version (names and codes only).

## Constraints
- Stitch is the design source of truth: check the Promo codes admin screen for the buttons; if none exists, stop and hand the owner a phone (390px) and a PC (1440px) prompt.
- Calm wording, no exclamation marks. Preserve CRLF in existing files. No `database.types.ts` regeneration (no schema change). Tests first.
- Tests: resolver (ordinary + suffix, over ceiling, off/expired/used-up with suffix, plain unchanged, owner behaviour unchanged), delete route (unused ok, used refused, owner code refused, not admin refused), PDF row builders as pure functions.

## Approaches considered
- Suffix: (a) all codes, no setting [chosen by owner]; (b) per-code tick box [not wanted].
- PDF: (a) browser jsPDF [chosen, my call]; (b) server route with a PDF library [rejected: CPU cost]; (c) print-friendly page [rejected: owner wants a file].
- Delete: (a) only unused codes [chosen by owner]; (b) allow with credit loss [rejected]; (c) soft-delete flag [rejected: needs a migration, the on/off switch already does this].

## Left to the builder
Where the buttons sit on phone width; PDF layout details (page breaks, fonts); exact wording of messages; how agents and affiliates are listed (existing data modules).
