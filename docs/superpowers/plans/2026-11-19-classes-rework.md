# Classes rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the per-class admin page easy for a non-technical owner: three always-visible actions, a clear reminder line, three tabs (Links and emails, Attendance, Quiz and podium), attendance search with quick marks, a shareable podium, and a layout that fits the screen on PC.

**Architecture:** Keep `SessionsPanel`, `ClassList`, the data loaders and every existing server action. Replace the three stacked fold cards inside `TodayPanel` with an action row + reminder line + a tab bar. Reminder text and attendance search are new pure functions with tests. Tab and class are kept in the address (`?class=`, `?tab=`). The podium reuses `SharePodium` and the existing public podium picture route (no new route, no database change).

**Tech Stack:** Next.js 14.2.5 App Router, TypeScript, Tailwind (pz-* tokens, existing `cardCls/primaryBtn/quietBtn/fieldCls` in `src/components/admin/classes/styles.ts`), Supabase (service-role loaders), vitest + Testing Library, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-19-classes-rework-design.md`

## Global Constraints

- No database change, no new route, no change to how emails, reminders, check-in windows or marks work. Every existing action in `.../campaign/[pageId]/sessions/actions.ts` keeps its signature.
- Owner copy: short plain words, calm, no exclamation marks, no sales words. Times in Pakistan time (use `formatPkt` from `src/lib/attendance/rules.ts`). Tap targets at least 48px (`min-h-12`).
- Colours: backgrounds and borders use pz-solid-* or landing-* tokens or the pz-primary / pz-surface-container-* family; pz-deep, pz-mid, pz-danger are text only. No `eslint-disable` for `@typescript-eslint`.
- Never regenerate `src/lib/supabase/database.types.ts`.
- A server page must not import plain values from a "use client" file: keep shared constants and pure helpers in non-client files (`tests/client-boundary-values.test.ts` guards this).
- Run tools directly (the `&` in the path breaks `npm run`): `node node_modules/typescript/bin/tsc --noEmit` (0 errors), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`. Known failing tests that are not ours: pz-tokens, participant-recipients, participant-whatsapp-ui, landing-route-hardening, gas-apply-registration-status, landing-event-sheet and a few landing-*/participant-* ones.
- Source files often use CRLF: keep each file's line endings.
- Reminder time rule (from `listDueReminderSessionIds`, `src/lib/data/session-cron.ts`): the reminder goes out at `starts_at - email_lead_minutes` when `email_enabled` is true and `audience` is set, the class has not started, and no reminder has been sent. The cron runs every 5 minutes.
- Branch `classes-rework` (from `menu-and-covers`). Do not push or merge without the owner's yes.
- Look: Stitch is the source of truth. No Classes screen existed when this plan was written; the phone and PC screens were requested in Stitch project `13117286791417011091` (design system `assets/13928921589093913717`). UI tasks 3 to 6 follow the screens the owner approves; see Task 0.

## Review Focus

- Reminder line states: sent, switched off, no audience chosen, due now (not yet sent), will send at a time, class started with no reminder, lead time of 0. Each must say exactly what the cron would do.
- `?tab=` and `?class=` with bad values (unknown tab, class from another batch, empty): fall back to Links and emails and the default class, never crash or show an empty panel.
- "Send emails" with no audience chosen must not send; it opens the Links tab and focuses the audience box.
- Tab keyboard use: arrow keys move between tabs, Home/End jump, the active tab is announced (`role="tablist"`, `aria-selected`, `aria-controls`), focus is not lost when the class changes.
- Attendance search: no match shows a plain line; clearing the box restores the full list; a mark tapped while filtered keeps its state when the filter changes; names with accents or Urdu text match by `includes` ignoring case.
- Podium: no slug or no saved quiz shows the plain explanation instead of a broken picture; a failed picture falls back to the same line; Share podium opens with the right class and file name.
- PC width: no sideways scroll at 1440px and 1280px, and the link boxes and attendance list scroll inside their own box, not the page.
- Nothing from the old folds is lost: every button that existed in AttendanceCard, FeedbackCard and QuizCard still has a home.

