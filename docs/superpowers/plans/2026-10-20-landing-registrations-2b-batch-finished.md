# Landing Registrations Plan 2b: Batch finished, portal links, module links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can press Batch finished (per page, per module or whole course) to open the portal for Paid Live students and email them the link; send the portal link on demand; link page options to course modules; see email history and access state on a registration; students see "portal opens after your batch" and a bell when it opens.

**Architecture:** Module-level opening is stored explicitly in a new table `enrollment_open_modules` (owner ruling A: pressing Batch finished for Module 1 opens only Module 1 for a whole-course Live buyer). `_module_open_for` requires an open row for Live enrollments only; Recorded, legacy and non-landing enrollments are unchanged. `landing_batch_state` stays the owner's record of presses; sync and the Batch finished action both compute "covered modules that are finished" and write open rows, then flip `portal_open`. `landing_email_log` gets a surrogate id so portal links can repeat; status emails keep their once-per-status guarantee through a partial unique index.

**Tech Stack:** Next.js App Router, Supabase (owner pastes SQL), Brevo via `sendTransactionalEmail`, vitest, zod.

**Spec:** `docs/superpowers/specs/2026-10-19-landing-registrations-phase3-design.md` (Part 2, Data model, Access rules, "Calls made", rulings 1 and 3). Plan 2a for context: `docs/superpowers/plans/2026-10-19-landing-registrations-2a-emails-access.md`.

## Global Constraints

- Branch `landing-batch-2b`, cut from origin/main b1531e0. Never push or merge to main without the owner's yes. Leave untracked `docs/lead-capture-go-live-guide.md` alone. `gh` not logged in: give the owner the PR URL.
- `npm run` is broken: `node node_modules/typescript/bin/tsc --noEmit` (baseline 0, ignore `.next/types` noise); `node node_modules/vitest/vitest.mjs run tests/<file>`. Never `next build` while dev runs. Known failing, not ours: `tests/pz-tokens.test.ts`, `tests/landing-route-hardening*`.
- Never regenerate `database.types.ts`; hand-add the new tables/columns. Supabase MCP is read-only: migrations are files the owner pastes. A migration smoke test uses the "results as one red error box" style of `supabase/tests/0075_access_smoke_visible.sql` (the SQL editor hides notices and shows only the last statement).
- Visible text for non-technical users: say "link", "country", "module"; never "variant", "override", "resolve", "schema", "YAML".
- UI rule: never improvise UI. Port from Stitch project `4651274386787527431` ("PZ Academy Platform 2"). Every UI task below is **BLOCKED until the owner supplies the Stitch screen**; backend tasks are not.
- Batch finished, Email portal link, module linking: admin and super_admin only (`requireAdmin()`). Sales agents never reach them. Server-side check on every route.
- Test registrations (`is_test`) are never opened and never emailed by these actions.
- Never `git commit --amend`. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Brand fonts in `src/lib/emails/landing-registration.ts` (Inter/Montserrat) stay as they are.

## Review Focus

1. Live whole-course buyer, only Module 1 finished: lessons of Module 2 must stay unreadable (RLS, `complete_lesson`, `submit_quiz_attempt`). Pinned in Task 1 smoke test.
2. A 2a Live student whose portal is already open must not lose access when Task 1 lands (backfill). Pinned in Task 1.
3. Pressing Batch finished twice emails nobody the second time. Task 3.
4. A group member with no account yet: skipped and counted, never an error; opened later when they sign up (sync). Task 3, Task 4.
5. Paid changed back to Pending closes the portal; Paid again after the batch finished reopens it with no manual step. Task 2.
6. One email fails mid-batch: the screen reports the real counts, and pressing again sends only the rest. Task 3.
7. Two admins press at once: no duplicate rows, no double emails. Task 3.
8. A module added to the course after the whole course was marked finished stays closed until pressed. Task 2.

## File Structure

