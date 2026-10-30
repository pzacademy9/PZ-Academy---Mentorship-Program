# Batch Sheet Mirror Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every 15 minutes (and on a "Sync now" button) copy new rows and status/amount changes from the old PPC Batch 3 Google sheet into the app, silently, and warn when an app-side Paid has no WhatsApp group link.

**Architecture:** Pure modules parse the sheet CSV and decide, per row, what to do (insert / apply status / skip). A data-layer runner applies the decisions through the existing guarded `landing_apply_status` function with source `sheet` and queues NO follow-ups (no email, enrollment or Meta). A small memory table remembers what was last seen per sheet row. pg_cron job 4 calls a bearer-protected route; an admin route backs the button.

**Tech Stack:** Next.js route handlers, Supabase (service role client `createAdminSupabase`), vitest, pg_cron + pg_net (job 3 `session-emails` is the model).

**Spec:** `docs/superpowers/specs/2026-10-30-batch-sheet-mirror-design.md`

## Global Constraints

- Next free migration is **0093**; the owner pastes SQL by hand; every statement safe to run twice.
- Never regenerate `src/lib/supabase/database.types.ts`; hand-add the new columns/table entries.
- Never add `eslint-disable` for `@typescript-eslint`. Source files often use CRLF: use the Edit tool.
- No student names/emails/phones in the repo, tests or commit messages; tests use invented rows.
- Mirror-origin changes send NO email, enrollment or Meta event: never call `queueStatusFollowUps` from the mirror.
- Rows are never deleted. The mirror never changes name/email/WhatsApp of an existing row.
- Match sheet rows by lower(trim(email)) + submitted time, never by Ref ID (the sheet reuses Ref IDs).
- Run checks directly (the `&` in the path breaks `npm run`): `node node_modules/typescript/bin/tsc --noEmit` (baseline 0 errors), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`. Known failing, not ours: tests/pz-tokens.test.ts, participant-recipients, participant-whatsapp-ui, landing-route-hardening, gas-apply-registration-status, landing-event-sheet.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Sheet row with a blank/garbled email or unknown status text: skipped and counted as a problem; the run goes on.
- Two sheet rows with the same email and different times (re-sign-ups, reused Ref ID) stay two separate app rows and never merge.
- Running twice in a row changes nothing the second time (idempotent).
- A row whose status an admin changed in the app (`status_source = 'app'`) is never moved by the sheet, not even to match.
- Sheet unreachable / not a CSV (login page HTML): run fails visibly, nothing is written, last good result kept.
- Two runs at once (cron + button): the second does nothing.
- Group member rows whose lead is not in the sheet yet / lead email blank: member skipped as a problem, not inserted orphaned.

---

## File Structure

- `supabase/migrations/0093_batch_sheet_mirror.sql` - columns on `landing_pages`, table `landing_mirror_rows`.
- `docs/superpowers/plans/2026-10-30-batch-sheet-mirror-owner-steps.md` - what the owner pastes and in what order.
- `src/lib/landing/mirror/csv.ts` - `parseCsv`.
- `src/lib/landing/mirror/rows.ts` - `mapSheetRow`, `rowKey`, types.
- `src/lib/landing/mirror/plan.ts` - `planMirror` (pure decision table).
- `src/lib/data/landing-mirror.ts` - `runMirror` (fetch, lock, apply, remember, report).
- `src/app/api/cron/sheet-mirror/route.ts` - GET, bearer secret.
- `src/app/api/admin/landing-mirror/sync/route.ts` - POST, admin.
- `src/components/admin/registrations/MirrorPanel.tsx` + hook-in on `src/app/dashboard/admin/enrollments/registrations/sheet/[pageId]/page.tsx`.
- `src/lib/data/landing-registration-admin.ts`, `src/lib/landing/registration/status-change-response.ts`, `src/components/admin/registrations/StatusChangeControl.tsx` - the Paid warning.
- Tests: `tests/mirror-csv.test.ts`, `tests/mirror-rows.test.ts`, `tests/mirror-plan.test.ts`, `tests/mirror-run.test.ts`, `tests/mirror-routes.test.ts`, `tests/status-paid-warning.test.ts`.

---

### Task 1: Migration 0093, types, owner steps

**Files:**
- Create: `supabase/migrations/0093_batch_sheet_mirror.sql`, `docs/superpowers/plans/2026-10-30-batch-sheet-mirror-owner-steps.md`
- Modify: `src/lib/supabase/database.types.ts` (hand-add)

**Interfaces:**
- Produces: `landing_pages` columns `mirror_sheet_id text null`, `mirror_last_run_at timestamptz null`, `mirror_last_result jsonb null`, `mirror_running_at timestamptz null`. Table `landing_mirror_rows(page_id uuid, row_key text, registration_id uuid, last_status text, last_amount numeric null, last_seen_at timestamptz)` primary key `(page_id, row_key)`, FK `registration_id` to `landing_registrations(id)` on delete cascade, RLS on with no policies (service role only).

- [ ] **Step 1:** Write the migration (idempotent: `add column if not exists`, `create table if not exists`, `alter table ... enable row level security`). Header comment says the owner pastes it.
- [ ] **Step 2:** Hand-add the four `landing_pages` columns (Row/Insert/Update) and the `landing_mirror_rows` table entry to `database.types.ts`, following the neighbouring entries' shape.
- [ ] **Step 3:** Write the owner-steps doc: (a) paste 0093; (b) check query `select column_name from information_schema.columns where table_name='landing_pages' and column_name like 'mirror_%'` returns 4 rows; (c) set the sheet: `update landing_pages set mirror_sheet_id='1OEl4BIi53bsecA562n7fci659r6I6umBj2cG-t4Bcto' where slug='ppc-batch-3';` (d) the cron statement: `select cron.schedule('sheet-mirror','*/15 * * * *', $$ select net.http_get(url := 'https://pz-academy.pharmacozyme.com/api/cron/sheet-mirror', timeout_milliseconds := 60000, headers := jsonb_build_object('Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='session_cron_secret'))); $$);` plus check `select jobname, schedule from cron.job;`. Order: paste (a), deploy the branch, then (c) and (d).
- [ ] **Step 4:** `tsc --noEmit` expect 0 errors. Commit `feat: migration 0093 for the batch sheet mirror`.

### Task 2: CSV reader and row mapper

**Files:**
- Create: `src/lib/landing/mirror/csv.ts`, `src/lib/landing/mirror/rows.ts`
- Test: `tests/mirror-csv.test.ts`, `tests/mirror-rows.test.ts`

**Interfaces:**
- Produces:
  - `parseCsv(text: string): string[][]` (RFC-4180: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF/LF, strips a leading BOM).
  - `interface MirrorSheetRow { key: string; email: string; submittedAt: Date; name: string; whatsapp: string; profession: string; discovery: string; consent: boolean; rowType: "individual" | "lead" | "member"; leadEmail: string; optionLabel: string; mode: "live" | "recorded"; tierKey: string; groupSize: number; region: string; currency: string; promoCodeText: string; expectedAmount: number; paymentMethod: string; voucherUrl: string; status: RegistrationStatus; amountReceived: number | null; emailStatusText: string; refId: string }`
  - `type MapResult = { ok: true; row: MirrorSheetRow } | { ok: false; reason: "no-email" | "bad-status" | "bad-time" | "no-name" | "bad-option" }`
  - `mapSheetRow(header: string[], cells: string[]): MapResult` (columns found by header name, not position).
  - `rowKey(email: string, submittedAt: Date): string` = `lower(trim(email)) + "|" + ISO string cut to the minute`.
  - `isCsvSheet(rows: string[][]): boolean` true only when the first row contains the headers "Email", "Submitted At" and "Payment Confirmation" (guards against a Google login HTML page).
- Consumes: `parseSheetStatus`, `parseSheetAmount` from `src/lib/landing/registration/sheet-sync-engine.ts` (status text -> status; blank/garbled amount handled there).

- [ ] **Step 1:** Write `tests/mirror-csv.test.ts`: a quoted field containing a comma and a newline; doubled quotes; CRLF; BOM; empty trailing line; `isCsvSheet` false for an HTML string parsed as one cell.
- [ ] **Step 2:** Run it, expect FAIL (module missing).
- [ ] **Step 3:** Implement `parseCsv` and `isCsvSheet` in `csv.ts`; run, expect PASS.
- [ ] **Step 4:** Write `tests/mirror-rows.test.ts` with invented rows: individual Live full course (mode live, tier "individual"), "Recorded - Modules: M1" (mode recorded), "Group of 3" lead (tierKey "group3", groupSize 3), a member row with Group Lead Email, Source "ppc-v2-UAE#PZA-PPC-009" gives region "UAE" currency "AED" (PK -> PKR, KSA -> SAR), status text "Paid"/"Pending"/"Reserved"/"Underpaid"/"Free" map to the five statuses, "Maybe" -> `bad-status`, blank email -> `no-email`, unparsable Submitted At -> `bad-time`; email is lower-cased and trimmed; `rowKey` ignores seconds and case; the Submitted At text format is read from the real sheet's first data row (builder: open the CSV once, state the format found in a code comment, parse as Pakistan time UTC+5).
- [ ] **Step 5:** Run, expect FAIL. Implement `mapSheetRow`/`rowKey` in `rows.ts` (option label parsing mirrors how the first import filled mode/tier/group size; builder: confirm region/currency mapping with one read-only query `select distinct region, currency from landing_registrations where page_id='a2456801-cac0-4ac8-b4c0-179db02b013d'`). Run, expect PASS.
- [ ] **Step 6:** eslint on both files, commit `feat: sheet mirror CSV reader and row mapper`.

### Task 3: Decision table

**Files:**
- Create: `src/lib/landing/mirror/plan.ts`
- Test: `tests/mirror-plan.test.ts`

**Interfaces:**
- Consumes: `MirrorSheetRow`, `rowKey` (Task 2).
- Produces:
  - `interface AppRowLite { id: string; email: string; createdAt: Date; status: RegistrationStatus; amountReceived: number | null; statusSource: "app" | "sheet"; rowType: "individual" | "lead" | "member" }`
  - `interface MemoryRow { rowKey: string; registrationId: string; lastStatus: RegistrationStatus; lastAmount: number | null }`
  - `type MirrorAction = { kind: "insert"; row: MirrorSheetRow } | { kind: "link"; rowKey: string; registrationId: string; status: RegistrationStatus; amount: number | null } | { kind: "apply"; rowKey: string; registrationId: string; to: RegistrationStatus; amount: number | null; from: RegistrationStatus } | { kind: "remember"; rowKey: string; registrationId: string; status: RegistrationStatus; amount: number | null } | { kind: "skip"; rowKey: string; reason: "unchanged" | "app-owns-row" | "free-row" | "member-row" | "orphan-member" } | { kind: "problem"; rowNumber: number; reason: string }`
  - `planMirror(sheet: { rowNumber: number; mapped: MapResult }[], app: AppRowLite[], memory: MemoryRow[]): MirrorAction[]`

Decision table (the tests pin each line):
1. `mapped.ok === false` -> `problem`.
2. rowKey in memory: if the app row is gone -> `problem`; if `statusSource === "app"` -> `remember` (so memory follows) but no `apply`; if sheet status/amount equal memory -> `skip unchanged`; if app row is `free` or `member` -> `skip`; else `apply` (from = current app status).
3. rowKey not in memory, an app row with the same lower-case email exists on the page: pick the one whose `createdAt` is within 1 minute of the sheet time, else if exactly one candidate use it, else `problem` "ambiguous"; result is `link` (writes memory only; changes nothing in the app).
4. Not in memory, not in app: `insert`; a `member` row whose lead email has no sheet or app lead -> `problem` ("orphan-member"). Inserts of leads come before their members in the returned order.
5. Two sheet rows with the same rowKey: the second is a `problem` ("duplicate-row").

- [ ] **Step 1:** Write `tests/mirror-plan.test.ts` with one test per line above (names like `"app-owned row is never moved by the sheet"`, `"same email at a different time is a separate insert"`, `"second run over the same data yields only skips"`, `"orphan member becomes a problem"`).
- [ ] **Step 2:** Run, expect FAIL. Implement `planMirror`; run, expect PASS.
- [ ] **Step 3:** eslint, commit `feat: sheet mirror decision table`.

### Task 4: Runner

**Files:**
- Create: `src/lib/data/landing-mirror.ts`
- Test: `tests/mirror-run.test.ts` (fake Supabase client plus stubbed `fetch`; follow how existing `tests/landing-sheet-sync*.test.ts` fake the client, if such a file exists)

**Interfaces:**
- Consumes: `parseCsv`, `isCsvSheet`, `mapSheetRow`, `planMirror`, `landing_apply_status` RPC (args `p_registration_id, p_to_status, p_expected_from, p_amount, p_actor: null, p_source: "sheet"`), `checkStatusChange` from `status-rules`.
- Produces:
  - `interface MirrorResult { ok: boolean; preview: boolean; inserted: number; changed: number; linked: number; skipped: number; problems: { rowNumber: number; reason: string }[]; error?: string; ranAt: string }`
  - `runMirror(pageId: string, opts?: { preview?: boolean }): Promise<MirrorResult>`
  - `runMirrorForAllPages(): Promise<{ pageId: string; result: MirrorResult }[]>` (pages with a non-null `mirror_sheet_id`)

Behaviour:
- Lock: `update landing_pages set mirror_running_at = now() where id = $1 and (mirror_running_at is null or mirror_running_at < now() - interval '10 minutes')` returning id; no row back -> return `{ ok:false, error:"Already running" }` without touching anything. Always clear `mirror_running_at` at the end (finally).
- Fetch `https://docs.google.com/spreadsheets/d/<mirror_sheet_id>/export?format=csv` with a 20 s timeout; non-200, or `isCsvSheet` false -> `{ ok:false, error:"Could not read the sheet" }`, nothing written, `mirror_last_result` set to that error, previous good counts untouched in a `lastGood` key.
- Load the page's `landing_registrations` (id, email, created_at, status, amount_received, status_source, row_type) and `landing_mirror_rows`.
- `preview: true` returns the counts and writes nothing (not even memory).
- `insert`: lead rows first; row values as the first import used: `status_source 'sheet'`, `email_status = row.emailStatusText`, `is_test false`, `created_at = submittedAt`, `lead_registration_id` = lead's id for members (looked up by lead email on the page), `ref_id` = sheet Ref ID, with `-dup2`, `-dup3` suffix when that ref_id already exists on the page (builder: check for a unique index on `ref_id` first; keep suffixing either way). `status`/`amount_received` from the sheet; the database trigger gives Paid/Free rows their PZ ID. Insert the memory row after each successful insert.
- `apply`: run `checkStatusChange` with the sheet amount; on `ok` call the RPC with `p_expected_from` = the `from` of the action; on `stale`/`already-in-status` count as skipped; on any rejection add a problem; then upsert the memory row. Do NOT call `queueStatusFollowUps`, `enqueueStatusEffects`, or any email function.
- `link` and `remember`: upsert memory only.
- Save `mirror_last_run_at` and `mirror_last_result` on the page (also in preview? no - preview writes nothing).
- Logging uses fixed strings and error codes only; never emails or names.

- [ ] **Step 1:** Write `tests/mirror-run.test.ts`: (a) fresh page + 3-row CSV with invented rows -> 3 inserts, memory rows created, zero calls to any follow-up/email function (spy), `status_source 'sheet'`; (b) second run -> all skipped; (c) sheet moves a row Pending -> Paid -> one RPC call with `p_source "sheet"` and `p_actor null`, no follow-ups; (d) row whose app `status_source` is `'app'` -> no RPC; (e) HTML instead of CSV -> `ok:false`, no writes; (f) lock already held -> `Already running`, no writes; (g) preview -> counts only, no writes.
- [ ] **Step 2:** Run, expect FAIL. Implement `runMirror` and `runMirrorForAllPages`; run, expect PASS.
- [ ] **Step 3:** `tsc --noEmit`, eslint, commit `feat: sheet mirror runner`.

### Task 5: Routes (15-minute tick and Sync now)

**Files:**
- Create: `src/app/api/cron/sheet-mirror/route.ts`, `src/app/api/admin/landing-mirror/sync/route.ts`, `src/lib/validations/landing-mirror.ts`
- Test: `tests/mirror-routes.test.ts`

**Interfaces:**
- Consumes: `runMirrorForAllPages`, `runMirror`, `requireAdmin` (from `@/lib/auth/require-admin`).
- Produces: `GET /api/cron/sheet-mirror` (same bearer check as `src/app/api/cron/session-emails/route.ts`: `CRON_SECRET`, timing-safe digest compare, 401 otherwise; `dynamic = "force-dynamic"`, `maxDuration = 60`; returns `{ pages: number, results: [{ pageId, inserted, changed, problems }] }`). `POST /api/admin/landing-mirror/sync` body `{ pageId: uuid, preview?: boolean }` (zod in `landing-mirror.ts`), admin only, returns the `MirrorResult`; 400 invalid input; 404 when the page has no `mirror_sheet_id`.

- [ ] **Step 1:** Write `tests/mirror-routes.test.ts`: cron route 401 with no/wrong secret and 401 when `CRON_SECRET` unset; 200 with the right secret; admin route 401/403 for non-admin (use the existing `requireAdmin` mock pattern from other route tests), 400 for a bad body, success returns the result.
- [ ] **Step 2:** Run, expect FAIL. Implement both routes; run, expect PASS.
- [ ] **Step 3:** eslint, commit `feat: sheet mirror cron and sync routes`.

### Task 6: Screen - "Synced from sheet" line and Sync now

**Files:**
- Create: `src/components/admin/registrations/MirrorPanel.tsx`
- Modify: `src/app/dashboard/admin/enrollments/registrations/sheet/[pageId]/page.tsx` (render the panel when the page has a `mirror_sheet_id`); `src/lib/data/landing-pages.ts` (include `mirror_sheet_id`, `mirror_last_run_at`, `mirror_last_result` in what the page reads)
- Test: `tests/mirror-panel.test.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/landing-mirror/sync`, `relativeTime` and `formatDateTimePkt` from `@/lib/format`, `MirrorResult` shape (Task 4).
- Produces: `MirrorPanel({ pageId, lastRunAt, lastResult }: { pageId: string; lastRunAt: string | null; lastResult: MirrorResult | null })`. Shows in plain words: "Synced from sheet 4 min ago - 2 new, 1 changed, 0 problems"; a red line with the error when the last run failed ("Could not read the sheet"); problems list (row number and reason in plain words); a "Preview" button and a "Sync now" button; both disabled while running; after a run it calls `router.refresh()`.

- [ ] **Step 1:** Write the test: renders the summary sentence for a given result; shows the error text for `ok:false`; clicking Sync now posts `{ pageId, preview:false }`; Preview posts `preview:true`; buttons disabled while pending.
- [ ] **Step 2:** Run, expect FAIL. Implement panel and page hook-in (follow `SheetSyncPanel.tsx` styling and `useAsyncAction` usage); run, expect PASS.
- [ ] **Step 3:** `tsc --noEmit`, eslint, commit `feat: sheet mirror panel with Sync now`.

### Task 7: Warning when Paid is set in the app and the batch has no WhatsApp group link

**Files:**
- Modify: `src/lib/data/landing-registration-admin.ts` (`ChangeStatusResult` ok variant gains `warning?: string`; `changeRegistrationStatus` fills it), `src/lib/landing/registration/status-change-response.ts` (return `warning` in the JSON), `src/components/admin/registrations/StatusChangeControl.tsx` (show it)
- Test: `tests/status-paid-warning.test.ts`

**Interfaces:**
- Consumes: `selectWaGroups(cfg, optionKeys, mode)` from `src/lib/landing/registration/wa-groups.ts`; the page config loader that `src/lib/landing/registration/status-email.ts` uses (`page.registration`).
- Produces: pure helper `paidGroupWarning(args: { to: ChangeableStatus; mode: "live" | "recorded"; groups: WaGroupButton[] }): string | null` exported from `wa-groups.ts`; returns `"Marked Paid and the email is queued, but this batch has no WhatsApp group link, so the email will have no group button."` only when `to === "paid"`, `mode === "live"` and `groups.length === 0`, else `null`. Recorded students never get a group link by design, so no warning for them.

- [ ] **Step 1:** Write `tests/status-paid-warning.test.ts`: helper returns the sentence for live + paid + no groups; null for recorded; null when a group exists; null for `underpaid`/`pending`/`reserved`; response mapper includes `warning` when present and omits it otherwise.
- [ ] **Step 2:** Run, expect FAIL. Implement the helper; in `changeRegistrationStatus` after the RPC succeeds, load the page config for the registration's page (read-only, in a try/catch: a failed lookup yields no warning, never a failed status change) and compute the warning; thread it through the response mapper; in `StatusChangeControl` after the success toast, if the response JSON has `warning`, show it with `toast.warning` (keep it on screen long enough to read, e.g. the sonner `duration: 10000`). Run, expect PASS.
- [ ] **Step 3:** Run every test that imports a changed file (`landing-registration-admin`, `status-change-response`, `StatusChangeControl`), `tsc --noEmit`, eslint, commit `feat: warn when Paid has no WhatsApp group link`.

### Task 8: Whole-branch check and docs

**Files:**
- Modify: `CLAUDE.md` (Project state: mirror section; also fix "0092 awaiting paste" to live)

- [ ] **Step 1:** `tsc --noEmit` (expect 0), eslint on all changed paths, run all `tests/mirror-*.test.ts*` and `tests/status-paid-warning.test.ts` (expect PASS).
- [ ] **Step 2:** Update CLAUDE.md Project state (short). Commit `docs: project state for the sheet mirror`.
- [ ] **Step 3:** Whole-branch review (opus), then owner steps: paste 0093, push branch only on owner's yes, set `mirror_sheet_id`, run Preview, read counts together, run Sync now once, then add the cron.

---

## Self-review notes

- Spec coverage: 15-minute tick (T1 cron, T5), Sync now (T5, T6), all five statuses (T2, T3), silent mirror (T4 constraint + test), app-wins rule (T3 line 2, T4 test d), Paid warning (T7), never delete (T3 line 2 gone-row = problem only), PZ ID via trigger (T4 insert), memory table (T1).
- Types consistent: `MirrorSheetRow`/`MapResult` (T2) feed `planMirror` (T3) feed `runMirror` (T4); `MirrorResult` (T4) feeds routes (T5) and panel (T6).
- Left to the builder (spec says so): Submitted At format/time zone, unique-index check on `ref_id`, region/currency mapping check, fake-client style for T4.
