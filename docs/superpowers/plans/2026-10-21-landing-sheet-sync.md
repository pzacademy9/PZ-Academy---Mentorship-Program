# Landing Sheet to App Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edits in a landing page's Google Sheet (Status, Amount, Name, Email, WhatsApp) reach the app within about 5 minutes, with the first scan of each sheet being a report the owner approves.

**Architecture:** One time-driven Apps Script trigger reads every event sheet and posts all its rows to a new app webhook. The app does all the thinking: it matches rows to registrations, compares sheet values against a stored per-registration snapshot of what the app last wrote, and applies or skips each difference through the existing status RPC. The scan is stateless (it re-reads the whole sheet each time), so failures retry automatically on the next scan and no retry queue is needed.

**Tech Stack:** Next.js route handlers, Supabase (service-role admin client, `landing_apply_status` RPC), Vitest, Google Apps Script via clasp.

**Spec:** `docs/superpowers/specs/2026-10-21-landing-sheet-sync-design.md` (read it first; also `2026-10-19-landing-registrations-phase3-design.md` Part 4).

## Global Constraints

- Branch `landing-sheet-sync`. Never push or merge to main without the owner's yes. Leave untracked `docs/lead-capture-go-live-guide.md` alone. `gh` is not logged in: give the owner the PR URL.
- `npm run` is broken. Use `node node_modules/typescript/bin/tsc --noEmit` (baseline 0, ignore `.next/types` noise), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`. Full vitest takes over 2 minutes: run in background. Known failing tests, not ours: `tests/pz-tokens.test.ts`, `tests/landing-route-hardening.test.ts`.
- Never `next build` while dev runs. Never regenerate `database.types.ts`; hand-add entries (`src/lib/supabase/database.types.ts`).
- Supabase MCP is read-only. Migrations are files; the owner pastes the SQL. Next number is `0078`.
- eslint config is only `next/core-web-vitals`: never add `eslint-disable @typescript-eslint/...` comments (Vercel build fails).
- GAS changes live in `gas/clasp-project/Sheet Sync.js` and deploy only via clasp, only after the owner says yes. Never the web editor.
- UI rule: never improvise UI. Port from Stitch (project "PZ Academy Platform 2" `4651274386787527431`); if no screen fits, give the owner a Stitch prompt and stop.
- Visible text for non-technical users: say "link", "country", "module"; never "variant", "override", "resolve", "schema", "YAML", "snapshot", "webhook".
- Test only with the owner's own registrations (hamzaansari4you@gmail.com has an invalid phone, dit.pharmacozyme@gmail.com has a valid phone). Never press send on anything that reaches real students.
- Commits: new commits only, never amend; end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Vercel crons are daily only (Hobby). The 5-minute scan must be an Apps Script trigger, not a Vercel cron.
- Watched sheet columns (1-based, `LANDING_COL` in the GAS file): A Name, B Email, C WhatsApp, O Amount (15), P Payment Confirmation / Status (16), S Ref ID (19), H Row Type (8). Nothing else is read back. Status words in the sheet: `Paid, Pending, Underpaid, Reserved, Free`.

## Review Focus

Each line has its test in the owning task.

1. A hand-typed sheet row whose Ref ID the app does not know is skipped and listed, never created (Task 2, 5).
2. Two sheet rows with the same Ref ID + email: the first is used, the second is reported as a duplicate (Task 2).
3. A Status cell with stray spaces or other case (` paid `) is read as Paid; garbage text is rejected and reported, nothing half-applied (Task 2).
4. A fixed Email that already belongs to another person on the same page is rejected (Task 4).
5. The same scan arriving twice changes nothing the second time and sends no second email (Task 4, 5).
6. The app changed a value and its push to the sheet has not landed yet: the old sheet value must not overwrite the app (Task 2).
7. A group member's Status edited alone is rejected with "change the group lead row" (Task 2, 4).
8. Test registrations (`is_test`) and Free rows are never changed from the sheet (Task 2).
9. A scan that runs out of time stops cleanly and the remaining sheets are scanned first next time (Task 5, 6).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0078_landing_sheet_sync.sql` | snapshot table, sync log, page columns |
| `src/lib/landing/registration/sheet-sync-engine.ts` | pure: parse, match, diff, decide (no I/O) |
| `src/lib/data/landing-sheet-sync.ts` | I/O: load context, write snapshots, apply changes, report, approval, status |
| `src/lib/landing/registration/job-handlers.ts` (modify) | `sheetAppend` / `sheetStatus` save snapshots after a successful push |
| `src/app/api/webhooks/landing-sheet-scan/route.ts` | token-checked entry for the Apps Script (`listSheets`, `scan`) |
| `src/lib/gas/event-sheet-client.ts` (modify) | `requestSheetScan`, `installLandingScanTrigger` |
| `gas/clasp-project/Sheet Sync.js` (modify) | time trigger, reader, `scanLandingSheet` and `installLandingScanTrigger` actions |
| `src/app/api/admin/landing-sheet-sync/...` | admin routes: status, approve, scan now, install trigger |
| Registrations screen components (Task 8) | "Sheet sync" badge, first-scan review, Retry (gated on Stitch) |