---

### Task 0: Stitch screens (controller, not an implementer)

- [ ] `list_screens` on project `13117286791417011091` (the two requests were sent 2026-11-19 and may take 10 to 25 minutes). Never re-send a request: re-list.
- [ ] Show the owner both screens and get their approval or changes before Task 3. Tasks 1 and 2 (logic and width) may start meanwhile.
- [ ] If a screen disagrees with this plan's layout, the screen wins for look and spacing; the plan wins for behaviour.

### Task 1: Pure helpers (reminder line, attendance search)

**Files:**
- Create: `src/lib/classes/reminder-line.ts`, `src/lib/classes/attendance-search.ts`
- Test: `tests/classes-reminder-line.test.ts`, `tests/classes-attendance-search.test.ts`

**Interfaces:**
- Consumes: `formatPkt(iso: string): string` (`src/lib/attendance/rules.ts`); `audienceFromJson(json: unknown)` (`src/lib/classes/audience.ts`); `SessionRow` (`src/lib/data/attendance.ts`); `SessionSendState` (`src/lib/data/session-emails.ts`); `GridRow` (`src/lib/data/attendance.ts`).
- Produces:
  - `export type ReminderTone = "ok" | "warn" | "idle"`
  - `export type ReminderLine = { text: string; tone: ReminderTone }`
  - `export function reminderLine(session: Pick<SessionRow, "starts_at" | "email_enabled" | "email_lead_minutes" | "audience">, sends: SessionSendState | undefined, now: Date): ReminderLine`
  - `export function filterAttendanceRows<T extends { name: string; pzId: string }>(rows: T[], query: string): T[]`

- [ ] **Step 1: Write the failing tests.** `reminderLine` cases (assertions on `text` and `tone`, with the exact texts): reminder already sent -> `Reminder sent <formatPkt(reminderAt)>` / ok; class already started and nothing sent -> `No reminder was sent for this class` / idle; switched off -> `Reminder is switched off` / idle; on but no audience -> `Choose who gets the reminder` / warn; on with audience, now is at or after start minus lead -> `Reminder is due and goes out within a few minutes` / warn; on with audience, before that -> `Reminder will send <formatPkt(start - lead)>` / ok; lead 0 minutes means the send time is the start time. Order of precedence is exactly the order listed. `filterAttendanceRows`: empty or whitespace query returns the same array contents; matches by name substring ignoring case; matches by PZ ID substring ignoring case; trims the query; no match returns `[]`; accented and Urdu names match with `includes`; does not mutate the input.
- [ ] **Step 2: Run both, show RED.** `node node_modules/vitest/vitest.mjs run tests/classes-reminder-line.test.ts tests/classes-attendance-search.test.ts`
- [ ] **Step 3: Implement both modules** (no React, no "use client"). Compute the send time as `new Date(new Date(starts_at).getTime() - email_lead_minutes * 60_000).toISOString()`.
- [ ] **Step 4: GREEN, `tsc`, eslint.** Commit `feat(classes): reminder line and attendance search helpers`.

### Task 2: PC width fix and the page slug

**Files:**
- Modify: `src/components/admin/attendance/SessionsPanel.tsx` (the `lg:grid-cols-[20rem_1fr]` line and the right column wrapper), `src/lib/data/class-overview.ts` (`ClassOverview`, `getClassOverview`), `src/components/admin/classes/BatchSummary.tsx`
- Test: `tests/classes-layout.test.tsx`, extend `tests/class-overview-data.test.ts`

