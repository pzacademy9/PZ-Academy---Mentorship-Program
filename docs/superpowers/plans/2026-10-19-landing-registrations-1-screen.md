# Landing Registrations screen (Phase 3, Plan 1 of 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin, super admin and sales agents can list, filter, search and open page registrations, and change their status (Pending, Reserved, Underpaid, Paid) with a recorded history, and each change reaches the event Google Sheet.

**Architecture:** A SQL function applies a status change atomically (lead plus members, one history row each). A data module wraps it with transition rules and scope checks (agents only their own `agent_id`). A coalesced `sheet_status` job pushes current status and amount to column P and O through a new Apps Script action. UI is ported from the Stitch "Admin: Enrollment Review" screens as a second tab under Enrollments (admin) and a page under `/dashboard/sales` (agents).

**Tech Stack:** Next.js 14 app router, Supabase (service-role access, RLS on with no policies), Zod, Vitest + React Testing Library, Google Apps Script via clasp.

**Spec:** `docs/superpowers/specs/2026-10-19-landing-registrations-phase3-design.md` (Part 1, plus "Calls made" and "Owner rulings"). Plans 2 to 6 (emails and access, participants and email builder, sheet-to-app sync, Meta Purchase, payment accounts and My links) are written after this one ships.

## Global Constraints

- Statuses in this screen are exactly **Pending, Reserved, Underpaid, Paid**. `free` rows are shown but never changeable. No "approve" step.
- Two tables stay separate: never touch `enrollments` in this plan.
- Agents see and change only registrations whose lead has `agent_id = their user id`, enforced server-side. Admin and super_admin see all. Agents cannot see `is_test` rows. A non-owned id answers "not found", never "forbidden".
- Every change records who (`changed_by`), when, and source (`app`).
- Group: changing the lead changes all its members; only individual and lead rows are actionable and listed.
- Underpaid requires an amount received greater than 0 and less than the expected amount. Paid sets `amount_received` to the entered amount or the expected amount.
- Visible text is plain words: "link", "country", "module"; never "variant", "override", "resolve", "schema", "YAML".
- Do NOT invent UI. Port from the Stitch screens (project `11811490301995978699`, screens `d5483d0f798c46959c35b4e4c871643c` and `73c60cf341794e0a934b91c138d11d72`). Any part those do not cover waits for a Stitch prompt result (Task 1).
- Tooling: `npm run` is broken. Type check `node node_modules/typescript/bin/tsc --noEmit` (baseline 0, ignore `.next/types` noise). Tests `node node_modules/vitest/vitest.mjs run tests/<file>`. Never run `next build` while the dev server runs (`node node_modules/next/dist/bin/next dev -p 3945`). Never regenerate `database.types.ts`; hand-add entries. Known failing, not ours: `tests/pz-tokens.test.ts`, `tests/landing-route-hardening*`.
- Migrations are files only; the owner pastes the SQL (Supabase MCP is read-only). GAS deploys only via `gas/clasp-project/` after the owner says yes.
- Branch `landing-registrations`. Never push or merge to main without the owner's yes. Leave untracked `docs/lead-capture-go-live-guide.md` alone. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. New commits only, never amend.

## Review Focus

1. Two people change the same registration at once: the second gets "changed by someone else, reload" (409), not a silent overwrite (test in Task 3 and 4).
2. A member row id is sent to the change route: rejected, no row touched (Task 3).
3. An agent sends another agent's registration id, or one with `agent_id` null: 404 and nothing changes (Task 3, 4).
4. Underpaid with a missing, zero, negative, non-numeric or too-large amount: rejected with a plain message; Paid with a stale previous underpaid amount ends with the right amount (Task 2, 3).
5. Search text containing `%`, `_` or commas must not break the query or match everything (Task 3).
6. A group of 5 where one member row already has a different status: all rows end at the new status and each gets a history row only if it changed (Task 3).
7. Test registrations (`is_test`) never show to agents and are hidden from admin unless asked (Task 3).
8. A voucher link that is not `https` is not rendered as a clickable link (Task 8).

## File Structure

