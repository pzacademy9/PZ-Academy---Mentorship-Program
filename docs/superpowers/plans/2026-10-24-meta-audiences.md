# Meta Audiences (Step 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner download Meta-ready customer-list CSVs per cohort, and close a finished website batch into the CRM as a paid cohort plus an interested-not-paid cohort.

**Architecture:** A pure library builds hashed Meta rows and CSV from contacts. A pure library maps `landing_registrations` rows into CRM rows. One Postgres function (`landing_close_batch`, modelled on `crm_import_commit` in migration 0053) writes both cohorts atomically and idempotently. Admin API routes and small UI additions sit on the existing Cohorts panel and `BatchAccessPanel`.

**Tech Stack:** Next.js App Router, Supabase (service-role `createAdminSupabase()`, behind `requireAdmin()`), zod, vitest, libphonenumber-js via `src/lib/crm/phone.ts`.

**Spec:** `docs/superpowers/specs/2026-10-24-meta-audiences-design.md` (read it first; its "calls made" lists are binding).

## Global Constraints

- Paid = `landing_registrations.status = 'paid'`; everything else (pending, underpaid, reserved, free) = interested. `is_test = true` rows are never copied or exported.
- Rows copied: `individual`, `lead`, `member`. A member shares its group's status (status changes already apply to the whole group) and uses the **lead's** `consent` for the interested list.
- Interested list requires `consent = true`; paid people are copied regardless of consent (`consent_basis = 'purchase'`). Interested contacts are created with `consent_basis = 'enquiry'` (enum is `purchase | enquiry`); an existing contact's basis is never changed.
- Revenue counted once: the group amount (`expected_amount`) goes on the `individual`/`lead` purchase row only; member purchase rows have `amount = null`.
- Re-running Close batch is allowed and never duplicates. Idempotency key: `contact_purchases (source_sheet_id, source_row_ref)` with `source_sheet_id = 'landing:<pageId>'`, `source_row_ref = <registration id>`.
- Cohort names: `sheet_name = "<page title> (paid)"` / `"<page title> (interested)"`, `tab_name = 'paid' | 'interested'`, `course_id` from `landing_pages.course_id` (may be null).
- Interested download excludes anyone who has any `contact_purchases` row in any cohort.
- Export never includes an identifier from an unreachable channel: blank email if `email_unsubscribed_at` is set or `email_metrics` has a suppression event (`hard_bounce`, `blocked`, `spam`, `invalid_email`, `unsubscribed`); blank phone if `whatsapp_unsubscribed_at` is set; drop the whole row if `do_not_contact_at` is set or both identifiers end up blank.
- CSV headers are Meta's exact names: `email,phone,fn,ln,country`. Values SHA-256 hashed with `sha256Lower` from `src/lib/meta/capi-payload.ts`; phone = e164 digits without `+`; `country` = lowercase 2-letter code, only when `contacts.country` matches `^[A-Za-z]{2}$`; `fn` = first word of `full_name`, `ln` = the rest.
- Never log raw emails/phones. Admin-only routes: `requireAdmin()` first, generic error body `{ error: "Something went wrong. Please try again." }`.
- Supabase reads cap at 1000 rows: page with `.range()` and chunk `.in()` lists at 200 ids.
- Never regenerate `database.types.ts`: hand-add the new column and table. Source files often use CRLF: use the Edit tool. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; new commits only.
- Run tools via node (see repo gotchas): `node node_modules/typescript/bin/tsc --noEmit` (baseline 0 errors), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`.

## Review Focus

1. Pressing Close batch twice: second run adds only new payers, creates no duplicate contacts or purchases, and the interested cohort is recalculated (a person who paid in between leaves it).
2. A registration whose email matches contact A and whose phone matches contact B: no crash, no lost import (same `unique_violation` guard as 0053); counted as merged.
3. A member of a group whose lead is unconsented or unpaid: not-paid, and excluded from the interested list when the lead's `consent` is false.
4. A contact in both a paid cohort and the interested list (e.g. paid in an older batch): excluded from the interested download.
5. A cohort with more than 1000 contacts: export contains all of them (paging), and the interested cohort (no purchase rows) still appears with a Download button and a correct count.

---

### Task 1: Migration 0086 and hand-added types

**Files:**
- Create: `supabase/migrations/0086_meta_audiences.sql`
- Modify: `src/lib/supabase/database.types.ts` (hand-add only)
- Test: `tests/meta-audiences-migration.test.ts` (static text checks, same style as other migration tests; look at an existing `tests/*migration*.test.ts` for the pattern)

**Interfaces:**
- Produces: `import_batches.kind text not null default 'imported' check (kind in ('imported','closed_paid','closed_interested'))`; `import_batches.source_page_id uuid references landing_pages(id) on delete set null`; unique index on `import_batches (sheet_id, tab_name) where kind <> 'imported'`; table `import_batch_contacts (import_batch_id uuid references import_batches on delete cascade, contact_id uuid references contacts on delete cascade, primary key (import_batch_id, contact_id))` with RLS on and zero policies; function `landing_close_batch(p_page_id uuid, p_page_title text, p_course_id uuid, p_created_by uuid, p_rows jsonb) returns jsonb` (security definer, `set search_path = public`, revoke from public/anon/authenticated).
- `p_rows` element shape: `{ rowRef: string, bucket: 'paid'|'interested', contact: { email, phoneE164, phoneRaw, fullName, profession, country, discoverySource }, purchase: { amount, currency, rowType: 'individual'|'group_leader'|'group_member', promoCode, purchasedAt } }` (same contact/purchase keys as `crm_import_commit`).
- Return: `{ paid_batch_id, interested_batch_id, paid_added, interested_added, contacts_created, contacts_merged }`.

- [ ] **Step 1: Write the static test** asserting the migration text contains: the `kind` check values, the partial unique index, `import_batch_contacts` with `enable row level security`, `consent_basis` literal `'enquiry'` in the interested insert path, `on conflict (source_sheet_id, source_row_ref)`, the `exception when unique_violation` guard, and the `revoke all on function public.landing_close_batch`.
- [ ] **Step 2: Run it, expect FAIL** (file missing).
- [ ] **Step 3: Write the migration.** Function body: `set local statement_timeout = '55s'`; find-or-create the two `import_batches` rows by `(sheet_id = 'landing:'||p_page_id, tab_name)` (kind `closed_paid` / `closed_interested`, status `committed`, `source_page_id`, `course_id`, `sheet_name` per Global Constraints); per row, match contact by email then phone, create or merge exactly as migration 0053 does (collision guard included), with `consent_basis` = `'purchase'` for paid-bucket creates and `'enquiry'` for interested-bucket creates; paid bucket upserts `contact_purchases` (`import_batch_id` = paid batch, `product_label` = page title, `course_id` = `p_course_id`, `ON CONFLICT` update like 0053); interested bucket: collect contact ids. After the loop: `delete from import_batch_contacts where import_batch_id = <interested batch>`, re-insert the interested contact ids **minus any contact that has a `contact_purchases` row**, update both batches' `rows_imported`/counts. `landing_close_batch` must not touch `landing_registrations`.
- [ ] **Step 4: Hand-add types** to `database.types.ts`: `kind`, `source_page_id` on `import_batches` Row/Insert/Update; `import_batch_contacts` table; the function under `Functions`.
- [ ] **Step 5: Run the test (PASS) and `tsc --noEmit` (0 errors).**
- [ ] **Step 6: Commit** `feat: migration for Meta audiences cohorts` .
- [ ] **Step 7:** Owner pastes the SQL into the Supabase SQL editor (Supabase MCP is read-only). Do not proceed to Task 4's live verification until applied.

---

### Task 2: Meta audience builder (pure)

**Files:**
- Create: `src/lib/crm/meta-audience.ts`
- Test: `tests/meta-audience.test.ts`

**Interfaces:**
- Consumes: `sha256Lower` from `@/lib/meta/capi-payload`.
- Produces:
  - `type AudienceContact = { id: string; email: string | null; phoneE164: string | null; fullName: string; country: string | null; emailUnsubscribedAt: string | null; whatsappUnsubscribedAt: string | null; doNotContactAt: string | null; emailSuppressed: boolean }`
  - `type MetaRow = { email: string; phone: string; fn: string; ln: string; country: string }`
  - `buildMetaRows(contacts: AudienceContact[]): { rows: MetaRow[]; dropped: number }` (dedupes by hashed email, else hashed phone; drops per Global Constraints)
  - `toMetaCsv(rows: MetaRow[]): string` (header `email,phone,fn,ln,country`, CRLF-free `\n` lines, no quoting needed because hex values)
  - `metaCsvFilename(names: string[], date: Date): string` (slug of names joined, `-meta-audience-YYYY-MM-DD.csv`, max 80 chars before the suffix)

- [ ] **Step 1: Write failing tests:** (a) `"Ali Raza Khan"` gives `fn = sha256Lower("ali")`, `ln = sha256Lower("raza khan")`; (b) `phoneE164 "+923001234567"` hashes `"923001234567"`; (c) email-unsubscribed contact keeps phone, blank email hash; (d) `doNotContactAt` set drops the row and increments `dropped`; (e) both identifiers blank drops; (f) duplicate contacts with the same email appear once; (g) `country "PK"` becomes hash of `"pk"`, `"Pakistan"` becomes empty; (h) CSV first line is exactly `email,phone,fn,ln,country`; (i) filename for `["DIT Batch 1 (paid)"]` on 2026-10-24 ends `-meta-audience-2026-10-24.csv`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement the three functions** per the signatures.
- [ ] **Step 4: Run, expect PASS; eslint the two files.**
- [ ] **Step 5: Commit** `feat: Meta audience CSV builder`.

---

### Task 3: Registration-to-CRM row mapper (pure)

**Files:**
- Create: `src/lib/landing/close-batch-rows.ts`
- Test: `tests/close-batch-rows.test.ts`

**Interfaces:**
- Consumes: `normalizePhone` from `@/lib/crm/phone` (returns `{ ok, e164, country }`).
- Produces:
  - `type RegRow = { id: string; row_type: "individual" | "lead" | "member"; lead_registration_id: string | null; name: string; email: string; whatsapp: string; profession: string; discovery: string; consent: boolean; status: string; expected_amount: number; currency: string; promo_code_text: string; created_at: string; status_changed_at: string | null; is_test: boolean }`
  - `type CloseRow` = the `p_rows` element shape from Task 1
  - `mapRegistrations(regs: RegRow[]): { rows: CloseRow[]; paid: number; interested: number; skipped: { id: string; reason: "test" | "no-contact-details" | "interested-without-consent" }[] }`
- Rules: skip `is_test`; bucket by `status === 'paid'`; member consent = its lead's consent (lead found in `regs` by `lead_registration_id`); interested needs consent true; paid ignores consent; `rowType` mapping individual→`individual`, lead→`group_leader`, member→`group_member`; amount only for individual/lead (`null` for member); phone through `normalizePhone`, invalid phone becomes null (contact still created by email); `country` from the phone result, else null; `discoverySource` maps `discovery` text containing `instagram`/`facebook`/`whatsapp` (case-insensitive) to that value, other non-empty to `other`, empty to `unknown`; `purchasedAt` = `status_changed_at ?? created_at`; a row with email empty and no valid phone is skipped.

- [ ] **Step 1: Write failing tests** covering: paid individual (amount kept, `consent_basis` not in row), paid member with `amount: null` and `group_member`, member of unconsented unpaid lead excluded as `interested-without-consent`, test row skipped, invalid phone `"abc"` yields `phoneE164: null` but row kept, `"03001234567"` yields `+923001234567` and country `PK`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement `mapRegistrations`.**
- [ ] **Step 4: Run, expect PASS; eslint.**
- [ ] **Step 5: Commit** `feat: map registrations to CRM close rows`.

---

### Task 4: Close batch data layer and API

**Files:**
- Create: `src/lib/data/landing-close-batch.ts`, `src/app/api/admin/landing/close-batch/route.ts`, `src/lib/validations/landing-close-batch.ts`
- Test: `tests/landing-close-batch.test.ts` (data layer, mocked supabase like `tests/landing-batch.test.ts`), `tests/landing-close-batch-route.test.ts` (copy the gate/validation style of `tests/landing-batch-routes.test.ts`)

**Interfaces:**
- Consumes: `mapRegistrations`, `RegRow` (Task 3); RPC `landing_close_batch` (Task 1).
- Produces:
  - `previewCloseBatch(pageId: string): Promise<CloseBatchPreview>` where `CloseBatchPreview = { pageTitle: string; paid: number; interested: number; skipped: number; alreadyClosed: boolean; newPaid: number }` (`newPaid` = paid people not yet in the paid cohort's purchases; `alreadyClosed` = a `closed_paid` batch exists for the page). Read-only.
  - `closeBatch(input: { pageId: string; adminId: string }): Promise<CloseBatchResult>` where `CloseBatchResult = { paidAdded: number; interestedAdded: number; contactsCreated: number; contactsMerged: number; skipped: number }`
  - Route: `GET ?pageId=` returns the preview; `POST { pageId }` runs it. `export const maxDuration = 60`.
  - Validation: `closeBatchQuerySchema`, `closeBatchBodySchema` (uuid `pageId`).
- Reads registrations by `page_id` in pages of 1000 with `.range()`, ordered by `created_at, id`; sends all rows in a single RPC call (the interested cohort is rebuilt each run, so one call must carry every row; do not split the payload).

- [ ] **Step 1: Write failing tests:** data layer: pages beyond 1000 rows are all read (mock returns 1000 then 250); RPC called once with all mapped rows and `p_course_id` from the page; preview counts match `mapRegistrations`; route: 401/403 never reach the data layer, bad uuid gives 400, error gives the generic 500 body, `maxDuration` is 60.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the data layer (`import "server-only"`, `createAdminSupabase`, throw on Supabase errors like `check()` in `landing-batch.ts`), the schemas and the route.
- [ ] **Step 4: Run tests (PASS), `tsc --noEmit`, eslint.**
- [ ] **Step 5: Commit** `feat: close batch into CRM cohorts`.

---

### Task 5: Cohort export data layer, route and cohort list fields

**Files:**
- Create: `src/lib/data/cohort-export.ts`, `src/app/api/admin/crm/cohorts/export/route.ts`
- Modify: `src/lib/data/admin-crm-import.ts` (`CohortRow`, `listCohorts`)
- Test: `tests/cohort-export.test.ts`, `tests/cohort-export-route.test.ts`

**Interfaces:**
- Consumes: `buildMetaRows`, `toMetaCsv`, `metaCsvFilename`, `AudienceContact` (Task 2); `import_batch_contacts` (Task 1).
- Produces:
  - `CohortRow` gains `kind: "imported" | "closed_paid" | "closed_interested"` and `contactCount: number` (for `closed_interested` this counts `import_batch_contacts`; otherwise equals `purchaseCount`). `listCohorts` must page the `contact_purchases` read (currently one unpaged select, which silently caps at 1000: fix it) and read `import_batch_contacts` counts the same way.
  - `loadCohortAudience(cohortIds: string[]): Promise<{ contacts: AudienceContact[]; names: string[] }>`: contacts of imported/paid cohorts via `contact_purchases.import_batch_id`, of interested cohorts via `import_batch_contacts`; for interested cohorts drop contacts having any `contact_purchases`; unions across cohorts; `.in()` chunks of 200; pages of 1000; `emailSuppressed` from `email_metrics` (`lower(user_email)` match on the suppression events in Global Constraints).
  - Route `GET /api/admin/crm/cohorts/export?ids=<uuid>,<uuid>`: admin gate, max 20 ids, returns `text/csv; charset=utf-8` with `Content-Disposition: attachment; filename=<metaCsvFilename>`, header `Cache-Control: no-store`; 404 JSON if no cohort found; 400 on bad ids.

- [ ] **Step 1: Write failing tests:** a cohort with 1300 purchase rows exports all 1300 contacts; interested cohort exports its members minus anyone with a purchase; same contact in two selected cohorts appears once; `ids` of 21 gives 400; non-admin gets 401/403 and the loader is not called; `listCohorts` returns `kind` and `contactCount`, with interested count from `import_batch_contacts`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `loadCohortAudience`, the route, and the `listCohorts` changes (update the existing `CohortRow` consumers: `CohortsPanel`, `getCohortDetail`, the cohort detail page: `getCohortDetail` for an interested cohort must list contacts from `import_batch_contacts`, not purchases).
- [ ] **Step 4: Run these tests plus `tests/` files that mention `listCohorts` or `CohortRow`; `tsc --noEmit`; eslint.**
- [ ] **Step 5: Commit** `feat: Meta CSV export for cohorts`.

---

### Task 6: Cohorts page UI

**Files:**
- Modify: `src/components/admin/crm/CohortsPanel.tsx`
- Test: `tests/cohorts-panel-meta.test.tsx` (copy the render style of an existing admin panel UI test, e.g. `tests/landing-registrations-list-ui.test.tsx`)

**Interfaces:**
- Consumes: `CohortRow.kind`, `CohortRow.contactCount` (Task 5); route `/api/admin/crm/cohorts/export?ids=` (Task 5).
- Produces: per-row **Download for Meta** link (`<a href=... download>`), row checkboxes plus a toolbar button **Download selected for Meta (N)** (disabled when none ticked, at most 20), a small badge for `closed_paid` ("Closed batch: paid") and `closed_interested` ("Interested, not paid"); the count shown uses `contactCount`.
- Plain-language copy only (the owner is not technical). Reuse existing `Button`, `ResponsiveList`, `EmptyState`; follow `docs`/Stitch tokens already used in the file (no new colours).

- [ ] **Step 1: Write failing UI tests:** each row shows a Download link with the right `href`; ticking two rows enables the selected button and its `href` carries both ids; interested cohort shows its badge and count; nothing ticked leaves the button disabled.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the UI changes.
- [ ] **Step 4: Run test (PASS), tsc, eslint.** Also run `tests/pz-tokens.test.ts` and confirm `CohortsPanel.tsx` is not an offender.
- [ ] **Step 5: Commit** `feat: download cohorts for Meta`.

---

### Task 7: "Save batch to CRM" button and warning

**Files:**
- Modify: `src/components/admin/registrations/BatchAccessPanel.tsx`
- Test: `tests/close-batch-panel.test.tsx`

**Interfaces:**
- Consumes: route `GET/POST /api/admin/landing/close-batch` (Task 4), `CloseBatchPreview`, `CloseBatchResult`.
- Produces: a **Save batch to CRM** button in the panel; on press, fetch the preview and open the existing `Dialog` with the warning text: "This copies N paid people and M interested people into your CRM as new cohorts. Nothing is removed from Registrations." and, when `alreadyClosed`, "This batch was saved before. Only K new paid people will be added; the interested list is refreshed." Confirm runs POST; the result sentence reads "Added X paid and Y interested. Z were already in the CRM. S skipped." Errors show the generic message. Use `useAsyncAction` like the other buttons in the file.

- [ ] **Step 1: Write failing tests:** the dialog shows the counts from the preview; `alreadyClosed` shows the second sentence; confirming calls POST once (double-click guard); error shows the generic text.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run test (PASS), tsc, eslint.**
- [ ] **Step 5: Commit** `feat: save finished batch to CRM from registrations`.

---

### Task 8: Consent wording

**Files:**
- Modify: `src/components/landing/registration/Field.tsx:54` (`ConsentField` label text)
- Test: extend an existing registration form test, or create `tests/consent-wording.test.tsx`

**Interfaces:**
- Produces: label text exactly: "I have read the registration details, payment terms and schedule. I agree that PharmaCozyme Academy may keep in touch with me about this course, future courses and updates, by email, WhatsApp and relevant messages." No change to validation (`consent: z.literal(true)` already required).

- [ ] **Step 1: Write the failing test** rendering `ConsentField` and asserting the exact text and that `aria-invalid` appears when `error` is set.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Replace the label text.**
- [ ] **Step 4: Run test (PASS); grep `tests/` for the old sentence "I have read and understood the registration details" and update any test that asserts it.**
- [ ] **Step 5: Commit** `feat: consent wording covers staying in touch`.

---

### Task 9: Live check (after Tasks 1-8, owner pastes 0086 first)

- [ ] **Step 1:** Read-only Supabase MCP (project `whqdasotjlhvrjmgiffk`): confirm `import_batches.kind`, `import_batch_contacts`, and `landing_close_batch` exist; confirm every column and value the function and `loadCohortAudience` use exist in the live DB.
- [ ] **Step 2:** Start the dev server (`node node_modules/next/dist/bin/next dev -p 3000`, background). Log in as admin. The database is live, so closing a batch writes real contacts: ask the owner which small real batch to use, and get an explicit yes first. Then press Save batch to CRM twice; confirm second run reports no duplicates; open Cohorts; download one cohort and one combined file; open the CSV and confirm headers and hashed values; confirm an interested person who later paid is gone from the interested file.
- [ ] **Step 3:** Never run `next build` while the dev server runs. Report results; do not push or merge without the owner's yes.
