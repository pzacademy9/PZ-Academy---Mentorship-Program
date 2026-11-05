# Team roles, Part 2 (enforce areas everywhere) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every admin page, admin API and server action check the person's areas, hide menu entries they cannot open, and add the database rule changes managers need.

**Architecture:** The two existing guards become area-aware: `requireAdmin(area)` and `requireAdminPage(area)` take the area (or list of areas) the route belongs to, load the person's role and custom access, and allow or deny. Passing the area is REQUIRED by the type, so `tsc` lists every call site that still needs updating. A coverage test then walks the real folders so a new admin route with no area, or a wrong one, fails CI. The menu reads the same data.

**Tech Stack:** Next.js App Router, Supabase (service role behind guards), vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-11-04-team-roles-design.md`. Builds on branch `team-roles` (Part 1, plan `docs/superpowers/plans/2026-11-04-team-roles-part1.md`). Work on branch `team-roles-2`, cut from `team-roles`.

## Global Constraints

- Area keys, starting sets and the path map are Part 1's (`src/lib/team/areas.ts`). Do not change a starting set.
- Owner ruling 2026-11-04: the Analytics home page (`/dashboard/admin` exactly) is open ONLY to `admin` and `super_admin`. A manager never sees it, whatever areas they have.
- `super_admin` passes every guard, including routes with no mapped area.
- Any other role: a route with no area, a failed read of the person's custom access, or a missing area means DENY (403 for APIs, redirect to `/dashboard` for pages). Never fail open.
- A manager must never hit a redirect loop: pages deny to `/dashboard`, never to an admin address.
- Migrations: owner pastes by hand; next free number is 0101. Never regenerate `database.types.ts`.
- Never use `eslint-disable` for `@typescript-eslint`. `tsc --noEmit` stays at 0 errors. Known failing test files (not ours): pz-tokens, participant-recipients, participant-whatsapp-ui, landing-route-hardening, gas-apply-registration-status, landing-event-sheet, migrations-segment-source-dnc, participant-campaign-page-ui, registration-id-selection.
- Existing admins and the super admin must keep working exactly as today: no existing admin page may start denying a plain `admin` with no custom access (except the settings areas `payment_accounts`, `sheet_sync`, `terms`, `team`, which a plain admin does not have; see the spec).
- Mentors and sales agents are untouched.

## Review Focus

- A plain `admin` suddenly losing a page they had: the coverage test must prove every route maps, and a table test proves a plain admin passes every area except the four settings areas.
- An admin with an area removed: the API for that area returns 403 and the page redirects (test per kind of guard, plus one real route each).
- A server action (`*-actions.ts`) reachable from a page the person CAN open but belonging to an area they cannot: each action's own guard names its area (coverage test).
- A shared route (media library) allowed through any one of several areas, and denied when the person has none of them.
- Custom-access read failing (database error): deny, not allow.
- A manager landing after login: no loop, and a sensible page.

---

### Task 1: Area-aware guards (core)

**Files:**
- Modify: `src/lib/auth/require-admin.ts`
- Modify: `src/lib/team/areas.ts` (add `mayOpen`, `isAdminHomePath`)
- Test: `tests/team-guards.test.ts`

**Interfaces:**
- Consumes: Part 1 `getCustomAccess(userId): Promise<CustomAccess | null>` (throws on read error), `effectiveAreas`, `Area`.
- Produces (areas.ts): `mayOpen(role: Role, custom: CustomAccess | null, areas: readonly Area[]): boolean` (true for `super_admin`; for `admin` and `manager` true when any of `areas` is in `effectiveAreas`; false for everyone else and for an empty list); `isAdminHomePath(path: string): boolean`.
- Produces (require-admin.ts): `requireAdmin(area: Area | readonly Area[])` (same return type as today), `requireAdminPage(area: Area | readonly Area[])` (same return type as today), `requireAdminHomePage()` (allows `admin` and `super_admin` only; managers redirect to `/dashboard`). `isAdminRole` stays unchanged (other code uses it).

- [ ] **Step 1: Write failing tests** in `tests/team-guards.test.ts` (mock `@/lib/supabase/server` for the signed-in role like `tests/team-api.test.ts` does, and mock `@/lib/data/team-access` for `getCustomAccess`): `mayOpen("manager", null, ["courses"])` true and `["payment_accounts"]` false; `mayOpen("admin", { extra: [], removed: ["landing_pages"] }, ["landing_pages"])` false; `mayOpen("super_admin", null, [])` true; `mayOpen("sales_agent", null, ["students"])` false; `mayOpen("admin", null, ["courses", "payment_accounts"])` true (any one is enough); a plain admin passes `mayOpen` for every area except `payment_accounts`, `sheet_sync`, `terms`, `team`; `requireAdmin("courses")` returns 403 for a manager with `courses` removed, 200-ok for a manager plain, 403 for a student, 401 signed out; when `getCustomAccess` rejects, `requireAdmin("courses")` returns 403 (fail closed); `requireAdminPage("courses")` redirects a denied manager to `/dashboard`; `requireAdminHomePage()` allows admin and super admin, redirects a manager to `/dashboard`.
- [ ] **Step 2:** Run `node node_modules/vitest/vitest.mjs run tests/team-guards.test.ts`; expect FAIL (functions missing or wrong signature).
- [ ] **Step 3:** Implement. Guards load the profile role as today, then for `admin` or `manager` call `getCustomAccess(user.id)` inside try/catch (catch means deny). Import `getCustomAccess` lazily from `@/lib/data/team-access` (it is `server-only`).
- [ ] **Step 4:** Run the test; expect PASS. DO NOT commit yet: `tsc` will now fail at every old call site; Task 3 fixes them. Keep Tasks 1 to 3 on one commit series and only push when tsc is clean.

### Task 2: Middleware and manager landing

**Files:**
- Modify: `src/middleware.ts` (the `/dashboard/admin` check allows `manager` too; the page guards do the real decision)
- Modify: `src/lib/roles.ts` (`roleHome("manager")` returns `/dashboard/admin/courses`)
- Test: `tests/team-middleware.test.ts` (pure: extract the role check into a small exported function `mayEnterAdminSpace(role: Role): boolean` in `src/lib/access.ts` and test that)

**Interfaces:**
- Produces: `mayEnterAdminSpace(role)` true for `admin`, `super_admin`, `manager`; false otherwise.

- [ ] **Step 1: Write failing tests:** `mayEnterAdminSpace` true/false table for all six roles; `roleHome("manager")` is `/dashboard/admin/courses`; `roleHome("manager")` is a path for which `mayEnterAdminSpace("manager")` is true (no loop).
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement and use `mayEnterAdminSpace` in `middleware.ts` line ~54. A manager denied by the page guard lands on `/dashboard` (a student page that does not redirect back).
- [ ] **Step 4:** Run; expect PASS.

### Task 3: Give every guard call its area

**Files:**
- Modify: every file under `src/app/api/admin/**`, `src/app/dashboard/admin/**` and `src/app/api/landing/[slug]/register/route.ts` that calls `requireAdmin(` or `requireAdminPage(` (about 200 files, found by `grep -rlE "requireAdmin\(|requireAdminPage\(" src/app`).
- Modify: `src/app/dashboard/admin/page.tsx` to call `requireAdminHomePage()`.

**Interfaces:**
- Consumes: Task 1 signatures; `areaForPath` from Part 1 (use it to decide each file's area).

- [ ] **Step 1:** Write a throwaway script (kept out of git, in the workspace folder) that, for each file, converts its folder path to the URL path (drop `src/app`, drop `route.ts` or `page.tsx`, keep `[id]` segments), calls the same rules as `areaForPath`, and rewrites `requireAdmin()` to `requireAdmin("<area>")` or `requireAdmin(["a","b"])` for multi-area routes. Server action files (`*-actions.ts`, `actions.ts`) take the area of the page folder they sit in. Print every file where the area is `null`; do not guess: map each by hand using the spec's area list, and if it truly fits none, stop and ask the owner. The register route `src/app/api/landing/[slug]/register/route.ts` is a public form with an admin test mode: give it `"landing_pages"`.
- [ ] **Step 2:** Run the script. Run `node node_modules/typescript/bin/tsc --noEmit`; expect 0 errors (the required parameter forces any missed call site to show up).
- [ ] **Step 3:** Run `tests/api-role-gates.test.ts`, `tests/team-api.test.ts` (Team routes keep `requireSuperAdmin`), and the existing admin route tests: `node node_modules/vitest/vitest.mjs run tests/api-role-gates.test.ts tests/admin-agent-campaigns-routes.test.ts tests/attendance-admin-actions.test.ts tests/classes-feedback-email.test.ts`. Existing tests that mock `requireAdmin` keep working (they ignore the argument). Fix any test that breaks only because of the new argument.
- [ ] **Step 4:** Commit Tasks 1 to 3 together, by path (`git add` the touched folders' files by explicit path list from `git status`).

### Task 4: Coverage tests that stop future gaps

**Files:**
- Test: `tests/team-coverage.test.ts`

**Interfaces:**
- Consumes: `areaForPath` and the folder layout.

- [ ] **Step 1: Write the tests:** (a) walk `src/app/dashboard/admin` and `src/app/api/admin`; every `page.tsx` and `route.ts` has a non-null `areaForPath` (the admin home page is the one allowed exception, and must call `requireAdminHomePage`); (b) in every such file that contains `requireAdmin(` or `requireAdminPage(`, the call has an argument and its area list equals `areaForPath` of the file's URL path (or is a superset for the media routes); (c) no file under `src/app/api/admin` or `src/app/dashboard/admin` calls `requireAdmin()` with no argument; (d) server action files (`"use server"`) under `src/app/dashboard/admin` each name an area in every exported action that calls a guard.
- [ ] **Step 2:** Run it; expect PASS if Task 3 was done right; if a real route is unmapped, fix `areas.ts` (add a rule) and add an assertion to `tests/team-areas.test.ts` for it.
- [ ] **Step 3:** Commit by path.

### Task 5: Menu filtering

**Files:**
- Modify: `src/components/dashboard/nav.ts` (each admin `NavItem` gets `areas?: Area[]`; `navForRole(role, areas?)` filters admin-area items by the person's effective areas; the Analytics item stays roles `["admin","super_admin"]`; the Team item stays `["super_admin"]`)
- Modify: `src/components/dashboard/Sidebar.tsx` and its caller (the dashboard layout) to pass the person's effective areas
- Test: `tests/team-nav.test.ts`

**Interfaces:**
- Consumes: `effectiveAreas`, `getCustomAccess`. Produces: `navForRole(role: Role, areas?: readonly Area[]): NavItem[]`.

- [ ] **Step 1: Write failing tests:** a plain manager sees Programs, Landing Pages, Students, Certificates, Enrollments, Feedback, Mentorship, Send Notice and NOT Marketing, Sales Hub, Payment Accounts, Terms, Sheet Sync, Team, Analytics; a manager with `marketing` added sees Marketing; an admin with `landing_pages` removed does not see Landing Pages, Media Library or Promo Codes; a plain admin sees everything except the four settings entries and Team; super admin sees everything; students, mentors and sales agents see exactly what they see today (snapshot of `navForRole` for those roles before and after).
- [ ] **Step 2:** Run; expect FAIL. Implement; run; expect PASS.
- [ ] **Step 3:** In the layout that renders `Sidebar`, read the role and `getCustomAccess` once (service-role, server side; a failed read gives the person no admin entries, never extra ones) and pass the effective areas down. Check by reading the layout file first; if the sidebar is a client component, pass the plain array as a prop.
- [ ] **Step 4:** Commit by path.

### Task 6: Database rules for managers (migration 0101)

**Files:**
- Create: `supabase/migrations/0101_manager_policies.sql`
- Modify: `docs/superpowers/plans/2026-11-04-team-roles-owner-steps.md` (add a step 4)

**Interfaces:**
- Produces: policies that let a `manager` read and write exactly the tables their areas use through the signed-in (non-service) client.

- [ ] **Step 1:** Find which tables matter. With the Supabase read tool, run `select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname='public' and (qual ilike '%super_admin%' or with_check ilike '%super_admin%') order by 1,2;` (24 tables today: attendance, attendance_events, attendance_sessions, auth_email_logs, banners, certificates, courses, enrollment_modules, enrollment_open_modules, enrollments, event_registrations, featured_items, gas_sync_log, lesson_progress, lessons, mentors, module_notes, modules, profiles, quiz_attempts, quiz_questions, sessions, sheet_leads, webinars). Then `grep -rl "createServerSupabase" src/app/dashboard/admin src/lib/data` to list which admin pages and data files in the MANAGER areas (courses, landing_pages, classes, enrollments, students, certificates, feedback, mentorship, notifications) read these tables with the signed-in client instead of the service-role client. Only those tables need a manager policy.
- [ ] **Step 2:** Write 0101 with one `alter policy "<name>" on public.<table> using (<same condition> or get_my_role() = 'manager') [with check (...)]` per policy that a manager needs, copying the existing condition text exactly from the query output; managers get no write policy on tables outside their areas (for example `mentors`, `banners`, `featured_items` stay admin-only). Add a comment block listing each table and which manager area needs it.
- [ ] **Step 3:** Write the owner step: "paste 0101 after 0099 and 0100 have been run". The enum value `manager` must already exist, which is why this is a separate file.
- [ ] **Step 4:** Add a vitest that reads the migration file text and asserts: it never mentions `payment`, `sheet`, `terms`, `banners`, `featured_items`, `mentors` tables, and that every policy name in it exists in the pg_policies list recorded in the file's header comment. Run; expect PASS.
- [ ] **Step 5:** Commit by path.

### Task 7: Whole-branch check

- [ ] **Step 1:** Run `node node_modules/vitest/vitest.mjs run tests/team-guards.test.ts tests/team-middleware.test.ts tests/team-coverage.test.ts tests/team-nav.test.ts tests/team-areas.test.ts tests/team-api.test.ts tests/api-role-gates.test.ts`; expect all PASS.
- [ ] **Step 2:** `tsc --noEmit` (0 errors) and eslint on `src/lib/auth src/lib/team src/middleware.ts src/components/dashboard`.
- [ ] **Step 3:** Run the whole suite to a file and read only the failing file names; only the known failing files may fail (re-run any other failing UI file alone first).
- [ ] **Step 4:** One fresh review of the whole branch on the most capable model (`model: "opus"` set explicitly) with the Review Focus section pasted in; one fix pass, failing test first; then ask the owner whether to push.
