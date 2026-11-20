# History icon + copy-with-message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move "Messages sent" behind a History icon at the top of the batch registrations page, give the attendance and feedback copy buttons a Copy link / Copy with message menu, and add Copy message to the Classes Share podium menu.

**Architecture:** Pure message builders (one file, unit-tested) feed three UI pieces: a reusable copy menu on the Classes screen, an optional third item in `SharePodium` fed by an admin-only server action, and a History panel wrapping the existing `MessagesSentList`. No database change.

**Tech Stack:** Next.js App Router, React client components, lucide-react, sonner toasts, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-20-history-and-copy-messages-design.md` (exact message wording is in it: copy the text verbatim, including emoji and line breaks).

## Global Constraints

- Message text is the owner's own wording from the spec. Only `{batch title}`, links, class number, open/close times, board label, names and points change.
- `{batch title}` is the landing page title (`ClassOverview.title`, passed to `TodayPanel` as `batchTitle`).
- Attendance open/close times = class start minus/plus the window minutes, in PKT. Default 15 and 15, exported from `src/lib/attendance/rules.ts` so a later job can pass real numbers. Show `7:15` and `7:45 pm` (am/pm left off the open time when it matches the close time's).
- Points have thousands commas. Fewer than three ranked students: list only those that exist.
- Podium message only in Classes (`QuizTab`). The student Progress page `Leaderboard.tsx` must not gain it.
- Classes screen uses `ds` tokens (`src/components/admin/classes/ds.ts`); registrations page uses `pz-*` tokens. No new Stitch screens.
- Source files use CRLF: keep it for edited files, write new files with CRLF. Stage by explicit path only; never `git add docs` (three untracked stranger docs exist there).
- Tools run directly (npm/npx broken by `&` in path): `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js <paths>`. Never regenerate `database.types.ts`.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A podium where two people tie (ranks 1,2,2): both listed with the shared medal; no crash (Task 1 test).
- Fewer than three ranked students, and zero (message action returns a plain "no ranked students yet" result, not an empty post) (Tasks 1, 3).
- Clipboard blocked or failing: toast "Could not copy..." and no "Copied" state (Task 2).
- A class with no feedback link: the feedback copy menu stays disabled, as the button is today (Task 2).
- Class crossing midnight or window opening before midnight: times shown still read correctly (Task 1 test: 00:10 class start gives open `11:55 pm`, close `12:25 am`).
- A non-admin calling the podium action gets a refusal, not names (Task 3).
- History panel: Escape closes it, focus returns to the icon, the "View details" dialog inside it still opens (Task 4).

## File structure

- Create `src/lib/classes/share-messages.ts`: pure builders.
- Modify `src/lib/attendance/rules.ts`: export default window minutes.
- Create `src/components/admin/classes/CopyLinkMenu.tsx`: Copy link / Copy with message menu.
- Modify `ClassActionRow.tsx`, `LinksTab.tsx`, `TodayPanel.tsx` (pass `batchTitle`, `cls.startsAt` is already in `cls`).
- Create `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/podium-message-action.ts`: admin server action.
- Modify `src/components/progress/portal/SharePodium.tsx` and `src/components/admin/classes/QuizTab.tsx`.
- Create `src/components/admin/registrations/MessagesHistory.tsx`: icon + panel.
- Modify `CampaignRegistrations.tsx` and `campaign/[pageId]/page.tsx`.
- Tests: `tests/share-messages.test.ts`, `tests/copy-link-menu.test.tsx`, `tests/podium-message-action.test.ts`, `tests/share-podium-message.test.tsx`, `tests/messages-history.test.tsx`; update any existing test that breaks (`classes-action-row.test.tsx`, registrations campaign tests that render `messagesSlot`).

### Task 1: Message builders

**Files:**
- Create: `src/lib/classes/share-messages.ts`; Modify: `src/lib/attendance/rules.ts` (export `CHECKIN_OPEN_MINUTES = 15`, `CHECKIN_CLOSE_MINUTES = 15` and build `WINDOW_MS` pieces from them without changing `checkinWindow` behaviour)
- Test: `tests/share-messages.test.ts`

**Interfaces:**
- Produces:
  - `attendanceMessage(i: { batchTitle: string; link: string; startsAtIso: string; openMinutes?: number; closeMinutes?: number }): string`
  - `feedbackMessage(i: { batchTitle: string; link: string; classNumber: number }): string`
  - `podiumMessage(i: { batchTitle: string; boardLabel: string; entries: { rank: number; name: string; score: number }[]; progressLink: string }): string`
  - `clockWindowPkt(startsAtIso: string, openMinutes: number, closeMinutes: number): { open: string; close: string }`

- [ ] **Step 1: Write failing tests** with exact strings from the spec: attendance for a class at `2026-11-20T14:30:00Z` (7:30 pm PKT), batch "PPC Batch 3", link `https://x/attend/abc` returns exactly the spec text with `Open at 7:15 and Closes at 7:45 pm PKT.`; a 00:10 PKT start gives `11:55 pm` / `12:25 am`; feedback for class 9 contains `🔗 Day 9 Feedback Form:` and `Thank you for being part of PPC Batch 3!`; podium with three entries gives the spec text with `154,372`; tie `[1,2,2]` lists two `🥈 2nd Position`; two entries omit the 3rd block; zero entries still returns the heading (the action, not the builder, refuses an empty board).
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/share-messages.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the four functions in `share-messages.ts` and the two constants in `rules.ts`. Lines joined with `\n`. Clock format uses `PKT_OFFSET_MS`.
- [ ] **Step 4: Run** the test plus `tests/attendance-rules.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(classes): share message builders`.

