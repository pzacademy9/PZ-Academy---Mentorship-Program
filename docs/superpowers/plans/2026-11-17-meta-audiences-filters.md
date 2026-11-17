# Meta Audiences: filters, saved audiences, bring-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Sales Hub "Audiences" page that filters people (course, recorded/live, country, paid or not, dates), shows an honest count, downloads the hashed or plain Meta file, saves named audiences, and brings landing-page registrants into the CRM on demand. Import and Merge review become tabs under Cohorts.

**Architecture:** Migration 0116 stores recorded/live, option keys, region (and registration time for interested people) on what the CRM keeps, extends `landing_close_batch`, and adds a saved-audiences table. A pure filter model plus a server engine (reads purchases and interested rows, filters in memory, applies suppression via a helper extracted from `loadCohortAudience`) feeds count, export and saved-audience routes. UI is built from existing parts (chips, segmented control, ResponsiveList patterns, Dialog) because Stitch produced no screen (owner agreed 2026-11-17).

**Tech Stack:** Next.js 14.2.5 App Router, Supabase (service role via `createAdminSupabase`), zod, vitest, existing `meta-audience.ts` builders.

**Spec:** `docs/superpowers/specs/2026-11-17-meta-audiences-filters-design.md` (read its "Calls made after the builder check" first; they are binding). Stitch prompts for later reference: `docs/superpowers/specs/2026-11-17-meta-audiences-stitch-prompts.md` (use its copy and layout as the content guide).

## Global Constraints