**Interfaces:**
- Produces: `ClassOverview.slug: string | null` (the landing page's `slug`, from the same `landing_pages` select that reads `title, feedback_program_id`); `lg:grid-cols-[20rem_minmax(0,1fr)]` on the main grid with `min-w-0` on the class panel column; `BatchSummary` renders collapsed by default.

- [ ] **Step 1: Write failing tests.** (a) Render `SessionsPanel` with one class (copy the fixtures of `tests/classes-overview-ui.test.tsx`) and assert the grid element's className contains `minmax(0,1fr)` and the right column has `min-w-0`. (b) `getClassOverview` returns `slug` (extend the data test's mock page row with a `slug`). (c) `BatchSummary` starts collapsed: its details content is not open until the toggle is used (read the component first: if it is already a collapsed `details`, keep it and assert that instead and say so in your report).
- [ ] **Step 2: Run, show RED.**
- [ ] **Step 3: Implement.** Add `slug` to the `landing_pages` select and the returned object (null when missing, also in the empty-classes early return). Change the grid class. Make the batch summary collapsed by default using the existing patterns in `FoldCard.tsx` or a native `details`, keeping all current content.
- [ ] **Step 4: GREEN, `tsc`, eslint, plus `tests/classes-overview-ui.test.tsx tests/classes-summary-ui.test.tsx tests/class-overview-data.test.ts`.** Commit `fix(classes): page fits the screen on PC, load the batch slug, collapse the batch summary`.

### Task 3: Class header, action row and reminder line

**Files:**
- Create: `src/components/admin/classes/useSessionEmails.ts` (a hook), `src/components/admin/classes/ClassActionRow.tsx`
- Modify: `src/components/admin/classes/TodayPanel.tsx` (header stays; add the row and the line under it), `src/components/admin/classes/AttendanceCard.tsx` (use the hook instead of its own copies of the handlers)
- Test: `tests/classes-action-row.test.tsx`, existing `tests/classes-overview-ui.test.tsx` kept green

**Interfaces:**
- Consumes: `reminderLine` (Task 1); the email actions already imported by `AttendanceCard.tsx` (`sendReminderNow`, `resendClassDetails`, `emailMissingOnly`, `emailNewZoomLink`, `emailUpdatedTime`, `sendTestEmailToMe`); `useConfirm`; `CopyLinkButton` look from `CopyLinkButton.tsx`.
- Produces:
  - `export function useSessionEmails(session: SessionRow, sends: SessionSendState | undefined): { busy: boolean; sendNow: () => Promise<void>; missingOnly: () => Promise<void>; newZoomLink: () => Promise<void>; updatedTime: () => void; testToMe: () => void }` (move the existing handler bodies and confirm texts from `AttendanceCard.tsx` unchanged; `sendNow` keeps the first-time versus again wording).
  - `export function ClassActionRow(props: { cls: ClassSummary; session: SessionRow; sends: SessionSendState | undefined; now: Date; onNeedAudience: () => void }): JSX.Element` renders: three buttons **Copy attendance link** (copies `cls.attendanceLink`), **Copy feedback link** (copies `cls.feedbackLink`; if it is null the button is disabled and a short note says "This class has no feedback link yet"), **Send emails** (calls `sendNow`; when `audienceFromJson(session.audience)` is null it does NOT send but calls `onNeedAudience()` and shows a short toast "Choose who gets this email first"). Under them a status line from `reminderLine(session, sends, now)` with a small dot coloured by tone (ok green, warn amber, idle grey) and the text; the line is `role="status"`.
  - Copy buttons show "Copied" for 1.5 seconds like `CopyLinkButton`, and show a toast on clipboard failure with the existing text.

