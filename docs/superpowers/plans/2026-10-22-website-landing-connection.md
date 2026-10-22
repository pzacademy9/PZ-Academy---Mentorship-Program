# Website and Landing Page Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The public website shows a "Live batch open" banner, tag and button for a course whenever its main landing page is open for live registration, and sends visitors to that landing page.

**Architecture:** Add `is_main_page` to `landing_pages` (one per course, needs `course_id`, set atomically by an RPC). A server-only reader (`landing-website.ts`, admin client) returns the open live batch per course. Website pages are already dynamic per request (they read cookies), so they show fresh data and need no cache wiring. Links go to `/e/<slug>?src=website`; the `src` key rides the existing UTM pipeline.

**Tech Stack:** Next.js App Router, Supabase (admin client for landing tables, which are service-role only), zod, vitest, Tailwind with `pz-*` tokens.

**Spec:** `docs/superpowers/specs/2026-10-22-website-landing-connection-design.md`

## Global Constraints

- Never regenerate `src/lib/supabase/database.types.ts`; hand-add new columns to Row, Insert and Update of `landing_pages`.
- Migrations are idempotent files; the owner pastes SQL. Next number is `0084`. Style: line 1 comment with filename, header comment, `if not exists`, `revoke all ... from public, anon, authenticated; grant execute ... to service_role` for functions.
- Landing tables are never read with the anon client; website code uses `createAdminSupabase()` in server-only files.
- Agent attribution (`?ref=`, `REF_RE`, `pz_agent_ref`) and Meta fields (`fbp`, `fbc`, `eventId`) must not change behavior.
- Banner and button show only when the main page: `status = 'published'`, has a published copy, `registration.enabled`, `registration.modes` includes `"live"`, is not full, and is not finished.
- "Full" mirrors the SQL in `0069_landing_registration.sql` lines 262-269: count of `landing_registrations` rows for the page with `is_test = false`, compared with `registration.capacity` when `capacity > 0`.
- "Finished" = a `landing_batch_state` row with `module_id is null` exists for the page, OR the page's course has modules and every module has a `landing_batch_state` row.
- Tests: flat `tests/` folder, `// @vitest-environment node` for data and route tests, Supabase mocked with `tests/helpers/supabase-mock.ts`. Run files with `node node_modules/vitest/vitest.mjs run tests/<file>`; type check with `node node_modules/typescript/bin/tsc --noEmit` (baseline 0 errors; ignore `.next/types` noise); lint with `node node_modules/eslint/bin/eslint.js <paths>`; never add `eslint-disable @typescript-eslint` comments. `npm run` is broken in this path.
- Known failing tests, not ours: `tests/pz-tokens.test.ts`, `tests/landing-route-hardening.test.ts`, `tests/gas-apply-registration-status.test.ts`, `tests/landing-event-sheet.test.ts` (2).
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. New commits only, never amend. Nothing pushed to main without the owner's yes.
- UI: check Stitch (project "PZ Academy Platform 2" `4651274386787527431`, then "PZ Academy Platform 1" `11811490301995978699`) for a matching screen before styling; if none, reuse existing `pz-*` tokens and the owner-chosen layout "C" (banner on course page, tag on cards, open batch on home page). The Stitch list output is huge: parse the saved tool-result file with node, not jq.
- Visible copy is plain, no jargon: "Live batch open", "Starts 30 October 2026", "Register for live".

## Review Focus

- Main page is a draft, closed, finished, full, or recorded-only: banner and button must be absent, never a dead link.
- Two landing pages for one course both ticked main: database must reject it; the RPC must move the tick in one step.
- A page with no course: cannot be main (database check and API refusal).
- `?src=website` plus an existing agent `?ref=` in the same visit: ref must survive and still attribute.
- Course `capacity = 0` (unlimited): never "full".
- Student with an active website enrollment later pays on a landing page (and the reverse): no second enrollment row, and the owner can see it happened.
- Visitor who is signed in and already enrolled still sees the live banner correctly (banner is about the batch, not the person).

---

### Task 1: Migration 0084 and types for the main page

**Files:**
- Create: `supabase/migrations/0084_landing_main_page.sql`
- Modify: `src/lib/supabase/database.types.ts` (`landing_pages` Row/Insert/Update, about lines 1782-1855; add the new function under `Functions`)
- Test: `tests/landing-main-page-migration.test.ts`

