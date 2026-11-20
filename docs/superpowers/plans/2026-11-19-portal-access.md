# Portal access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each registration batch its own portal (a copy of an older course), grouped under a course name, with a "Portal access" screen inside each campaign that can copy a portal and move that batch's students into it.

**Architecture:** A portal is a `courses` row. A new `course_families` table plus `courses.family_id` / `courses.batch_label` group portals. Two service-role-only SQL functions (`duplicate_course`, `move_batch_students`) do the copy and the move in one transaction. Server data helpers in `src/lib/data/portals.ts` call them behind admin-guarded API routes. A new page `campaign/[pageId]/portal` holds the UI and reuses the existing batch actions (open modules, email link, save to CRM) with the registration picker removed.

**Tech Stack:** Next.js 14.2.5 App Router, Supabase (service role via `createAdminSupabase()`), zod, vitest + Testing Library, Radix dialog (`@/components/ui/dialog`).

**Spec:** `docs/superpowers/specs/2026-11-19-portal-access-design.md`. Stitch (project 13117286791417011091): "Portal Access - Admin (Mobile 390px)", "Portal access - PPC Batch 3 (Desktop 1440px)". Use them for LAYOUT only. Do NOT copy the invented PC extras: the "Cohort protocol" card, the "Student synchronization" title, the modules/videos/cases strip, "Sync Active", the "Last sync" line, the sample dates. The Duplicate dialog and the Move confirm dialog are not drawn: build them from the spec text.

## Global Constraints

- Branch `portal-access` (from main). Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage files by path only. Never push.
- Migration file `supabase/migrations/0119_portal_access.sql`, safe to re-run. The owner pastes it by hand. Nobody runs it from tooling.
- New tables are service-role only: RLS on, zero policies (CLAUDE.md). Functions are `security definer`, `set search_path = public, pg_temp`, and `revoke all ... from public, anon, authenticated`.
- Never regenerate `src/lib/supabase/database.types.ts`: hand-add the `course_families` table, the two new `courses` columns, and both `Functions` entries.
- Wording: short plain words, calm, no exclamation marks, no sales words. Phone-first at 390px, no sideways scroll; PC at 1440px. Buttons at least 44px high on phone (`max-md:min-h-11`).
- Colours: backgrounds and borders use `pz-primary` / `pz-surface-container-*` / `pz-solid-*`; `pz-deep`, `pz-mid`, `pz-danger` are text only. The Classes `ds.ts` is NOT on this branch; use the existing admin look (see `BatchAccessPanel.tsx` classes).
- No `eslint-disable` for `@typescript-eslint`. Source files often use CRLF: when editing with python write UTF-8 with `newline=""`.
- Run tools directly: `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/typescript/bin/tsc --noEmit` (0 errors), `node node_modules/eslint/bin/eslint.js <paths>`.
- Write tests first and show RED then GREEN. Dialog behaviour (Escape closes, focus returns to the opener) must be checked in review.
- Never email anyone, never write to the live database, never commit student data.

## Review Focus

- A student enrolled in the target portal already: skipped and counted as "already in this portal", never an error. (Task 1 regex test + Task 2 test.)
- Moving twice: the second run finds nothing to move and changes nothing. (Task 1, Task 2.)
- A student in two batches of the same course: only enrollments whose `landing_registration_id` belongs to THIS page move; another batch's enrollment never moves. (Task 1.)
- Duplicating when the new name makes a slug that already exists: still succeeds with a unique slug; empty name rejected. (Task 1, Task 2.)
- Moving to the course the page already uses, or to a course with no modules, or a page with no portal: clear refusal, nothing changes. (Task 1, Task 2, Task 3.)

---

### Task 1: Migration 0119 and types

**Files:**
- Create: `supabase/migrations/0119_portal_access.sql`
- Create: `tests/portal-access-0119-migration.test.ts`
- Modify: `src/lib/supabase/database.types.ts` (hand-add only)

**Interfaces:**
- Produces (SQL): table `course_families(id uuid pk, name text unique not null, created_at)`; `courses.family_id uuid null references course_families(id) on delete set null`; `courses.batch_label text null`;
  `public.duplicate_course(p_source uuid, p_title text, p_family uuid, p_batch_label text) returns uuid`;
  `public.move_batch_students(p_page uuid, p_to_course uuid, p_dry_run boolean) returns jsonb` with keys `to_move int`, `already_there int`, `unmatched_modules int`, `moved int`.