---

### Task 1: Migration and types

**Files:**
- Create: `supabase/migrations/0078_landing_sheet_sync.sql`
- Modify: `src/lib/supabase/database.types.ts` (hand-add entries only)
- Test: `tests/landing-sheet-sync-migration.test.ts` (reads the SQL file text, like existing migration tests)

**Interfaces:**
- Produces tables and columns used by every later task:
  - `landing_sheet_snapshots(registration_id uuid pk references landing_registrations on delete cascade, status text, amount_received numeric(12,2), name text, email text, whatsapp text, updated_at timestamptz default now())`
  - `landing_sheet_sync_log(id uuid pk, page_id uuid references landing_pages on delete cascade, registration_id uuid null references landing_registrations on delete set null, row_number int null, ref_id text not null default '', field text not null, outcome text check (outcome in ('applied','skipped','rejected','unknown-row','duplicate-row','report','kept-app')), sheet_value text, app_value text, detail text not null default '', scan_id uuid not null, created_at timestamptz default now())` with index `(page_id, scan_id)` and `(page_id, outcome, created_at desc)`
  - `landing_pages` new columns: `sheet_sync_state text not null default 'report' check (sheet_sync_state in ('report','live'))`, `sheet_last_scanned_at timestamptz`, `sheet_sync_waiting integer not null default 0`
- RLS on, zero policies on both new tables (service role only, same as 0071). Safe to run twice (`if not exists`). File header states the owner pastes it.

- [ ] **Step 1:** Write the failing test asserting the file exists and contains each table, the three page columns, `enable row level security` twice, and no `create policy`.
- [ ] **Step 2:** Run `node node_modules/vitest/vitest.mjs run tests/landing-sheet-sync-migration.test.ts`; expect FAIL (file missing).
- [ ] **Step 3:** Write the migration to the Interfaces above. Hand-add `landing_sheet_snapshots`, `landing_sheet_sync_log` (Row/Insert/Update) and the three `landing_pages` columns to `database.types.ts`.
- [ ] **Step 4:** Run the test (PASS) and `node node_modules/typescript/bin/tsc --noEmit` (0 errors).
- [ ] **Step 5:** Commit `feat: tables for landing sheet sync`.

---

### Task 2: Pure sync engine

**Files:**
- Create: `src/lib/landing/registration/sheet-sync-engine.ts`
- Test: `tests/landing-sheet-sync-engine.test.ts`

