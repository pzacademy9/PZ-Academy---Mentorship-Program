# Registrations List Row Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the admin Registrations lists, an admin can see the voucher, edit name/email/WhatsApp (sheet updated too), send any status email (again if needed), and open the one-person email/WhatsApp writer, without opening the person's page.

**Architecture:** Backend first (resend-safe status email, details edit with a queued sheet update, voucher data), then the list UI from Stitch screens. A status email resend reuses the existing email builders and sender but logs under new repeat-friendly kinds and never touches status, enrollment or jobs. A details edit saves in the app at once and pushes to the sheet through the existing outbox, keeping the sheet-sync "last written" record correct.

**Tech Stack:** Next.js route handlers and client components, Supabase admin client, Vitest + testing-library, Google Apps Script via clasp.

**Spec:** `docs/superpowers/specs/2026-10-21-registrations-list-actions-design.md` (read it, including "Lessons from sheet sync" and "Calls made after the builder check"). Related: `docs/superpowers/specs/2026-10-21-landing-sheet-sync-design.md`.

## Global Constraints

- Branch `registrations-list-actions` (cut from main). Never push or merge to main without the owner's yes. Leave untracked `docs/lead-capture-go-live-guide.md` alone. `gh` is not logged in: give the owner the PR URL.
- `npm run` is broken. Use `node node_modules/typescript/bin/tsc --noEmit` (baseline 0, ignore `.next/types` noise), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`. Known failing tests, not ours: `tests/pz-tokens.test.ts`, `tests/landing-route-hardening.test.ts`. Full vitest takes over 2 minutes: run in background. Never `next build` while dev runs.
- Never regenerate `database.types.ts` (`src/lib/supabase/database.types.ts`): hand-add entries. Supabase MCP is read-only: migrations are files (next number `0079`) the owner pastes. No `eslint-disable @typescript-eslint/...` comments (config is only `next/core-web-vitals`).
- Apps Script changes only via clasp (`gas/clasp-project/`) after the owner's yes; `gas/sheets-sync/Code.gs` and `gas/clasp-project/Sheet Sync.js` stay byte-identical (a test enforces it). Deploy: `clasp pull`, copy mirror over `Sheet Sync.js`, `clasp push -f`, `clasp redeploy AKfycbziAgPGm187O3nScUO1wd9RsIuaiGoUd8Z_MC55f7Lv6PaMJuc3lC9So7TyWt9xqeeE -d "<label>"`.
- UI comes only from Stitch (project "PZ Academy Platform 2", `4651274386787527431`); if no screen fits, give the owner a Stitch prompt and stop that part. Never improvise UI.
- Plain words for a non-technical owner; never "snapshot", "webhook", "variant", "override", "resolve", "schema", "YAML" in visible text.
- Admin only: every new route calls `requireAdmin()` first; page ids validated after auth. Sales pages and agent lists get none of these actions.
- Test only with the owner's own rows (page "Diabetes Management & Pharmacotherapy - Batch 1": hamzaansari4you@gmail.com has an invalid phone, dit.pharmacozyme@gmail.com is valid). Never send to real students.
- Commits: new commits only, never amend; end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Sheet-sync lessons that must hold: the "last written" record (`landing_sheet_snapshots`) moves only after a push that found its row (Apps Script returns `missing`); a name/email/WhatsApp push must never write the snapshot's status or amount; the sheet row is found by Ref ID plus the email the sheet currently shows (the snapshot email), not the new email.

## Review Focus

1. Resending a status email that was already sent needs an explicit confirm: without it the server refuses (T2).
2. A resend changes nothing but the email: no status change, no enrollment, no jobs queued, no once-only guard consumed (T2).
3. A member row offers only Pending-received and Paid (covered by group); Reserved/Underpaid are refused for members (T2).
4. A test registration's resend goes only to the test admin recipient, as automatic emails do (T2).
5. Email edit to an address another registration on the same page uses is refused; invalid email or WhatsApp refused with plain text (T3).
6. A name/email/WhatsApp push whose sheet row is missing leaves the snapshot alone and keeps the job retrying; a success never touches the snapshot's status/amount (T4).
7. A sheet scan while an edit's push is still pending must not revert the edit (T4).
8. A voucher that is not an https Google Drive link shows no thumbnail (icon/plain link); thumbnails only on admin pages (T5).
9. WhatsApp button is disabled with "No phone number" / "Number not valid" for missing/invalid numbers (T7).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0079_landing_list_actions.sql` | new email-log kinds, new job type `sheet_details` |
| `src/lib/data/landing-email-log.ts` (modify) | `EmailLogKind` gets manual kinds; `logManualEmail`, `lastSentAt` |
| `src/lib/landing/registration/status-email.ts` (create) | `buildStatusEmail(...)`: the builder-selection + context shared by automatic and manual sends |
| `src/lib/landing/registration/job-handlers.ts` (modify) | `emailStatus` uses `buildStatusEmail`; `sheetDetails` handler; export `sendStatusEmailAgain` |
| `src/app/api/admin/registrations/[id]/status-email/route.ts` (create) | POST resend |
| `src/lib/data/landing-registration-edit.ts` (create) | `updateRegistrationDetails` |
| `src/app/api/admin/registrations/[id]/details/route.ts` (create) | PATCH details |
| `src/lib/data/landing-sheet-sync.ts` (modify) | `saveContactSnapshots` |
| `src/lib/gas/event-sheet-client.ts`, `gas/sheets-sync/Code.gs` + clasp copy (modify) | `applyRegistrationDetails` |
| `src/lib/data/landing-registration-admin.ts` (modify) | list rows carry `voucherUrl`, `sheetUpdateWaiting`, `lastEmailKinds` |
| `src/components/admin/registrations/` (modify/create) | voucher thumb, row actions, dialogs (Stitch-gated) |