- `supabase/migrations/0076_landing_batch_access.sql` (new), `supabase/tests/0076_batch_access_smoke.sql` (new): table, gate, backfill, email log change, bell trigger.
- `src/lib/landing/registration/access-rules.ts`: `AccessInput.batchFinished` becomes `finishedModuleIds`; `DesiredEnrollment` gains `openModuleIds`.
- `src/lib/data/landing-enrollment.ts`: `finishedModuleIds()` replaces `isBatchFinished`; sync writes open rows.
- `src/lib/data/landing-batch.ts` (new): `finishBatch`, `emailPortalLinks`, `getBatchOverview`.
- `src/lib/data/landing-email-log.ts`: claim/sent states, `sweepStaleClaims`, `logPortalLink`.
- `src/lib/emails/landing-registration.ts`: `buildPortalLinkEmail`.
- `src/lib/landing/registration/config.ts`, `public-config.ts`: uuid fix, strip `moduleIds` publicly, validate module ownership on save.
- `src/lib/data/landing-registration-admin.ts`: detail gains `emails` and `access`.
- `src/lib/data/landing-jobs.ts`: drain order, stale sweep call.
- `src/app/api/admin/landing/batch/route.ts`, `.../portal-links/route.ts`, `src/lib/validations/landing-batch.ts` (new).
- Student: `src/app/portal/[slug]/page.tsx`, `src/app/courses/[slug]/page.tsx`, `src/components/lms/EnrollmentStatusScreen.tsx`.
- Admin UI (blocked on Stitch): batch screen, module linking in `RegistrationSetup.tsx`, `RegistrationDetailView.tsx`.

---

### Task 1: Migration 0076 and smoke test

**Files:**
- Create: `supabase/migrations/0076_landing_batch_access.sql`, `supabase/tests/0076_batch_access_smoke.sql`
- Modify: `src/lib/supabase/database.types.ts` (hand-add)

**Interfaces:**
- Produces: table `enrollment_open_modules(enrollment_id uuid, module_id uuid, opened_at timestamptz, pk(enrollment_id, module_id))`, RLS select for the owning student and admins, no write policies. `landing_email_log` columns: `id uuid pk default gen_random_uuid()`, `registration_id`, `kind`, `to_email`, `sent_at`, `state text not null default 'sent' check in ('claimed','sent')`, `claimed_at timestamptz not null default now()`. Partial unique index on `(registration_id, kind)` where `kind in ('paid','underpaid','reserved')`. Bell: `enrollments` trigger inserting a `notifications` row when `portal_open` goes false to true on an active enrollment.

- [ ] **Step 1:** Write the migration (idempotent, safe to run twice): (a) create `enrollment_open_modules` with RLS like `enrollment_modules`; (b) `landing_email_log`: add `id`, drop the old primary key, make `id` the primary key, add `state`/`claimed_at`, create the partial unique index; (c) replace `_module_open_for` so that for an enrollment with `access_level = 'live'` the module must also have a row in `enrollment_open_modules`; every other enrollment is gated exactly as today; (d) backfill: for every enrollment with `access_level = 'live'` and `portal_open = true`, insert an open row for each covered module (its `enrollment_modules` rows, or all modules of the course when it has none); (f) expand every existing `landing_batch_state` row with `module_id` null into one row per module of that page's course (skip pages without a course), keeping the null row; (e) a bell trigger function (security definer) creating a notification titled "Your portal is open" with link `/portal/<course slug>` when an active enrollment flips `portal_open` false to true. Check `supabase/migrations/0002*.sql` and 0015 for the notification `type` allowed values and reuse an existing type if no new one is allowed, otherwise add one in this migration.
- [ ] **Step 2:** Write `supabase/tests/0076_batch_access_smoke.sql` in the one-red-box style (create temp table, DO blocks insert results, final DO raises the joined text; no begin/rollback). Cases, each PASS/FAIL: Live whole-course enrollment, no open rows: every module closed; one open row for module A: A open and B closed; recorded enrollment with no open rows: all open; a Live enrollment backfilled by (d) keeps its modules open; `portal_open` flip inserts one notification; status-kind duplicate `(registration, 'paid')` fails but two `portal_link` rows succeed.
- [ ] **Step 3:** Hand-add `enrollment_open_modules` and the new `landing_email_log` columns to `database.types.ts`. Run `node node_modules/typescript/bin/tsc --noEmit`; expected baseline 0.
- [ ] **Step 4:** Commit `feat: migration 0076 per-module live access, email log repeats`. **STOP and tell the owner to paste 0076 then run the smoke test** (and say all PASS before Task 2 runs against the live database). Tasks 2+ unit tests mock the database and can proceed in parallel.

### Task 2: Access rules and sync write open modules

**Files:** Modify `src/lib/landing/registration/access-rules.ts`, `src/lib/data/landing-enrollment.ts`; Test `tests/landing-access-rules.test.ts`, `tests/landing-enrollment.test.ts`.