**Interfaces:**
- Consumes: `RegistrationStatus` from `./config`, `STATUS_LABELS` from `./sheet-row`, `checkStatusChange` from `./status-rules`.
- Produces (all pure, no I/O):
```ts
export interface SheetScanRow { rowNumber: number; refId: string; email: string; name: string; whatsapp: string; status: string; amount: string; rowType: string }
export interface AppReg { id: string; refId: string | null; leadRefId: string; rowType: "individual" | "lead" | "member"; name: string; email: string; whatsapp: string; status: RegistrationStatus; amountReceived: number | null; expectedAmount: number; isTest: boolean }
export interface Snapshot { registrationId: string; status: RegistrationStatus; amountReceived: number | null; name: string; email: string; whatsapp: string }
export type SyncField = "status" | "amount" | "name" | "email" | "whatsapp";
export type RejectReason = "bad-status" | "bad-amount" | "member-status" | "free-row" | "test-row" | "bad-email" | "bad-name" | "bad-whatsapp" | "amount-required";
export interface PlannedChange { registrationId: string; field: SyncField; sheetValue: string | number | null; appValue: string | number | null }
export interface PlanResult {
  changes: PlannedChange[];                       // safe to apply (live mode) or to report (report mode)
  appWins: { registrationId: string; field: SyncField }[]; // app changed after the last push: sheet is rewritten, nothing applied
  rejected: { registrationId: string; rowNumber: number; field: SyncField; reason: RejectReason; sheetValue: string }[];
  unknownRows: SheetScanRow[];
  duplicateRows: SheetScanRow[];
}
export function parseSheetStatus(text: string): RegistrationStatus | null;      // trim, case-insensitive, only the five sheet words
export function parseSheetAmount(text: string): number | null | "invalid";      // "" -> null, "1,500" -> 1500, negative/NaN -> "invalid"
export function planScan(rows: SheetScanRow[], regs: AppReg[], snapshots: Snapshot[], mode: "report" | "live"): PlanResult;
```
- Rules `planScan` must implement:
  - Match key = upper(trim(refId)) + "|" + lower(trim(email)); `AppReg.leadRefId` is the lead's ref (members carry it). First row per key wins, later ones go to `duplicateRows`.
  - A sheet row with no match is paired to a registration of the same Ref ID that no row matched, only when exactly one row and exactly one registration are left over for that Ref ID: that is an email fix (field `email` change). Otherwise the row goes to `unknownRows`.
  - `live` mode: a field is a change only when sheet value differs from the snapshot AND (app value equals snapshot, else it is `appWins`). `report` mode: compare sheet against the app value directly (no snapshot needed) and return every difference as a change.
  - Registrations with `isTest` produce nothing. Free rows: status/amount edits are rejected `free-row`. Member rows: a status/amount edit is rejected `member-status`. Status text that fails `parseSheetStatus` is `bad-status`; `Free` typed onto a non-free row is `bad-status`. Underpaid with no amount, or an amount that fails `checkStatusChange`, is `amount-required` / `bad-amount`.
  - Emails lower-cased and trimmed, must contain `@` with a character before it; WhatsApp is reduced to digits and must be 8 to 15 digits (else `bad-whatsapp`); Name trimmed, 1 to 200 characters.

- [ ] **Step 1:** Write failing tests, one per Review Focus line 1, 2, 3, 6, 7, 8 plus: unchanged sheet yields no changes; report mode lists every difference with no snapshots; email-fix pairing for an individual and for a group member; ambiguous leftovers go to `unknownRows`; ` paid ` becomes Paid; `1,500` parses to 1500; `-5` is invalid.
- [ ] **Step 2:** Run the test file; expect FAIL.
- [ ] **Step 3:** Implement the module to the signatures above.
- [ ] **Step 4:** Run the test file (PASS), tsc, eslint on both files.
- [ ] **Step 5:** Commit `feat: pure planner for sheet to app sync`.

---

### Task 3: Snapshots stay current

**Files:**
- Create: `src/lib/data/landing-sheet-sync.ts` (first part)
- Modify: `src/lib/landing/registration/job-handlers.ts` (`sheetAppend`, `sheetStatus`)
- Test: extend `tests/landing-job-handlers.test.ts`; new `tests/landing-sheet-sync-data.test.ts`

**Interfaces:**
- Produces in `landing-sheet-sync.ts`:
```ts
export async function saveSnapshots(regs: { id: string; status: RegistrationStatus; amountReceived: number | null; name: string; email: string; whatsapp: string }[]): Promise<void>; // upsert on registration_id, throws on DB error
```
- `sheetAppend` calls `saveSnapshots` for lead + members after `appendRegistrationRows` succeeds (all five values). `sheetStatus` calls it after `applyRegistrationStatus` succeeds, but updates **only** `status` and `amount_received` (a status push must not overwrite the stored name/email/WhatsApp snapshot). Skipped for test rows and pages without a sheet, as today. A failed snapshot save throws so the job retries.

