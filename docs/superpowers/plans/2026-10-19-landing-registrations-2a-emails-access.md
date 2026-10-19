# Landing Registrations Plan 2a: status emails, enrollment on Paid, Live/Recorded + per-module access

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** When a registration's status changes in the app, the right status email goes out once, a Paid registration becomes a real course enrollment with the right access (Live portal closed until "Batch finished", Recorded portal open at once, single/chosen modules only), and a Paid reversal closes the portal again.

**Spec:** `docs/superpowers/specs/2026-10-19-landing-registrations-phase3-design.md` (Parts 2 and the owner rulings). Plan 1 (screen, status change, sheet push) is done on branch `landing-registrations`; this plan is cut from it on branch `landing-registrations-2a`.

**Out of scope (Plan 2b):** Batch finished button, Email portal link button, the screen that links page options to modules, any new UI (registration detail additions: email history, portal state). No UI is built in 2a, so no Stitch work. Until 2b, nothing writes `landing_batch_state` and no page option has modules, so every Paid buyer gets the whole course, Live buyers stay closed until 2b, Recorded buyers open at once.

## Decisions made while planning (builder's calls, owner can overrule)

1. **Pending email = the existing "received" email.** Going back to Pending sends nothing new (ruling: one email per registration per status; the received email already is the Pending email). Only Paid, Underpaid, Reserved get new emails.
2. **Admin alert stays as is** (sent once at submission by Phase 2). No alert on status change.
3. **Member versions:** each group member gets the same email as the lead, to their own address, with their own name, their own log row, and their own enrollment. Members' amount line reads "Covered by your group".
4. **Guests (no account):** no enrollment exists until they sign up with the same email (`linkGuestRegistrations`); the Paid email tells them "create an account with this same email address to open your course". After sign-up, linking triggers the enrollment sync.
5. **Existing enrollments:** unique (student, course). On Paid, an existing enrollment is only widened (never narrowed, never closed). On Paid reversal, only an enrollment this registration created (`landing_registration_id` set) is reverted.
6. **Test rows (`is_test`) never create enrollments** (their student_id is the admin).
7. **Notification bell:** the existing trigger says "Your first lesson is unlocked" on `active`; skipped when the portal is closed. 2b adds a "portal opened" bell when Batch finished flips it.
8. **Batch finished state** lives in `landing_batch_state` (per page, per module or whole course); 2a only reads it.

## Files

Create:
- `supabase/migrations/0075_landing_access.sql`
- `src/lib/landing/registration/access-rules.ts` (pure)
- `src/lib/data/landing-enrollment.ts` (server: sync enrollment for a registration)
- `src/lib/data/landing-email-log.ts` (server: claim/release a "sent once" row)
- `tests/landing-access-rules.test.ts`, `tests/landing-enrollment.test.ts`, `tests/landing-email-log.test.ts`, `tests/landing-status-emails.test.ts`

Modify:
- `src/lib/supabase/database.types.ts` (hand-add entries, never regenerate)
- `src/lib/landing/registration/config.ts` (option gets `moduleIds`)
- `src/lib/emails/landing-registration.ts` (Paid / Underpaid / Reserved builders)
- `src/lib/landing/registration/job-handlers.ts` (new handlers `enrollment_sync`, `email_status`)
- `src/lib/data/landing-jobs.ts` (job types, order, coalescing enqueue)
- `src/lib/data/landing-registration-admin.ts` (enqueue after a status change)
- `src/lib/data/landing-registrations.ts` + `src/lib/landing/registration/link-student.ts` (enrol after guest sign-up link)
- `src/lib/data/lms.ts` and the portal route(s) under `src/app/portal` (portal-open check)

Test conventions: vitest, `tests/helpers/supabase-mock.ts` (see `tests/landing-job-handlers.test.ts` for the mocking style). Run one file: `node node_modules/vitest/vitest.mjs run tests/<file>`. Type check: `node node_modules/typescript/bin/tsc --noEmit` (baseline 0, ignore `.next/types` noise). Known failing, not ours: `tests/pz-tokens.test.ts`, `tests/landing-route-hardening*`.

---

## Task 1: Migration 0075 (data model + access rules in the database)

Write the file only. The owner pastes it into the Supabase SQL editor (the MCP is read-only). Must be safe to run twice. **Risky task: opus reviewer.**

- [ ] **Step 1: new columns and tables**