---

### Task 1: Migration and kinds

**Files:**
- Create: `supabase/migrations/0079_landing_list_actions.sql`
- Modify: `src/lib/supabase/database.types.ts` (hand-add only if the job type or kind appear as unions there), `src/lib/data/landing-email-log.ts`, `src/lib/data/landing-jobs.ts` (`JobType`, `JOB_TYPES`), `src/components/admin/registrations/RegistrationEmailsCard.tsx` (labels)
- Test: `tests/landing-list-actions-migration.test.ts` (reads SQL text, like `tests/landing-sheet-sync-migration.test.ts`)

**Interfaces:**
- Produces: `EmailLogKind` = `"paid" | "underpaid" | "reserved" | "portal_link" | "manual_received" | "manual_paid" | "manual_underpaid" | "manual_reserved"`; `JobType` gains `"sheet_details"` (also in `JOB_TYPES`, `JOB_HANDLERS` in Task 4).
- The migration drops and re-adds `landing_email_log_kind_check` (inline check from 0075; find its real name in the SQL: it is the default `landing_email_log_kind_check`) to allow the 4 manual kinds, and `landing_jobs_type_check` to allow `sheet_details` (list ALL existing types: sheet_append, email_received, email_members, email_admin, sheet_status, enrollment_sync, email_status, sheet_details). The existing partial unique index `landing_email_log_status_once` (kinds paid/underpaid/reserved) is NOT touched, so manual kinds may repeat. Header says the owner pastes it; safe to run twice.
- Email card labels: `manual_paid` => "Paid (sent again)", `manual_received` => "Pending (sent again)", `manual_underpaid` => "Underpaid (sent again)", `manual_reserved` => "Reserved (sent again)" (same colours as the base kinds).

- [ ] **Step 1:** Failing test: the SQL file has both constraint re-creations with all kinds/types listed, no `create policy`, and does not mention dropping `landing_email_log_status_once`.
- [ ] **Step 2:** Run it; expect FAIL (file missing).
- [ ] **Step 3:** Write the migration; extend `EmailLogKind`, `JobType`, `JOB_TYPES`, the email-card label map (and make `JOB_HANDLERS` compile with a temporary no-op `sheet_details` that Task 4 replaces).
- [ ] **Step 4:** Run the migration test and `tsc` (0 errors); run `tests/landing-jobs.test.ts` and `tests/landing-email-log.test.ts` (PASS).
- [ ] **Step 5:** Commit `feat: new email kinds and job type for list actions`.