- [ ] **Step 1:** Failing tests: after a successful append, `saveSnapshots` is called with lead and members; after a failed append it is not called; after a successful status push only status and amount are written; test registrations never write a snapshot.
- [ ] **Step 2:** Run both test files; expect FAIL.
- [ ] **Step 3:** Implement `saveSnapshots` (with an option or a second function `saveStatusSnapshots` for the status-only update; your choice, name it clearly) and wire the two handlers.
- [ ] **Step 4:** Run both test files (PASS), tsc, eslint.
- [ ] **Step 5:** Commit `feat: remember what the app last wrote to each sheet row`.

---

### Task 4: Apply changes

**Files:**
- Modify: `src/lib/data/landing-sheet-sync.ts`
- Modify: `src/lib/data/landing-registration-admin.ts` (extract the post-RPC block of `changeRegistrationStatus` into an exported `queueStatusFollowUps(registrationId: string): Promise<void>`; `changeRegistrationStatus` calls it; behavior unchanged)
- Test: `tests/landing-sheet-sync-data.test.ts`, existing `tests/landing-registration-admin*.test.ts` must still pass

**Interfaces:**
- Consumes: `PlannedChange`, `landing_apply_status` RPC (`p_actor: null`, `p_source: "sheet"`), `queueStatusFollowUps`, `saveSnapshots`.
- Produces:
```ts
export type ApplyOutcome = { change: PlannedChange; outcome: "applied" | "skipped" | "rejected"; detail: string };
export async function applySheetChanges(pageId: string, changes: PlannedChange[]): Promise<ApplyOutcome[]>;
```
- Behavior:
  - `status`: read the registration, run `checkStatusChange` with the amount from the paired `amount` change if present, call the RPC with `p_expected_from` = current status. `stale` or `already-in-status` is `skipped`. On success call `queueStatusFollowUps` (sheet push for members, enrollment, emails: the RPC already guarantees once-per-status) and update the snapshot to the sheet values.
  - `amount` alone (status unchanged, row is Paid or Underpaid lead/individual): update `amount_received` directly (must be more than 0), write a `landing_status_events` row is NOT needed; log only. Snapshot updated.
  - `name` / `whatsapp`: update the registration row (the member's own row; a lead's change does not touch members). `email`: reject if another registration on the same `page_id` has that email (`bad-email`, detail "Another person on this page already uses that email"); otherwise update the row, and if the row has a `student_id` leave it linked (the existing enrollment sync keys on `student_id`; plan note: do not re-link accounts here, record `detail` "Email changed; account link unchanged"). Snapshot updated.
  - After every outcome, snapshot is set to the sheet value for that field when applied, so the next scan sees no difference.

- [ ] **Step 1:** Failing tests with the admin client mocked: sheet Paid on a pending lead calls the RPC with source `sheet`, null actor, and calls `queueStatusFollowUps` once; the same change applied twice yields `skipped` the second time and `queueStatusFollowUps` is not called again; Underpaid without amount is `rejected`; email already used on the page is `rejected` and nothing is written; WhatsApp `+92 300 1234567` stores digits; amount-only change on a Paid row updates the amount.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Extract `queueStatusFollowUps`; implement `applySheetChanges`.
- [ ] **Step 4:** Run the new tests and the existing registration-admin tests (PASS), tsc, eslint.
- [ ] **Step 5:** Commit `feat: apply sheet edits through the same status path as the app`.

---

### Task 5: Scan webhook

**Files:**
- Modify: `src/lib/data/landing-sheet-sync.ts` (add `listSheetsToScan`, `runScan`)
- Create: `src/app/api/webhooks/landing-sheet-scan/route.ts`
- Test: `tests/landing-sheet-scan-route.test.ts`