```sql
-- 0075_landing_access.sql
-- NOTE: the owner pastes this SQL into the Supabase SQL editor. Safe to run more than once.

alter table public.enrollments
  add column if not exists access_level text check (access_level in ('live', 'recorded')),
  add column if not exists portal_open boolean not null default true,
  add column if not exists landing_registration_id uuid references public.landing_registrations(id) on delete set null;
-- default true + null access_level keeps every existing enrollment behaving exactly as today.
create unique index if not exists enrollments_landing_registration_key
  on public.enrollments (landing_registration_id) where landing_registration_id is not null;

-- Which modules an enrollment covers. NO rows = the whole course.
create table if not exists public.enrollment_modules (
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  module_id     uuid not null references public.modules(id) on delete cascade,
  primary key (enrollment_id, module_id)
);
alter table public.enrollment_modules enable row level security;
drop policy if exists "enrollment_modules: own or admin read" on public.enrollment_modules;
create policy "enrollment_modules: own or admin read" on public.enrollment_modules for select
  using (
    get_my_role() in ('admin', 'super_admin')
    or exists (select 1 from public.enrollments e where e.id = enrollment_id and e.student_id = auth.uid())
  );
-- no insert/update/delete policies: only the service role writes.

-- "Batch finished" state: module_id null = the whole course of that page.
create table if not exists public.landing_batch_state (
  id          uuid primary key default gen_random_uuid(),
  page_id     uuid not null references public.landing_pages(id) on delete cascade,
  module_id   uuid references public.modules(id) on delete cascade,
  finished_at timestamptz not null default now(),
  finished_by uuid references public.profiles(id) on delete set null
);
create unique index if not exists landing_batch_state_course_key on public.landing_batch_state (page_id) where module_id is null;
create unique index if not exists landing_batch_state_module_key on public.landing_batch_state (page_id, module_id) where module_id is not null;
alter table public.landing_batch_state enable row level security; -- zero policies = service role only

-- One row per person per email kind: the "sent once" guard and the email history.
create table if not exists public.landing_email_log (
  registration_id uuid not null references public.landing_registrations(id) on delete cascade,
  kind            text not null check (kind in ('paid', 'underpaid', 'reserved', 'portal_link')),
  to_email        text not null,
  sent_at         timestamptz not null default now(),
  primary key (registration_id, kind)
);
alter table public.landing_email_log enable row level security; -- zero policies = service role only

alter table public.landing_jobs drop constraint if exists landing_jobs_type_check;
alter table public.landing_jobs
  add constraint landing_jobs_type_check check (type in
    ('sheet_append', 'email_received', 'email_members', 'email_admin', 'sheet_status', 'enrollment_sync', 'email_status'));
```

(`portal_link` kind is for 2b; 'portal_link' log rows will need a different key, 2b may relax the primary key. Leave as is.)

- [ ] **Step 2: access helper functions**

```sql
-- Internal: does this student have an open, active enrollment that covers this module?
create or replace function public._module_open_for(p_student uuid, p_module uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.modules m
      join public.enrollments e on e.course_id = m.course_id
     where m.id = p_module
       and e.student_id = p_student
       and e.status = 'active'
       and e.portal_open
       and (
         not exists (select 1 from public.enrollment_modules em where em.enrollment_id = e.id)
         or exists (select 1 from public.enrollment_modules em where em.enrollment_id = e.id and em.module_id = m.id)
       )
  );
$$;
revoke all on function public._module_open_for(uuid, uuid) from public, anon, authenticated;

-- For policies and student-facing functions: always about the caller.
create or replace function public.can_access_module(p_module uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public._module_open_for(auth.uid(), p_module);
$$;
revoke all on function public.can_access_module(uuid) from public, anon;
grant execute on function public.can_access_module(uuid) to authenticated;
```

- [ ] **Step 3: put the helper into every place that today checks "active enrollment"**

Four places gate on `e.status = 'active'` (found with `grep -n "status = 'active'" supabase/migrations/*.sql`): `0002` lessons policy, `0007` `complete_lesson`, `0009` the quiz-attempt function (line ~134), `0003` `unlock_first_lesson_on_enroll`. Also `0003`'s `unlock_next_lesson` fallback (next module). For each, copy the CURRENT definition from its migration file (read it fully first; later migrations may have redefined it, check with `grep -n "function public.<name>" supabase/migrations/*.sql` and copy the latest), and change ONLY the access check:

- Lessons policy `"lessons: read if enrolled or admin"`: drop and recreate with `using (get_my_role() in ('admin','super_admin') or public.can_access_module(module_id))`. Keep any other conditions the later migrations added (read policy history: the 0007 header says lesson content is also gated on a per-student progress row; copy the latest policy and only swap the enrollment sub-select).
- `complete_lesson` and the quiz function: replace the `exists (select 1 from enrollments ... status='active')` check with `public.can_access_module((select module_id from public.lessons where id = p_lesson_id))`, keeping the `'not enrolled'` exception text.
- `unlock_first_lesson_on_enroll`: make it fire `after insert or update` and also when `portal_open` changes. Condition to act: `new.status = 'active' and new.portal_open and (tg_op = 'INSERT' or old.status is distinct from 'active' or not old.portal_open)`. Choose the first lesson (by module order, lesson order) whose module satisfies `public._module_open_for(new.student_id, m.id)`.
- `unlock_next_lesson` fallback branch ("first lesson of next module"): add `and public._module_open_for(new.student_id, m.id)` so a module-limited student is not pre-unlocked in modules they did not buy. It uses `new.student_id` from the lesson_progress row.
- `notify_enrollment_status_change` (0015): add `if new.status = 'active' and not new.portal_open then return new; end if;` before the `active` branch.

- [ ] **Step 4: smoke test block (owner runs it, rolls back)**

Append to the migration as a commented block, and put a copy in `supabase/tests/0075_access_smoke.sql` (create the folder if absent): a `begin; ... rollback;` script that inserts a test profile-backed enrollment with `portal_open=false`, checks `_module_open_for` is false, sets `portal_open=true` and checks true, adds an `enrollment_modules` row for module A and checks module B is false, then rolls back. (Use real ids from `select id from public.modules limit 2` in the script via `do $$` blocks with `raise notice`.)

- [ ] **Step 5: Commit** `feat(landing-registrations): migration 0075 access columns, batch state, email log`

## Task 2: Hand-add database types

**Files:** `src/lib/supabase/database.types.ts`

- [ ] Add to `enrollments` Row/Insert/Update: `access_level: string | null`, `portal_open: boolean`, `landing_registration_id: string | null` (Insert/Update optional). Add tables `enrollment_modules`, `landing_batch_state`, `landing_email_log` (Row/Insert/Update/Relationships in the same style as `landing_status_events`). Add Functions `can_access_module`: Args `{ p_module: string }` Returns boolean. Update the `landing_jobs.type` union if the types spell it out. Never regenerate. Run tsc, expect 0 new errors.
- [ ] Commit `chore(landing-registrations): database types for 0075`.

## Task 3: Pure access rules (TDD)

**Files:** create `src/lib/landing/registration/access-rules.ts`, `tests/landing-access-rules.test.ts`

The one place that decides what a registration should look like as an enrollment. Pure, no I/O.

```ts
import type { RegistrationStatus } from "@/lib/landing/registration/config";

export type EnrollmentStatusWord = "active" | "pending" | "reserved";
export interface AccessInput {
  status: RegistrationStatus;           // the registration's current status
  mode: "live" | "recorded";
  hasCourse: boolean;                   // page has a course_id
  isTest: boolean;
  /** Module ids the bought option covers; [] = whole course. */
  moduleIds: string[];
  /** True when the owner has pressed Batch finished for everything this buyer bought. */
  batchFinished: boolean;
}
export interface DesiredEnrollment {
  /** "skip" = do nothing at all (test row, no course, free row). */
  action: "skip" | "grant" | "revert";
  status: EnrollmentStatusWord;
  portalOpen: boolean;
  accessLevel: "live" | "recorded";
  moduleIds: string[];
}

export function desiredEnrollment(i: AccessInput): DesiredEnrollment {
  const base = { accessLevel: i.mode, moduleIds: i.moduleIds };
  if (i.isTest || !i.hasCourse || i.status === "free") return { action: "skip", status: "pending", portalOpen: false, ...base };
  if (i.status === "paid") {
    const portalOpen = i.mode === "recorded" || i.batchFinished;
    return { action: "grant", status: "active", portalOpen, ...base };
  }
  return { action: "revert", status: i.status === "reserved" ? "reserved" : "pending", portalOpen: false, ...base };
}

/** Portal link wanted in the Paid email: only when the portal is actually open. */
export const emailGetsPortalLink = (d: DesiredEnrollment): boolean => d.action === "grant" && d.portalOpen;
```

Tests (write first, see them fail, then implement): paid recorded opens; paid live closed unless `batchFinished`; paid live + batchFinished opens; underpaid and pending revert to `pending`, reserved to `reserved`, all closed; test row, no course, free all `skip`; moduleIds pass through; `emailGetsPortalLink` true only for open grants.

