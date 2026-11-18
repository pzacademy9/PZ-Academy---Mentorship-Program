# Cohorts Guided Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Cohorts page a guided three-step page and fix the hydration error (#425/#422) on load.

**Architecture:** Fix dates first (small, isolated). Then split `CohortsPanel` into a list component, a per-row menu and an actions area, keeping the data, routes and delete flow unchanged.

**Tech Stack:** Next.js 14.2.5, React client components, Tailwind pz tokens, vitest + testing-library.

**Spec:** `docs/superpowers/specs/2026-11-18-cohorts-guided-design.md` (read first). Stitch: project 13117286791417011091, "Cohorts - Sales Hub (Desktop 1440px)" / "(Mobile 390px)" if present; else follow the Contacts screens' pattern.

## Global Constraints

- Tests first. Focused tests only: `node node_modules/vitest/vitest.mjs run tests/<file>`; `npm run` and `npx` are broken (the `&` in the path).
- Before each commit: `node node_modules/typescript/bin/tsc --noEmit` (0 errors; if stale `.next/types` errors from another branch appear, delete `.next/types` and re-run) and `node node_modules/eslint/bin/eslint.js <changed paths>`.
- **Write files in UTF-8 only.** A Windows-default python write once corrupted "…" into byte 0x85. Before every commit, verify all changed files decode as strict UTF-8 (`python -I`). Keep CRLF.
- No `eslint-disable` for `@typescript-eslint`. Never touch `database.types.ts`. No migration, no new route. Do not change the export route, the delete route, or their texts.
- Colours: backgrounds and borders use `pz-solid-*`/`landing-*` or the `pz-primary` / `pz-surface-container-*` family; `pz-deep`, `pz-mid`, `pz-danger` are text only.
- Calm plain words, no exclamation marks. Do not copy invented Stitch content (fake bottom menu, made-up names, "Updated just now").
- Menus: Escape closes, focus returns to the opener; arrows/Home/End; outside click closes; in flow (never `absolute bottom-full` inside a scroll area). 44px tap targets on phone. No horizontal scroll at 390px.
- Phone bottom bar: `bottom-[calc(4.5rem+env(safe-area-inset-bottom))]`, capped about 50vh with scroll; `lg:bottom-4` from lg; two-column grid and sticky side card only from `xl`, side card at `xl:top-20` (the sticky Topbar is 4rem high).
- Do not export non-component values from "use client" files for server use.
- Fake data only (`example.com`). Stage by path only. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Leave untracked docs files alone. Branch `cohorts-guided`; do not push.

## Review Focus

- Date shown for a cohort created at 20:30 UTC is the next day in Pakistan time, and the same text is produced whatever the machine timezone (set `TZ` in the test or use fixed UTC ISO strings and assert text).
- Ticking more than 20 cohorts is impossible (limit logic unchanged), including cohorts hidden by the search; the number shown is of visible ticks.
- Delete still asks first with the same title and warning text, and only deletes after Confirm; failure shows the same error toast; a deleted cohort drops out of the picks.
- A cohort with 0 people: no download items (menu shows "No people to download"), and it cannot add 0-people downloads that break the file link.
- Cohort with no course: shows "Course not set", never "undefined".
- Search with no match shows "No cohorts match" with the typed text; zero cohorts shows the import link.

---

### Task 1: Fix the date hydration error

**Files:**
- Modify: `src/components/admin/crm/CohortsPanel.tsx`, `src/components/admin/crm/CohortDetailClient.tsx`
- Test: `tests/cohorts-dates-hydration.test.tsx`

**Interfaces:**
- Consumes: `formatDatePkt(iso: string): string` from `@/lib/format` (exists).

- [ ] **Step 1: Write failing tests** in `tests/cohorts-dates-hydration.test.tsx`: render `CohortsPanel` with one cohort `createdAt: "2026-10-12T20:30:00.000Z"` and assert the page text contains `13 Oct 2026` (Pakistan date), not `12 Oct 2026`; the same for `CohortDetailClient` with the same `createdAt` (read its props type from the component; mock `next/navigation`, `sonner` and fetch as the existing tests `tests/cohort-detail-client.test.tsx` and `tests/cohorts-panel-meta.test.tsx` do); run both under `process.env.TZ` set to `"UTC"` and to `"Asia/Karachi"` (set before the Date is created; use `vi.stubEnv` or run with two describe blocks) and assert identical output text.
- [ ] **Step 2: Run, expect FAIL** (current `formatDate` uses the machine zone).
- [ ] **Step 3: Replace `formatDate` with `formatDatePkt`** in both components (import change plus the calls at the lines that print `createdAt`). Check for any other `formatDate`/`toLocale*` use in the two components and fix those too.
- [ ] **Step 4: Run the new test plus `tests/cohort-detail-client.test.tsx` and `tests/cohorts-panel-meta.test.tsx`; update their date expectations only where they asserted the old timezone-dependent text. tsc, eslint.**
- [ ] **Step 5: Commit** `fix(cohorts): print dates in Pakistan time so server and browser agree`.

### Task 2: Cohort list, row menu and find step

**Files:**
- Create: `src/components/admin/crm/CohortsList.tsx`, `src/components/admin/crm/CohortRowMenu.tsx`
- Modify: `src/components/admin/crm/CohortsPanel.tsx` (state, search, delete flow, steps 1 and 2; calls the list)
- Test: `tests/cohorts-guided-list.test.tsx`