- [ ] **Step 1: Write failing tests** for `ClassActionRow`: copy buttons call `navigator.clipboard.writeText` with the right link; feedback button disabled with the note when `feedbackLink` is null; Send emails with no audience calls `onNeedAudience` and none of the send actions; with an audience it opens the confirm dialog (mock `useConfirm` as other tests in `tests/` do) and calls `sendReminderNow` once confirmed (and `resendClassDetails` when `sends.reminderAt` is set); each reminder tone renders its text from `reminderLine`; buttons have an accessible name and are at least `min-h-12`.
- [ ] **Step 2: Run, show RED.**
- [ ] **Step 3: Extract `useSessionEmails`** from `AttendanceCard.tsx` without changing its behaviour or confirm texts; make `AttendanceCard` call it. Build `ClassActionRow`. Render the row and the line in `TodayPanel` directly under the header card (above the next-step box). `onNeedAudience` is a prop on `TodayPanel` that Task 4 wires; until then pass a no-op that scrolls to an element with id `class-audience` if it exists.
- [ ] **Step 4: GREEN, `tsc`, eslint, plus `tests/classes-overview-ui.test.tsx tests/attendance-admin-actions.test.ts tests/classes-feedback-email.test.ts`.** Commit `feat(classes): action row and reminder line at the top of each class`.

### Task 4: Tabs, tab and class in the address, Links and emails tab

**Files:**
- Create: `src/components/admin/classes/ClassTabs.tsx`, `src/components/admin/classes/LinksTab.tsx`, `src/lib/classes/tabs.ts`
- Modify: `src/components/admin/classes/TodayPanel.tsx`, `src/components/admin/attendance/SessionsPanel.tsx`
- Test: `tests/classes-tabs.test.tsx`, `tests/classes-tabs-lib.test.ts`

**Interfaces:**
- Produces in `src/lib/classes/tabs.ts` (no "use client"): `export const CLASS_TABS = ["links", "attendance", "quiz"] as const`, `export type ClassTab = (typeof CLASS_TABS)[number]`, `export const CLASS_TAB_LABELS: Record<ClassTab, string>` = `{ links: "Links and emails", attendance: "Attendance", quiz: "Quiz and podium" }`, `export function parseClassTab(v: string | null | undefined): ClassTab` (anything unknown returns `"links"`).
- `export function ClassTabs(props: { active: ClassTab; onChange: (t: ClassTab) => void; counts?: Partial<Record<ClassTab, string>>; panelId: (t: ClassTab) => string }): JSX.Element`: a segmented control with `role="tablist"`, each tab `role="tab"`, `aria-selected`, `aria-controls={panelId(tab)}`, roving `tabIndex`, Left/Right arrows move and activate, Home/End jump to the first/last, each tab `min-h-12`; on phone it must not scroll sideways (three equal tabs with short labels allowed: use `CLASS_TAB_LABELS` for md and up, and short labels `Links`, `Attendance`, `Quiz` below md). The bar is sticky under the top bar (use `sticky top-16 z-10 bg-pz-surface` with a bottom border; check the page top bar height in `src/app/dashboard/layout.tsx`).
- `export function LinksTab(props: { pageId: string; cls: ClassSummary; session: SessionRow; sends: SessionSendState | undefined })`: the attendance link box, the feedback link box, `AudiencePicker` inside an element with `id="class-audience"`, `ClassEmailHistory` for reminder/update and for feedback, the buttons Email only those who haven't got it, Send me a test, Email new Zoom link, Email updated time (all via `useSessionEmails`), and the feedback numbers with See responses (reuse the markup and actions of `FeedbackCard.tsx`, including Create missing feedback links when there is no feedback link and Email to students for the feedback link).
- URL state in `SessionsPanel`: initial class from `searchParams.get("class")` if it is one of `overview.classes` ids else `overview.selectedId`; initial tab from `parseClassTab(searchParams.get("tab"))`; changing either calls `router.replace(\`?class=\${id}&tab=\${tab}\`, { scroll: false })` (use `useRouter`, `useSearchParams` from `next/navigation`; wrap in `Suspense` only if the page needs it, check the build). Switching class keeps the current tab.
- `TodayPanel` receives `tab`, `onTabChange`, and renders `ClassTabs` and the active panel in a `div role="tabpanel" id={panelId} aria-labelledby=...`. The "Next step" box stays; its button now calls `onTabChange` (`attendance` or `feedback` target -> `"links"`, `quiz` -> `"quiz"`) instead of opening folds; the `Link` to the quiz page keeps working. The attendance and quiz tab bodies are placeholders in this task that render the existing `AttendanceCard` and `QuizCard` unchanged (replaced in Tasks 5 and 6).
- `onNeedAudience` (from Task 3) switches to the Links tab, then scrolls `#class-audience` into view and focuses its first radio.