**Interfaces:**
- Produces: column `landing_pages.is_main_page boolean not null default false`; check `landing_pages_main_needs_course` (`not is_main_page or course_id is not null`); unique partial index `landing_pages_main_per_course` on `(course_id) where is_main_page`; function `public.landing_set_main_page(p_page_id uuid, p_course_id uuid, p_main boolean) returns void` (service_role only).
- RPC behavior: sets `course_id = p_course_id` on the page; when `p_main` is true, first sets `is_main_page = false` on every other page of that course, then sets it true on this page; when `p_main` is false or `p_course_id` is null, sets `is_main_page = false`. Raises `main_needs_course` if `p_main` and `p_course_id` is null.

- [ ] **Step 1: Write the failing test.** `landing-main-page-migration.test.ts` reads the SQL text (pattern of `tests/landing-list-actions-migration.test.ts`) and asserts it contains: `add column if not exists is_main_page`, `landing_pages_main_needs_course`, `landing_pages_main_per_course`, `create or replace function public.landing_set_main_page`, `revoke all on function public.landing_set_main_page` and `to service_role`.
- [ ] **Step 2: Run it; expect FAIL (file missing).**
- [ ] **Step 3: Write the migration** in the style of `0079`/`0081`, idempotent (`drop constraint if exists` then `add constraint`).
- [ ] **Step 4: Hand-add** `is_main_page` (Row: `boolean`; Insert/Update: optional) and the `landing_set_main_page` Args/Returns entry to `database.types.ts`.
- [ ] **Step 5: Run the test (PASS) and tsc (0 errors).** Run the SQL body read-only against the live DB with Supabase `execute_sql` inside a rolled-back statement is not possible (read-only MCP); instead check syntax by reading it twice and have the owner paste it later.
- [ ] **Step 6: Commit** `feat: add main landing page per course (migration 0084)`.

### Task 2: Optional "batch start date" setting

**Files:**
- Modify: `src/lib/landing/content.ts` (`LandingSettings` interface line 19, `DEFAULT_SETTINGS` line 52, zod `settings` line 70, `normalizeContent` settings line 126, `emptyContent`), `src/components/admin/landing/PageSettingsPanel.tsx` (new input), `src/lib/landing/templates-data/ppc-batch-3.ts` (set `"2026-10-30T14:30:00.000Z"`, i.e. 30 Oct 7:30 PM PKT), existing tests that deep-equal settings (`tests/landing-content.test.ts` and any other that fails)
- Test: `tests/landing-content.test.ts`

**Interfaces:**
- Produces: `LandingSettings.batchStartsOn: string` (ISO instant or `""`, max 40 chars, default `""`). Shown with the existing `formatStartsOn(iso)` from `src/lib/emails/landing-registration.ts` (returns `"30 October 2026"` in Asia/Karachi, `""` if invalid).

- [ ] **Step 1: Write failing tests** in `landing-content.test.ts`: `normalizeContent` keeps a valid `batchStartsOn`; defaults it to `""` when missing (old saved pages must still load); `contentSchema` rejects a value over 40 characters.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Add the field** in all five places in `content.ts`. Add a `datetime-local` input in `PageSettingsPanel.tsx` titled "Batch start date (shown on the website)" reusing `isoToPkt`/`pktToIso` (lines 16-31) and the existing `Card`/`Input` pattern.
- [ ] **Step 4: Set the PPC Batch 3 template value; update deep-equal tests.**
- [ ] **Step 5: Run `landing-content`, `landing-admin-ui` and any failing settings test; tsc; lint changed files.**
- [ ] **Step 6: Commit** `feat: optional batch start date on landing pages`.

### Task 3: Data layer and API for course and main page

**Files:**
- Modify: `src/lib/data/landing-pages.ts` (`COLUMNS` line 39, `Row` Omit list lines 14-17, `LandingPage` and `LandingPageSummary` types, `mapRow`), `src/lib/validations/landing.ts`
- Create: `src/app/api/admin/landing-pages/[id]/course/route.ts`
- Test: `tests/landing-page-course.test.ts`

