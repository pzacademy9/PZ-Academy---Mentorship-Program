# Team roles, Part 1 (roles, area map, Team screen) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `manager` role, a real `super_admin`, a pure "which areas may this person open" check with a full path map, and a super-admin-only Team screen to add people, pick a role and tick custom areas.

**Architecture:** One pure module (`src/lib/team/areas.ts`) holds the areas, the starting set per role, and the path-to-area map. A small data layer reads and writes custom access in a new service-role-only table. A super-admin-only API and one admin page sit on top. Part 1 does NOT enforce areas on existing pages or APIs (that is Part 2), so nothing existing changes behaviour; a `manager` cannot yet open admin pages.

**Tech Stack:** Next.js App Router, Supabase (service-role client `createAdminSupabase()`), zod, vitest, Tailwind with `pz-*` tokens.

**Spec:** `docs/superpowers/specs/2026-11-04-team-roles-design.md`. Part 2 (enforce on every page, API, menu entry; row-level-rule migration) gets its own plan after Part 1 is reviewed.

## Global Constraints

- Roles: `student`, `mentor`, `sales_agent`, `admin`, `manager`, `super_admin`.
- Areas (exact keys): `students`, `certificates`, `courses`, `enrollments`, `landing_pages`, `classes`, `feedback`, `mentors`, `mentorship`, `marketing`, `crm`, `sales_hub`, `notifications`, `payment_accounts`, `sheet_sync`, `terms`, `team`.
- Starting sets: `super_admin` = all (fixed). `admin` = all except `payment_accounts`, `sheet_sync`, `terms`, `team`. `manager` = `courses`, `landing_pages`, `classes`, `enrollments`, `students`, `certificates`, `feedback`, `mentorship`, `notifications`. `sales_agent` = none of these (custom access does not apply).
- `team` is never grantable to anyone but a `super_admin`. A `super_admin` can never be edited or switched off from the Team screen.
- Switch-off: role becomes `student`; custom lists and previous role are kept; adding the person again restores them.
- Migrations: the owner pastes SQL by hand. A new enum value must be alone in its own migration (see `0061_sales_agent_role.sql`). Next free number is 0099.
- Never regenerate `src/lib/supabase/database.types.ts`; hand-add. Never add `eslint-disable` for `@typescript-eslint`. Use `tsc --noEmit` at 0 errors. Tests use fake people only.
- Mentors are not listed or managed on the Team screen. Sales agents keep their own screen (Sales Hub, Team) and are shown on the Team screen only as a read-only note linking there.
- Phone-first admin UI: tap targets at least 44px (`min-h-11`), no sideways scroll, one main action per screen. Use existing admin components and `pz-*` tokens. No Stitch screen exists: build with existing patterns and show the owner on the dev server; do not invent a new visual style.

## Review Focus

- A person typing an admin address they have no area for: not enforced until Part 2. The Team screen must say so in the plan notes only, not to the user. (No test here; Part 2 owns it.)
- Two super admins, or the last super admin being demoted: the Team API must refuse any change to a `super_admin` row (test in Task 4).
- Granting `team` via custom extra areas to an admin: `effectiveAreas` must drop it (test in Task 2).
- Unknown path or unknown area string coming from the database or a request: `areaForPath` returns `null` and `canAccessArea` returns false; a bad area string in a request is rejected by zod (tests in Tasks 2 and 4).
- Adding an email that already belongs to a mentor, student or sales agent: mentors and sales agents are refused with a plain message; a plain student is promoted after a confirm step (test in Task 4).

---

### Task 1: Migrations 0099 and 0100

**Files:**
- Create: `supabase/migrations/0099_manager_role.sql`
- Create: `supabase/migrations/0100_team_access.sql`
- Modify: `src/lib/supabase/database.types.ts` (hand-add `manager` to both `user_role` lines near 4895 and 5052, and a `team_access` table entry)
- Create: `docs/superpowers/plans/2026-11-04-team-roles-owner-steps.md`

