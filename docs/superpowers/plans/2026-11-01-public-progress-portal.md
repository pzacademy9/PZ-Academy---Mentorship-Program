# Public Progress Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/progress` into a public portal: every batch listed (Courses / Workshops / Webinars), each batch page showing everyone's attendance and results (first name + PZ ID), plus a "My Progress" page in the logged-in student's sidebar.

**Architecture:** One pure builder (`src/lib/progress/portal-build.ts`) turns plain rows into the portal view; one server loader (`src/lib/data/portal.ts`) reads the database and calls it. Public pages are server components that pass the finished view to small client components (tabs, search, drawer). The personal lookup already built on `track-progress` is kept only as the data behind the new `/dashboard/progress` page; the public "Find my ID" and "enter your ID" screens are removed because the portal rows already show first name + ID.

**Tech Stack:** Next.js App Router, Supabase (service-role reads through `createAdminSupabase`), Vitest + the existing `tests/helpers/supabase-mock`, Tailwind `pz-*` tokens.

**Spec:** Owner's redirect of 2026-11-01 (memory `pz-academy-track-progress-status.md`, last paragraph) and this plan's Global Constraints. Stitch screens (portal home, batch page, student sidebar section) come from the owner; Tasks 4-6 start only after they exist.

## Global Constraints

- Branch `public-portal`, created off `track-progress` (it reuses `progress.ts`, `build.ts`, `lookup-limit.ts`, migration 0094). Never push or merge without the owner's yes.
- No new migration. Migration 0094 (already prepared, not yet pasted) must be live before this ships because the rate limiter uses it.
- Public rows show **first name + PZ ID only**. Never email, last name, phone or full name.
- Only registrations with `status in ('paid','free')` and `is_test = false`; only batches with `landing_pages.status in ('published','closed')` and `kind in ('course','workshop','webinar')`.
- A person with both a live and a recorded registration in one batch counts as **live** (same rule as `progress.ts`).
- Attendance counts only classes matching the student's option labels (`parseOption` + `matchAudience`); a class with no stored audience counts for everyone; a stored audience that cannot be read is left out. (Same rules as `build.ts`.)
- Recorded students: attendance shows "Not tracked"; results listed with scores and **no rank**.
- Ranking is competition ranking (10, 10, 5 gives 1, 1, 3) among live students only.
- Overall results view = sum of each person's saved scores across the batch's classes; per-class view = that class's scores.
- Public batch page is rate limited with `allowLookup(ip)` from `src/lib/pzid/lookup-limit.ts` (same IP rule as `src/app/progress/actions.ts`).
- Tests use fake people only ("Sample", "Name-0000"). Never commit student data.
- UI: follow the downloaded Stitch screens; phone first (320 / 390 / 768), dark mode, tap targets at least 44px, text at least 14px, `pz-*` tokens. Do not copy demo-only parts of a screen.
- Checks run directly (no `npm run`): `node node_modules/typescript/bin/tsc --noEmit` (0 errors), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`. Never edit `database.types.ts` wholesale. No `eslint-disable` for `@typescript-eslint`. Use Edit on CRLF files. Stage files by path only. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Person live in a batch and also recorded in it: appears once, as live, with attendance and a rank.
- Two students with the same first name: both rows show, told apart by PZ ID; search matches either.
- Batch with no class held yet: percent is "no classes yet", never 0% or NaN; leaderboard says "No results yet".
- Tied scores: both get the same rank; the next rank skips (1, 1, 3).
- A saved quiz score for a person who is not an enrolled student of that batch (stale or test data): must not appear or affect ranks.
- A test registration or a pending/cancelled registration: person never appears.
- Slug that is unknown, draft, or of another kind: 404, no data.
- Logged-in student whose email has no PZ person: friendly "nothing yet" page with a link to the portal, no crash.
- Rate limit exceeded or a database read fails: friendly message, no raw error text sent to the browser.

---

## File Structure

- Create `src/lib/progress/portal-build.ts` - pure builder and view types.
- Create `src/lib/data/portal.ts` - `listPortalBatches()`, `getPortalBatch(slug, now)`; also `getProgressForEmail(email)`.
- Create `src/app/progress/page.tsx` (replace) - portal home.
- Create `src/app/progress/[slug]/page.tsx` - batch page shell (server, rate limited, 404).
- Create `src/components/progress/portal/` - `PortalHome.tsx`, `BatchPortal.tsx` (tabs + search), `AttendanceList.tsx`, `StudentDrawer.tsx`, `ResultsBoard.tsx`.
- Create `src/app/dashboard/progress/page.tsx` - My Progress.
- Modify `src/components/dashboard/nav.ts` - add student nav item.
- Delete after the above works: `src/components/progress/ProgressPage.tsx`, `MyIdSection.tsx`, and in `src/app/progress/actions.ts` the `findMyIdByName` / `getMyProgress` exports and their tests.
- Tests: `tests/portal-build.test.ts`, `tests/portal-data.test.ts`, `tests/portal-ui.test.tsx`, `tests/my-progress-page.test.tsx`.

---

### Task 1: Pure portal builder

**Files:**
- Create: `src/lib/progress/portal-build.ts`
- Test: `tests/portal-build.test.ts`

**Interfaces:**
- Consumes: `parseOption`, `matchAudience`, `Audience` from `@/lib/classes/audience`; `attendancePercent`, `meetsMinimum` from `@/lib/attendance/rules`; `ProgressKind` from `@/lib/progress/build`.
- Produces:
  - `type PortalSessionInput = { id: string; number: number; title: string; startsAt: string; audience: Audience | null; quizMax: number | null }`
  - `type PortalRegInput = { personId: string; mode: "live" | "recorded"; optionLabel: string }`
  - `type PortalPersonInput = { id: string; pzId: string; displayName: string }`
  - `type PortalBatchInput = { pageId: string; title: string; slug: string; kind: ProgressKind; minPct: number; sessions: PortalSessionInput[]; people: PortalPersonInput[]; regs: PortalRegInput[]; marks: { sessionId: string; personId: string }[]; scores: { sessionId: string; personId: string; score: number }[]; now: Date }`
  - `type PortalAttendanceRow = { firstName: string; pzId: string; mode: "live" | "recorded"; attended: number | null; held: number | null; pct: number | null; meetsMin: boolean | null; classes: { number: number; title: string; startsAt: string; state: "present" | "absent" | "upcoming" }[] }` (`attended/held/pct/meetsMin` and `classes` empty are null/empty for recorded: "Not tracked")
  - `type PortalResultRow = { firstName: string; pzId: string; mode: "live" | "recorded"; score: number; rank: number | null }`
  - `type PortalBatchView = { title: string; slug: string; kind: ProgressKind; minPct: number; sessions: { id: string; number: number; title: string; quizMax: number | null }[]; attendance: PortalAttendanceRow[]; overall: PortalResultRow[]; perClass: Record<string, PortalResultRow[]> }`
  - `buildPortalBatch(input: PortalBatchInput): PortalBatchView`
  - `type PortalBatchCard = { title: string; slug: string; kind: ProgressKind; students: number; classesHeld: number; classesTotal: number; lastClassAt: string | null }` and `buildPortalCards(batches: PortalBatchInput[]): PortalBatchCard[]` (newest last-class first, ties by title then slug)

- [ ] **Step 1: Write failing tests** in `tests/portal-build.test.ts`, one `it` per line, fake people only:
  - live student with 2 of 3 held classes: `attended 2, held 3, pct 67` (use `attendancePercent`), `classes` has 3 rows with states `present/absent/present` plus an `upcoming` row for a future class.
  - Module scoping: student with label `Live - Modules: M2` is not counted for a class whose audience is Module 1 only.
  - Recorded student: `attended/held/pct/meetsMin` all `null`, `classes` `[]`.
  - Person with a live and a recorded reg appears once as `live`.
  - Competition ranking: scores 10, 10, 5 among live give ranks 1, 1, 3; a recorded student with score 99 is listed, `rank: null`, and does not push live ranks.
  - Overall = sum per person; students with no score at all are omitted from results lists but kept in attendance.
  - A score row for a person who has no reg in the batch is ignored.
  - No held class: `pct null`, `meetsMin` false-safe (use `meetsMinimum(null, min)`).
  - Rows sorted: attendance by first name then PZ ID; results by rank (recorded after live, by score desc then name).
  - Same first name twice: two rows, distinct `pzId`.
  - `buildPortalCards`: counts only distinct people with a paid/free reg; `classesHeld` counts started classes; ordering rule above.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/portal-build.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the types and both functions in `src/lib/progress/portal-build.ts`. Reuse the scoping logic from `buildBatch` in `src/lib/progress/build.ts` (same `parseOption` / `matchAudience` rule); first name = first whitespace-separated word of `displayName`. Pure: no server imports, no clock (`now` is in the input).
- [ ] **Step 4: Run** the same command. Expected: PASS. Also run tsc: 0 errors.
- [ ] **Step 5: Commit** `feat(portal): pure builder for batch attendance and results lists`.

---

### Task 2: Server loaders

**Files:**
- Create: `src/lib/data/portal.ts`
- Test: `tests/portal-data.test.ts` (copy the `createSupabaseMock` / `memoryHandler` setup from `tests/progress-data.test.ts`)

**Interfaces:**
- Consumes: Task 1 types and builders; `createAdminSupabase`; `fetchAll` from `@/lib/data/attendance`; `audienceFromJson`.
- Produces:
  - `listPortalBatches(now?: Date): Promise<PortalBatchCard[]>`
  - `getPortalBatch(slug: string, now?: Date): Promise<PortalBatchView | null>` (null for unknown slug, non-published/closed status, or wrong kind)
  - `getProgressForEmail(email: string, now?: Date): Promise<Progress | null>` (looks the email up in `pz_person_emails` lowercase, then returns what `getProgressByPzId` returns for that person's `pz_id`; null if no person)
  - Both list functions throw on a failed read (never a partial answer); messages stay on the server.

- [ ] **Step 1: Write failing tests**: seed like `progress-data.test.ts` (published course with 2 live + 1 recorded, a draft page, a test-only registration, a pending registration, an unreadable stored audience, a stray score for a non-student). Assert: `listPortalBatches` omits draft and shows correct counts; `getPortalBatch("course-a")` returns exactly the enrolled people, no emails anywhere in `JSON.stringify(view)`; unknown or draft slug returns null; a read error rejects; `getProgressForEmail("Me@Example.com")` matches case-insensitively and an unknown email returns null.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/portal-data.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `src/lib/data/portal.ts`. Read in chunks of 200 with `fetchAll`, as `progress.ts` does (pages, sessions, registrations, people, marks, quiz results). `getProgressForEmail` delegates to `getProgressByPzId` so the personal rules stay in one place.
- [ ] **Step 4: Run** the test and tsc. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `feat(portal): server loaders for batch list, batch view, and progress by email`.

---

### Task 3: Stitch gate (no code)

- [ ] **Step 1:** `mcp__stitch__list_screens` for project `4651274386787527431`; find the three new screens (portal home, batch page, student sidebar section). If missing, stop and ask the owner one question.
- [ ] **Step 2:** Download each with `mcp__stitch__download_file` into the session scratchpad (not the repo). Read them.
- [ ] **Step 3:** Write down, in the SDD ledger under `.superpowers/sdd/`, which parts are real UI and which are demo-only (fake names, fake numbers, device frames) so later tasks skip the demo parts.

---

### Task 4: Portal home page

**Files:**
- Replace: `src/app/progress/page.tsx`
- Create: `src/components/progress/portal/PortalHome.tsx`
- Test: `tests/portal-ui.test.tsx`

**Interfaces:**
- Consumes: `listPortalBatches()` from Task 2; `PortalBatchCard`.
- Produces: `<PortalHome groups={{ kind: ProgressKind; batches: PortalBatchCard[] }[]} />` - three groups in order Courses, Workshops, Webinars; empty groups hidden; each card is one link to `/progress/<slug>`.

- [ ] **Step 1: Write failing UI tests**: groups render in the right order with headings "Courses", "Workshops", "Webinars"; an empty group has no heading; each card links to `/progress/<slug>` and shows student count and "x of y classes held"; page has exactly one `h1`; empty portal shows a plain "No batches yet" message.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/portal-ui.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the page as a server component (keep the existing logo header from the current page) that calls `listPortalBatches()` and renders `PortalHome` to match the Stitch home screen. Wrap the call so a failure shows a short generic error, not the thrown text.
- [ ] **Step 4: Run** tests, tsc, eslint on the new paths. Expected: clean.
- [ ] **Step 5: Commit** `feat(portal): public home listing every batch by type`.

---

### Task 5: Batch page (attendance, results, search, drawer)

**Files:**
- Create: `src/app/progress/[slug]/page.tsx`
- Create: `src/components/progress/portal/BatchPortal.tsx`, `AttendanceList.tsx`, `StudentDrawer.tsx`, `ResultsBoard.tsx`
- Test: `tests/portal-ui.test.tsx` (extend)

**Interfaces:**
- Consumes: `getPortalBatch(slug)`, `allowLookup(ip)`, `PortalBatchView`.
- Produces: `<BatchPortal view={PortalBatchView} />` (client component): two tabs "Attendance" and "Results"; one search box shared by both (matches first name or PZ ID, case-insensitive, ignores spaces); `StudentDrawer` opens from an attendance row and lists that student's classes.

- [ ] **Step 1: Write failing UI tests** (Review Focus items marked R):
  - Attendance tab: row shows first name, PZ ID, "attended X of Y" and a percent; recorded row shows "Not tracked" and no percent.
  - Tapping a live row opens the drawer with the class list (present / absent / upcoming wording); recorded row opens no drawer.
  - Search "sample" filters both tabs; search by PZ ID works; no match shows "No one matches".
  - Results tab: Overall and per-class switch; live rows show rank, recorded rows show score and no rank; tied ranks display equally (R).
  - Batch with no held class shows "No classes yet" and no percent; no results shows "No results yet" (R).
  - Page route: unknown slug calls `notFound()`; rate-limited caller sees the friendly "Too many requests, try again in a few minutes" message and `getPortalBatch` is not called; a thrown loader error shows the generic message only (R).
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** to match the Stitch batch screen. The page is a server component: read caller IP exactly like `callerAllowed` in `src/app/progress/actions.ts`, then `getPortalBatch(slug)`, then render `BatchPortal`. Tabs are real buttons with `role="tab"`; drawer is the existing `Dialog` from `@/components/ui/dialog` (bottom sheet on phones if the Stitch screen shows that); one screen-reader live region for the result count.
- [ ] **Step 4: Run** tests, tsc, eslint. Then start the dev server per the project's usual way and check `/progress` and a batch at 320 / 390 / 768 wide, light and dark. Expected: no horizontal scroll, readable text.
- [ ] **Step 5: Commit** `feat(portal): batch page with attendance, results, search and class drawer`.

---

### Task 6: My Progress in the student sidebar

**Files:**
- Create: `src/app/dashboard/progress/page.tsx`
- Modify: `src/components/dashboard/nav.ts` (add `{ label: "My Progress", shortLabel: "Progress", href: "/dashboard/progress", icon: TrendingUp, roles: ["student"] }` next to "My Courses"; import `TrendingUp` from `lucide-react`)
- Test: `tests/my-progress-page.test.tsx`, `tests/dashboard-nav.test.ts` (extend if it exists, else add one assertion file)

**Interfaces:**
- Consumes: `getProgressForEmail`, existing `ProgressSection` (`{ progress: Progress; headingRef? }`), Supabase auth user from `createServerSupabase`.
- Produces: page that renders `ProgressSection` for the signed-in user, plus a link "See every batch" to `/progress`.

- [ ] **Step 1: Write failing tests**: student nav includes "My Progress" and mentor/admin nav does not; page with a person shows their batches via `ProgressSection`; page with no person (or null result) shows the friendly empty state and the portal link (R); a loader error shows the generic message (R).
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement** the server page (layout `src/app/dashboard/layout.tsx` already redirects signed-out users). Match the Stitch sidebar-section screen. Mobile bottom bar keeps 4 items; "My Progress" lands in the "More" sheet unless the Stitch screen says otherwise.
- [ ] **Step 4: Run** tests, tsc, eslint. Open the page logged in as the test student account listed in memory.
- [ ] **Step 5: Commit** `feat(portal): My Progress page and student sidebar link`.

---

### Task 7: Retire the old public lookup, final checks

**Files:**
- Delete: `src/components/progress/ProgressPage.tsx`, `MyIdSection.tsx`; their parts of `tests/progress-ui.test.tsx`, `tests/progress-actions.test.ts`
- Modify: `src/app/progress/actions.ts` (remove both exports; keep the file only if something still imports it, otherwise delete it); `src/lib/data/pz-people.ts` (remove `findIdsByName`, `checkNameQuery`, `cleanNameQuery`, `MyIdRow` only if nothing else uses them)
- Modify: `docs/superpowers/plans/2026-11-01-track-your-progress-owner-steps.md` (name search check removed; the limiter check stays)

- [ ] **Step 1:** `grep` each symbol to confirm nothing else uses it, then delete.
- [ ] **Step 2: Run** tsc (0 errors), eslint on `src/app/progress src/components/progress src/lib/data src/app/dashboard`, and vitest on every `portal-*`, `progress-*`, `lookup-limit`, `my-progress-page` test. Known unrelated failures are listed in the session brief; anything else failing is mine.
- [ ] **Step 3:** Whole-branch review by a fresh reviewer (set the model explicitly), one fix wave, re-check.
- [ ] **Step 4: Commit** `refactor(portal): remove the old ID-entry screens now replaced by the portal`.
- [ ] **Step 5:** Update memory and `docs` status; hand the owner: 0094 paste steps, the phone-width and dark-mode checklist, and the compare link (no push until the owner says yes).

---

## Notes for the owner (plain words)

- Anyone with the link sees every student's first name and PZ ID, and that student's attendance and quiz scores. This is the choice you made; it is the main privacy trade-off.
- Because the portal rows already show first name + ID, the old "Find my ID" search goes away.
- Still not in this plan: the admin-only organised ID list (needs its own Stitch screen), and aligning the admin attendance grid with the module-matching rule.
