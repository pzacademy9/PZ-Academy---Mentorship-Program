# Permanent PZ ID (identity) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every enrolled person gets one permanent PZ ID tied to their email, shown on a public per-batch "find your ID" page, a downloadable batch PDF, the admin registrations list, and available as a `{{pz_id}}` tag in participant messages.

**Architecture:** New tables `pz_people`, `pz_person_emails`, `pz_id_aliases` (service-role only, like 0067/0077). A trigger on `landing_registrations` creates the person when a row first becomes `paid` or `free`; a backfill covers existing rows. App code reads through `createAdminSupabase()` behind existing admin guards, and the public page goes through a narrow data function.

**Tech Stack:** Next.js App Router, Supabase (owner pastes SQL; MCP is read-only), vitest, jspdf (already a dependency, see `src/lib/notes-export.ts`).

**Spec:** `docs/superpowers/specs/2026-10-27-attendance-results-design.md` (this is plan 1 of 5: parts 1 to 5 of that spec become five plans). **Scope call:** the spec lists the automatic session emails under part 1, but they need sessions (Zoom link, time) that only exist in part 2. So the session emails move to plan 2. This plan delivers only the `{{pz_id}}` tag so IDs can already go out through the existing participant messages.

## Global Constraints

- ID format `FirstName-1234`: first name letters only, plus a globally unique number from one sequence starting at 1000 (it grows to 5 digits on its own). It always ends in digits. It never changes after it is issued.
- Email is the identity: stored lowercase, one email maps to one person.
- Each person's own ID is also stored as an alias (normalised: lowercase, trimmed), so one table answers every later "which person is this ID?" question.
- Only paid or free, non-test registrations create a person.
- Emails are never shown whole on public pages: `ja***@gmail.com` style.
- Public "find your ID" search needs at least 3 characters, shows at most 5 people, and is rate limited.
- New tables: RLS on, zero policies. Never regenerate `database.types.ts`: hand-add the new entries.
- Run tools as in this repo: `node node_modules/typescript/bin/tsc --noEmit` (baseline 0 errors), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`. No `eslint-disable` for `@typescript-eslint`. Source files often use CRLF.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Next migration number is 0088.

## Review Focus

- Name `Dr. Janice Juan` gives `Janice-xxxx`, not `Dr-xxxx`; a name with no Latin letters or an empty name gives `Student-xxxx`; the ID is never empty or malformed.
- The same person registering for two batches with `A@x.com` and ` a@x.com ` gets one person and one ID.
- A registration that goes paid, then pending, then paid keeps the same `person_id` and the same ID.
- Searching `%`, `_` or two characters never returns everyone; wildcards are escaped.
- Two people with the same first name in a batch both appear, with different IDs.
- A draft landing page's ID page is a 404; a published or closed one works.

---

### Task 1: Migration 0088, tables, functions, trigger, backfill

**Files:**
- Create: `supabase/migrations/0088_pz_people.sql`
- Modify: `src/lib/supabase/database.types.ts` (hand-add)
- Test: `tests/migrations-pz-people.test.ts` (same style as `tests/migrations-participant-messaging.test.ts`: read the SQL file, assert its text)

**Interfaces:**
- Produces (SQL):
  - table `pz_people(id uuid pk, pz_id text unique not null, display_name text not null, created_at timestamptz)`
  - table `pz_person_emails(email text pk check (email = lower(email)), person_id uuid not null references pz_people on delete cascade)`
  - table `pz_id_aliases(alias_norm text pk, person_id uuid not null references pz_people on delete cascade, source text not null check (source in ('own','legacy','review')), created_at timestamptz)`
  - column `landing_registrations.person_id uuid references pz_people on delete set null` plus an index
  - sequence `pz_id_seq` starting at 1000
  - `pz_first_name(p_name text) returns text`
  - `pz_ensure_person(p_email text, p_name text) returns uuid`
  - `pz_merge_people(p_keep uuid, p_drop uuid) returns void`
  - trigger `landing_registrations_person` (before insert or update of status, email, name) setting `new.person_id`

- [ ] **Step 1: Write the failing test.** `tests/migrations-pz-people.test.ts` reads the file and asserts it contains: the three `create table if not exists` statements, `enable row level security` for each, `create sequence if not exists public.pz_id_seq start 1000`, `create or replace function public.pz_first_name`, `create or replace function public.pz_ensure_person`, `create or replace function public.pz_merge_people`, `create trigger landing_registrations_person`, the `person_id` column add, the backfill `update public.landing_registrations`, and that it contains no `drop table` or `delete from public.landing_registrations`.
- [ ] **Step 2: Run it, expect FAIL** (file missing): `node node_modules/vitest/vitest.mjs run tests/migrations-pz-people.test.ts`.
- [ ] **Step 3: Write the migration.** Decisions the SQL must follow:
  - `pz_first_name`: strip leading titles (`dr`, `mr`, `mrs`, `ms`, `miss`, `prof`, `engr`, with or without a dot, case-insensitive), take the first remaining word, keep only `a-z`/`A-Z`, initcap, cut to 12 characters, fall back to `Student` when empty.
  - `pz_ensure_person`: lowercase and trim the email; if it exists in `pz_person_emails` return that `person_id`; otherwise insert a person with `pz_id = pz_first_name(p_name) || '-' || nextval('pz_id_seq')`, insert the email, insert the alias row `(lower(pz_id), 'own')`. Use `plpgsql` with `select ... into` carefully (a plain `into` needs an existing row; use `if not found`).
  - `pz_merge_people`: reject keep = drop; move emails and aliases from drop to keep (the dropped `pz_id` stays valid as an alias because its `own` alias row moves too); repoint `landing_registrations.person_id`; delete the dropped person.
  - Trigger function: when `new.status in ('paid','free') and not new.is_test`, set `new.person_id := pz_ensure_person(new.email, new.name)`; otherwise leave `person_id` as it is.
  - Backfill: `update public.landing_registrations set person_id = public.pz_ensure_person(email, name) where status in ('paid','free') and not is_test and person_id is null`, ordered so earlier registrations get lower numbers (use a subselect ordered by `created_at`).
  - All three tables: `alter table ... enable row level security`, no policies. Revoke execute on the three functions from `public`, `anon`, `authenticated` (service role only).
  - Hand-add the three tables and the `person_id` column to `database.types.ts` following the existing entries' shape.
- [ ] **Step 4: Run the test, expect PASS.** Then `tsc --noEmit` expecting 0 errors.
- [ ] **Step 5: Commit** `feat: add permanent PZ ID tables, trigger and backfill`.

### Task 2: ID helpers (normalise and mask)

**Files:**
- Create: `src/lib/pzid/format.ts`
- Test: `tests/pzid-format.test.ts`

**Interfaces:**
- Produces:
  - `normalizePzId(input: string): string` returns lowercase, trimmed, inner spaces removed.
  - `maskEmail(email: string): string` keeps up to 2 characters of the local part, then `***` and the domain; `a@x.com` gives `a***@x.com`; no `@` or empty gives `***` or empty.
  - `PZ_ID_SHAPE: RegExp` matches `^[A-Za-z]+-\d{4,}$`.

- [ ] **Step 1: Write the failing tests** with exact values: `normalizePzId("  Hamid-4821 ")` equals `"hamid-4821"`; `normalizePzId("HAMID - 4821")` equals `"hamid-4821"`; `maskEmail("jane@gmail.com")` equals `"ja***@gmail.com"`; `maskEmail("a@x.com")` equals `"a***@x.com"`; `maskEmail("")` equals `""`; `maskEmail("nodomain")` equals `"***"`; `PZ_ID_SHAPE` accepts `Hamid-4821` and `Hamid-10001` and rejects `Hamid-48`, `Hamid4821`, `4821`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the three exports in `src/lib/pzid/format.ts`. First check no equivalent exists: `grep -rn "maskEmail" src`; if one appears since this plan was written, reuse it instead.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: add PZ ID format helpers`.