---

### Task 2: Resend a status email

**Files:**
- Create: `src/lib/landing/registration/manual-kinds.ts` (pure, no server-only imports: `ManualEmailKind`, `manualKindsFor`; also imported by the Task 7 client files), `src/lib/landing/registration/status-email.ts`, `src/app/api/admin/registrations/[id]/status-email/route.ts`
- Modify: `src/lib/landing/registration/job-handlers.ts` (extract; add `sendStatusEmailAgain`), `src/lib/data/landing-email-log.ts` (`logManualEmail`, `lastSentAt`)
- Test: `tests/landing-status-email-again.test.ts`, existing `tests/landing-job-handlers.test.ts` must still pass unchanged

**Interfaces:**
- Produces in `manual-kinds.ts`:
```ts
export type ManualEmailKind = "received" | "paid" | "underpaid" | "reserved";
export function manualKindsFor(rowType: "individual" | "lead" | "member"): ManualEmailKind[]; // member: ["received","paid"]; others: all four
```
- Produces in `status-email.ts` (extracted from the body of `emailStatus` in `job-handlers.ts`, behavior of automatic sends unchanged):
```ts
export async function buildStatusEmail(p: { kind: ManualEmailKind; person: RegistrationRecord; lead: RegistrationRecord; page: RegistrablePage; asOf?: "now" }): Promise<BuiltEmail>;
```
  `received` uses `buildReceivedEmail` (lead/individual) or `buildMemberReceivedEmail` (member, as `emailMembers` does); `paid` uses `buildPaidEmail` with `coveredByGroup: person.rowType === "member"`; `underpaid`/`reserved` the existing builders. Context (portal url, needsAccount, portalOpensLater, noCourse, signupUrl) is built the same way `emailStatus` builds it today.
- `landing-email-log.ts`: `logManualEmail(registrationId: string, kind: "manual_received"|"manual_paid"|"manual_underpaid"|"manual_reserved", toEmail: string): Promise<void>` (insert state `sent`); `lastSentAt(registrationId: string, kinds: EmailLogKind[]): Promise<string | null>` (latest `sent_at` among `state='sent'` rows of those kinds; the automatic kind for a manual kind counts: paid <-> manual_paid, etc.; `received` is judged by `landing_registrations.email_status === RECEIVED_SENT` or any manual_received row).
- `job-handlers.ts`: `export async function sendStatusEmailAgain(p: { registrationId: string; kind: ManualEmailKind; confirmedAgain: boolean }): Promise<{ ok: true } | { ok: false; reason: "not-found" | "not-allowed" | "needs-confirm" | "send-failed"; sentAt?: string }>`. Rules: unknown registration => `not-found`; kind not in `manualKindsFor(rowType)` => `not-allowed`; if `lastSentAt(...)` is non-null and `confirmedAgain` is false => `needs-confirm` with `sentAt`; otherwise build, `deliver(...)` (so test registrations go only to the test admin, with the test prefix), then `logManualEmail`. It must NOT call `claimEmail`, `enqueue*`, `changeRegistrationStatus`, or touch `email_status`.
- Route `POST /api/admin/registrations/[id]/status-email`, body `{ kind: ManualEmailKind, confirmedAgain?: boolean }` (zod). `requireAdmin()` first; id checked with the UUID helper after auth (malformed => 404); `needs-confirm` => 409 `{ error: "This person already got this email.", code: "needs-confirm", sentAt }`; `not-allowed` => 422 plain message; `send-failed` => 502 "The email could not be sent. Try again."; success => 200 `{ ok: true }`.

