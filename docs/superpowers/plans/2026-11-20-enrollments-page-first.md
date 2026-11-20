# Enrollments: Page registrations first Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Page registrations is the first tab and the page the Enrollments menu opens; App sign-ups moves to `/dashboard/admin/enrollments/app`.

**Architecture:** One pure helper decides where the bare Enrollments address redirects (no query goes to registrations; any query goes to the app page with the query kept). The current App sign-ups page file moves under `enrollments/app/`. Six links are repointed.

**Tech Stack:** Next.js App Router (server pages, `redirect` from `next/navigation`), vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-20-enrollments-page-first-design.md`

## Global Constraints

- Addresses: App sign-ups `/dashboard/admin/enrollments/app`; Page registrations `/dashboard/admin/enrollments/registrations`; bare `/dashboard/admin/enrollments` only redirects.
- Tab labels stay exactly "Page registrations" then "App sign-ups".
- Source files use CRLF: keep it. Stage by explicit path only, never `git add docs`.
- No database change, no new look, no change to what either page shows.
- Run tools directly (npm/npx broken by `&` in path): `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js <paths>`.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Old link `?status=all&courseId=X&courseTitle=Y` must land on `/app` with all three params intact (test in Task 1).
- Repeated query keys (`?status=a&status=b`, array values) must be forwarded, not dropped (Task 1).
- Empty query value only (`?status=`) still counts as a query and goes to `/app` (Task 1).
- Sidebar must still highlight Enrollments on `/enrollments/app`, `/enrollments/registrations/...` and `/enrollments/<id>` (Task 2 test).
- The tab strip on every page must still show the right tab selected (existing `active` prop untouched).

## File structure

- Create `src/lib/registrations/enrollments-entry.ts`: pure redirect-target helper.
- Create `src/app/dashboard/admin/enrollments/app/page.tsx`: the current App sign-ups page, moved.
- Modify `src/app/dashboard/admin/enrollments/page.tsx`: becomes the redirect.
- Modify `src/components/admin/registrations/EnrollmentSourceTabs.tsx`: order + app href.
- Modify links: `EnrollmentFilterTabs.tsx`, `program/ProgramRosterPanel.tsx` (2), `enrollments/[id]/page.tsx`, `dashboard/admin/page.tsx` (2).
- Tests: `tests/enrollments-entry.test.ts` (new), update `tests/landing-registrations-list-ui.test.tsx`, add case to `tests/dashboard-nav.test.ts`.

### Task 1: Redirect helper and tab strip

**Files:**
- Create: `src/lib/registrations/enrollments-entry.ts`
- Modify: `src/components/admin/registrations/EnrollmentSourceTabs.tsx:9-12`
- Create: `tests/enrollments-entry.test.ts`
- Modify: `tests/landing-registrations-list-ui.test.tsx:139-145`

**Interfaces:**
- Produces: `enrollmentsEntryTarget(query: Record<string, string | string[] | undefined>): string`, returning `"/dashboard/admin/enrollments/registrations"` when no key has a defined value, otherwise `"/dashboard/admin/enrollments/app?<same params>"`. Arrays produce one `key=value` pair per item. Keys whose value is `undefined` are ignored; an empty string value counts as present.

- [ ] **Step 1: Write failing tests** in `tests/enrollments-entry.test.ts`: `{}` returns the registrations address; `{status:"all",courseId:"X",courseTitle:"A B"}` returns `/dashboard/admin/enrollments/app?status=all&courseId=X&courseTitle=A+B`; `{status:["a","b"]}` returns `...app?status=a&status=b`; `{status:""}` returns `...app?status=`; `{status: undefined}` returns the registrations address. Update the tab-strip test: App sign-ups href is `/dashboard/admin/enrollments/app`, and the first link in the `nav` (by `getAllByRole("link")[0]`) is "Page registrations".
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/enrollments-entry.test.ts tests/landing-registrations-list-ui.test.tsx`. Expected: FAIL (module missing; old order/href).
- [ ] **Step 3: Implement** the helper with `URLSearchParams`, and reorder `tabs` in `EnrollmentSourceTabs` (page first; app href `/dashboard/admin/enrollments/app`). Update the component's doc comment.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** the four paths above, message `feat(enrollments): page registrations first tab + redirect helper`.

### Task 2: Move App sign-ups, add redirect, repoint links

**Files:**
- Create: `src/app/dashboard/admin/enrollments/app/page.tsx` (use `git mv` from `enrollments/page.tsx`, keeping content and `requireAdminPage("enrollments")`)
- Modify: `src/app/dashboard/admin/enrollments/page.tsx` (new file after the move)
- Modify: `src/components/admin/EnrollmentFilterTabs.tsx:39`, `src/components/admin/program/ProgramRosterPanel.tsx:55,61`, `src/app/dashboard/admin/enrollments/[id]/page.tsx:41`, `src/app/dashboard/admin/page.tsx:25,50` (and the comment at line 40)
- Test: `tests/dashboard-nav.test.ts`

**Interfaces:**
- Consumes: `enrollmentsEntryTarget` from Task 1.
- Produces: the redirect page `export default async function EnrollmentsEntryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> })` that awaits `requireAdminPage("enrollments")` then calls `redirect(enrollmentsEntryTarget(await searchParams))`.

- [ ] **Step 1: Write failing test** in `tests/dashboard-nav.test.ts`: with the admin nav items, `activeHrefFor(items, "/dashboard/admin/enrollments/app")`, `.../enrollments/registrations/campaign/abc` and `.../enrollments/some-id` each return `"/dashboard/admin/enrollments"`. (Likely already true: if it passes at once, keep it as a guard.)
- [ ] **Step 2: Do the move and rewrite** with `git mv`, create the redirect page, then replace each listed link so it points at `/dashboard/admin/enrollments/app` (keep their query strings). Both admin-home cards are about the payment review queue, so both go to `/app`. The enrollments `[id]` back link goes to `/app`. Leave `nav.ts` and `areas.ts` untouched.
- [ ] **Step 3: Verify** with `node node_modules/typescript/bin/tsc --noEmit` (0 errors), `node node_modules/eslint/bin/eslint.js` on every changed path, and `node node_modules/vitest/vitest.mjs run tests/enrollments-entry.test.ts tests/landing-registrations-list-ui.test.tsx tests/dashboard-nav.test.ts tests/sales-hub-sidebar.test.tsx tests/sidebar-collapse.test.tsx`. Expected: all pass, tsc 0.
- [ ] **Step 4: Grep check:** `Grep "admin/enrollments[\"'`?#]" src` shows no remaining link that means App sign-ups except `nav.ts`, `areas.ts` and the new redirect page.
- [ ] **Step 5: Commit** by explicit paths, message `feat(enrollments): app sign-ups at /app, bare address opens page registrations`.

## Self-review

Spec coverage: tab order (T1), move + redirect (T2), links (T2), nav/area unchanged and highlight check (T2), tests (T1, T2). Browser check on localhost (admin test login, no data changes) is done after the tasks by the controller: menu opens Page registrations, old `?status=all` link lands on App sign-ups.