**Interfaces:**
- Produces: enum value `manager`; table `public.team_access(user_id uuid primary key references public.profiles(id) on delete cascade, extra_areas text[] not null default '{}', removed_areas text[] not null default '{}', active boolean not null default true, previous_role public.user_role null, updated_at timestamptz not null default now())`, RLS on, zero policies.

- [ ] **Step 1:** Write 0099 as the single line `alter type public.user_role add value if not exists 'manager';` with a header comment copied in style from 0061.
- [ ] **Step 2:** Write 0100: create the table above; enable RLS; then promote the owner: `update public.profiles set role = 'super_admin' where role = 'admin' and (select count(*) from public.profiles where role = 'admin') = 1 and not exists (select 1 from public.profiles where role = 'super_admin');` with a comment that it only runs when there is exactly one admin and no super admin.
- [ ] **Step 3:** With the Supabase read tool, run `select id, role from public.profiles where role in ('admin','super_admin')` and confirm exactly one admin and no super admin before finishing; note the result in the owner-steps file.
- [ ] **Step 4:** Hand-edit `database.types.ts` (enum lists, `team_access` Row/Insert/Update/Relationships in the same shape as a neighbouring table). Run `node node_modules/typescript/bin/tsc --noEmit`; expect 0 errors.
- [ ] **Step 5:** Write the owner-steps file: paste 0099 first, run it alone, then paste 0100; one sentence on what each does and that the owner's account becomes super admin.
- [ ] **Step 6:** Commit `supabase/migrations/0099_manager_role.sql supabase/migrations/0100_team_access.sql src/lib/supabase/database.types.ts docs/superpowers/plans/2026-11-04-team-roles-owner-steps.md`.

### Task 2: Areas module (pure)

**Files:**
- Create: `src/lib/team/areas.ts`
- Modify: `src/lib/roles.ts` (add `"manager"` to `Role`; `roleHome("manager")` returns `/dashboard/admin`; add `isSuperAdminRole(role): boolean`)
- Test: `tests/team-areas.test.ts`

**Interfaces:**
- Produces (all in `areas.ts`): `AREAS` (readonly tuple of the 17 keys), `type Area`, `type CustomAccess = { extra: Area[]; removed: Area[] }`, `startingAreas(role: Role): Area[]`, `effectiveAreas(role: Role, custom: CustomAccess | null): Area[]`, `canAccessArea(role: Role, custom: CustomAccess | null, area: Area): boolean`, `areaForPath(path: string): Area[] | null` (a route may belong to several areas; `null` means unmapped, therefore denied), `isArea(v: unknown): v is Area`.