- [ ] **Step 1: Write the failing migration test** (style: `tests/audience-status-0117-migration.test.ts`, read the file with `readFileSync`, assert with regexes). Tests: `creates course_families with unique name and RLS on and no policy`; `adds family_id and batch_label to courses`; `duplicate_course is security definer with the exact signature and revoked from public, anon, authenticated`; `duplicate_course copies modules, lessons, quiz_questions and module_notes but not enrollments, lesson_progress or quiz_attempts` (assert it inserts into those four tables and does not mention the other three); `duplicate_course creates the course unpublished` (matches `'draft'` and `is_published`... false); `move_batch_students filters enrollments by landing_registration_id of the page's registrations`; `move_batch_students skips a student who already has an enrollment in the target course`; `move_batch_students remaps enrollment_open_modules, enrollment_modules and landing_batch_state and repoints landing_pages.course_id`; `a dry run writes nothing` (every `update`/`insert`/`delete` sits after an `if not p_dry_run` guard); `refuses when the page already uses the target course`.
- [ ] **Step 2: Run it, expect FAIL** (file missing).
- [ ] **Step 3: Write `0119_portal_access.sql`.** Read-only check first: list the live `courses`, `modules`, `lessons` columns with a SELECT on `information_schema.columns`, and compare with migrations 0001, 0009, 0012, 0016, 0019, 0020, 0022, 0023, 0024, 0085, 0101, 0102. `duplicate_course`: insert the new course copying every content column from the source EXCEPT `id`, `slug`, `title`, `status`, `is_published`, `created_at`, `created_by`, `family_id`, `batch_label` and any unique or sheet-sync column (for example `sheet_id`); status `'draft'`, `is_published` false. Slug = slugified title, with `-2`, `-3` appended in a loop until unused; empty or blank title raises. Copy modules (keep `order_index`), `module_notes`, lessons (all content columns including `video_url_2`, `resource_urls`, `pdf_file_id`, `documents`) and `quiz_questions`, mapping old to new ids with a temp mapping. `move_batch_students`: module map = same rank by `(order_index, id)` within the old and new course; `to_move` = enrollments on the page's current course linked (`landing_registration_id`) to this page's `landing_registrations` whose student has no enrollment in the target; `already_there` = linked enrollments already on the target plus those skipped for a conflict; `unmatched_modules` = old modules with no counterpart. When not a dry run: update `enrollments.course_id`, remap `enrollment_open_modules` and `enrollment_modules`, remap and delete unmatched `landing_batch_state` rows for the page, set `landing_pages.course_id`, return `moved`. Raise if the page has no course, the target equals the current course, or the target has no modules.
- [ ] **Step 4: Run the test, expect PASS.**
- [ ] **Step 5: Hand-add types** in `database.types.ts` (Tables `course_families`, `courses` Row/Insert/Update `family_id` and `batch_label`, `Functions` `duplicate_course` and `move_batch_students`). Run `tsc --noEmit`, expect 0 errors.
- [ ] **Step 6: Commit** `feat(portal): migration 0119 portal families, duplicate and move` (stage the three files by path).

---

### Task 2: Data helpers and API routes

**Files:**
- Create: `src/lib/validations/landing-portal.ts`, `src/lib/data/portals.ts`
- Create: `src/app/api/admin/landing/portal/route.ts` (GET overview), `.../portal/duplicate/route.ts`, `.../portal/move/route.ts` (GET preview, POST move), `.../portal/attach/route.ts`, `.../portal/group/route.ts`
- Test: `tests/portals-data.test.ts`, `tests/portal-routes.test.ts` (style: `tests/landing-batch.test.ts`, `tests/landing-batch-routes.test.ts`)