**Interfaces:**
- Produces:
```ts
export async function listSheetsToScan(): Promise<{ sheetId: string; pageId: string; state: "report" | "live" }[]>; // pages with sheet_id, oldest sheet_last_scanned_at first (nulls first)
export interface ScanSummary { applied: number; rejected: number; skipped: number; unknown: number; duplicates: number; differences: number /* report mode */ }
export async function runScan(sheetId: string, rows: SheetScanRow[]): Promise<ScanSummary | { error: "unknown-sheet" }>;
```
- `runScan`: load page by `sheet_id`; load that page's registrations (all rows incl. members, with lead ref) and snapshots; `planScan(rows, regs, snaps, page.sheet_sync_state)`. `report` mode: delete this page's previous `report` log rows, write one `report` row per change, apply nothing, write nothing to snapshots. `live` mode: `applySheetChanges`, write a log row per outcome and per rejected/unknown/duplicate row under a fresh `scan_id`; for each `appWins` field enqueue `enqueueSheetStatus` (status/amount) so the sheet is rewritten. Always set `sheet_last_scanned_at = now()` and `sheet_sync_waiting` = count of rejected + unknown + differences-still-open in this scan.
- Route `POST /api/webhooks/landing-sheet-scan` body `{ token, action: "listSheets" } | { token, action: "scan", sheetId, rows }`. Token compared to `SHEETS_SYNC_SECRET` **before** any database access (same ordering as `webhooks/sheets-sync`). Reply shape `{ status: "success", ... }` or `{ status: "error", message }` with plain messages. Reject more than 5000 rows. Zod-validate each row; strings capped at 500 characters.

- [ ] **Step 1:** Failing tests: wrong or missing token returns the error reply and the data module is never called; `listSheets` returns the ordered list; `scan` with valid rows returns the summary; unknown sheetId returns an error; second identical `scan` in live mode applies nothing (Review Focus 5); report mode writes no snapshots and applies nothing; a hand-typed row lands in `unknown-row` log (Review Focus 1).
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement `listSheetsToScan`, `runScan`, and the route.
- [ ] **Step 4:** Run (PASS), tsc, eslint.
- [ ] **Step 5:** Commit `feat: webhook that receives sheet scans`.

---

### Task 6: Apps Script scanner

**Files:**
- Modify: `gas/clasp-project/Sheet Sync.js`
- Modify: `src/lib/gas/event-sheet-client.ts` (`requestSheetScan(sheetId)`, `installLandingScanTrigger()`, both return `{ ok: boolean; message?: string }`)
- Test: `tests/landing-event-sheet.test.ts` (extend; it already reads the GAS file text and the client)

**Interfaces:**
- GAS adds:
  - `scanLandingSheets()`: the time-trigger handler. Gets the sheet list by POSTing `{token: SYNC_SECRET, action: "listSheets"}` to the scan URL, then for each sheet calls `scanOneLandingSheet_(sheetId)`. Stops starting new sheets after 4 minutes 30 seconds of run time (limit is 6 minutes). Scan URL = script property `WEBHOOK_URL` with `/api/webhooks/sheets-sync` replaced by `/api/webhooks/landing-sheet-scan`.
  - `scanOneLandingSheet_(sheetId)`: reads columns A to W of the tab `LANDING_TAB_NAME` (falls back to first sheet) with `getDisplayValues`, builds `SheetScanRow[]` (skip fully empty rows, include `rowNumber`), POSTs `{token, action: "scan", sheetId, rows}`. Takes the same script lock as other landing writers (`LockService.getScriptLock`, 10 s wait; if busy, skip that sheet this round).
  - `handleScanLandingSheet_(body)`: `doPost` action `scanLandingSheet` (token-checked like the other landing actions) runs `scanOneLandingSheet_` for one sheet now. Used by "Scan now" and after approval.
  - `handleInstallLandingScanTrigger_(body)`: `doPost` action `installLandingScanTrigger`, idempotent, creates `ScriptApp.newTrigger("scanLandingSheets").timeBased().everyMinutes(5).create()` only when none exists.
- `LANDING_HEADERS` and `LANDING_COL` are not changed.

- [ ] **Step 1:** Failing tests that read the GAS text and assert: the three new function names exist; the 4:30 time guard constant exists; the new actions are registered in `doPost`; `LANDING_HEADERS` still equals `SHEET_HEADERS` (existing assertion keeps passing); client functions post the expected `action` strings with the token and never log it.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement the GAS functions and the two client functions.
- [ ] **Step 4:** Run (PASS), tsc, eslint. **Do not run `clasp push`.**
- [ ] **Step 5:** Commit `feat: Apps Script scan of landing sheets (not deployed)`.

---

### Task 7: Admin routes and review data