**Interfaces:**
- Produces: `AccessInput.finishedModuleIds: string[]` (modules this buyer covers that the owner has marked finished; for a whole-course buyer this is finished-set intersected with all course modules); `DesiredEnrollment.openModuleIds: string[]`; `portalOpen = mode === "recorded" || openModuleIds.length > 0`. `finishedModuleIds(pageId: string, courseId: string, coveredModuleIds: string[]): Promise<string[]>` in `landing-enrollment.ts` (a `landing_batch_state` row with `module_id` null means every module of the course that exists now; `coveredModuleIds` empty means all course modules). `isBatchFinished` is removed.

- [ ] **Step 1: Tests.** `desiredEnrollment` cases: live paid, no finished modules, portalOpen false and openModuleIds []; live paid, module A finished, portalOpen true, openModuleIds [A]; recorded paid, portalOpen true; revert and skip unchanged. `finishedModuleIds`: whole-course row gives all course modules; module row gives only that module covered by the buyer; a module added after a whole-course press is NOT finished (focus 8: whole-course rows expand to modules at read time, so the test fixes "course has M3 now" and expects M3 included. Decision: a whole-course press means "everything the course has at the time of the press"; store it by also inserting one `landing_batch_state` row per module at press time in Task 3, and treat the null row as the page-wide marker only for display. So `finishedModuleIds` reads per-module rows only).
- [ ] **Step 2:** Update `resolveAccess` to compute `finishedModuleIds` and pass it. Extend `syncEnrollmentForRegistration`: for a Live grant, after enrollment_modules are settled and BEFORE `portal_open` is set true, insert missing `enrollment_open_modules` rows for `openModuleIds` (ignore duplicates); `unlockFirstLessons` for the modules newly opened on an already-open enrollment (the DB trigger covers the closed-to-open flip only). Revert path unchanged (closing `portal_open` is enough; leaving open rows is harmless and makes re-Paid reopen). Recorded enrollments never get open rows.
- [ ] **Step 3:** Tests in `tests/landing-enrollment.test.ts`: new Live Paid with module A finished inserts exactly one open row and sets portal_open; Paid then Pending then Paid reopens with the rows intact; Live Paid with nothing finished inserts no rows and keeps portal_open false; a second sync is a no-op ("no-change").
- [ ] **Step 4:** Run both test files, tsc. Commit `feat: sync opens only finished modules for live buyers`.

### Task 3: Batch finished and portal link actions (data layer)

**Files:** Create `src/lib/data/landing-batch.ts`; Modify `src/lib/data/landing-email-log.ts`, `src/lib/emails/landing-registration.ts`; Test `tests/landing-batch.test.ts`, `tests/landing-email-log.test.ts`.

**Interfaces:**
- Consumes: `syncEnrollmentForRegistration`, `resolveAccess` (Task 2), `sendTransactionalEmail`.
- Produces:
  - `finishBatch(p: { pageId: string; moduleId: string | null; adminId: string }): Promise<BatchResult>`
  - `emailPortalLinks(p: { pageId: string; audience: "live" | "recorded" | "both"; adminId: string }): Promise<LinkResult>`
  - `BatchResult = { modulesFinished: number; opened: number; emailed: number; alreadyOpen: number; waitingForAccount: number; failed: number }`
  - `LinkResult = { sent: number; notOpenYet: number; waitingForAccount: number; failed: number }`
  - `getBatchOverview(pageId: string): Promise<{ courseTitle: string | null; modules: { id: string; title: string; finishedAt: string | null; paidLive: number; opened: number }[]; recordedPaid: number }>`
  - email log: `claimEmail` inserts `state='claimed'`; new `markEmailSent(registrationId, kind)`; new `logPortalLink(registrationId, toEmail)` (inserts a `sent` row, no guard); `listEmailLog` returns only `sent` rows plus `state`; `buildPortalLinkEmail(ctx: LandingEmailContext & { portalUrl: string; moduleTitles?: string[] }): BuiltEmail` in the style of `buildPaidEmail` (copy is yours to write in the existing tone; mention which modules opened when given).