- [ ] **Step 1:** Failing tests (mock brevo + admin client like `tests/landing-job-handlers.test.ts`): `manualKindsFor("member")` equals `["received","paid"]` and lead/individual get four; `sendStatusEmailAgain` on a person who already got a Paid email without `confirmedAgain` returns `needs-confirm` with `sentAt` and sends nothing; with `confirmedAgain: true` it sends once and logs a `manual_paid` row; first-ever send needs no confirm; a member asking for `reserved` is `not-allowed`; none of `claimEmail`, enqueue helpers or the status RPC are called (assert on mocks); a test registration is delivered only to the test recipient with the test prefix; route: 403 non-admin, 404 malformed id after auth, 409 payload, 400 bad body.
- [ ] **Step 2:** Run `tests/landing-status-email-again.test.ts`; expect FAIL.
- [ ] **Step 3:** Extract `buildStatusEmail` and `manualKindsFor` (refactor `emailStatus` to call them; run `tests/landing-job-handlers.test.ts` to prove no behavior change), implement `logManualEmail`, `lastSentAt`, `sendStatusEmailAgain`, and the route.
- [ ] **Step 4:** Run both test files, `tsc`, eslint on touched files (PASS / 0 errors).
- [ ] **Step 5:** Commit `feat: send a status email again from the admin side`.

---

### Task 3: Edit name, email, WhatsApp (app side)

**Files:**
- Create: `src/lib/data/landing-registration-edit.ts`, `src/app/api/admin/registrations/[id]/details/route.ts`
- Modify: `src/lib/data/landing-sheet-sync.ts` (add `saveContactSnapshots`)
- Test: `tests/landing-registration-edit.test.ts`

**Interfaces:**
- Consumes: `saveSnapshots(regs, { insertOnly: true })` and the planner's validators (`sheet-sync-engine.ts` exports or re-exports for email/WhatsApp/name normalization; reuse, do not copy), `enqueueJobs`/a coalescing enqueue like `enqueueSheetStatus` in `src/lib/data/landing-jobs.ts`.
- Produces:
```ts
export type DetailsEditResult =
  | { ok: true; changed: ("name" | "email" | "whatsapp")[] }
  | { ok: false; reason: "not-found" | "nothing-to-change" | "bad-name" | "bad-email" | "email-taken" | "bad-whatsapp" | "db-error" };
```
  `export async function updateRegistrationDetails(p: { registrationId: string; name?: string; email?: string; whatsapp?: string }): Promise<DetailsEditResult>` — normalization: name trim 1-200 chars; email trim + lower-case, `@` at index >= 1; WhatsApp digits only, 8 to 15 digits; `email-taken` when another registration with `page_id` equal and that email exists (case-insensitive, escape like the sheet-sync applier). Order: read the row; compute changed fields (none => `nothing-to-change`); BEFORE writing, `saveSnapshots([pre-edit values], { insertOnly: true })` so the sheet row's old email is known even for registrations that have no snapshot yet; update the row (name/email/whatsapp only; never `student_id`); enqueue ONE coalesced `sheet_details` job for the registration (upsert back to pending, attempts 0, like `enqueueSheetStatus`); run it in the background like `queueStatusFollowUps` does (a failure there never fails the edit). Test registrations are editable but never pushed (the handler already skips `isTest`).
- `saveContactSnapshots(regs: { id: string; name: string; email: string; whatsapp: string }[]): Promise<void>` in `landing-sheet-sync.ts`: per registration an UPDATE of `name, email, whatsapp, updated_at` only on the EXISTING snapshot row (normalized the same way as `saveSnapshots`); missing rows skipped; throws on DB error.
- Route `PATCH /api/admin/registrations/[id]/details` body `{ name?: string; email?: string; whatsapp?: string }` (zod, at least one key). Admin first, malformed id 404 after auth; `bad-*` => 422 with plain text ("Enter a valid email address, like name@example.com.", "Enter a WhatsApp number with the country code, digits only.", "The name cannot be empty."); `email-taken` => 409 "Another person on this page already uses that email. Their account is not changed."; `nothing-to-change` => 200 `{ ok: true, changed: [] }`; success => 200 `{ ok: true, changed }`. Visible text never says "snapshot".