**Interfaces:**
- Produces in `portals.ts` (all `import "server-only"`, all throw on a database error):
  - `type PortalSummary = { id: string; title: string; slug: string; published: boolean; familyId: string | null; familyName: string | null; batchLabel: string | null }`
  - `type PortalOverview = { portal: PortalSummary | null; siblings: PortalSummary[]; families: { id: string; name: string }[]; sources: PortalSummary[] }` — `siblings` = other portals in the same family (or all ungrouped ones when the portal has no family); `sources` = every course, for "Copy from".
  - `getPortalOverview(pageId: string): Promise<PortalOverview | null>` (null = no such page)
  - `duplicatePortal(p: { pageId: string; sourceCourseId: string; title: string; familyId: string | null; newFamilyName: string | null; batchLabel: string | null }): Promise<{ courseId: string }>` (creates the family when `newFamilyName` is set, calls `duplicate_course`, then points the page at the copy)
  - `attachPortal(pageId: string, courseId: string): Promise<void>`
  - `setPortalGroup(p: { courseId: string; familyId: string | null; newFamilyName: string | null; batchLabel: string | null }): Promise<void>`
  - `type MovePreview = { toMove: number; alreadyThere: number; unmatchedModules: number }`; `previewMove(pageId: string, toCourseId: string): Promise<MovePreview>`; `moveStudents(pageId: string, toCourseId: string): Promise<{ moved: number }>`
- Routes: gate with `requireAdmin(["enrollments", "landing_pages"])` (middleware does not cover `/api`); validate with zod (ids are uuids, title 1 to 120 chars trimmed, batchLabel at most 60); return `{ error: "Something went wrong. Please try again." }` with 500 on a thrown error, `{ error: "Invalid input" }` 400; never echo database messages.

- [ ] **Step 1: Write failing tests.** Data: `getPortalOverview returns null for an unknown page`; `previewMove maps the RPC keys to toMove, alreadyThere, unmatchedModules and passes p_dry_run true`; `moveStudents calls the RPC with p_dry_run false and returns moved`; `duplicatePortal creates a family only when newFamilyName is given`; `duplicatePortal rejects a blank title before any database call`; `previewMove throws when the RPC errors`. Routes: `each route returns 401 or 403 for a non-admin`; `duplicate returns 400 for a missing sourceCourseId`; `move POST returns 500 with the plain message on an RPC error`.
- [ ] **Step 2: Run them, expect FAIL.**
- [ ] **Step 3: Implement** the schemas, helpers and routes with the signatures above. Use `createAdminSupabase()` and `.rpc("duplicate_course", ... as never)` like `landing-pages.ts` does for `landing_set_main_page`.
- [ ] **Step 4: Run tests, expect PASS; `tsc --noEmit` 0 errors; eslint on the new files clean.**
- [ ] **Step 5: Commit** `feat(portal): portal data helpers and admin routes`.

---

### Task 3: Portal access screen

**Files:**
- Create: `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/portal/page.tsx` (server, `requireAdminPage("enrollments")`, `force-dynamic`, uuid check, `notFound()`), `src/components/admin/registrations/PortalAccessScreen.tsx`, `PortalDuplicateDialog.tsx`, `PortalMoveDialog.tsx`
- Modify: `src/components/admin/registrations/BatchAccessPanel.tsx` (props become `{ pageId: string }`, remove the registration picker and its `pageOptions` state; keep every action and the audience picker)
- Test: `tests/portal-access-screen.test.tsx`; update `tests/batch-access-panel.test.tsx`

**Interfaces:**
- Consumes: Task 2 routes and the `PortalOverview` / `MovePreview` shapes.
- Produces: `PortalAccessScreen({ pageId, pageTitle, overview }: { pageId: string; pageTitle: string; overview: PortalOverview | null })`; `PortalDuplicateDialog({ open, onOpenChange, pageId, sources, families, onDone })`; `PortalMoveDialog({ open, onOpenChange, pageId, toCourseId, preview, onDone })`; `BatchAccessPanel({ pageId })`.