- `supabase/migrations/0073_landing_status_changes.sql`: `changed_by` column, `sheet_status` job type, `landing_apply_status` function.
- `src/lib/landing/registration/status-rules.ts`: pure transition rules.
- `src/lib/data/landing-registration-admin.ts`: list, detail, change (server-only).
- `src/lib/validations/landing-registration-status.ts`: Zod body schema.
- `src/lib/format-money.ts`: money with currency.
- `src/lib/landing/registration/job-handlers.ts`, `src/lib/data/landing-jobs.ts`, `src/lib/gas/event-sheet-client.ts`: `sheet_status` job.
- `gas/clasp-project/` and `gas/sheets-sync/Code.gs`: `applyRegistrationStatus` action.
- Routes: `src/app/api/admin/registrations/[id]/route.ts`, `src/app/api/sales/registrations/[id]/route.ts`.
- Pages: `src/app/dashboard/admin/enrollments/registrations/{page,loading}.tsx`, `.../registrations/[id]/{page,loading}.tsx`, `src/app/dashboard/sales/registrations/{page,loading}.tsx`, `.../[id]/{page,loading}.tsx`.
- Components: `src/components/admin/registrations/*` (shared by both roles).
- Docs: `docs/stitch-prompts-registrations.md`.

---

### Task 1: Stitch capture and gap prompts (controller task, no subagent)

**Files:** Create `docs/stitch-prompts-registrations.md`; save fetched markup under the scratchpad, not the repo.

**Interfaces:** Produces a list of "covered" and "not covered" pieces that Tasks 7 to 9 read.

- [ ] **Step 1:** Fetch both Enrollment Review screens with `mcp__stitch__get_screen` and download their markup from the `htmlCode.downloadUrl`. List which pieces they contain (stat cards, status filter tabs, table, row actions, detail header, field grid, receipt).
- [ ] **Step 2:** Write `docs/stitch-prompts-registrations.md` with one generation prompt per piece NOT covered: page/status/Live-Recorded/agent filter bar with search; "App sign-ups | Page registrations" tab strip; status change dialog with amount field for Underpaid; group members panel; status history timeline; agent view (no agent filter, no test rows). Each prompt names the PZ Academy look and the plain-word labels from this plan.
- [ ] **Step 3:** Hand the prompts to the owner, who generates the screens in Stitch (the MCP generate call is unreliable). Tasks 7 to 9 do not start until the owner says the screens exist; Tasks 2 to 6 do not depend on them.
- [ ] **Step 4: Commit** the prompts file.

---

### Task 2: Status rules and money formatter

**Files:** Create `src/lib/landing/registration/status-rules.ts`, `src/lib/format-money.ts`, `src/lib/validations/landing-registration-status.ts`; Test `tests/landing-status-rules.test.ts`.

**Interfaces:**
- Produces:
  - `export const CHANGEABLE_STATUSES = ["pending","reserved","underpaid","paid"] as const; export type ChangeableStatus`
  - `export type StatusChangeCheck = { ok: true; amountReceived: number | null } | { ok: false; reason: "free-row" | "member-row" | "amount-required" | "amount-invalid" | "already-in-status" }`
  - `export function checkStatusChange(i: { rowType: "individual"|"lead"|"member"; from: RegistrationStatus; to: ChangeableStatus; expectedAmount: number | null; amount: number | null }): StatusChangeCheck`
  - `export const STATUS_CHANGE_MESSAGES: Record<Exclude<StatusChangeCheck, {ok:true}>["reason"], string>` (plain-word sentences)
  - `export function formatMoney(amount: number | null, currency: string): string`
  - `export const statusChangeBodySchema` (Zod): `{ status: enum(CHANGEABLE_STATUSES), from: enum([...CHANGEABLE_STATUSES, "free"]), amount?: number | null }` strict; `from` is the status the person was looking at when they clicked.

- [ ] **Step 1: Write failing tests** `tests/landing-status-rules.test.ts`, named: `member rows are rejected`, `free rows are rejected`, `same status is already-in-status`, `underpaid same status with a new amount is allowed`, `underpaid without amount is amount-required`, `underpaid 0, -5, NaN is amount-invalid`, `underpaid amount >= expected is amount-invalid`, `paid takes entered amount else expected`, `pending and reserved return amountReceived null`, `formatMoney shows currency and handles null as a dash`, `schema rejects unknown keys and unknown statuses`.
- [ ] **Step 2:** Run `node node_modules/vitest/vitest.mjs run tests/landing-status-rules.test.ts`; expect FAIL (module missing).
- [ ] **Step 3:** Implement the three files per the signatures. Order of checks: member-row, free-row, already-in-status (except underpaid with a different amount), then amount rules.
- [ ] **Step 4:** Run the test; expect PASS.
- [ ] **Step 5: Commit** `feat(landing-registrations): status rules`.