### Task 2: Copy menu on the Classes screen

**Files:**
- Create: `src/components/admin/classes/CopyLinkMenu.tsx`
- Modify: `ClassActionRow.tsx` (replace both `CopyButton` uses; add prop `batchTitle: string`), `LinksTab.tsx` (replace `LinkCard`'s copy button; add prop `batchTitle`), `TodayPanel.tsx` (pass `batchTitle`)
- Test: `tests/copy-link-menu.test.tsx`; update `tests/classes-action-row.test.tsx`

**Interfaces:**
- Consumes: `attendanceMessage`, `feedbackMessage` from Task 1.
- Produces: `CopyLinkMenu(props: { label: string; link: string; message: string; className: string; variant?: "button" | "icon" })`. Clicking opens a small menu with two items, "Copy link" (writes `link`) and "Copy with message" (writes `message`). Escape and click outside close it and return focus to the trigger; a successful copy shows "Copied" for 1.5 s on the trigger and closes the menu; a failed write shows toast `Could not copy. Select the link and copy it by hand.`.

- [ ] **Step 1: Write failing tests**: trigger shows `label`; click shows the two items; each item writes the right text to a mocked `navigator.clipboard.writeText`; Escape closes; rejected write shows the toast (mock `sonner`) and no "Copied"; `ClassActionRow` with a feedback link renders two menu triggers named "Copy attendance link" and "Copy feedback link", and without a feedback link the feedback trigger is a disabled button as before.
- [ ] **Step 2: Run** the two test files. Expected: FAIL.
- [ ] **Step 3: Implement** `CopyLinkMenu` (menu behaviour copied from `SharePodium`: ref wrap, mousedown/keydown listeners, `aria-expanded`, `role="menu"`/`menuitem`, 44px minimum height, `ds` tokens). In `ClassActionRow` build `message` with `attendanceMessage({ batchTitle, link: cls.attendanceLink, startsAtIso: cls.startsAt })` and `feedbackMessage({ batchTitle, link: cls.feedbackLink, classNumber: cls.number })`. In `LinksTab` the two `LinkCard`s use `CopyLinkMenu` with `variant="icon"` text "Copy" (keep the visible "Copy link" label on md and up).
- [ ] **Step 4: Run** tests, `tsc --noEmit`, eslint on changed paths. Expected: pass, 0 errors.
- [ ] **Step 5: Commit** `feat(classes): copy link or copy with message`.

### Task 3: Podium message in the Share podium menu

**Files:**
- Create: `.../campaign/[pageId]/sessions/podium-message-action.ts`
- Modify: `src/components/progress/portal/SharePodium.tsx`, `src/components/admin/classes/QuizTab.tsx`
- Test: `tests/podium-message-action.test.ts`, `tests/share-podium-message.test.tsx`

**Interfaces:**
- Consumes: `podiumMessage` (Task 1); `getPortalBatch`, `resolvePodiumPick`, `rowsFor`, `podium` (existing); `attendanceBase()`; `requireAdmin("classes")`.
- Produces:
  - `getPodiumMessage(pageId: string, sessionId: string): Promise<{ ok: true; text: string } | { ok: false; message: string }>` (`"use server"`). Refuses non-admin (`"You do not have permission to do this."`), bad ids, unknown batch, and an empty board (`"No ranked students yet."`). Reads the page's `slug` and `title` from `landing_pages` with `createAdminSupabase()`; progress link is `${attendanceBase()}/progress/${slug}`; board label from `resolvePodiumPick`.
  - `SharePodium` new optional prop `messageText?: () => Promise<string | null>`. When given, the menu gets a third item "Copy message" (hint "Names and points, ready to post"). The text is fetched when the menu opens, together with the pictures; the item is disabled while loading and shows an alert line on failure; clicking writes it to the clipboard and closes the menu. Without the prop the menu is unchanged.

- [ ] **Step 1: Write failing tests**: action with mocked admin refusal returns not-ok and never reads data; with a view of three ranked rows returns text containing `1st Position – <name>` and `154,372`; empty board returns not-ok; `SharePodium` without `messageText` has two items; with it, three, and clicking writes the fetched text.
- [ ] **Step 2: Run** the two files. Expected: FAIL.
- [ ] **Step 3: Implement** the action and the prop. `QuizTab` passes `messageText={async () => { const r = await getPodiumMessage(pageId, cls.id); return r.ok ? r.text : null; }}`. Do not touch `Leaderboard.tsx`.
- [ ] **Step 4: Run** tests, `tsc --noEmit`, eslint. Expected: pass.
- [ ] **Step 5: Commit** `feat(classes): copy podium message`.

### Task 4: History icon and panel

**Files:**
- Create: `src/components/admin/registrations/MessagesHistory.tsx`
- Modify: `CampaignRegistrations.tsx` (replace `messagesSlot` usage at the bottom with a toolbar-level slot), `src/components/admin/registrations/CampaignToolbar.tsx` if the slot must be placed there, `campaign/[pageId]/page.tsx:98`
- Test: `tests/messages-history.test.tsx`; update existing tests that pass `messagesSlot`

**Interfaces:**
- Consumes: `MessagesSentList` and `SendListItem` (unchanged).
- Produces: `MessagesHistory(props: { sends: SendListItem[] })`: an icon button (`History` icon from lucide-react, accessible name "Messages sent", count badge when `sends.length > 0`) that opens a right-side panel on md and up and a full-screen sheet below md, containing `<MessagesSentList sends={sends} />`; Escape or a Close button closes it and returns focus to the icon; locks page scroll while open. `CampaignRegistrations` gets prop `historySlot?: ReactNode` (replacing `messagesSlot`) rendered beside the Filters / Batch tools buttons, with the same height as them.

- [ ] **Step 1: Write failing tests**: icon renders with name "Messages sent" and no panel; click shows the panel with the heading "Messages sent"; Escape closes and focus returns to the icon; with sends present, "View details" still opens its dialog inside the panel; `CampaignRegistrations` no longer renders the list at the bottom (no `messages-sent-title` heading until the icon is clicked).
- [ ] **Step 2: Run** the files. Expected: FAIL.
- [ ] **Step 3: Implement** `MessagesHistory` (panel markup in the registrations `pz-*` style, `role="dialog" aria-modal="true" aria-label="Messages sent"`), wire the slot, update the page to pass `historySlot={<MessagesHistory sends={sends} />}`, and remove `messagesSlot`.
- [ ] **Step 4: Run** the new test, the campaign registrations tests (`node node_modules/vitest/vitest.mjs run tests/landing-registrations-list-ui.test.tsx` plus any test found by `Grep messagesSlot tests`), `tsc --noEmit`, eslint. Expected: pass.
- [ ] **Step 5: Commit** `feat(registrations): messages sent behind a history icon`.

## Self-review

Spec coverage: History panel (T4); two-choice copy on attendance and feedback in both places (T2); podium Copy message in Classes only (T3); exact owner wording and times from window numbers (T1); no Progress page change (constraint, T3). Browser check on localhost (admin test login, no data changes, 390 and 1440 widths) happens after the tasks.