- [ ] **Step 1:** Failing tests: valid edit updates only the three columns and enqueues one `sheet_details` job; second edit while a job is pending still leaves one job; email already used on the same page => `email-taken`, nothing written, nothing enqueued; same email on a different page is allowed; invalid email, empty name, 7-digit WhatsApp rejected; the pre-edit snapshot is created insert-only before the update (assert call order) and an existing snapshot is never overwritten; `student_id` untouched; route auth/404/409/422 cases; `saveContactSnapshots` updates only the three contact fields (assert the update payload keys) and skips a registration with no snapshot.
- [ ] **Step 2:** Run `tests/landing-registration-edit.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement the data function, `saveContactSnapshots` and the route.
- [ ] **Step 4:** Run the test file, `tests/landing-sheet-sync-data.test.ts`, `tsc`, eslint (PASS / 0 errors).
- [ ] **Step 5:** Commit `feat: edit a person's name, email and WhatsApp from the admin side`.

---

### Task 4: Push the edit to the sheet

**Files:**
- Modify: `src/lib/landing/registration/job-handlers.ts` (`sheetDetails` handler registered in `JOB_HANDLERS`), `src/lib/gas/event-sheet-client.ts`, `gas/sheets-sync/Code.gs` and its clasp copy `gas/clasp-project/Sheet Sync.js` (byte-identical)
- Test: `tests/landing-sheet-details-job.test.ts`, extend `tests/landing-event-sheet.test.ts`, extend `tests/landing-sheet-sync-engine.test.ts`