**Interfaces:**
- Produces: `LandingPage.courseId: string | null` and `LandingPage.isMainPage: boolean` (also on `LandingPageSummary`).
- Produces: `setPageCourse(pageId: string, courseId: string | null, isMain: boolean): Promise<{ ok: true } | { ok: false; reason: "not-found" | "no-course" | "no-live" | "course-missing" | "error" }>` in `landing-pages.ts`. Rules: `isMain` with null `courseId` returns `no-course`; `isMain` requires the page's registration `modes` to include `"live"` (read the published copy if it exists, otherwise the draft) else `no-live`; the course must exist else `course-missing`; then calls RPC `landing_set_main_page`; revalidates `/dashboard/admin/landing-pages`.
- Produces: `courseAssignmentSchema = z.object({ courseId: z.string().uuid().nullable(), isMain: z.boolean() })` in `validations/landing.ts`.
- Route `POST /api/admin/landing-pages/[id]/course` follows `rename/route.ts`: `requireAdmin()`, `isPageId`, parse body, call `setPageCourse`, map `not-found` 404, `no-course`/`no-live`/`course-missing` 422 with plain messages ("Pick a course first", "This page has no live option, so it cannot be the main page", "Course not found"), `error` 500.

- [ ] **Step 1: Write failing tests** (`landing-page-course.test.ts`, mock admin client and `next/cache` as in `landing-data.test.ts`; route tests as in `landing-routes.test.ts`): `isMain` without course returns `no-course` and makes no RPC call; recorded-only page with `isMain` returns `no-live`; live page calls RPC `landing_set_main_page` with `{p_page_id, p_course_id, p_main: true}`; `isMain` false with a course just assigns; route returns 404 on bad uuid, 422 on `no-live`, 200 `{ok:true}` on success.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** the three pieces. Include `course_id, is_main_page` in `COLUMNS` and map to the new fields.
- [ ] **Step 4: Run new tests plus `landing-data`, `landing-routes`; tsc; lint.**
- [ ] **Step 5: Commit** `feat: assign course and main page to a landing page`.

### Task 4: Course and main-page picker in the landing editor

**Files:**
- Modify: `src/app/dashboard/admin/landing-pages/[id]/page.tsx` (load courses `{id, title}` with `createAdminSupabase().from("courses").select("id, title").order("title")`, pass `courses` prop), `src/components/admin/landing/LandingEditor.tsx` (header, near rename input lines 427-441)
- Create: `src/components/admin/landing/CourseMainPicker.tsx`
- Test: `tests/landing-course-picker-ui.test.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/landing-pages/[id]/course` and `LandingPage.courseId/isMainPage` from Task 3.
- Produces: `CourseMainPicker({ pageId, courses, courseId, isMainPage }: { pageId: string; courses: { id: string; title: string }[]; courseId: string | null; isMainPage: boolean })`. Plain `<select>` (pattern from `ComposeNotificationForm.tsx` lines 129-148) with first option "No course", plus a checkbox "Main page for this course (shown on the website)", disabled until a course is chosen. Saves on change with `useAsyncAction`, shows `toast` on success or the API message on error, then `router.refresh()`.

- [ ] **Step 1: Write failing UI tests:** checkbox disabled with "No course"; choosing a course posts `{courseId, isMain: false}`; ticking the box posts `{courseId, isMain: true}`; an error response shows its message and does not change the checkbox.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** the component and wire it into the editor header and page loader. If changing the course on a page that already has module links, keep the existing `pruneModuleIds` behavior (LandingEditor lines 159-163).
- [ ] **Step 4: Run new tests plus `landing-admin-ui`; tsc; lint.**
- [ ] **Step 5: Commit** `feat: course and main page picker in landing editor`.

### Task 5: Open live batch reader for the website

**Files:**
- Create: `src/lib/data/landing-website.ts` (starts with `import "server-only"`; admin client)
- Test: `tests/landing-website.test.ts`

**Interfaces:**
- Consumes: `normalizeContent` from `src/lib/landing/content.ts`, `formatStartsOn` from `src/lib/emails/landing-registration.ts`, `landing_batch_state`, `modules`, `landing_registrations`.
- Produces: `type OpenLiveBatch = { courseId: string; slug: string; title: string; startsOn: string; href: string }` where `href = "/e/" + slug + "?src=website"` and `startsOn` is `formatStartsOn(settings.batchStartsOn)` (empty string when unset).
- Produces: `getOpenLiveBatches(): Promise<Map<string, OpenLiveBatch>>` keyed by `courseId`, covering every course with a qualifying main page; and `getOpenLiveBatch(courseId: string): Promise<OpenLiveBatch | null>`. Both never throw: on any error return an empty map or null and `console.warn` (the website must still render).
- Pure helper (exported for tests): `isBatchOpen(args: { status: string; hasPublished: boolean; enabled: boolean; modes: string[]; capacity: number; taken: number; finished: boolean }): boolean`.