- [ ] Run test, commit `feat(landing-registrations): pure access rules`.

## Task 4: "Batch finished" read helper and option modules in config

**Files:** `src/lib/landing/registration/config.ts`, `src/lib/data/landing-enrollment.ts` (first function only), tests

- [ ] In `config.ts` option schema add `moduleIds: z.array(z.string().uuid()).max(40).default([])` (check the file's `text`/default handling style; if the options are normalised in a `list(...)` mapper at ~line 166, add the field there too, defaulting to `[]`). Existing saved configs without the field must still parse. Test: an old option object without `moduleIds` parses to `[]`.
- [ ] In `landing-enrollment.ts` add `export async function isBatchFinished(pageId: string, courseId: string, moduleIds: string[]): Promise<boolean>`: loads `landing_batch_state` rows for the page; true if a whole-course row exists; else, with `moduleIds` non-empty true when every id has a row; else (whole-course buyer, no whole-course row) true when every module of the course has a row (and the course has at least one module). Test with the supabase mock: no rows -> false; course row -> true; per-module rows cover bought modules -> true; cover only some -> false.
- [ ] Commit `feat(landing-registrations): batch-finished lookup and option module ids`.

## Task 5: Enrollment sync

**Files:** `src/lib/data/landing-enrollment.ts`, `tests/landing-enrollment.test.ts`. **Risky task: opus reviewer.**

`export async function syncEnrollmentForRegistration(registrationId: string): Promise<"skipped" | "granted" | "reverted" | "no-account" | "no-change">`

Behaviour (server-only, admin Supabase client, idempotent, never throws for expected states; throws on DB errors so the job retries):

1. Load the registration row (any row type; members have their own row, email and `student_id`) with its lead for `mode`/`option_keys`/`status` source: **use the person's own row for status** (the RPC already cascades status to members), the lead's row for page and option. Load the page (`course_id`, `registration.options`).
2. `moduleIds` = union of `moduleIds` of the page options whose `key` is in the registration's `option_keys` (empty if none or no links = whole course).
3. `batchFinished` = `isBatchFinished(pageId, courseId, moduleIds)`.
4. `d = desiredEnrollment(...)`. `skip` -> return `"skipped"`. If `student_id` is null -> return `"no-account"`.
5. Find the existing enrollment for `(student_id, course_id)`.
   - **grant:** no existing -> insert `{student_id, course_id, status:'pending', access_level, portal_open:false, landing_registration_id, verified_at: now}`, then insert the `enrollment_modules` rows, THEN update to `{status:'active', portal_open: d.portalOpen}` (insert-then-update so the unlock trigger sees the modules; the trigger also handles insert, but keep this order). Existing enrollment (any origin) -> widen only: `status` becomes `active` if it was not; `portal_open = existing.portal_open || d.portalOpen`; module coverage: if the existing has no `enrollment_modules` rows (whole course) leave it; if it has rows and `moduleIds` is empty (whole course bought) delete the rows; else add the missing module rows. Never set `access_level` away from `live` once `live`. Set `landing_registration_id` only when null.
   - **revert:** only if an enrollment exists with `landing_registration_id = registration.id`: set `{status: d.status, portal_open:false}`. Anything else untouched -> `"no-change"`.
6. Return the outcome. Do NOT call `applyEnrollmentStatus` (it sends its own approval email, which would double the Paid email).

Tests (mock): recorded Paid with student -> insert pending, modules inserted before the final update, final update `active`/open; live Paid, no batch -> active + closed; live Paid with batch finished -> open; module-limited -> module rows written; guest (no student) -> `"no-account"`, nothing written; test row and no-course -> `"skipped"`; existing active enrollment owned by someone else: Paid widens only, reversal returns `"no-change"`; reversal of an owned enrollment -> pending + closed; second identical call is a no-op update (idempotent).

- [ ] Commit `feat(landing-registrations): enrollment sync from registration status`.

## Task 6: Email log (sent-once guard)

**Files:** `src/lib/data/landing-email-log.ts`, `tests/landing-email-log.test.ts`

- [ ] `claimEmail(registrationId, kind, toEmail): Promise<boolean>` inserts into `landing_email_log`; unique violation (`23505`) -> `false` (already sent or being sent); other error -> throw. `releaseEmail(registrationId, kind)` deletes the row (called when the send failed, so a retry can claim again). `listEmailLog(registrationIds)` returns rows for 2b. Tests: first claim true, duplicate false, release then claim true again.
- [ ] Commit `feat(landing-registrations): sent-once email log`.

## Task 7: Paid, Underpaid, Reserved email builders

**Files:** `src/lib/emails/landing-registration.ts`, `tests/landing-emails.test.ts` (extend)

Port from `Landing pages/Course/PPC B3 GAS.gs` lines ~794-976 (Paid recorded/live, Underpaid, Reserved) and compare with MDC (`Landing pages/Workshop/MDC-3-GAS.gs`, the same functions) for wording differences; keep the existing builder style in this file (`shell`, `table`, `button`, `para`, `esc`, `C` palette, `https`-only links). Subjects (keep from the scripts, hyphen not em dash like the existing ones):

- Paid, portal open: `Your course is ready, {fn} - start learning`; Paid, portal closed (Live, before Batch finished): `You're in, {fn} - here's your access`
- Underpaid: `{fn}, your balance is outstanding - {eventLabel}`
- Reserved: `{fn}, your seat is reserved - complete payment to confirm`

Add to `LandingEmailContext` (optional so existing builders and tests keep compiling): `portalUrl?: string`, `needsAccount?: boolean`, `amountReceived?: number | null`, `coveredByGroup?: boolean`.

- `buildPaidEmail(c)`: heading "Payment verified". Details table: registration, amount paid (`coveredByGroup` -> "Covered by your group"), schedule rows. If `portalUrl` is set (portal open): button "Open your learning portal" (https only). If `needsAccount`: paragraph "To open your course, create an account with this same email address ({email}) at {site}/register" (add `signupUrl?: string` to the context). If the portal is closed (Live): paragraph "Your recordings and course portal open after your batch finishes. We will email you the link." plus the WhatsApp group buttons (reuse `waHtml`) and "Zoom link and updates are shared there".
- `buildUnderpaidEmail(c)`: shows amount received and balance (`amount - amountReceived`, never negative), payment accounts (`accountsHtml`), no portal link.
- `buildReservedEmail(c)`: seat held, amount due, payment accounts.

Tests: each builder returns one-line subject, escapes a hostile name (`<script>`), contains the portal button only when `portalUrl` is https, shows "Covered by your group" for members, shows the account note for guests, Live-closed Paid mentions the portal opens later and has no portal button, Underpaid shows the computed balance.

- [ ] Commit `feat(landing-registrations): Paid, Underpaid, Reserved emails`.

## Task 8: Jobs `enrollment_sync` and `email_status`

**Files:** `src/lib/data/landing-jobs.ts`, `src/lib/landing/registration/job-handlers.ts`, `tests/landing-status-emails.test.ts`, `tests/landing-jobs.test.ts` (extend). **Risky task: opus reviewer.**

- [ ] `landing-jobs.ts`: `JobType` gains `"enrollment_sync" | "email_status"`; `JOB_TYPES` order becomes `["email_received","sheet_append","sheet_status","enrollment_sync","email_status","email_members","email_admin"]`. Add `enqueueStatusEffects(registrationId)`: upsert BOTH jobs (`onConflict: "registration_id,type"`) back to `pending` with `attempts: 0, last_error: null`, exactly like `enqueueSheetStatus` (coalescing: handlers always read the current status, so flip-flops are safe). Never throws; returns boolean.
- [ ] Handler `enrollment_sync(registrationId)`: loads the bundle; calls `syncEnrollmentForRegistration` for the lead and every member; lets errors propagate (retry) after trying all people.
- [ ] Handler `email_status(registrationId)`: load bundle and page. For the lead and each member (each person independently): map their current status -> kind (`paid`, `underpaid`, `reserved`; `pending` and `free` -> skip, see decision 1). `claimEmail(person.id, kind, person.email)`; if not claimed skip. Build context (`emailContext` helper already exists; set `amountReceived`, `coveredByGroup` for members, `portalUrl` = `${APP_URL}/portal/${courseSlug}` only when `emailGetsPortalLink(desiredEnrollment(...))` AND the person has an account (`student_id`), `needsAccount` when the person is Paid with a course but no `student_id`, `signupUrl` = `${APP_URL}/register`). `APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pharmacozyme.com"` (same as `src/lib/emails/enrollment.ts`). Send with the existing `deliver()` (it already redirects test rows to the admin who ran the test and prefixes the subject). On a send error `releaseEmail` then collect the error; after all people, throw the first error so the job retries (people already sent are guarded by the log).
- [ ] Course slug for the portal link: load `courses.slug` for `page.courseId` inside the handler (page type already carries `courseId`).
- [ ] Register both in `JOB_HANDLERS` (it is `Record<JobType, ...>`, so tsc forces this).
- [ ] Tests (mock brevo + data modules like `landing-job-handlers.test.ts`): Paid recorded person with account -> one email with portal link, log claimed; second run -> no send; Paid live -> email without portal link; Paid after batch finished -> with link; guest -> account note, no link; group of three -> three emails to three addresses, members "Covered by your group"; send failure on member 2 -> member 2 released, lead and member 3 not resent on retry; pending status -> no email; test row -> delivered to the admin recipient only; `enrollment_sync` calls sync for lead and members. In `landing-jobs.test.ts`: `enqueueStatusEffects` upserts two jobs, `JOB_TYPES` order.
- [ ] Commit `feat(landing-registrations): status email and enrollment sync jobs`.

## Task 9: Wire into the status change

**Files:** `src/lib/data/landing-registration-admin.ts`, its existing test file

- [ ] After a successful `landing_apply_status` (right next to the existing sheet push) call `enqueueStatusEffects(rec.id)`; if it returns true `runInBackground(runJobsFor(rec.id))` (this already runs the sheet job too, so merge with the existing branch: enqueue sheet and status effects, one `runJobsFor`), else `runInBackground(runJobsDirect(rec.id, ["sheet_status","enrollment_sync","email_status"]))`. A failure here never fails the status change (same as the sheet push). Keep the existing behaviour for `rowsChanged === 0`.
- [ ] Extend the existing test: a Paid change enqueues status effects; an enqueue failure falls back to `runJobsDirect` with the three types and still returns `ok`.
- [ ] Commit `feat(landing-registrations): run enrollment and email jobs on status change`.

## Task 10: Enrol after a guest signs up

**Files:** `src/lib/data/landing-registrations.ts`, `src/lib/landing/registration/link-student.ts`, `tests/landing-link-student.test.ts`

- [ ] Keep `linkRegistrationsToStudent(userId, email): Promise<number>` unchanged (existing callers and tests). Add `linkRegistrationsToStudentIds(...)` returning `string[]` of linked ids; implement the old function on top of it. `linkGuestRegistrations` uses the ids version and, for each linked id whose row status is `paid`, enqueues and runs `enrollment_sync` only (not the email; the email was already sent as a guest email). Never throws. Add a small `enqueueJobs(id, ["enrollment_sync"])` use plus `runJobsFor`, or reuse `enqueueStatusEffects` partially, choosing the smaller change; the `enrollment_sync` job must not send email.
- [ ] Tests: guest signs up -> linked paid registration gets a sync job; unconfirmed email -> nothing; non-paid linked rows -> no job.
- [ ] Commit `feat(landing-registrations): enrol Paid guests after sign-up`.

## Task 11: Portal respects the open/closed flag

**Files:** `src/lib/data/lms.ts` and the portal pages

- [ ] `getEnrolledCourses`: add `.eq("portal_open", true)`. `getEnrollment` (line ~232) additionally returns `portal_open`. Find every place under `src/app/portal` and `src/app/api` that decides "student may view this course" by `status === 'active'` (`grep -rn "active" src/app/portal src/lib/data/lms.ts src/lib/data/enrollments.ts`) and require `portal_open` as well; a student with a closed portal who opens the course URL sees the same screen a non-enrolled student sees today (no new UI). Lesson content is already protected by the database rules from Task 1; this keeps the app screens consistent with them.
- [ ] Test: update/extend the existing lms data test to assert the filter; tsc clean.
- [ ] Commit `feat(landing-registrations): portal hides courses whose portal is closed`.

## Task 12: Verify, document, hand over

- [ ] Run `node node_modules/typescript/bin/tsc --noEmit`, then the new and touched test files, then the full `landing-*` and `admin-enrollment` tests; report any failure with its output. Known failing tests stay failing.
- [ ] Owner checkpoint (the controller stops here, no dev-server clicking without the owner): ask the owner to paste `0075_landing_access.sql`, then the smoke block. Then verify live with ONE real non-test registration set to Paid in the app: expect a log row in `landing_email_log`, an `enrollments` row with the right `access_level`/`portal_open`, and the email in the inbox. Read-only checks via the Supabase MCP.
- [ ] Update the memory note `pz-academy-landing-phase3-status.md` (Plan 2a state, branch, migration 0075) and tick the ledger.
- [ ] Final whole-branch review on opus, then ask the owner before pushing.