- [ ] **Step 1: Tests (`landing-batch.test.ts`, database mocked like `landing-enrollment.test.ts`).** `finishBatch` whole course (moduleId null): upserts one batch_state row per module of the course plus the null marker; `finishBatch` for module A: only A; paid live participants whose coverage includes the module get synced and one `portal_link` email each; a second identical press returns `opened: 0, emailed: 0, alreadyOpen: n`; a member with no account counts in `waitingForAccount`, no email; test rows skipped; Recorded buyers and non-Paid skipped; one failing send: `failed: 1`, others counted, and a re-press emails only the failed one; paid on a page with no course returns zero counts. `emailPortalLinks` "live": only Paid Live with an open portal get mail, Live with closed portal counted `notOpenYet`; "recorded" ; "both"; each send logged via `logPortalLink`.
- [ ] **Step 2:** Implement `finishBatch`: verify page has a course; upsert batch_state rows (idempotent via the existing unique indexes, `finished_by = adminId`); load Paid, non-test registration rows of the page (lead and member rows; `mode` and option keys come from the lead, use `resolveAccess` per row); only rows whose desired Live coverage includes the pressed module(s); compare open rows before and after `syncEnrollmentForRegistration` to decide "newly opened"; email only those, newly opened, with a per-participant try/catch, concurrency of 5. A participant whose email failed gets no `portal_link` log row, so a re-press finds their open rows already written and must still email them: track "needs link" as *open row newer than the last `portal_link` log row for this registration* rather than "newly opened this call". Serialize concurrent presses per page with a unique-violation-safe upsert only (no locks); the email decision above makes a double press safe.
- [ ] **Step 3:** Implement `emailPortalLinks`, `getBatchOverview`, the `landing-email-log.ts` changes, `buildPortalLinkEmail` (+ a snapshot-free assertion test: contains the portal URL and the student's name).
- [ ] **Step 4:** Update the 2a status-email path to call `markEmailSent` after a successful send, keeping `releaseEmail` on failure. Run `landing-job-handlers` and `landing-email-log` tests.
- [ ] **Step 5:** tsc, commit `feat: batch finished and portal link sending`.

### Task 4: Admin routes

**Files:** Create `src/app/api/admin/landing/batch/route.ts`, `src/app/api/admin/landing/portal-links/route.ts`, `src/lib/validations/landing-batch.ts`; Test `tests/landing-batch-routes.test.ts`.

**Interfaces:** `POST /api/admin/landing/batch` body `{ pageId: uuid, moduleId: uuid | null }` returns `BatchResult`. `POST /api/admin/landing/portal-links` body `{ pageId: uuid, audience: "live" | "recorded" | "both" }` returns `LinkResult`. `GET /api/admin/landing/batch?pageId=` returns `getBatchOverview`. Each starts with `requireAdmin()`, returns 400 `{ error: "Invalid input" }` on bad body (pattern: `src/app/api/admin/registrations/[id]/route.ts`), `export const maxDuration = 60` on the two POSTs.

- [ ] **Step 1:** Tests: unauthenticated and sales_agent get 401/403 and the data layer is never called; bad uuid gets 400; success passes `adminId` from the session; the response body is the result object.
- [ ] **Step 2:** Implement routes and zod schemas. Step 3: run tests, tsc, commit `feat: admin routes for batch finished and portal links`.

### Task 5: Module links in config

**Files:** Modify `src/lib/landing/registration/config.ts` (line 115-117 normalizer), `src/lib/landing/registration/public-config.ts`, the registration config save route/data function (find with grep `registration` in `src/lib/data/landing-pages.ts` and its API route); Test `tests/landing-registration-config.test.ts` (existing config tests) and `tests/landing-public-config.test.ts`.

- [ ] **Step 1: Tests.** `uuidList` rejects a string the regex accepts but zod `.uuid()` rejects (for example version nibble 0: `00000000-0000-0000-0000-000000000000` style values with an invalid version) and keeps real v4 ids; `toPublicRegistration` output options have no `moduleIds`; saving a config whose option `moduleIds` includes a module of a different course (or a page with no course) is rejected with a plain message ("Pick modules from this page's course.").
- [ ] **Step 2:** Replace the `UUID_RE` test with `z.string().uuid().safeParse(x).success`. Strip `moduleIds` in `toPublicRegistration`. In the save path, load the page's course modules and reject unknown ids. Step 3: tests, tsc, commit `fix: module ids validated; hidden from public config`.

### Task 6: Registration detail: email history and access state

**Files:** Modify `src/lib/data/landing-registration-admin.ts` (`RegistrationDetail`, `getRegistrationDetail`); Test `tests/landing-registration-admin.test.ts`.

**Interfaces:** `RegistrationDetail` gains `emails: { kind: "paid"|"underpaid"|"reserved"|"portal_link"; toEmail: string; sentAt: string }[]` (lead and members, newest first) and `access: { mode: "live"|"recorded"; hasAccount: boolean; enrollmentStatus: string | null; portalOpen: boolean | null; modules: { id: string; title: string; open: boolean }[] | null }` (modules null = whole course; "No course on this page" case returns `enrollmentStatus: null`). Agent scope sees `access` but never `emails` is out of scope for agents: return `emails: []` for `scope.kind === "agent"`.

- [ ] **Step 1:** Tests for the three shapes (admin with enrollment, guest without account, agent scope hides emails). Step 2: implement with existing helpers (`listEmailLog`, the enrollment and open-module tables). Step 3: tests, tsc, commit `feat: registration detail email history and access state`.

### Task 7: Jobs: order and stale email claims

**Files:** Modify `src/lib/data/landing-jobs.ts`, `src/lib/data/landing-email-log.ts`; Test `tests/landing-jobs.test.ts`, `tests/landing-email-log.test.ts`.

**Interfaces:** `sweepStaleClaims(olderThanMinutes = 15): Promise<{ released: number }>` deletes `state = 'claimed'` rows older than the cutoff and re-enqueues `email_status` for each affected registration (`enqueueStatusEffects`-style upsert, only `email_status`). `drainDueJobs` calls it first and sorts each fetched batch by `JOB_TYPES` order before running.

- [ ] **Step 1: Tests.** A claimed row 16 minutes old is released and its registration gets an `email_status` job; a claimed row 2 minutes old is untouched; a `sent` row never; drain runs `enrollment_sync` before `email_status` for the same registration even when `next_run_at` orders them the other way. Step 2: implement. Step 3: tests, tsc, commit `fix: stale email claims released; drain respects job order`.

### Task 8: Student side: closed portal and bell link

**Files:** Modify `src/app/portal/[slug]/page.tsx`, `src/app/courses/[slug]/page.tsx` (line ~311 CTA), `src/components/lms/EnrollmentStatusScreen.tsx`; Test `tests/portal-open-flag.test.ts`. **BLOCKED on Stitch screen S4** (see Stitch list).

- [ ] **Step 1: Tests.** Active enrollment with `portal_open = false` on `/portal/[slug]` renders the status screen variant `portal_closed` and does NOT redirect to `/courses`; `/courses/[slug]` for the same student shows the "portal opens after your batch" state and no "Enroll" button; an open portal still redirects to the lesson. Step 2: implement per the screen. Visible text: "Your portal opens after your batch." plus the course title; no mention of enrollment states. Step 3: tests, tsc, commit.

### Tasks 9 to 11 (UI, each BLOCKED on its Stitch screen)

- [ ] **Task 9: Batch screen** (S1): page picker, module list from `getBatchOverview`, per module and whole-course "Batch finished" buttons with a confirm step that states how many students will be emailed, result summary from `BatchResult`; an "Email portal link" panel (Live, Recorded, Both) showing `LinkResult`. Placement and route per the screen; link from the Page registrations tab. Component tests: confirm required before the POST; counts shown; a failed send count shown in plain words.
- [ ] **Task 10: Link options to modules** (S2) in `RegistrationSetup.tsx`: per option, tick modules of the page's course; empty = "Whole course". Saves `option.moduleIds` through the Task 5 save path.
- [ ] **Task 11: Detail additions** (S3) in `RegistrationDetailView.tsx`: email history list and access card from `RegistrationDetail`.

---

## Out of scope (named so nothing is silently dropped)

- Module-only buyers never reaching 100% progress (certificates), and Brevo timeout-after-accept resend: separate fixes.
- Editable email text, Participants sheet, sheet sync, Meta, payment accounts: Plans 3 to 6.
- Reusing one page for two batches (a batch marker): still open.

## Self-review notes

- Spec Part 2 Batch finished, Email portal link, module linking, detail additions, bell, dead end, stale claim sweep, UUID fix, public strip, drain order: Tasks 1 to 11. Rulings 1 and 3: Task 2 (re-Paid reopens; later Paid after finish opens at once).
- Names used across tasks: `finishedModuleIds`, `openModuleIds`, `enrollment_open_modules`, `BatchResult`, `LinkResult`, `getBatchOverview`, `sweepStaleClaims`, `logPortalLink`, `markEmailSent` match.
- Whole-course press writes one `landing_batch_state` row per module (and the null marker). Existing 2a rows with only a null marker: Task 1 migration also expands each null marker into per-module rows for the page's course so 2a state stays valid.