### Task 3: Data layer for batch IDs

**Files:**
- Create: `src/lib/data/pz-people.ts`
- Test: `tests/pz-people-data.test.ts` (mock `createAdminSupabase` the way `tests/participant-sends-data.test.ts` does)

**Interfaces:**
- Consumes: `maskEmail` (task 2), tables from task 1.
- Produces:
  - `type BatchIdRow = { name: string; pzId: string; emailMasked: string }`
  - `searchBatchIds(slug: string, query: string): Promise<{ found: boolean; rows: BatchIdRow[] } | null>` returns `null` when the slug is not a published or closed landing page; `rows` is empty when the query is under 3 characters after trimming; at most 5 rows; one row per person; `%`, `_` and `\` in the query are escaped before the `ilike`.
  - `listBatchIdsForAdmin(pageId: string): Promise<Array<{ name: string; email: string; pzId: string }>>` for admins only (the caller guards), all paid or free non-test rows of that page, one per person, sorted by name, throws a plain `Error("Could not load IDs. Please try again.")` on any query failure.

- [ ] **Step 1: Write the failing tests** for: slug of a draft page returns `null`; query `"ab"` returns no rows and makes no registrations query; query `"%"` is sent escaped (assert the `ilike` argument equals `"%\\%%"`); two registrations of the same person return one row; two different people with the same first name both return, with different `pzId`; each row's `emailMasked` is masked and no raw email appears anywhere in the result; a failing query in `listBatchIdsForAdmin` throws the plain error.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** both functions with `import "server-only"`. Join registrations to `pz_people` through `person_id`; filter `status in ('paid','free')` and `is_test = false`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: add batch ID data layer`.