**Interfaces:**
- Produces: `CohortsList({ cohorts, selected, atLimit, busyId, removing, onToggle, onDelete })` (phone cards, PC 4-5 column rows) and `CohortRowMenu({ cohort, busy, onDelete })` (More button: Download for Meta / Download plain version as links with the `download` attribute and the existing `exportHref`/`plainHref` URLs, and Delete). Export the two URL helpers from a non-client file `src/lib/crm/cohort-export-url.ts` (`cohortExportUrl(ids: string[]): string`, `cohortPlainUrl(ids: string[]): string`), with the same output as today.

- [ ] **Step 1: Write failing tests:** headings "1. Find a cohort" and "2. Pick cohorts"; search box labelled "Search by sheet or tab name" filters by sheet and tab; each cohort shows sheet name (link to `/dashboard/admin/sales-hub/cohorts/<id>`), tab, course or "Course not set", "N people" ("1 person") plus "(of M imported)" when different and not interested-only (existing `showImportedNote` rule), a Pakistan-time date, and the kind chip text unchanged ("Closed batch: paid", "Interested, not paid"); More menu opens with the two download links (hrefs equal `/api/admin/crm/cohorts/export?ids=<id>` and the same with `&format=plain`) and Delete; Escape closes and returns focus to More; a 0-people cohort shows "No people to download" and no download links; Delete asks with title "Delete cohort?" and the same warning text as today, only calls DELETE `/api/admin/crm/cohorts/<id>` after confirm, drops the row and shows "Cohort deleted." (failure shows the error toast text); empty list shows "No cohorts imported yet" with the import link; no match shows "No cohorts match" and `Nothing matches "x".`; ticks cap at 20 (the 21st cannot be ticked, a note says "You can pick at most 20 cohorts at a time"), ticks hidden by search stay counted toward the cap.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the three files. Phone cards: big tick box (44px label), sheet name link, tab, course, people line, chip, More button; PC (md+): tick, Cohort (sheet link with tab under it and chip), Course, People, Imported, More. Use `useConfirm` and `useAsyncAction` as today. Keep the Audiences link card.
- [ ] **Step 4: Run test, existing `tests/cohorts-panel-meta.test.tsx` (update only where it asserted the old toolbar or table text), tsc, eslint, UTF-8 scan.**
- [ ] **Step 5: Commit** `feat(cohorts): find and pick cohorts list with row menu`.

### Task 3: What do you want to do, page frame, finish

**Files:**
- Create: `src/components/admin/crm/CohortsActions.tsx`, `docs/superpowers/plans/2026-11-18-cohorts-guided-owner-steps.md`
- Modify: `src/components/admin/crm/CohortsPanel.tsx` (step 3 area and layout), `src/app/dashboard/admin/sales-hub/cohorts/page.tsx` (intro)
- Test: `tests/cohorts-guided-actions.test.tsx`

**Interfaces:**
- Produces: `CohortsActions({ cohorts: Cohort[] /* the visible ticked ones */, atLimit: boolean, hiddenTicks: number })`.

- [ ] **Step 1: Write failing tests:** intro reads "Each imported sheet becomes a cohort. Pick the ones you want, then download them for Meta."; heading "3. What do you want to do?"; with no ticks the area says "Tick cohorts to download them" and shows "You can pick up to 20 at a time."; with 2 ticks it says "2 cohorts selected" ("1 cohort selected") and "Up to N people" (sum of `contactCount`), a primary link "Download for Meta" (href `/api/admin/crm/cohorts/export?ids=a,b`, `download` attribute) and a secondary "Download plain version" with `&format=plain`, the upload note ("Upload the downloaded file in Meta Ads Manager: Audiences, Create audience, Custom audience, Customer list.") and the plain-file privacy note ("The plain file has real emails and phone numbers. Meta scrambles it for you when you upload. Keep it private and delete it after uploading."); the limit note when at 20 (with ", including ones hidden by your search" when ticks are hidden); focus is not stolen on load; layout class assertions: phone bar `bottom-[calc(4.5rem+env(safe-area-inset-bottom))]` and `lg:bottom-4`, side card `xl:top-20`, grid `xl:grid`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `CohortsActions` and the layout (list left, card right from xl; sticky bar below xl, capped 50vh). Intro line in the page. Write the owner steps (no database update; how to look at Cohorts; what to check on a phone: no sideways scroll, the bottom bar not covering the menu, the More menu opens fully, no wrong characters; check the browser console has no red error on load — that was the date bug; what is unchanged: downloads and delete work as before).
- [ ] **Step 4: Run all new tests plus `tests/cohorts-panel-meta.test.tsx`, `tests/cohort-detail-client.test.tsx`, `tests/cohorts-tabs.test.tsx`, `tests/cohort-export-route.test.ts`, `tests/client-boundary-values.test.ts`; tsc (0), eslint, UTF-8 scan.**
- [ ] **Step 5:** Run `node node_modules/next/dist/bin/next build` once (check port 3000 with netstat first; skip and say so if a dev server is up). Commit `feat(cohorts): what do you want to do area and page intro` and, separately, `docs(cohorts): owner steps`.