**Interfaces:**
- Consumes: `updateRegistrationDetails` (Task 3) which enqueues the job; `saveContactSnapshots`; the existing `applyRegistrationStatus` pattern in `event-sheet-client.ts` (`postToGas`, token from `SHEETS_SYNC_SECRET`, `missing` parsing).
- Produces in the client: `export interface DetailsSheetRow { refId: string; matchEmail: string; name: string; email: string; whatsapp: string }` and `export async function applyRegistrationDetails(sheetId: string, rows: DetailsSheetRow[]): Promise<{ ok: boolean; missing: string[] }>` (same `missing` semantics as `applyRegistrationStatus`; `missing` entries are `REF.toUpperCase()|matchEmail.toLowerCase()` keys).
- GAS: new `doPost` action `applyRegistrationDetails` (token-checked like `applyRegistrationStatus`) handled by `handleApplyRegistrationDetails_(body)`: script lock (10 s), find each row by `landingRowKey_(refId, matchEmail)` using the first match, write ONLY columns A (name), B (email), C (WhatsApp) for that row, using `landingCell_` to keep text safe from formulas and the text-column rule for column C; rows not found go to `missing` (not an error); reply `{status:"success", ok:true, updated:n, missing:[...]}`.
- Handler `sheetDetails(registrationId)` in `job-handlers.ts`: skip (done) for test registrations or pages without a sheet; load the registration and its snapshot (`landing_sheet_snapshots`); `matchEmail` = the snapshot's email when a snapshot exists, else the current email (Task 3 guarantees a snapshot exists for any edit made after this ships); build one `DetailsSheetRow` using the lead's Ref ID (`bundle.lead.refId`, members carry the lead's ref); call `applyRegistrationDetails`; throw when `!ok` or when the row is in `missing` (so the outbox retries with backoff); on success call `saveContactSnapshots([{ id, name, email, whatsapp }])`. It must not call `saveSnapshots` or `saveStatusSnapshots`.

- [ ] **Step 1:** Failing tests: handler success pushes with `matchEmail` = snapshot email (old) and `email` = new, then `saveContactSnapshots` runs and no status/amount snapshot function runs; row in `missing` => handler throws and no snapshot write; no snapshot row => falls back to current email; test registration and no-sheet page are skipped; GAS text test: the action name, `handleApplyRegistrationDetails_`, writes only columns 1 to 3 (assert the `getRange(...)` column span in text), `landingCell_` used, and `Code.gs` equals the clasp copy; client test: posts the right action with the token and never logs it, parses `missing`. Engine test (Review Focus 7): a registration whose app name/email changed and whose snapshot still holds the old values, with the sheet unchanged (sheet == snapshot), yields NO planned change and no appWins for status; and the email-fix pairing still finds it by name against the snapshot.
- [ ] **Step 2:** Run the three test files; expect FAIL.
- [ ] **Step 3:** Implement the GAS action, copy it to the clasp copy, add the client function and the handler; replace the temporary no-op in `JOB_HANDLERS`. Do NOT run clasp.
- [ ] **Step 4:** Run the three test files, `tsc`, eslint (PASS / 0 errors).
- [ ] **Step 5:** Commit `feat: update the sheet row after an edit (not deployed)`.

---

### Task 5: List data: voucher, sheet-waiting, last emails

**Files:**
- Modify: `src/lib/data/landing-registration-admin.ts` (`RegistrationListRow`, `listRegistrations`), `src/lib/data/landing-registrations.ts` only if the row select needs `voucher_url`
- Create: `src/lib/landing/registration/voucher-thumb.ts`
- Test: `tests/landing-registration-list-rows.test.ts`, `tests/landing-voucher-thumb.test.ts`

**Interfaces:**
- `RegistrationListRow` gains `voucherUrl: string | null`, `whatsapp: string`, `sheetUpdateWaiting: boolean` (a `sheet_details` job for that registration exists with status not `done`), `lastEmailAt: Partial<Record<ManualEmailKind, string>>` (latest sent time per status email kind, automatic or manual, for the confirm dialog). Agent-scope lists (`Scope.kind === "agent"`) must NOT include `voucherUrl`: return `null` (the voucher is admin-only).
- `voucher-thumb.ts`: `export function driveFileId(url: string | null): string | null` (https `drive.google.com` or `docs.google.com` links of the forms `/file/d/<id>/...`, `/open?id=<id>`, `/uc?id=<id>`; anything else null); `export function voucherThumbSrc(url: string | null): string | null` returns `https://drive.google.com/thumbnail?id=<id>&sz=w160` or null (the project note: Drive images need the `/thumbnail?id=` form).
- Keep list queries efficient: one extra query for the page's rows' jobs and one for email kinds (chunks of at most 100 ids per `.in()`).

- [ ] **Step 1:** Failing tests: `driveFileId` for the three link forms, a non-Drive https link, `javascript:` and null; `voucherThumbSrc` shape; list rows for admin carry `voucherUrl`, `whatsapp`, `sheetUpdateWaiting` true only for pending/failed `sheet_details` jobs, `lastEmailAt` from both automatic and manual kinds; agent scope returns `voucherUrl: null`; 250 rows read jobs/emails in chunks of at most 100 ids.
- [ ] **Step 2:** Run both files; expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run both files and the existing registration-admin tests, `tsc`, eslint.
- [ ] **Step 5:** Commit `feat: list rows carry voucher, waiting-sheet flag and last email times`.

---

### Task 6: Stitch screens (owner step, gates Task 7)

- [ ] **Step 1:** Search Stitch project `4651274386787527431` for a fitting screen. Needed: (a) list row (desktop and mobile card) with a small voucher thumbnail that opens the voucher, and an actions area: Edit details, Status email, Send email, Send WhatsApp; (b) Edit details dialog (name, email, WhatsApp, helper text "The person's account is not changed"); (c) Status email dialog: choose Pending / Paid / Reserved / Underpaid, with the confirm step "This person already got this email on <date>. Send again?" and the warning "This person is Pending but you are sending the Paid email"; (d) the "Sheet update waiting" mark on a row. If none fit, **stop and give the owner this Stitch prompt**: "Admin Registrations list: add to each row a small voucher thumbnail (click to open), and a row action menu with Edit details, Status email, Send email, Send WhatsApp. Edit details dialog for name, email, WhatsApp. Status email dialog with four choices and a confirm step when it was already sent. A small 'Sheet update waiting' tag. Desktop table and mobile card, light and dark, same style as Page Registrations."

---

### Task 7: List UI (Stitch-gated)

**Files:** `src/components/admin/registrations/RegistrationsTable.tsx` (modify: optional `rowActions` render prop and voucher thumb cell, both desktop and mobile), new `VoucherThumb.tsx`, `RowActions.tsx`, `EditDetailsDialog.tsx`, `StatusEmailDialog.tsx`; hosts: `CampaignRegistrations.tsx` (already owns `MessageBuilder` state) and a new client wrapper for `src/app/dashboard/admin/enrollments/registrations/all/page.tsx` (that page is a server component). The sales page (`src/app/dashboard/sales/registrations/page.tsx`) passes no `rowActions` and shows no voucher.
Tests: `tests/landing-list-actions-ui.test.tsx`.

**Interfaces:**
- Consumes: Task 2 route (`POST /api/admin/registrations/{id}/status-email`), Task 3 route (`PATCH .../details`), Task 5 row fields, `MessageBuilder`/`CampaignBuilderRequest` (`{ pageId, pageTitle, selection: { mode: "ids", ids: [row.id] }, count: 1 }`, `channel: "email" | "whatsapp"`), `manualKindsFor` from the pure `src/lib/landing/registration/manual-kinds.ts` (Task 2); never import `status-email.ts` or `job-handlers.ts` (server-only) into client files.
- Behavior: Send email / Send WhatsApp open the existing builder for that one person with that row's own page id/title; the WhatsApp action is disabled with the existing wording ("No phone number" / "Number not valid", see `WhatsAppSendList.tsx` `reasonFor` logic; reuse its validity check, do not copy) when the number is missing/invalid; Status email dialog lists only `manualKindsFor(row.rowType)`, shows the confirm step when `row.lastEmailAt[kind]` is set (first POST without `confirmedAgain`; on 409 `needs-confirm` show the confirm with the date in Pakistan time, then re-POST with `confirmedAgain: true`) and the mismatch warning when the chosen email does not match the row's status; Edit details posts only changed fields, shows the route's plain error text, and on success refreshes the page data (`router.refresh()`); a row with `sheetUpdateWaiting` shows the "Sheet update waiting" tag; every button is disabled while its request is in flight; voucher thumbnail uses `voucherThumbSrc(row.voucherUrl)` as an image link to the full voucher (new tab, `rel="noopener noreferrer"`), with a document icon fallback on load error or when there is no thumb source, and "No voucher" text when `voucherUrl` is null.

- [ ] **Step 1:** Failing component tests: actions render for admin hosts only (sales table has none, no voucher); WhatsApp disabled with the right word for empty and invalid numbers (the owner's invalid-phone row); status email dialog lists 4 kinds for a lead and 2 for a member; confirm step appears only after the server's 409 and the re-post carries `confirmedAgain: true`; mismatch warning text; edit dialog posts only the changed field and shows the 409/422 text; Send email opens the builder with `selection.ids === [row.id]` and `count: 1`; thumbnail falls back to the icon on error and renders no `<img>` for a non-Drive link; in-flight buttons disabled.
- [ ] **Step 2:** Run `tests/landing-list-actions-ui.test.tsx`; expect FAIL.
- [ ] **Step 3:** Implement from the Stitch screens only; map to existing design tokens (no raw palette), light and dark, mobile cards per the design; no new dependencies.
- [ ] **Step 4:** Run the UI test, existing registration UI tests (`tests/landing-admin-ui.test.tsx`, campaign page tests), `tsc`, eslint (PASS / 0 errors).
- [ ] **Step 5:** Commit `feat: row actions and voucher thumbnail in the registrations lists`.

---

### Task 8: Rollout (owner in the loop)

- [ ] **Step 1:** Full suite in the background; only the two known failures allowed. Whole-branch review by a fresh reviewer on the most capable model; triage deferred minors.
- [ ] **Step 2:** Owner pastes `0079` into Supabase; verify with the read-only MCP.
- [ ] **Step 3:** After the owner's yes: deploy the Apps Script through clasp (`pull`, copy, `push -f`, `redeploy` with a label).
- [ ] **Step 4:** Merge only on the owner's yes (give the PR URL); check the Vercel main build is green.
- [ ] **Step 5:** Live check with the owner's own two rows only: edit DIT's name and email from the list and see the sheet row follow within a minute (and a scan afterwards changes nothing); resend the Paid email to dit.pharmacozyme (it was already sent: confirm step appears, then one more email arrives, status unchanged); Send email and Send WhatsApp open the writer for one person (the invalid-phone row shows the disabled WhatsApp); voucher thumbnail opens the voucher if one exists. Save a memory note with the result.