### Task 4: Public "find your ID" page

**Files:**
- Create: `src/app/ids/[slug]/page.tsx`, `src/app/ids/[slug]/actions.ts`, `src/components/marketing/FindMyId.tsx`, `src/lib/pzid/rate-limit.ts`
- Test: `tests/pz-find-id-ui.test.tsx`, `tests/pzid-rate-limit.test.ts`

**Interfaces:**
- Consumes: `searchBatchIds`, `BatchIdRow` (task 3).
- Produces:
  - `findMyId(slug: string, query: string): Promise<{ status: "ok"; rows: BatchIdRow[] } | { status: "too_short" } | { status: "not_found" } | { status: "rate_limited" }>` as a server action in `actions.ts`.
  - `allowRequest(key: string, now?: number): boolean` in `rate-limit.ts`: at most 10 requests per key per minute, best effort in memory per server instance. Document in a comment that serverless instances do not share it.

- [ ] **Step 1: Write the failing tests.** Rate limit: the 11th call within a minute for one key is refused, a different key is allowed, and after 61 seconds the first key is allowed again. UI: typing fewer than 3 characters shows "Type at least 3 letters of your name", a result list shows name, ID in large type with a copy button and the masked email, an empty result shows "No match. Check the spelling of your name, or ask the team."
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** The page reads the course title for the heading, renders `FindMyId`, uses `notFound()` when `searchBatchIds` says the slug is unknown (call it once with an empty query to check). The action rate limits by client IP from `headers()` (`x-forwarded-for` first value), returns `rate_limited` with a plain message. Use the app's existing marketing styling (`MarketingNav` is not needed on this page). Plain words only in visible text.
- [ ] **Step 4: Run, expect PASS.** Then `tsc` and `eslint` on the new files.
- [ ] **Step 5: Commit** `feat: add public find-your-ID page`.

### Task 5: Admin: PZ ID column and batch PDF

**Files:**
- Modify: `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/page.tsx`, `src/components/admin/registrations/CampaignRegistrations.tsx`, `src/lib/data/landing-registration-admin.ts` (add `pzId` to each row)
- Create: `src/lib/pzid/batch-pdf.ts`, `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/id-actions.ts`
- Test: `tests/pz-batch-pdf.test.ts`, extend the existing campaign page UI test for the new column

**Interfaces:**
- Consumes: `listBatchIdsForAdmin` (task 3).
- Produces:
  - `buildBatchPdf(title: string, rows: Array<{ name: string; pzId: string }>): Blob` in `batch-pdf.ts` (jspdf, A4, title, a "Name / ID" table, page breaks).
  - `getBatchIdList(pageId: string): Promise<Array<{ name: string; pzId: string }>>` server action guarded by the same admin check the sibling actions use (`grep requireAdmin` in the folder), emails not returned.
  - Campaign registrations table: a "PZ ID" column; rows without a person (not yet paid or free) show a dash.
  - A "Download ID list (PDF)" button, and a "Copy public ID page link" button building `${origin}/ids/${slug}`.

- [ ] **Step 1: Write the failing tests.** PDF: `buildBatchPdf("PPC Batch 3", rows)` returns a `Blob` of type `application/pdf` with size above 0, and 200 rows produce more than one page (inspect via the jspdf instance exposed through a small `countPages` helper or by asserting size grows). UI: the table shows `Hamid-4821` in the PZ ID column and a dash for a pending row; the action returns no `email` key.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Add `pzId` to the row type and to the query used by `listRegistrations` (join through `person_id`). Wire the two buttons into the campaign page header following how nearby buttons are done.
- [ ] **Step 4: Run, expect PASS.** Then `tsc` and `eslint`.
- [ ] **Step 5: Commit** `feat: show PZ IDs on campaign registrations and add batch PDF`.

### Task 6: `{{pz_id}}` tag in participant messages

**Files:**
- Modify: `src/lib/landing/participants/merge.ts` (`TagContext`, `PARTICIPANT_TAGS`, renderer), `src/lib/data/participant-sends.ts` (`renderEmail`, a `pzIdsFor` helper next to `refIdsFor`, the detail loader that returns `refIds`), `src/components/admin/registrations/MessageBuilder.tsx` (preview sample), `src/components/admin/registrations/WhatsAppSendList.tsx`
- Test: extend `tests/participant-merge.test.ts` and `tests/participant-sends-data.test.ts`