**Files:**
- Modify: `src/lib/data/landing-sheet-sync.ts`
- Create: `src/app/api/admin/landing-sheet-sync/route.ts` (GET status for one page), `.../approve/route.ts`, `.../scan/route.ts`, `.../install/route.ts`
- Test: `tests/landing-sheet-sync-routes.test.ts`

**Interfaces:**
- Produces:
```ts
export interface SheetSyncStatus { pageId: string; state: "report" | "live"; lastScannedAt: string | null; waiting: number; report: { logId: string; registrationId: string; name: string; field: SyncField; sheetValue: string; appValue: string }[]; problems: { rowNumber: number | null; refId: string; field: string; outcome: string; detail: string }[] }
export async function getSheetSyncStatus(pageId: string): Promise<SheetSyncStatus>;
export async function approveReport(pageId: string, applyLogIds: string[]): Promise<{ applied: number; keptApp: number }>;
```
- `approveReport`: loads the page's `report` log rows. Rows in `applyLogIds` go through `applySheetChanges`. Every other report row: for `status`/`amount` fields enqueue `enqueueSheetStatus` (the sheet is rewritten to the app value) and save the snapshot as the app value; for name/email/whatsapp leave both sides as they are and save the snapshot as the **sheet** value (logged `kept-app`). Then, for every registration of the page that still has no snapshot, save one from the app values. Finally set `sheet_sync_state = 'live'` and delete the page's `report` rows. Refuses with a plain message when the page is already live.
- Routes: all `requireAdmin()` first, page id checked with `isPageId`; `approve` takes `{ applyLogIds: string[] }` (max 5000, UUIDs); `scan` calls `requestSheetScan(page.sheetId)` and returns "Scan requested; results appear in a minute"; `install` calls `installLandingScanTrigger()`. Non-admins (including sales agents) get 403.

- [ ] **Step 1:** Failing tests: 403 for non-admin on every route; malformed page id is 404 after auth; approve on a live page is refused; approve applies ticked rows, rewrites sheet for unticked status rows, marks the page live, deletes report rows; unticked name/email/whatsapp rows are not applied and snapshot takes the sheet value (so the next live scan sees no difference).
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run (PASS), tsc, eslint.
- [ ] **Step 5:** Commit `feat: admin routes to review and approve the first sheet scan`.

---

### Task 8: Screens (gated on Stitch)

**Files:** components under `src/components/admin/registrations/` and the campaign/registrations pages; exact files depend on the design.

- [ ] **Step 1:** Search Stitch project `4651274386787527431` for a fitting screen. Needed: (a) a small "Sheet sync: N waiting" status with Retry on the Registrations page; (b) the first-scan review list (each difference with a tick box, defaults ticked, one Approve button, plain words); (c) a problems list (unknown rows, rejected edits, with what to do). If no screen fits, **stop and give the owner a Stitch prompt**.
- [ ] **Step 2:** After the design exists: failing component tests (renders waiting count, Retry calls the scan route, review list ticks default on and Approve posts the ticked ids, problems shown with plain words, hidden for sales agents).
- [ ] **Step 3:** Implement from the Stitch screen only. Words for the owner: "Sheet", "Waiting", "Scan now", "These rows are different in the sheet", "Use sheet value", "Keep app value".
- [ ] **Step 4:** Run tests (PASS), tsc, eslint.
- [ ] **Step 5:** Commit `feat: sheet sync status and first-scan review screen`.

---

### Task 9: Rollout (owner in the loop)

- [ ] **Step 1:** Run the full suite in the background; only the two known failures allowed. Whole-branch review by a fresh Opus reviewer on Tasks 4, 5, 6.
- [ ] **Step 2:** Ask the owner to paste `0078` into the Supabase SQL editor. Verify tables with the read-only Supabase MCP.
- [ ] **Step 3:** After the owner's yes: `clasp push` and redeploy from `gas/clasp-project/` (never the web editor), then call the admin `install` route once.
- [ ] **Step 4:** Merge only on the owner's yes (give the PR URL). Check the Vercel main build is green.
- [ ] **Step 5:** Live check with the owner's own rows only: first scan produces a report, nothing changed; approve; edit a Status on the owner's test row in the sheet, wait up to 5 minutes, confirm the app shows it with source "sheet" and one email; fix a WhatsApp in the sheet and see it in the app; save a memory note with the result.