---

### Task 3: Migration, types, and data module

**Files:** Create `supabase/migrations/0073_landing_status_changes.sql`, `src/lib/data/landing-registration-admin.ts`; Modify `src/lib/supabase/database.types.ts` (hand edit: `changed_by` in `landing_status_events` Row/Insert/Update near lines 1942-1976; the new function under Functions), `src/lib/data/landing-registrations.ts` (add `statusChangedAt`, `statusSource`, `amountReceived` to `RegistrationRecord` and `mapRecord`); Test `tests/migrations-landing-status-changes.test.ts`, `tests/landing-registration-admin-data.test.ts`.

**Interfaces:**
- Consumes: `checkStatusChange`, `ChangeableStatus` (Task 2); `createAdminSupabase`; test helpers `tests/helpers/supabase-mock.ts`.
- Produces (all server-only):
  - `export type Scope = { kind: "all"; includeTest?: boolean } | { kind: "agent"; agentId: string }`
  - `export type Actor = { userId: string; role: "admin" | "super_admin" | "sales_agent" }`
  - `export interface RegistrationListFilters { pageId?: string; status?: RegistrationStatus | "all"; mode?: "live" | "recorded"; agentId?: string; q?: string; page?: number }`
  - `export interface RegistrationListRow { id; refId; name; email; pageId; pageTitle; optionLabel; mode; region; expectedAmount; amountReceived; currency; status; agentId; agentName; groupSize; isTest; createdAt; statusChangedAt }`
  - `export interface RegistrationList { rows: RegistrationListRow[]; total: number; pageSize: 25; counts: Record<RegistrationStatus | "all", number> }`
  - `export async function listRegistrations(scope: Scope, f: RegistrationListFilters): Promise<RegistrationList>`
  - `export interface StatusEventRow { at: string; from: string | null; to: string; source: "app" | "sheet"; actorName: string | null; registrationName: string }`
  - `export interface RegistrationDetail { lead: RegistrationRecord; members: RegistrationRecord[]; page: { id: string; title: string; slug: string }; agentName: string | null; events: StatusEventRow[] }`
  - `export async function getRegistrationDetail(id: string, scope: Scope): Promise<RegistrationDetail | null>`
  - `export type ChangeStatusResult = { ok: true; id: string; status: ChangeableStatus; rowsChanged: number } | { ok: false; reason: "not-found" | "member-row" | "free-row" | "amount-required" | "amount-invalid" | "already-in-status" | "stale" | "db-error" }`
  - `export async function changeRegistrationStatus(p: { registrationId: string; to: ChangeableStatus; expectedFrom: RegistrationStatus; amount?: number | null; actor: Actor }): Promise<ChangeStatusResult>` (enqueues the sheet job in Task 4; for now a TODO-free stub call `enqueueSheetStatus(registrationId)` imported from landing-jobs is added in Task 4, not here).