- [ ] **Step 1: Write failing tests:** `isBatchOpen` is true for the happy case; false for each of: status `draft`, status `closed`, no published copy, registration disabled, recorded-only modes, `capacity 10` with `taken 10`, finished; true for `capacity 0` with `taken 500`. `getOpenLiveBatches` with a memory store: returns one entry for a qualifying main page, ignores a non-main page of the same course, ignores a page whose whole-course `landing_batch_state` row exists, treats "every module finished" as finished, excludes `is_test` registrations from `taken`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** with three batched reads (main pages, registration counts for those pages, batch state and module ids for those courses), not one query per course.
- [ ] **Step 4: Run; tsc; lint.**
- [ ] **Step 5: Commit** `feat: read open live batches for the website`.

### Task 6: Website banner, card tag and home page strip

**Files:**
- Modify: `src/app/courses/[slug]/page.tsx` (banner at top of `<main>`, before the hero `<section className="mb-12">`), `src/app/courses/page.tsx`, `src/app/workshops/page.tsx`, `src/app/webinars/page.tsx` (merge open batches into cards), `src/components/marketing/CourseCard.tsx` (tag), `src/components/marketing/CourseCatalogGrid.tsx` (pass data through), `src/lib/data/lms.ts` (`CourseCard` type gets optional `liveBatch?: { startsOn: string; href: string }`; keep `getPublishedCourses` unchanged), `src/app/page.tsx` (open-batch strip near the featured grid, about line 195)
- Create: `src/components/marketing/LiveBatchBanner.tsx`
- Test: `tests/live-batch-website.test.tsx`

**Interfaces:**
- Consumes: `getOpenLiveBatches()` and `getOpenLiveBatch(courseId)` from Task 5.
- Produces: `LiveBatchBanner({ title, startsOn, href }: { title: string; startsOn: string; href: string })` renders "Live batch open", "Starts {startsOn}" only when non-empty, and a link button "Register for live" to `href`.
- Produces: `CourseCard` shows a small "Live batch open" tag (top-right corner, mirroring the type badge) when `course.liveBatch` is set.
- Home page strip lists up to 3 open batches (course title, start date, "Register for live"); renders nothing when there are none.

- [ ] **Step 1: Check Stitch** for a banner or tag screen; if found match it, otherwise follow Global Constraints.
- [ ] **Step 2: Write failing tests:** banner renders title, date and the exact `href`; date line omitted when `startsOn` is empty; `CourseCard` shows the tag only with `liveBatch`; catalog grid passes `liveBatch` through; home strip renders nothing for an empty map.
- [ ] **Step 3: Run; expect FAIL.**
- [ ] **Step 4: Implement.** Pages call the reader once and attach `liveBatch` to the matching card by `course.id`. The detail page calls `getOpenLiveBatch(course.id)`. Signed-in and already-enrolled visitors still see the banner.
- [ ] **Step 5: Run new tests plus `marketing.test.ts` and existing course page tests; tsc; lint.**
- [ ] **Step 6: Commit** `feat: show open live batch on the website`.

### Task 7: Tag registrations that came from the website

**Files:**
- Modify: `src/lib/landing/registration/utm.ts` (`UTM_KEYS`), `src/components/landing/registration/attribution.ts` (the duplicate key list that copies query keys into `pz_utm`)
- Test: `tests/landing-attribution.test.ts` (or the existing attribution/utm tests; find them with grep for `UTM_KEYS`)

**Interfaces:**
- Produces: `"src"` added to both key lists, so `?src=website` is stored in `pz_utm`, sent on funnel events and registrations, kept by `cleanUtm`, and shown in the admin registration detail (`Object.entries(lead.utm)`) with no schema change.

- [ ] **Step 1: Write failing tests:** `captureAttribution("?src=website", ...)` stores `src: "website"` in the session utm; `cleanUtm({ src: "website" })` keeps it; with `?ref=agent-one&src=website` the agent ref is stored exactly as before; a later visit with only `?src=website` does not remove a stored ref.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Add `"src"` to both lists.** Update any existing test asserting the exact key list.
- [ ] **Step 4: Run attribution, funnel and register-route tests; tsc; lint.**
- [ ] **Step 5: Commit** `feat: tag landing registrations that came from the website`.