- [ ] **Step 1: Write failing tests.** `shows the portal name, group chip, batch chip and Not published chip`; `shows "No portal yet" with the duplicate and pick actions when overview.portal is null`; `Duplicate a portal opens the dialog and Escape closes it and returns focus to the button`; `Copy portal is disabled until a source and a name are given and posts to /api/admin/landing/portal/duplicate`; `Move students shows the count line "48 students will move", "2 already in this portal" and "1 module could not be matched"`; `Move students is disabled when nothing will move`; `the confirm dialog says progress does not carry over and posts to /api/admin/landing/portal/move only on confirm, and Cancel posts nothing`; `the group and batch label form posts to /api/admin/landing/portal/group`; `the actions panel no longer renders a registration picker`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Layout per the Stitch screens, one column on phone, two columns at `lg`: card "This batch's portal" (name, chips, "Open in Course Builder" link to `/dashboard/admin/courses/<id>`, small edit form for group and batch label), card "Change or copy portal" (select "Portals in the <group> group" that calls the attach route, lime "Duplicate a portal" button), card "Move students" (preview fetched from `GET .../portal/move?pageId&toCourseId`, one button), then `BatchAccessPanel` under the heading "Open modules and emails". Page title "Portal access", line "The course students open after paying for this batch." Breadcrumb "Registrations / <pageTitle> / Portal access". Use `@/components/ui/dialog` for both dialogs; Move confirm title "Move N students?", buttons Cancel and Move students; after success show a calm result line and refresh the preview. Calm wording only.
- [ ] **Step 4: Run both test files, expect PASS; tsc and eslint clean.**
- [ ] **Step 5: Commit** `feat(portal): Portal access screen with duplicate and move`.

---

### Task 4: Move the entry point, retire the old page

**Files:**
- Modify: `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/page.tsx` (add a "Portal access" link in the existing link row, href `${DETAIL_BASE}/campaign/${pageId}/portal`), `src/components/admin/registrations/CampaignList.tsx` and `src/app/dashboard/admin/enrollments/registrations/all/page.tsx` (remove the "Batch access" links), `src/app/dashboard/admin/enrollments/registrations/access/page.tsx` (replace with a `redirect("/dashboard/admin/enrollments/registrations")`)
- Modify: `tests/participant-campaign-list-ui.test.tsx`
- Test: add `tests/portal-access-entry.test.tsx`

- [ ] **Step 1: Failing tests.** `CampaignList has no "Batch access" link with or without campaigns` (replace the existing test at line 42); `the campaign page header links "Portal access" to .../campaign/<id>/portal` (render the link row or assert on the page source, follow the style of nearby page tests); `the old /access page redirects to the Registrations list`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the edits above. Search `src` and `tests` for any other "Batch access" or `/registrations/access` reference (`Grep`) and update each.
- [ ] **Step 4: Run these tests plus `tests/batch-access-panel.test.tsx`, expect PASS; tsc clean.**
- [ ] **Step 5: Commit** `feat(portal): Portal access lives inside each campaign`.

---

### Task 5: Programs list grouped by family

**Files:**
- Modify: `src/lib/data/admin-lms.ts` (`listPrograms` selects `family_id, batch_label` and joins `course_families`; `ProgramListRow` gains `familyName: string | null` and `batchLabel: string | null`), `src/components/admin/program/ProgramLibraryTable.tsx`
- Test: `tests/program-library-grouping.test.tsx` (and extend the existing `listPrograms` test if one exists)

- [ ] **Step 1: Failing tests.** `rows with a family render under a heading with the family name, batch label shown beside the title`; `rows without a family stay in the normal list, unchanged`; `listPrograms returns familyName and batchLabel`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Sorting stays by title inside a group; groups sorted by family name; ungrouped rows keep today's layout.
- [ ] **Step 4: Run tests, tsc, eslint, expect clean.**
- [ ] **Step 5: Commit** `feat(portal): group portals under their course name in Programs`.

---

### Task 6: Owner steps, full checks, browser check

**Files:**
- Create: `docs/superpowers/plans/2026-11-19-portal-access-owner-steps.md` (paste 0119; then in order: set the PPC group on the existing PPC course, Duplicate a portal for Batch 3, edit the copy in Course Builder, run the Move preview and read the three numbers, press Move students; each step in short plain words, with the read-only SQL the owner can run to check counts)

- [ ] **Step 1:** Run `tsc --noEmit` (0), focused tests for every file touched, eslint on changed paths, then `node node_modules/next/dist/bin/next build` once (no dev server up).
- [ ] **Step 2:** Strict-UTF-8 scan changed files (`python -I`), then start the dev server and, with the localhost admin login from memory, load `/dashboard/admin/enrollments/registrations/campaign/<pageId>/portal` at 390, 1280 and 1440 widths: no sideways scroll, both dialogs open and close with Escape. Migration 0119 is NOT live, so the data cards show the empty or error state; say so in the report. Do not click Move or Duplicate against live data.
- [ ] **Step 3:** Commit the owner-steps file. Final whole-branch review (opus) follows the build.