**Interfaces:**
- Produces: `TagContext` gains `pzId: string`; `PARTICIPANT_TAGS` gains `"pz_id"`; the tag renders the person's ID, or an empty string when the recipient has no person yet. `pzIdsFor(registrationIds: string[]): Promise<Map<string, string>>`.

- [ ] **Step 1: Write the failing tests:** `renderParticipantTags("Your ID: {{pz_id}}", { name: "A", refId: "R", portalUrl: null, pzId: "Hamid-4821" }, "text")` equals `"Your ID: Hamid-4821"`; with `pzId: ""` the result is `"Your ID: "`; `PARTICIPANT_TAGS` contains `"pz_id"`; the email send path renders the ID for a recipient whose registration has a person.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Members take their own person's ID (not the lead's). Update every `TagContext` construction (`grep -rn "refId:" src`) so `tsc` stays at 0 errors; the builder preview sample uses `pzId: "Hamid-4821"`.
- [ ] **Step 4: Run, expect PASS.** Then run all `tests/participant-*.test.*`, `tsc` and `eslint`.
- [ ] **Step 5: Commit** `feat: add pz_id tag to participant messages`.

### Task 7: Admin People page (look up and merge)

**Files:**
- Create: `src/app/dashboard/admin/people/page.tsx`, `src/app/dashboard/admin/people/actions.ts`, `src/lib/data/pz-people-admin.ts`, `src/components/admin/people/PeopleLookup.tsx`
- Modify: the admin navigation component (find it with `grep -rn "Certificates" src/components/layout`) to add a "People" link
- Test: `tests/pz-people-admin.test.ts`, `tests/pz-people-ui.test.tsx`

**Interfaces:**
- Produces:
  - `findPeople(query: string): Promise<Array<{ id: string; pzId: string; name: string; emails: string[]; batches: number }>>` matching an ID, alias, email or name (min 3 characters, escaped, max 20).
  - `mergePeople(keepId: string, dropId: string): Promise<{ ok: true } | { ok: false; message: string }>` calling `pz_merge_people` through the admin client; refuses when ids are equal or not UUIDs; both guarded by `requireAdmin`.

- [ ] **Step 1: Write the failing tests:** searching by `hamid-4821` and by an email both return the person; merging a person into itself returns `{ ok: false }` and never calls the database; a database error returns a plain message without raw error text; the UI asks for confirmation naming both IDs before it merges, and after a merge the dropped ID still appears as an alias of the kept person.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the data functions, the actions (with `requireAdmin()` first), the page and one client component: a search box, result cards showing ID, name, emails and number of batches, and a "Merge into this person" flow that needs two selected cards and an explicit confirm. Visible text in plain words.
- [ ] **Step 4: Run, expect PASS.** Then `tsc` and `eslint`.
- [ ] **Step 5: Commit** `feat: add admin People page with merge`.

### Task 8: Go live and verify (owner pastes SQL)

**Files:**
- Modify: nothing (verification only). Memory update after: `pz-academy-attendance-results-status.md`.

- [ ] **Step 1:** Run the full suite once in the background and confirm only the known failing tests fail (listed in the repo notes).
- [ ] **Step 2:** Give the owner `supabase/migrations/0088_pz_people.sql` to paste into the Supabase SQL editor. Do not run it from here (the Supabase MCP here is read-only).
- [ ] **Step 3:** After the paste, check with read-only queries: `select count(*) from pz_people` equals the distinct emails of paid or free non-test registrations; no `pz_id` is duplicated; every paid or free non-test registration has a `person_id`; every person has exactly one `own` alias. Report the numbers.
- [ ] **Step 4:** On a Vercel preview, open `/ids/<slug>` for a real published batch, search a known name, confirm the masked email, the copy button, and the "too many tries" message after 10 searches in a minute; download the PDF from the admin campaign page; send a test participant email with `{{pz_id}}`.
- [ ] **Step 5:** Report to the owner what was checked. No merge and no push to main without an explicit yes.

---

## Self-review notes

- **Spec coverage (part 1):** permanent ID at first enrolment (task 1), aliases table (task 1), batch "find your ID" page and PDF (tasks 4, 5), `{{pz_id}}` for emails (task 6), merge-two-people tool (tasks 1, 7). The session emails are deliberately moved to plan 2 (see Spec line). The backfill of existing students is in task 1; importing legacy IDs is plan 5. Student-facing "my ID" shown on the student's page is plan 4.
- **Type consistency:** `BatchIdRow`, `searchBatchIds`, `listBatchIdsForAdmin`, `maskEmail`, `normalizePzId`, `pzIdsFor` are defined once and used with the same names later.
- **Not in this plan:** nickname matching (`n` rejoin rule) belongs to plan 3, where it is first needed.