- [ ] **Step 1: Migration test** `tests/migrations-landing-status-changes.test.ts` (pattern: `tests/migrations-landing-registration.test.ts`): reads the SQL and asserts it adds `changed_by`, drops and re-adds the `landing_jobs` type check to include `'sheet_status'`, creates `landing_apply_status` as `security definer`, revokes from public/anon/authenticated and grants only to `service_role`.
- [ ] **Step 2:** Run it; expect FAIL.
- [ ] **Step 3: Write the migration.** `landing_status_events.changed_by uuid references profiles(id) on delete set null`. `landing_apply_status(p_registration_id uuid, p_to_status text, p_expected_from text, p_amount numeric, p_actor uuid, p_source text) returns jsonb`: lock the lead row (`for update`), return `{ok:false,reason:'not-found'}` if missing or a member, `{ok:false,reason:'stale'}` if lead status differs from `p_expected_from`; update the lead and every member to the new status with `status_source=p_source`, `status_changed_at=now()`, `updated_at=now()`, and set `amount_received=p_amount` on the lead only when `p_amount` is not null; insert one `landing_status_events` row (from, to, source, changed_by) per row whose status actually changed; return `{ok:true,from,changed:n}`. Follow the `into`/plpgsql rules used in 0069. The owner pastes this SQL, so also include a header comment saying so.
- [ ] **Step 4:** Run the migration test; expect PASS. Hand-edit `database.types.ts` and extend `RegistrationRecord`.
- [ ] **Step 5: Data tests** `tests/landing-registration-admin-data.test.ts` (mock pattern from `tests/landing-registrations-data.test.ts`): `list for agent scope filters agent_id and excludes test rows`, `list for all scope hides test rows unless includeTest`, `list returns only individual and lead rows`, `search with % _ and commas is escaped and does not widen the match`, `status filter and counts per status`, `detail for non-owned agent id returns null`, `detail returns members and events with actor names`, `change: member id returns member-row and calls no rpc`, `change: agent not owner returns not-found and calls no rpc`, `change: underpaid without amount returns amount-required and calls no rpc`, `change: passes the caller's expectedFrom (not the freshly read status), amount, actor and source app to the rpc`, `change: expectedFrom that differs from the current status returns stale without a second write`, `change: rpc stale becomes stale`, `change: rpc error becomes db-error`, `change: same status returns already-in-status`.
- [ ] **Step 6:** Run; expect FAIL. Implement the module (reads lead row first, runs `checkStatusChange`, then `rpc("landing_apply_status", ...)`; escape `%`, `_`, `,` and `\` in search; page size 25; agent names from `profiles.full_name`). Run; expect PASS.
- [ ] **Step 7:** `node node_modules/typescript/bin/tsc --noEmit` shows no new errors. **Commit** `feat(landing-registrations): list, detail and status change`.

---

### Task 4: `sheet_status` job and sheet client

**Files:** Modify `src/lib/data/landing-jobs.ts`, `src/lib/landing/registration/job-handlers.ts`, `src/lib/gas/event-sheet-client.ts`, `src/lib/data/landing-registration-admin.ts`; Test `tests/landing-sheet-status-job.test.ts` (and extend `tests/landing-jobs.test.ts` only where the type list is asserted).

**Interfaces:**
- Consumes: `changeRegistrationStatus` (Task 3), `getRegistrationBundle`, `toSheetRow` column rules.
- Produces:
  - `JobType` gains `"sheet_status"`; `JOB_TYPES` runs it after `sheet_append`.
  - `export async function enqueueSheetStatus(registrationId: string): Promise<boolean>` in landing-jobs: upserts the single `sheet_status` row for the registration and resets it to `status: "pending"`, `attempts: 0`, `next_run_at: now`, `last_error: null` (one coalesced job per registration; the handler always sends current values). Never throws.
  - `export async function applyRegistrationStatus(sheetId: string, rows: { refId: string; email: string; status: RegistrationStatus; amountReceived: number | null }[]): Promise<{ ok: boolean }>` in event-sheet-client (action name `applyRegistrationStatus`, uses `postToGas`, never throws).
  - `JOB_HANDLERS.sheet_status` in job-handlers: loads the bundle for the lead id, skips when `isTest` or the page has no `sheetId` (it does not wait for `sheet_append`; the Apps Script action reports missing rows), builds one entry per lead and member (`refId` of the lead, own `email`), calls the client, throws on `ok:false` so the job retries.
- `changeRegistrationStatus` calls `enqueueSheetStatus(leadId)` after a successful rpc, then runs the job the same way the register route runs its jobs after a sign-up (read `src/app/api/landing/[slug]/register/route.ts` and mirror it; the cron `drainDueJobs` is the safety net), guarded by try/catch so a sheet failure never fails the status change.

- [ ] **Step 1: Tests** `tests/landing-sheet-status-job.test.ts`: `enqueueSheetStatus resets an existing done job to pending`, `handler sends lead and members with their own emails and the lead ref`, `handler skips test registrations and pages without a sheet`, `handler throws when the sheet call fails`, `change calls enqueueSheetStatus once after success and not on failure`, `a failing sheet call does not fail the status change`. Update the existing job-type list assertions in `tests/landing-jobs.test.ts` and the SQL check in the migration test if they enumerate types.
- [ ] **Step 2:** Run; expect FAIL. **Step 3:** Implement. **Step 4:** Run these plus `tests/landing-jobs.test.ts tests/landing-job-handlers.test.ts`; expect PASS. **Step 5:** tsc clean. **Commit** `feat(landing-registrations): push status to the event sheet`.

---

### Task 5: API routes (admin and sales)

**Files:** Create `src/app/api/admin/registrations/[id]/route.ts`, `src/app/api/sales/registrations/[id]/route.ts`; Test `tests/landing-registration-status-routes.test.ts` (pattern: `tests/landing-admin-promo-routes.test.ts`, mock `@/lib/auth/require-admin`, `@/lib/auth/require-sales`, and the data module).

**Interfaces:** Consumes `statusChangeBodySchema`, `changeRegistrationStatus`. Both: `PATCH(req, { params: Promise<{ id: string }> })`, body `{ status, from, amount? }` (`from` becomes `expectedFrom`), success `{ id, status }`.
- Admin route uses `requireAdmin()`.
- Sales route uses `requireSalesAgent()`; for `role === "sales_agent"` the actor carries the agent role so the data layer applies the owner check; admins pass through.
- Status mapping: invalid body 400 `{error:"Invalid input"}`; `not-found` and `member-row` 404; `free-row`, `amount-required`, `amount-invalid` 400 with `STATUS_CHANGE_MESSAGES`; `already-in-status` and `stale` 409; `db-error` 500.

- [ ] **Steps:** failing tests first (`401 when signed out`, `403 for a student on the admin route`, `agent actor passed with sales_agent role`, `each reason maps to its status code`, `invalid body 400 and the data layer is not called`); run FAIL; implement; run PASS; add both routes to `tests/api-role-gates.test.ts` if it enumerates routes; tsc; **Commit** `feat(landing-registrations): status change routes`.

---

### Task 6: Apps Script action (code and test; deploy gated)

**Files:** Modify `gas/sheets-sync/Code.gs` and `gas/clasp-project/Sheet Sync.js` (keep identical); Test `tests/gas-apply-registration-status.test.ts` (check how existing GAS source tests load `Code.gs`, e.g. `tests/landing-event-sheet.test.ts` or other `gas-*` tests, and follow that).

**Interfaces:** `doPost` action `applyRegistrationStatus` (needs `SYNC_SECRET` like the other sheet actions). Body `{ sheetId, rows: [{ refId, email, status, amountReceived }] }`. For each row find the sheet row by `landingRowKey_(ref, email)` (never row number); write the status label (Pending, Paid, Underpaid, Reserved) to `LANDING_COL.STATUS` (P) and `amountReceived` to column O (15, blank when null); leave other columns untouched; return `{ ok: true, updated: n, missing: [keys] }`. Missing rows are reported, not an error.

- [ ] **Steps:** failing test (`updates P and O for the matching ref and email only`, `leaves other rows and columns untouched`, `reports missing rows`, `rejects a wrong secret`); implement; PASS; diff the two GAS files are identical. **Commit.**
- [ ] **Deploy gate:** STOP and ask the owner. After a yes, deploy via clasp from `gas/clasp-project/` (never the web editor "New version"), then confirm one real status change reaches a sheet. Until deployed, `sheet_status` jobs retry and show as waiting; say so.

---

### Task 7: Registrations list UI (admin tab) — after Task 1 gate

**Files:** Create `src/app/dashboard/admin/enrollments/registrations/{page.tsx,loading.tsx}`, `src/components/admin/registrations/{RegistrationFilters,RegistrationsTable,RegistrationStatusBadge,EnrollmentSourceTabs}.tsx`; Modify `src/app/dashboard/admin/enrollments/page.tsx` (add the tab strip, no other change); Test `tests/landing-registrations-list-ui.test.tsx`.

**Interfaces:** Consumes `listRegistrations`, `RegistrationListRow`. Page: `await requireAdminPage()`, `searchParams` Promise `{ page?, status?, mode?, pageId?, agentId?, q?, p? }`, calls `listRegistrations({ kind: "all" }, filters)`. Port markup, tokens, `ResponsiveList` and `EmptyState` use from the Stitch Enrollment Review screens and `src/app/dashboard/admin/enrollments/page.tsx`; do not restyle. Columns: Name, Page, Country, Option, Live or Recorded, Amount, Status, Agent, Date; row links to `.../registrations/[id]`. Admin filter set includes Agent; search box (name, email, ref). Empty-state copy in plain words.

- [ ] **Steps:** failing component tests (`renders a row with name, page, status and money`, `shows Test label for test rows when included`, `status tabs show counts and keep other filters in the link`, `empty state when no rows`, `tab strip links between App sign-ups and Page registrations`); run FAIL; implement; PASS; tsc; **Commit.**

---

### Task 8: Registration detail and status change UI (admin) — after Task 1 gate

**Files:** Create `src/app/dashboard/admin/enrollments/registrations/[id]/{page.tsx,loading.tsx}`, `src/components/admin/registrations/{RegistrationDetailView,StatusChangeControl,StatusHistory,GroupMembers}.tsx`; Test `tests/landing-registration-detail-ui.test.tsx`.

**Interfaces:** Consumes `getRegistrationDetail`, `STATUS_CHANGE_MESSAGES`, the admin route (Task 5). `StatusChangeControl` is a client component (`useAsyncAction`, `sonner`, `Dialog`) with props `{ registrationId: string; endpoint: string; status: RegistrationStatus (also sent as `from`); expectedAmount: number | null; currency: string; studentName: string }` so the sales page reuses it with its own endpoint. Underpaid opens an amount field; on 409 it shows "Someone else changed this just now. Reload to see the latest." and offers reload. Detail shows voucher (clickable only when the URL starts with `https://`), price and promo, group members panel, status history with who/when/source, agent name, page link. `notFound()` when detail is null.

- [ ] **Steps:** failing tests (`underpaid requires an amount before submit`, `409 shows the reload message`, `non-https voucher is plain text`, `history lists actor, time and source`, `members listed under the lead`, `free rows show no change control`); run FAIL; implement; PASS; tsc; **Commit.**

---

### Task 9: Agent pages and nav — after Task 1 gate

**Files:** Create `src/app/dashboard/sales/registrations/{page.tsx,loading.tsx}`, `src/app/dashboard/sales/registrations/[id]/{page.tsx,loading.tsx}`; Modify `src/components/dashboard/nav.ts` (item "Registrations", `href: "/dashboard/sales/registrations"`, `roles: ["sales_agent"]`; keep admin entry inside Enrollments tabs, no new admin nav item), `tests/dashboard-nav.test.ts`, `tests/access.test.ts` only if the allow-list needs the new path; Test `tests/landing-sales-registrations.test.tsx`.

**Interfaces:** Pages use `requireSalesAgentPage()`. For `role === "sales_agent"` scope is `{ kind: "agent", agentId: user.id }` and the Agent filter and test rows are absent; for admin roles reaching this path, scope is `{ kind: "all" }`. Detail uses `StatusChangeControl` with endpoint `/api/sales/registrations/<id>`.

- [ ] **Steps:** failing tests (`agent page queries with agent scope`, `agent detail for someone else's registration is notFound`, `nav shows Registrations for sales_agent only`); run FAIL; implement; PASS; tsc; **Commit.**

---

### Task 10: Whole-feature verification (controller)

- [ ] Run `node node_modules/vitest/vitest.mjs run tests/landing-*.test.ts tests/landing-*.test.tsx tests/dashboard-nav.test.ts tests/access.test.ts tests/api-role-gates.test.ts`; expect only the known failures. tsc baseline.
- [ ] Owner pastes migration 0073 SQL (give it in chat). Start the dev server on 3945; as admin open Enrollments, Page registrations; find the owner's real pending Diabetes registration; filter, search, open detail; change to Underpaid (amount rejected when empty), then Paid, then Pending; confirm history rows and, once GAS is deployed, the sheet P and O values. As a sales agent test account scoped to a link, confirm only own rows show and another id returns not found. Check 390px width has no horizontal scroll. Report results faithfully, including anything not verified.
- [ ] Final whole-branch review by an opus reviewer; do not push or merge without the owner's yes.