- [ ] **Step 1: Write failing tests** in `tests/team-areas.test.ts`: `startingAreas("admin")` excludes exactly `payment_accounts`, `sheet_sync`, `terms`, `team`; `startingAreas("manager")` equals the nine listed; `startingAreas("sales_agent")` is `[]`; `effectiveAreas("admin", { extra: ["team"], removed: [] })` does not contain `team`; `effectiveAreas("manager", { extra: ["marketing"], removed: ["landing_pages"] })` contains `marketing`, not `landing_pages`; `effectiveAreas("super_admin", { extra: [], removed: ["courses"] })` still contains all 17; `canAccessArea("sales_agent", { extra: ["students"], removed: [] }, "students")` is false; `areaForPath("/dashboard/admin/landing-media")` returns an array containing `landing_pages`, `courses`, `mentors`, `marketing`; `areaForPath("/api/admin/landing-media/x")` same; `areaForPath("/dashboard/admin/nope")` is `null`; `areaForPath("/dashboard/admin/../x")` is `null`; `isArea("team")` true, `isArea("hax")` false.
- [ ] **Step 2:** Run `node node_modules/vitest/vitest.mjs run tests/team-areas.test.ts`; expect FAIL (module missing).
- [ ] **Step 3:** Implement `areas.ts`. The path map is a list of `[prefix, Area[]]` pairs, longest prefix wins, covering every folder under `src/app/dashboard/admin` and every folder under `src/app/api/admin` (list them with `ls` first; use the spec's area names; for example `agent-leaderboard`, `sales`, `sales-agents`, `landing-agent-links` map to `sales_hub`; `landing`, `landing-pages`, `landing-promo-codes`, `landing-whatsapp`, `landing-mirror` map to `landing_pages`; `landing-sheet-sync` and `sheet-sync` to `sheet_sync`; `payment-accounts` and `payment-countries` to `payment_accounts`; `site-terms` and `terms` to `terms`; `landing-media` and `uploads` to the four shared areas; `registrations` and `enrollments` to `enrollments`; `participants` to `enrollments`; `courses`, `modules`, `lessons`, `quiz-questions` to `courses`; `banners`, `featured-items`, `marketing` to `marketing`; `crm` to `crm`; `mentors` to `mentors`; `mentorship` to `mentorship`; `feedback` to `feedback`; `notifications` to `notifications`; `students`, `people` to `students`; `certificates` to `certificates`). Any folder you cannot place from its code: stop and ask the owner, do not guess. `/dashboard/admin` exactly (the Analytics home) maps to every area (any staff person may open it). `effectiveAreas` always removes `team` unless role is `super_admin`, and returns all areas for `super_admin` regardless of custom.
- [ ] **Step 4:** Add the `manager` role to `roles.ts`, and run `node node_modules/typescript/bin/tsc --noEmit`. Fix every exhaustiveness error it reports by giving `manager` the same behaviour as `student` EXCEPT where noted (nav and roleHome). Expected: 0 errors.
- [ ] **Step 5:** Run the Step 2 command again; expect PASS. Also run `node node_modules/vitest/vitest.mjs run tests/access.test.ts` if it exists.
- [ ] **Step 6:** Commit by path: `src/lib/team/areas.ts src/lib/roles.ts tests/team-areas.test.ts` plus any file `tsc` made you touch.

### Task 3: Data layer

**Files:**
- Create: `src/lib/data/team-access.ts`
- Test: `tests/team-access-data.test.ts`

**Interfaces:**
- Consumes: Task 2's `Area`, `CustomAccess`, `effectiveAreas`, `isArea`.
- Produces: `type TeamMember = { id: string; email: string; fullName: string; role: Role; custom: CustomAccess; active: boolean }`, `listTeam(): Promise<TeamMember[]>` (admin and manager and super_admin rows from `profiles`, plus rows in `team_access` with `active = false`), `getCustomAccess(userId: string): Promise<CustomAccess | null>`, `saveTeamMember(input: { userId: string; role: "admin" | "manager"; custom: CustomAccess }): Promise<{ ok: true } | { ok: false; reason: "not-found" | "is-super-admin" | "is-mentor" | "is-sales-agent" | "db-error" }>`, `switchOffTeamMember(userId: string)` (same result shape): sets role `student`, `team_access.active = false`, `previous_role` = old role, lists kept.

- [ ] **Step 1: Write failing tests** with the Supabase admin client mocked the way `tests/` already mocks `createAdminSupabase` (copy from the nearest existing data-layer test). Cases: saving a `super_admin` returns `is-super-admin` and writes nothing; saving a mentor returns `is-mentor`; saving with `extra` containing `team` stores it without `team` (stripped); switch-off sets role `student` and keeps lists; switching off a `super_admin` returns `is-super-admin`.
- [ ] **Step 2:** Run the test file; expect FAIL.
- [ ] **Step 3:** Implement with `createAdminSupabase()` (`src/lib/supabase/admin.ts`), upserting `team_access` and updating `profiles.role`. Re-adding a switched-off person restores `previous_role` and lists (a `restore` path inside `saveTeamMember` when `active = false`: it flips `active` back to true).
- [ ] **Step 4:** Run the tests; expect PASS. Run `tsc --noEmit`; expect 0 errors.
- [ ] **Step 5:** Commit `src/lib/data/team-access.ts tests/team-access-data.test.ts`.

### Task 4: Super-admin guard and Team API

**Files:**
- Modify: `src/lib/auth/require-admin.ts` (add `requireSuperAdmin()` and `requireSuperAdminPage()`, same shapes as the existing two but allowing only `super_admin`)
- Create: `src/lib/validations/team.ts`
- Create: `src/app/api/admin/team/route.ts` (GET list; POST add a person by email), `src/app/api/admin/team/[id]/route.ts` (PATCH role and areas; DELETE switch off)
- Test: `tests/team-api.test.ts`

**Interfaces:**
- Consumes: Task 3 data functions; `inviteOrCheckSalesAgent` in `src/lib/data/sales-agents.ts` as the pattern for invite-or-existing-account (read it; copy the shape for a `team` version in `team-access.ts`: `inviteOrCheckTeamMember(email, fullName, redirectTo)` returning `"invited" | "existing"`, and `confirmPromoteToTeamMember(email, role)`).
- Produces: `teamMemberSchema = z.object({ email, fullName, role: z.enum(["admin","manager"]), extra: z.array(z.enum(AREAS)), removed: z.array(z.enum(AREAS)) })`.

- [ ] **Step 1: Write failing tests:** a non-super-admin (admin, manager, sales_agent, student, signed out) gets 403/401 from every handler; PATCH on a `super_admin` id returns 409; an area string `"hax"` returns 400; a mentor email returns 409 with the message "That account is a mentor. A mentor cannot also be on the team"; a sales agent email returns 409 "Sales agents are managed in Sales Hub, Team".
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement the guards, the zod schema (areas validated against `AREAS`), and the four handlers using `requireSuperAdmin()`. Messages in plain words like the sales-agents route.
- [ ] **Step 4:** Run the tests; expect PASS; `tsc --noEmit` 0 errors; eslint on the touched paths clean.
- [ ] **Step 5:** Commit by path.

### Task 5: Team screen

**Files:**
- Create: `src/app/dashboard/admin/team/page.tsx` (server page, `requireSuperAdminPage()`), `src/components/admin/team/TeamManager.tsx` (client), `src/components/admin/team/AreaTicks.tsx`
- Modify: `src/components/dashboard/nav.ts` (one entry: label "Team", href `/dashboard/admin/team`, icon `ShieldCheck`, `roles: ["super_admin"]`)
- Test: `tests/team-manager-ui.test.tsx`

**Interfaces:**
- Consumes: Task 3 `TeamMember`, `listTeam`; Task 2 `AREAS`, `startingAreas`, `effectiveAreas`; Task 4 routes.
- Produces: a page listing people (name, email, role, "Custom" tag when `effectiveAreas` differs from `startingAreas`, "Switched off" tag), an "Add a person" form (name, email, role), and an edit sheet per person with the role picker and a tick list of the 16 grantable areas shown in plain words, plus a one-line summary like "Manager, plus Marketing, minus Landing pages". Super admin rows have no edit or switch-off buttons. A short note at the bottom links sales agents to `/dashboard/admin/sales-hub/team`.

- [ ] **Step 1: Write failing UI tests** (React Testing Library): the summary line text for a manager with extra `marketing` and removed `landing_pages`; a `super_admin` row shows no Edit button; the tick list never shows `team`; toggling a tick calls the PATCH route with the right body (mock `fetch`).
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Build the page and components with existing admin patterns (look at `src/components/admin/sales/` and `src/components/admin/terms/` for the card, button and dialog styles). Every control `min-h-11`; list rows stack on phones.
- [ ] **Step 4:** Run the tests; expect PASS. Run `tsc --noEmit`, eslint on the new paths.
- [ ] **Step 5:** Commit by path.

### Task 6: Whole-branch check

- [ ] **Step 1:** Run `node node_modules/vitest/vitest.mjs run tests/team-areas.test.ts tests/team-access-data.test.ts tests/team-api.test.ts tests/team-manager-ui.test.tsx tests/access.test.ts`; expect all PASS.
- [ ] **Step 2:** Run `tsc --noEmit` (0 errors) and eslint on `src/lib/team src/lib/data/team-access.ts src/lib/auth src/app/api/admin/team src/app/dashboard/admin/team src/components/admin/team`.
- [ ] **Step 3:** Dispatch one fresh review of the whole branch on the most capable model (set `model: "opus"` explicitly); fix findings failing-test-first; then ask the owner whether to push.