- Branch `meta-audiences-filters` (already checked out, local only). Do not push. No merge.
- Owner-facing copy: short plain words, calm, no exclamation marks, no sales words. Never show or log an email or phone in counts, errors, URLs or logs.
- Never include do-not-contact people; keep every rule of `buildMetaRows` / `buildPlainRows` (unsubscribed or suppressed email blanked, unsubscribed WhatsApp blanked, no email and no phone dropped). Do NOT use the segment machinery's email-sendable guard.
- Admin access for every new route/page: `requireAdmin(["sales_hub", "crm"])` / `requireAdminPage("sales_hub")` (middleware area map already covers `/api/admin/crm/*`).
- Vercel free plan: no new cron; counts and downloads run on request only; routes that read widely set `export const maxDuration = 60`. Reads page at 1000 (`pageAll`), `.in()` lists chunked (`chunk`).
- Upper limit 50,000 people per audience; above it the count route and the download answer a plain message, never a partial file.
- Migration 0116 is pasted by the owner by hand, so every new read/write must degrade clearly (plain "needs one update first" message, no crash) when the new columns/table are missing. Postgres missing-column error code `42703`, missing table `42P01` (or PostgREST message containing "does not exist" / "schema cache").
- Never edit `src/lib/supabase/database.types.ts` wholesale: hand-add entries (new columns on `contact_purchases` and `import_batch_contacts`, new table, nothing else). No `eslint-disable` for `@typescript-eslint`. Preserve CRLF in existing files. Shared constants must not live in "use client" files that a server page imports. Colours: tokens already used in the file being edited / sibling admin CRM components (`pz-*`), no new colour classes.
- Run tools directly (npm/npx broken by `&` in the path): `node node_modules/typescript/bin/tsc --noEmit` (must stay 0 errors), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`. Known unrelated failing tests: landing-event-sheet, landing-hero-render, landing-polish-3, landing-route-hardening, pz-tokens, participant-recipients, participant-whatsapp-ui, gas-apply-registration-status, migrations-segment-source-dnc, participant-campaign-page-ui, registration-id-selection; landing-registrations-list-ui is flaky (re-run alone).
- Write the test first. Dialogs/menus keep Escape closing and focus returning to the opener. Phone-first: usable at 390px and 1440px; touch targets at least 44px (`min-h-11`).
- Stage files by path only. Leave untracked `docs/lead-capture-go-live-guide.md`, `docs/superpowers/plans/2026-11-02-*.md` and the Stitch prompts spec alone. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A person with a live-recorded registration and an imported-sheet registration: picking "Recorded" must include them via the recorded one and never via the imported one (imported rows have no mode).
- "Registered, not paid" never includes anyone who has any purchase, even in another course.
- Empty Course / Country selection means "no restriction", not "nobody".
- "Not known" country selects people whose country is null.
- Date range with only one end filled works; people with no date are left out only when a date filter is set; inverted range answers a plain error.
- A saved audience pointing at a deleted course or page: warning, choice ignored, no crash.
- Migration not applied: Audiences page loads, shows the plain "needs one update first" line, downloads of old cohorts keep working.
- Bring-in pressed twice, or on a page already closed: no duplicates (purchases upsert on `(source_sheet_id, source_row_ref)`), mode/options/region filled for earlier-copied people.
- Count never includes people the download would drop silently: total matching, will go in the file, left out (no email or phone, do-not-contact) must add up.

---

### Task 1: Migration 0116 (columns, close-batch function, saved audiences)

**Files:**
- Create: `supabase/migrations/0116_audience_filters.sql`
- Create: `docs/superpowers/plans/2026-11-17-meta-audiences-filters-owner-steps.md`
- Modify: `src/lib/supabase/database.types.ts` (hand-add only the new columns and table)
- Test: `tests/audience-filters-0116-migration.test.ts` (follow the style of `tests/meta-audiences-0087-migration.test.ts`)

**Interfaces:**
- Produces columns: `contact_purchases.reg_mode text null check in ('live','recorded')`, `contact_purchases.option_keys text[] not null default '{}'`, `contact_purchases.region text null`; `import_batch_contacts.reg_mode text null (same check)`, `.option_keys text[] not null default '{}'`, `.region text null`, `.registered_at timestamptz null`.
- Produces table `public.crm_saved_audiences (id uuid pk default gen_random_uuid(), name text not null check (length(btrim(name)) between 1 and 80), filters jsonb not null, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`, RLS on, zero policies (service role only), unique index on `lower(btrim(name))`.
- Produces: `landing_close_batch(p_page_id uuid, p_page_title text, p_course_id uuid, p_created_by uuid, p_rows jsonb)` (same signature) now reads per row `v_row->'purchase'->>'mode'`, `->'optionKeys'` (json array of text), `->>'region'` and (interested) `->>'registeredAt'`, writes them into the purchase upsert (also in the `on conflict ... do update` so re-running fills earlier copies; keep `coalesce` so a null never erases a stored value) and into `import_batch_contacts` (first row seen per contact wins, ordered by registeredAt ascending; rows without mode stay null). Everything else in the function stays exactly as migration 0087.

- [ ] **Step 1: Write the failing test.** Read the SQL file as text and assert: the four ALTERs/columns exist with the check constraints; the new table with `enable row level security` and no `create policy`; the function is `create or replace ... landing_close_batch` with the same argument list and `security definer`, still contains the 0087 rule that only paid rows run the identity-filling UPDATE, and the `revoke all ... from public, anon, authenticated` line; the upsert's `do update` set list mentions `reg_mode`, `option_keys`, `region`.
- [ ] **Step 2: Run it; expect FAIL (file missing).**
- [ ] **Step 3: Write `0116_audience_filters.sql`.** Start from the full body of `0087` (copy, then edit) so nothing else changes. Use `add column if not exists`. The interested insert into `import_batch_contacts` must carry one row per distinct contact: build a temp array/jsonb of `{contact_id, mode, option_keys, region, registered_at}` per interested row during the loop (append), then insert `distinct on (contact_id)` ordered by `registered_at asc nulls last`, still excluding anyone with a purchase. Header comment explains the owner pastes this whole file.
- [ ] **Step 4: Owner-steps file:** plain words, one statement-at-a-time not needed (it is one file): where to paste, what changes for them, how to check (one SELECT counting the new columns), and a line that the Audiences page shows "needs one update first" until pasted. Hand-add the new columns/table entries in `database.types.ts` (Row/Insert/Update for the table; new optional columns on the two existing tables).
- [ ] **Step 5: Run the test (PASS), tsc (0 errors). Commit** `feat: migration 0116 audience filters storage`.

### Task 2: Close-batch mapping carries mode, options, region

**Files:**
- Modify: `src/lib/landing/close-batch-rows.ts`, `src/lib/data/landing-close-batch.ts`
- Test: `tests/close-batch-rows.test.ts`, `tests/landing-close-batch.test.ts` (extend)

**Interfaces:**
- `RegRow` gains `mode: "live" | "recorded"`, `option_keys: string[] | null`, `region: string`. `REG_COLUMNS` adds `mode, option_keys, region`.
- `CloseRow.purchase` gains `mode: "live" | "recorded" | null`, `optionKeys: string[]`, `region: string | null` (empty string becomes null); `CloseRow` gains `registeredAt: string` (= `created_at`). Members take their lead's mode/optionKeys/region when their own are empty.
- `closeBatch` / `previewCloseBatch` behaviour and result shape unchanged.

- [ ] **Step 1: Write failing tests.** `mapRegistrations`: a recorded row with option_keys `["m1","m2"]` and region `"UK"` yields those values on `purchase`; empty region becomes null; null option_keys becomes `[]`; a `member` row with blank own values inherits the lead's; an interested row carries `registeredAt` equal to its `created_at`. `closeBatch`: the RPC receives rows containing the new keys (assert on the mocked `rpc` payload).
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** the type additions and mapping in `close-batch-rows.ts` and the column list in `landing-close-batch.ts`.
- [ ] **Step 4: Run both test files, `tests/close-batch-panel.test.tsx`, tsc, eslint on the two source files. Commit** `feat: close batch carries recorded/live, options, region`.

### Task 3: Audience filter model, validation, URL form

**Files:**
- Create: `src/lib/crm/audience-filter.ts` (pure, no "server-only", no "use client")
- Test: `tests/audience-filter.test.ts`

**Interfaces (Produces):**
- `export type AudienceFilter = { courses: string[]; mode: "either" | "recorded" | "live"; countries: string[]; who: "paid" | "unpaid" | "both"; from: string | null; to: string | null }` where `courses` are course display names, `countries` are ISO codes (`"PK"`, `"AE"`, `"SA"`, ...) plus the literal `"unknown"`, dates are `YYYY-MM-DD`.
- `export const DEFAULT_AUDIENCE_FILTER: AudienceFilter` (no courses, `either`, no countries, `both`, null dates).
- `export const audienceFilterSchema` (zod): courses max 50 items each trimmed 1..200 chars; countries max 20, each `/^[A-Z]{2}$/` or `"unknown"`; dates valid calendar dates; rejects `from > to` with message "The start date is after the end date."
- `export function parseAudienceFilter(input: unknown): { ok: true; filter: AudienceFilter } | { ok: false; error: string }`
- `export function encodeAudienceFilter(f: AudienceFilter): string` (base64url JSON, used in the download link) and `export function decodeAudienceFilter(s: string): ReturnType<typeof parseAudienceFilter>` (max 4000 chars).
- `export function describeAudienceFilter(f: AudienceFilter): string[]` plain-words lines for the filename and the page ("Recorded only", "UAE, Saudi Arabia"...). `export const AUDIENCE_MAX_PEOPLE = 50000`.

- [ ] **Step 1: Write failing tests** for: defaults; empty arrays accepted; bad country code, bad date, inverted range, 51 courses rejected with plain messages; encode then decode round-trips; decode of garbage or 5000 chars returns `{ ok: false }`; `describeAudienceFilter(DEFAULT)` returns `["Everyone in the CRM"]`... exact strings chosen by the implementer but asserted for the default and one filled case.
- [ ] **Step 2: Run; FAIL. Step 3: Implement. Step 4: Run test, tsc, eslint. Step 5: Commit** `feat: audience filter model`.

### Task 4: Audience engine (count, contacts, facets) and shared suppression helper

**Files:**
- Create: `src/lib/data/audience-query.ts` (`import "server-only"`)
- Modify: `src/lib/data/cohort-export.ts` (extract the contacts-read plus suppression part of `loadCohortAudience` into an exported `loadAudienceContacts(contactIds: string[]): Promise<AudienceContact[]>`; `loadCohortAudience` calls it, behaviour unchanged)
- Test: `tests/audience-query.test.ts`, keep `tests/cohort-export.test.ts` green

**Interfaces (Produces):**
- `export type AudienceCount = { total: number; inFile: number; leftOut: { noContact: number; doNotContact: number }; tooLarge: boolean; needsUpdate: boolean; ignoredChoices: string[] }`
- `export async function resolveAudienceContactIds(f: AudienceFilter): Promise<{ ids: string[]; needsUpdate: boolean; ignoredChoices: string[] }>`
- `export async function countAudience(f: AudienceFilter): Promise<AudienceCount>`: runs resolve, then `loadAudienceContacts`, then `buildMetaRows(contacts)` to read how many are dropped and why (do-not-contact vs no email or phone); `inFile = total - leftOut sums`. No contact detail leaves this function.
- `export async function loadAudienceFile(f: AudienceFilter): Promise<{ contacts: AudienceContact[]; tooLarge: boolean }>` (never returns contacts when over `AUDIENCE_MAX_PEOPLE`).
- `export async function audienceFacets(): Promise<{ courses: { name: string; count: number }[]; countries: { code: string; count: number }[]; unknownCountry: number; landingPages: { id: string; title: string; registrations: number; alreadyBrought: boolean }[]; needsUpdate: boolean }>`
- Course name rule (one function `courseNameOf`): purchases: the linked course title when `course_id` is set, else `courseNameFromLabel(product_label)` from `src/lib/crm/product-label.ts`, else "Unnamed"; interested rows: the cohort's course title when set, else the cohort `sheet_name` with the trailing " (interested)" removed. Trim and compare case-insensitively; the displayed name is the first seen spelling.
- Match rule (binding, spec calls 1-4): a registration satisfies the filter when course (any of chosen; none chosen = any) AND mode (`either` = any, imported/NULL-mode registrations fail `recorded` and `live`) AND date (purchase: `purchased_at ?? created_at`; interested: `registered_at`; no date fails only when a date filter is set; inclusive range on the date part) AND who all hold on that one registration; `who` `paid` uses purchases only, `unpaid` uses interested rows of contacts with no purchase at all, `both` is the union. Country is a contact-level test (selected codes any-of, `unknown` = null country; none selected = any).

- [ ] **Step 1: Write failing tests** with a hand-rolled fake of the admin client (look at how `tests/cohort-export.test.ts` fakes it): (a) one contact with an imported purchase (no mode) and a recorded landing purchase matches `recorded` only through the second; (b) `unpaid` excludes a contact with any purchase; (c) two courses chosen = either matches; (d) country `unknown` matches null country; (e) a date filter with only `from`; people with no date dropped only then; (f) over 50,000 ids sets `tooLarge`; (g) a missing-column error (`42703`) from the purchases read returns `needsUpdate: true` and an empty list, no throw; (h) a chosen course that exists nowhere is returned in `ignoredChoices` and does not shrink the result to zero by itself (it is dropped from the filter); (i) counts add up: `total = inFile + noContact + doNotContact`; (j) `loadCohortAudience` still returns the same contacts as before the extraction.
- [ ] **Step 2: Run; FAIL. Step 3: Implement** with `pageAll`/`chunk` (narrow selects: purchases `contact_id, product_label, course_id, reg_mode, purchased_at, created_at`; courses titles in one read; interested rows from `import_batch_contacts` joined by cohort ids of `kind = 'closed_interested'`). Fall back to the legacy select (no new columns) only to detect `needsUpdate`.
- [ ] **Step 4: Run both test files, `tests/meta-audience.test.ts`, tsc, eslint. Step 5: Commit** `feat: audience engine and shared contact loader`.

### Task 5: API routes (count, download, saved audiences, bring-in)

**Files:**
- Create: `src/app/api/admin/crm/audiences/count/route.ts` (POST body = filter), `.../export/route.ts` (GET `?f=<encoded>` or `?saved=<uuid>`, optional `&format=plain`), `.../saved/route.ts` (GET list, POST create), `.../saved/[id]/route.ts` (PATCH rename, DELETE), `.../facets/route.ts` (GET), `.../bring-in/route.ts` (POST `{ pageIds: string[] }`, max 20)
- Create: `src/lib/data/audience-saved.ts` (`listSavedAudiences`, `createSavedAudience`, `renameSavedAudience`, `deleteSavedAudience`, `getSavedAudience`; degrade on missing table)
- Create: `src/lib/validations/audience.ts` (zod for bodies; name trimmed 1..80, UUIDs)
- Test: `tests/audience-routes.test.ts`

**Interfaces:**
- All routes: `requireAdmin(["sales_hub","crm"])`, JSON errors `{ error: string }` in plain words, 400 on bad input, 500 generic with `console.error("[audiences] <step> failed")` (no PII). Count: `{ total, inFile, leftOut, tooLarge, ignoredChoices, needsUpdate }`. Export: same headers as `cohorts/export` (`text/csv`, attachment filename from `metaCsvFilename(describeAudienceFilter(filter) or saved name, new Date(), "hashed"|"plain")`, `Cache-Control: no-store`); 413 with plain message when `tooLarge`; 400 when zero people would be in the file ("Nobody to download for these choices."). Bring-in: for each page id (UUID-checked, deduplicated) call `closeBatch({ pageId, adminId })` from `src/lib/data/landing-close-batch.ts`; result `{ pages: { id, ok, paidAdded, interestedAdded, skipped, error? }[] }`; one page failing does not stop the others; `maxDuration = 60`. Saved create: duplicate name (case-insensitive) answers 409 "A saved audience with this name already exists."
- Saved audiences are shared by all admins with access; stored filters re-validated with `audienceFilterSchema` on read (a stored bad filter is skipped with a flag, not a crash).

- [ ] **Step 1: Write failing tests** per route with mocked `requireAdmin` and data modules (style of `tests/cohort-export-route.test.ts`): 401/403 passthrough; 400 on bad filter; count returns only numbers (assert JSON keys; no emails); export hashed vs plain headers and that plain is attachment-only; 413 when too large; saved create/duplicate/rename/delete; bring-in dedupes ids, rejects non-UUIDs and more than 20, reports per-page results and continues after one failure.
- [ ] **Step 2: Run; FAIL. Step 3: Implement. Step 4: Run, tsc, eslint. Step 5: Commit** `feat: audience routes`.

### Task 6: Audiences page, panel and Bring-in dialog

**Files:**
- Create: `src/app/dashboard/admin/sales-hub/audiences/page.tsx` (server, `requireAdminPage("sales_hub")`, loads facets and saved audiences; shows the "needs one update first" notice when `needsUpdate`), `.../audiences/loading.tsx`
- Create: `src/components/admin/crm/AudiencesPanel.tsx` ("use client"), `src/components/admin/crm/BringInDialog.tsx` ("use client"), small shared pieces only if reused (`ChipGroup`, `SegmentedControl` inside the same folder if no existing component fits; first grep `src/components/ui` and `SegmentBuilder.tsx` for an existing one and reuse it)
- Modify: `src/lib/crm/sales-hub-routes.ts` only if a helper is needed
- Test: `tests/audiences-panel.test.tsx`, `tests/bring-in-dialog.test.tsx`

**Interfaces:**
- `AudiencesPanel({ facets, saved, needsUpdate })`. Content and copy follow the Stitch prompt file: title "Audiences", subtitle, "Who to include" cards (Course chips with "Add course" search/select for more than 8, Recorded or live segmented control with the imported-sheets note, Country chips including "Not known (N)" and the "Country comes from the phone number" note, Who segmented control, Registered between date fields with hint), result card ("N people match", "N will go in the file", "N left out: X have no email or phone, Y asked not to be contacted"), buttons "Download for Meta" and "Download plain version" (lock icon and privacy note as in `CohortsPanel`), "Save this audience" revealing a name field and Save, saved-audiences select (load, rename, delete with `useConfirm`), "Reset filters", "Bring in from landing pages" button opening the dialog. The count loads on request through a "Check count" button and automatically (debounced 400 ms, abort on change) after a filter change; shows "Counting…" and a plain error line on failure; the download buttons are links to the export route and are disabled (rendered as disabled buttons, not links) while the count is 0, `tooLarge`, or stale. Warnings for `ignoredChoices` shown above the filters.
- `BringInDialog({ landingPages, onDone })`: a Radix Dialog (existing `ui/dialog` primitives): checklist of landing pages (title, registrations, "already brought in" tag), "Select all", "Bring in" and "Cancel"; posts to the bring-in route; result lines per page ("Brought in 180 paid, 40 interested. 4 left out: no email or phone, or no consent."); after success calls `onDone` which refreshes facets and the count. Escape closes; focus returns to the opener button; the dialog never closes mid-request.
- Phone (390px): single column, sticky result card above the bottom nav (`sticky bottom-…` clear of the mobile bar; check `Sidebar.tsx` for the bar height), all controls `min-h-11`. PC (1440px): two columns, filters left, sticky result card right.

- [ ] **Step 1: Write failing tests** (React Testing Library, mock `fetch`): choosing chips builds the right request body; count shows the three lines and the left-out reasons; download links carry `f=` that decodes to the chosen filter and `format=plain` for the plain one; downloads disabled at 0 / too large; imported-sheets note visible when Recorded or Live selected; save flow (name field, POST, appears in the select, 409 message shown); Reset restores defaults; `needsUpdate` notice shown and filters still render; Bring-in dialog: Escape closes and focus returns to the opener; select all; shows per-page results; opener disabled while running.
- [ ] **Step 2: Run; FAIL. Step 3: Implement. Step 4: Run both test files, tsc, eslint, and `tests/client-boundary-values.test.ts`. Step 5: Commit** `feat: audiences page and bring-in dialog`.

### Task 7: Cohorts tab strip, nav changes, redirects of old places

**Files:**
- Create: `src/components/admin/crm/CohortsTabs.tsx` (server-safe or client, tabs as links: "Cohorts" `/dashboard/admin/sales-hub/cohorts`, "Import a sheet" `/dashboard/admin/sales-hub/import`, "Merge review" `/dashboard/admin/sales-hub/merge`; `aria-current="page"` on the active one; horizontally scrollable at 390px with `min-h-11` targets)
- Modify: `src/app/dashboard/admin/sales-hub/{cohorts,import,merge}/page.tsx` (render `CohortsTabs` above the existing heading; cohort detail pages `cohorts/[id]` show it too with Cohorts active)
- Modify: `src/components/dashboard/nav.ts`: remove the "Import" and "Merge Review" `SALES_HUB_ITEMS`; add `hub("Audience", "Audiences", hubPath("audiences"), <icon>)` right after "Cohorts"; make the sidebar highlight "Cohorts" on `/import` and `/merge` (extend the hub active-href logic with a small alias map or a `matches` list, keep `activeHrefFor` behaviour for everything else). Update `Sidebar.tsx` only if highlight is computed there.
- Modify: `src/components/admin/crm/CohortsPanel.tsx`: the empty-state "Import contacts" link text becomes "Import a sheet"; add a short line above the toolbar: "Need a list made by a question, like recorded buyers in UAE? Use Audiences." linking to `/dashboard/admin/sales-hub/audiences`.
- Modify: any internal links to the removed sidebar entries (grep `hubPath("import")`, `hubPath("merge")`, `sales-hub/import`, `sales-hub/merge`); the pages and URLs stay.
- Test: `tests/sales-hub-nav.test.ts` (update expected labels: no Import, no Merge Review, Audiences present after Cohorts; Cohorts active on `/import` and `/merge` and `/cohorts/abc`), `tests/cohorts-tabs.test.tsx`, `tests/cohorts-panel-meta.test.tsx` (keep green)

- [ ] **Step 1: Write failing tests** as above. **Step 2: Run; FAIL. Step 3: Implement. Step 4: Run the three test files plus `tests/dashboard-nav.test.ts`, any test that greps the sales-hub routes, tsc, eslint. Step 5: Commit** `feat: cohorts tabs for import and merge, audiences nav entry`.

---

## Owner steps (after merge, not code)
1. Paste `0116_audience_filters.sql` in the Supabase SQL editor (steps file beside this plan).
2. Open Audiences, press "Bring in from landing pages", pick the pages, run it once.
3. Pick filters, check the count, download the hashed file, upload to Meta Ads Manager (Audiences, Create audience, Custom audience, Customer list).