### Task 8: Owner can see double purchases

**Files:**
- Modify: `src/lib/data/admin-enrollments.ts` (`listEnrollmentsForReview`), the admin enrollments review view under `src/app/dashboard/admin/enrollments/` (read it first to find the row component)
- Test: `tests/admin-enrollments-double.test.ts`

**Interfaces:**
- Produces: each review row gets `alsoPaidViaLanding: boolean`, true when the enrollment has a `payment_screenshot_url` (website payment) AND the same student has a `landing_registrations` row for a page with the same `course_id` and `status` in (`paid`, `free`), `is_test = false`. Row shows a small badge "Also paid on a landing page" so the owner can check for a double charge. No change to enrollment creation (it already merges into one row).

- [ ] **Step 1: Write failing tests:** true for the described case; false when the landing row is `pending`, `is_test`, a different course, or the enrollment has no screenshot.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** with one batched query for the students on the page, not per row. Add the badge to the row component.
- [ ] **Step 4: Run new test plus existing admin enrollment tests; tsc; lint.**
- [ ] **Step 5: Commit** `feat: flag students who paid on both the website and a landing page`.

### Task 9: Confirm recorded-only landing pages

**Files:**
- Inspect: `src/components/admin/landing/registration/RegistrationSetup.tsx` (Recorded Pricing step), `src/lib/landing/registration/pricing.ts` line 70, `card-price.ts` line 50
- Test: `tests/landing-recorded-only.test.ts`

**Interfaces:**
- Consumes: `computeQuote`, `normalizeRegistration` (find exact exported names by reading `pricing.ts` and `config.ts`).

- [ ] **Step 1: Write tests** against a config with `modes: ["recorded"]`: `computeQuote` for mode `"recorded"` returns a price; mode `"live"` returns `mode_not_offered`; the card price uses the recorded price; the mode choice label is hidden (one mode only); readiness (`computeReadiness`) has no blocking problem for a complete recorded-only page.
- [ ] **Step 2: Run.** If all pass, the model is confirmed: commit the test only. If any fail, fix the smallest thing (including the admin step if it hides recorded prices when live is off) and re-run.
- [ ] **Step 3: Open the editor in the browser** (dev server on port 3000, owner's test page only, never send anything) and confirm a recorded-only draft shows only recorded options and prices in the preview. Report what you saw.
- [ ] **Step 4: Commit** `test: recorded-only landing pages`.

### Task 10: Diabetes Batch 1 and end-to-end check

**Files:**
- Create: `docs/superpowers/plans/2026-10-22-website-landing-connection-owner-steps.md` (short, plain-language, for the owner)

- [ ] **Step 1: Write owner steps:** (a) paste `0084` in the Supabase SQL editor; (b) after deploy, open Admin > Landing pages > Diabetes Batch 1, pick course "Diabetes Management Course – Dr Christine", tick "Main page" only if the owner wants a website banner now (the course is marked draft but published: ask first); (c) tell the 3 paid Batch 1 buyers to log in with their registration email; note access opens fully only after the batch/modules are marked finished (paid live buyers get `portal_open` false until then); (d) PPC Batch 3: pick the PPC course, set the batch start date, tick Main page.
- [ ] **Step 2: Verify read-only** after the owner pastes the migration: Supabase `execute_sql` selecting `slug, course_id, is_main_page` from `landing_pages`, and confirm the unique index exists.
- [ ] **Step 3: Browser check on the dev server** (owner's rows only): tick PPC Batch 3 as main in a draft-safe way, load `/courses/ppc`, `/courses`, `/` and confirm banner, tag and strip; close the page and confirm they disappear. Restore the original state and report.
- [ ] **Step 4: Full test run in the background** (3-4 minutes); expect only the known failing tests.
- [ ] **Step 5: Commit** the owner steps `docs: owner steps for website and landing connection`.

## Self-review notes

- Spec coverage: item 1 Tasks 1, 3, 4; item 2 Tasks 5, 6; item 3 Task 5; item 4 Task 2; item 5 Task 7; item 6 Task 10; item 7 Task 8; item 8 Task 9. Non-goals respected (no batch table, no price sync, no in-website live form, recorded purchase flow untouched).
- Login linking already triggers enrollment sync for paid rows (`link-student.ts`), so no new trigger is needed.
- Website pages are dynamic, so no revalidation wiring is added.