- [ ] **Step 1: Write failing tests.** `parseClassTab`: valid values pass, `null`, `""`, `"x"` give `"links"`. `ClassTabs`: renders three tabs with the right roles/aria; arrow keys, Home and End change the active tab (fire keyboard events); clicking calls `onChange`. `SessionsPanel` with mocked `next/navigation` (look at how other tests in `tests/` mock `useRouter`/`useSearchParams`): `?tab=attendance` opens that tab; `?tab=bogus` falls back to Links; `?class=<unknown>` falls back to the default class; picking another class keeps the tab and calls `router.replace` with both keys; `onNeedAudience` from the action row switches to Links and focuses the audience box.
- [ ] **Step 2: Run, show RED.**
- [ ] **Step 3: Implement.** Keep `FoldCard.tsx` in the repo (other tests use it) but stop using it in `TodayPanel`.
- [ ] **Step 4: GREEN, `tsc`, eslint, plus `tests/classes-overview-ui.test.tsx tests/classes-fold-card.test.tsx tests/classes-card-status.test.ts tests/client-boundary-values.test.ts`. Update `tests/classes-overview-ui.test.tsx` only where it asserted the old fold cards, keeping every behaviour assertion.** Commit `feat(classes): tabs for Links and emails, Attendance and Quiz, kept in the address`.

### Task 5: Attendance tab (search and quick marks)

**Files:**
- Create: `src/components/admin/classes/AttendanceTab.tsx`
- Modify: `src/components/admin/classes/TodayPanel.tsx`, `src/components/admin/attendance/AttendanceGrid.tsx` (only if needed to accept already-filtered rows or to scroll inside its own box)
- Test: `tests/classes-attendance-tab.test.tsx`

**Interfaces:**
- Consumes: `filterAttendanceRows` (Task 1); `toggleMark(sessionId, personId, present)` and `markEveryonePresent`, `setOverride` actions as `AttendanceCard.tsx` uses them; `checkinWindow`.
- Produces: `export function AttendanceTab(props: { pageId: string; cls: ClassSummary; session: SessionRow; rows: GridRow[]; minPct: number; nowIso: string })`: the present count and bar (from `AttendanceCard`), a search box (label "Search by name or ID", `type="search"`, `min-h-12`) above the list, the list showing every student of the batch with a quick present/not present button per row (48px, `aria-pressed`, name in its accessible label), "Mark everyone present" with its existing confirm, and the check-in group (Automatic / Force open / Force closed with its note) from `AttendanceCard`'s More settings. The list box has a max height and scrolls inside itself (`max-h-[60vh] overflow-y-auto`); it must not widen the page. With no match: plain line "No student matches that search." Search is local (no new query) and by name or PZ ID only (GridRow has no email: my call; say so in the report).
- Marks use the same optimistic flip-and-revert behaviour as `AttendanceGrid` (reuse its code or the component itself with `scoped` and filtered rows; do not write a second implementation of the same optimistic logic).

