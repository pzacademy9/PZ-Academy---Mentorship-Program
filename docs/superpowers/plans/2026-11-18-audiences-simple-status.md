# Audiences: status choice, Recorded/Live from text, simpler page (design + plan)

Date: 2026-11-18. Builds on `docs/superpowers/specs/2026-11-17-meta-audiences-filters-design.md` (merged). Owner asked 2026-11-18:
1. Recorded/Live is written in the registration text (mostly column F); read it from there.
2. Filter by status: Paid, Reserved, Pending (and the others), not only paid / not paid.
3. Audiences page must be simple for a non-technical person. Contacts and Cohorts simplification comes AFTER, one at a time, each needing Stitch screens.

Design source: build from existing parts (owner agreed for this page 2026-11-17).

## Findings (checked in code and live data)
- Statuses that exist: pending, reserved, underpaid, paid, free (`RegistrationStatus`). Live data today: paid 195, pending 22, underpaid 1, free 1, reserved 0.
- The CRM keeps NO status. `landing_close_batch` turns status `paid` into a purchase and every other status into an "interested" row (`close-batch-rows.ts:93`). So Reserved/Pending/Part-paid/Free cannot be told apart yet.
- Mode text: 344 of 3,294 purchases carry "Live —" or "Recorded —" in `product_label`; 2,950 old-sheet rows have no such word and stay out of Recorded/Live.

## Calls (owner can change)
1. New column `import_batch_contacts.reg_status`; `landing_close_batch` writes it (coalesce, never erased). Migration 0117 (next free; implementer verifies the folder). Owner pastes it, then presses Bring in once more to fill it.
2. Interested rows keep the earliest registration (as today); status comes from that same row.
3. Interested rows with no stored status (old imported sheets, or before the re-run) count as Pending.
4. Purchases are always Paid.
5. Filter field `who` is replaced by `statuses: Array<"paid"|"reserved"|"pending"|"part_paid"|"free">`, empty = everyone. Old saved audiences keep working: `who:"paid"` becomes ["paid"], `"unpaid"` becomes reserved+pending+part_paid+free, `"both"` becomes []. Old encoded links keep working the same way.
6. A person with any purchase is Paid and is never shown as Reserved/Pending (existing rule, kept).
7. Mode fallback when `reg_mode` is null: purchase `product_label`, then for interested rows the batch `sheet_name`; word match, case-insensitive; both or neither words gives null.
8. Page copy: no "any of them", no "left out" jargon; saved audiences behind one small link; result card smaller on phone.

## Tasks
### Task 1: migration 0117 + types + bring-in payload
Files: `supabase/migrations/0117_audience_status.sql`, `src/lib/supabase/database.types.ts` (hand edit), `src/lib/landing/close-batch-rows.ts`, `src/lib/data/landing-close-batch.ts`, owner-steps doc `docs/superpowers/plans/2026-11-18-audiences-simple-status-owner-steps.md`, tests (`audience-filters-0116-migration.test.ts` style guard for 0117, close-batch-rows test).
- Copy the `landing_close_batch` body from 0116, add `reg_status` to the interested insert, fed from each row's top-level `status` (member inherits lead status when blank), coalesce on update.
- `CloseRow` gains top-level `status`. Degrade path unchanged (42703 etc. mean needsUpdate).
### Task 2: filter model
Files: `src/lib/crm/audience-filter.ts`, `tests/audience-filter.test.ts`.
- Replace `who` with `statuses`; schema accepts legacy `who` and converts (call 5); describe text: "Paid", "Paid and Reserved" etc.; encode/decode keeps old links working. Plain-message whitelist stays.
### Task 3: query
Files: `src/lib/data/audience-query.ts`, `tests/audience-query.test.ts`.
- `Registration` gets `status`; purchases = paid; interested = `reg_status ?? "pending"`; match when statuses empty or includes it. Add `modeFromLabel` fallback (call 7). `ignoredChoices`/routes unchanged.
- Select `reg_status` only when the new schema exists (same degrade path as 0116; before 0117 is pasted, interested rows count as Pending and the page shows a plain note).
### Task 4: page
Files: `AudienceFilters.tsx`, `AudiencesPanel.tsx`, `AudienceResultCard.tsx`, tests `audiences-panel.test.tsx`.
- "Who" card becomes tick-chips: Paid, Reserved, Pending, Part-paid, Free, each with its count if cheap (facets) else none; helper "Pick none for everyone."
- Step wording: 1 Who and what, 2 Check the number, 3 Download. Saved audiences move behind a small "Saved audiences" link. Result card compact on phone (no overlap of choices: card is a short bottom bar showing count + two buttons).
- Remove the imported-sheet note or reword: "Older sheets do not say Recorded or Live, so they only appear under Either."
- Dialogs/menus keep Escape + focus return.

### Task 5: fewer database reads per count
Files: `src/lib/data/audience-query.ts`, `src/app/api/admin/crm/audiences/bring-in/route.ts`, tests `audience-query.test.ts`.
- Measured need (live, 2026-11-18): one count today makes about 45-55 database reads (courses 1, purchases 4 pages, batches 1, interested 1, countries 3 pages only when a country is ticked, then 11 chunks of 200 contacts each with suppression reads) and moves about 1-1.5 MB. No outside service (Meta, Brevo) is called.
- Add a 60-second in-memory cache of the registrations read (the part shared by every filter change). Cache key is the schema flag; cleared when Bring in finishes. Contact details are still read fresh for each count (they carry the consent and email facts). Download never uses a cache.
- Test: second call inside 60s makes no new registration reads; clear after bring-in; expired cache re-reads.

## Review focus
- Legacy `who` values and old saved audiences and old links still work.
- Before 0117 is pasted nothing crashes; Reserved/Pending show a one-line note.
- Plain file privacy, do-not-contact, 50,000 cap unchanged.
- Count with statuses [] equals the old "both".

## Owner steps after merge
Paste 0117 (one statement), open Audiences, press Bring in once more.
