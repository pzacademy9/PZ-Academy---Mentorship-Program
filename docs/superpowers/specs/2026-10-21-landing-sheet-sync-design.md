# Landing registrations: sheet to app sync (Plan 4) design

Date: 2026-10-21. Builds on `2026-10-19-landing-registrations-phase3-design.md` (Part 4 sketch) and the shipped Plans 1, 2b and 3. Branch: `landing-sheet-sync`, cut from main bb516ec.

## Why

Each landing page has its own Google Sheet. The app already writes every new registration into it and pushes status changes (columns O amount, P status) to it. Nothing flows back. The owner and team mostly change two things in the sheet: a participant's **Status**, and **corrections to Name, Email, WhatsApp**. Those edits must reach the app, because the app is the main place and the sheet is the backup for when the app is down.

## Owner rulings (this conversation)

1. Sheet edits are mostly Status and data fixes. Data fixes are Name, Email, WhatsApp ("mostly these").
2. A Status set to Paid in the sheet behaves exactly as Paid pressed in the app: Paid email, enrollment, Meta Purchase hook (Plan 5), once.
3. The app is the main source. The sheet matters when the app is down.
4. If the same person was changed in both places, the **newest change wins**.
5. A short delay is fine. Roughly 5 minutes is acceptable.
6. The first scan of an existing sheet only reports differences; the owner approves before anything is applied (see First scan).

## Goals

- A change in the sheet to Status, Amount received (O), Name, Email or WhatsApp reaches the app within about 5 minutes and is recorded with source "sheet".
- Sheet Paid, Pending, Underpaid, Reserved go through the same status change used by the app (`landing_apply_status` with `p_source = 'sheet'`), so emails, enrollment, group cascade and status history behave identically.
- Data fixes update the registration row and are visible in the Registrations screen and Participants.
- A fixed Email in the sheet still finds the right person.
- The app never mistakes its own write to the sheet for a human edit.
- Admin can see how many sheet changes are waiting or failed and retry them.

## Non-goals

- No instant sync. No per-sheet edit trigger (the Apps Script cap of about 20 installable triggers would be hit).
- Other columns (Profession, Discovery, Registration Option, Expected Amount, Promo, Agent and so on) are not read back. Edits there are ignored.
- No creating registrations from rows typed by hand in the sheet. Rows the app does not know are listed in the sync report as "unknown row" and skipped.
- No changes to the legacy course enrollment sheet sync (`webhooks/sheets-sync`) or leads sync.
- Plan 5 (Meta) and Plan 6 (payment accounts, My links) are separate.

## Anti-goals

- Never lose an app change because an old sheet value came back.
- Never send a second Paid email, enrollment or Meta event because the same sheet change was seen twice.
- Never let a typo in the sheet damage data silently: a bad value is skipped and reported, not half-applied.
- Never type or log secrets; webhook uses a shared token checked before any database access, like `webhooks/sheets-sync`.

## How it works (decided)

**Trigger.** One time-driven Apps Script trigger runs about every 5 minutes. It visits every registered event sheet, reads the key and watched columns, and posts the rows that differ from what the app last wrote to a new webhook, keyed by `sheetId`. Deployed only through clasp from `gas/clasp-project/`, and only after the owner says yes. The plan must check Apps Script run-time and quota limits (many sheets, 6 minute run cap) and say how the scan resumes if it runs out of time.

**Matching.** Rows match by Ref ID plus email, never by row number. Because Email can itself be fixed in the sheet, the app stores, per registration, a **last-synced snapshot** of the five watched values (status, amount, name, email, WhatsApp) that it last wrote to the sheet. The scan sends the Ref ID, the row's current values, and the app compares. An email that changed in the sheet is matched through Ref ID plus the snapshot email. Group members share the lead's Ref ID, so the member is found by Ref ID plus the old email.

**Echo guard and newest wins.** Apps Script time triggers give no edit time, so "newest" is decided like this (carried from the Phase 3 builder check): a sheet value that differs from the last app-written snapshot is a human sheet edit and is applied at scan time, unless the app changed that field after the previous scan, in which case the app wins and the sheet is rewritten with the app value. App writes to the sheet update the snapshot, so they are never echoed back as edits.

**Applying.**
- Status or Amount: the same path as an app change (guarded transitions, atomic, group cascade). A move the rules refuse (for example Underpaid without an amount, or a member row on its own) is skipped and reported.
- Name, Email, WhatsApp: update the registration row, validated by the same rules as the form (Email format and uniqueness within the page, WhatsApp the same check that powers "Number not valid"). A changed Email also changes where later emails go and the enrollment's student match; the plan must say what happens when the new email belongs to an existing account.
- Every applied or skipped change is logged with source "sheet" so admin can see it in the status history and a sync log.

**Failures.** Rejected or failed changes are queued with retries in the existing outbox (`landing_jobs`) or a sibling queue (builder's call). Admin sees "Sheet sync: N waiting" on the Registrations screen with a Retry button. "Rebuild sheet from app" (rewrite the sheet from app data) is part of the original spec and is included only if the plan finds it small; otherwise it moves to later.

**App outage.** The sheet keeps working. When the app is back the scan applies everything, and Paid emails, enrollment and Meta fire then.

## First scan (owner ruling 6, after the builder check)

Existing registrations have no snapshot yet. The first scan of each sheet is **report-only**: it lists every row where the sheet differs from the app (status, amount, name, email, WhatsApp) and changes nothing in either place. The owner reviews the list and approves per sheet (or per row) before anything is applied. Only after approval does the sheet become live for sync, and snapshots are set from the approved result. This prevents a stale Paid in an old sheet from emailing or enrolling anyone. The plan must say where the owner sees and approves the report (reuse existing Registrations screen styles; if a new look is needed, give a Stitch prompt and stop).

## Constraints

- GAS changes deploy only via clasp after the owner's yes. Never the web editor.
- Supabase MCP is read-only. Migrations are written as files and the owner pastes the SQL.
- Never regenerate `database.types.ts`; hand-add entries.
- No UI improvised. The sync badge and Retry should reuse existing Registrations screen styles; if a new look is needed, give the owner a Stitch prompt and stop.
- Visible text for non-technical users: no words like variant, override, resolve, schema.
- Row-level security and server-side checks on any new table or route.
- Test only with the owner's own registrations. Never touch real students' rows.
- `npm run` is broken: use `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`. Known failing tests not ours: `tests/pz-tokens.test.ts`, `tests/landing-route-hardening.test.ts`. No `eslint-disable @typescript-eslint/...` comments.

## Left to the builder

Table and column shape for the snapshot and sync log, webhook payload shape, batching and resume logic inside the scan, quota math, how a changed Email interacts with an existing account, retry schedule, test strategy.

## Open for the owner later (my guesses, easy to change)

- Scan every 5 minutes (my call within "a bit delay").
- Rows the app does not know are skipped and listed, not created (my call).