- [ ] **Step 1: Write failing tests**: typing filters rows by name and by PZ ID; clearing restores all; no match line; tapping a row calls `toggleMark(session.id, personId, true)` and flips `aria-pressed`, reverting with a toast when the action fails; a mark tapped under a filter keeps its state after the filter changes; Mark everyone present asks for confirm then calls the action; check-in buttons call `setOverride` with `auto`/`open`/`closed`; the search input has an accessible label.
- [ ] **Step 2: Run, show RED.**
- [ ] **Step 3: Implement and wire into `TodayPanel` for the attendance tab** (the old `AttendanceCard` is no longer rendered; delete it only if no test or file imports it any more, otherwise leave it).
- [ ] **Step 4: GREEN, `tsc`, eslint, plus `tests/attendance-data.test.ts tests/attendance-admin-actions.test.ts tests/classes-overview-ui.test.tsx`.** Commit `feat(classes): attendance tab with search and quick marks`.

### Task 6: Quiz and podium tab

**Files:**
- Create: `src/components/admin/classes/QuizTab.tsx`
- Modify: `src/components/admin/classes/TodayPanel.tsx`, `src/components/admin/attendance/SessionsPanel.tsx` (pass `slug`)
- Test: `tests/classes-quiz-tab.test.tsx`

**Interfaces:**
- Consumes: `ClassOverview.slug` (Task 2); `SharePodium` from `src/components/progress/portal/SharePodium.tsx` (props `slug`, `title`, `pick`, `label`, optional `imageUrl`, `fileBase`); `podiumImageUrl(slug, size, pick)` from `src/lib/progress/leaderboard.ts`.
- Produces: `export function QuizTab(props: { pageId: string; cls: ClassSummary; slug: string | null; batchTitle: string })`: the quiz status and the Upload Kahoot file / Open quiz results link from `QuizCard`; when `cls.quiz.saved` and `slug` is set, a podium preview (an `img` of `podiumImageUrl(slug, "square", cls.id)`, fixed aspect box, `alt` "Top three students for Class N", `loading="lazy"`; on image error replace it with the plain line below) and `SharePodium` with `pick={cls.id}`, `label={\`Class \${cls.number}\`}`, `title={batchTitle}`, `slug={slug}`; when quiz results are not saved: "The podium appears after you save the quiz results."; when saved but no slug or the picture fails: "The podium picture is ready once this batch is shown on the Progress page and quiz results are saved."

- [ ] **Step 1: Write failing tests**: not saved -> upload link and the "appears after you save" line, no SharePodium; saved with a slug -> preview `img` src equals `podiumImageUrl(slug,"square",cls.id)` and the Share podium button exists; saved with `slug` null -> the "ready once this batch is shown on the Progress page" line and no `img`; firing `error` on the `img` swaps to that line; the Open quiz results link points at `.../sessions/<id>/quiz`.
- [ ] **Step 2: Run, show RED.**
- [ ] **Step 3: Implement and wire** the quiz tab in `TodayPanel` (QuizCard no longer rendered; keep the file if still imported elsewhere).
- [ ] **Step 4: GREEN, `tsc`, eslint, plus `tests/classes-overview-ui.test.tsx tests/classes-card-status.test.ts`.** Commit `feat(classes): quiz and podium tab with Share podium`.

### Task 7: Whole-branch checks

- [ ] `node node_modules/typescript/bin/tsc --noEmit` returns 0 errors; eslint on every changed path.
- [ ] Focused tests: every file named above plus `tests/client-boundary-values.test.ts tests/classes-*.test.* tests/class-*.test.* tests/attendance-*.test.ts`. Known failing tests that are not ours stay as they are.
- [ ] Stop any dev server, then `node node_modules/next/dist/bin/next build` (a page changed). Restart the dev server after (delete the `.next` folder first).
- [ ] Browser look on localhost (admin test login, localhost only) at 390px, 1280px and 1440px on the PPC Batch 3 classes page: no sideways scroll; every button of the old page is reachable; copy buttons, tabs, `?tab=` reload, search, quick mark (do NOT press Send emails or mark real students: test the marks on a throwaway class or cancel), podium section. Compare with the approved Stitch screens.
- [ ] Strict-UTF-8 scan of every changed file (`python -I`). Opus whole-branch review. Do not push.
