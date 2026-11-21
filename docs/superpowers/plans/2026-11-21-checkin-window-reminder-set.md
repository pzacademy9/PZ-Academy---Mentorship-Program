# Check-in window + "Reminder set" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the check-in window editable (batch default plus per-class override, starting 15 and 15) and show "Reminder set" on the Classes page.

**Architecture:** Two integer columns on `landing_pages` (batch default) and two nullable integer columns on `batch_sessions` (override, null = follow batch). One pure helper in `rules.ts` turns a session plus the batch default into effective minutes; every caller passes those minutes into `checkinWindow` and `attendanceMessage`. Job B makes `emailStatusLine` time-aware.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (service-role admin client), vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-21-checkin-window-reminder-set-design.md`

## Global Constraints

- Branch `checkin-window-reminder-set`, cut from `history-and-copy-messages` (491dd1fb). Stage by explicit path only; never `git add docs`.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Window limits: whole numbers 0 to 180 minutes, both open and close. Defaults 15 and 15.
- Migration is `supabase/migrations/0120_checkin_window.sql`. Owner pastes it by hand. Hand-add `database.types.ts` entries; NEVER regenerate it.
- App must keep working with 15 and 15 if the migration is not pasted yet (reads use `select("*")` and treat a missing or null value as 15).
- Source files use CRLF: keep it (check after any scripted edit).
- `window_override` (auto/open/closed) is unchanged.
- No new Stitch screens; copy the style of the neighbouring fields (`fieldCls`, `labelCls`, `ds*` classes).
- Plain words for owner-visible text, no jargon, no exclamation marks.
- Checks: `node node_modules/typescript/bin/tsc --noEmit` (ignore stale `.next/types` errors about enrollments/app/page), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`. No `next build` while the dev server is up.
- Known failing tests that are not ours: pz-tokens, participant-recipients, participant-whatsapp-ui ("not a real phone number"), landing-route-hardening, gas-apply-registration-status, landing-event-sheet.

## Review Focus

- Student opens an old check-in link while the migration is not pasted: window must behave as 15 and 15, no crash.
- Open = 0 and close = 0: window is exactly the start minute; must not be treated as "unset" (use `??`, not `||`).
- Open or close typed as blank, negative, decimal, over 180, or text in Setup or Edit class: rejected with a plain message, nothing saved.
- Batch default changed after a class already has its own numbers: that class keeps its own numbers.
- Class with own numbers switched back to "Same as the batch": both override columns become null.
- Reminder switch on, audience chosen, send time ahead: "Reminder set". Switch on but no audience: still "Choose who gets this email". Class already started and nothing sent: must not say "Reminder set".

---

### Task 1: Migration and types

**Files:**
- Create: `supabase/migrations/0120_checkin_window.sql`
- Modify: `src/lib/supabase/database.types.ts` (hand-add)
- Test: `tests/migrations-checkin-window.test.ts` (copy the style of `tests/migrations-attendance-sessions.test.ts`)

**Interfaces:**
- Produces: `landing_pages.checkin_open_minutes int not null default 15`, `landing_pages.checkin_close_minutes int not null default 15` (both check 0 to 180); `batch_sessions.checkin_open_minutes int null`, `batch_sessions.checkin_close_minutes int null` (check null or 0 to 180). `Row`, `Insert?` and `Update?` entries added by hand for both tables.

- [ ] **Step 1: Write the failing test** `tests/migrations-checkin-window.test.ts`: reads the SQL file and asserts it contains `alter table public.landing_pages`, `alter table public.batch_sessions`, both column names on each table, `default 15`, `between 0 and 180`, and `add column if not exists` for every column.
- [ ] **Step 2: Run it, expect FAIL** (file missing).
- [ ] **Step 3: Write the SQL file** (idempotent, no policies needed; tables already service-role only) and add the four columns to `database.types.ts` for `Row`, `Insert` (optional) and `Update` (optional) of both tables, next to `class_default_zoom` and the existing `batch_sessions` columns.
- [ ] **Step 4: Run test, expect PASS; run `tsc --noEmit`, expect no new errors.**
- [ ] **Step 5: Commit** `feat: migration 0120 check-in window columns`.

### Task 2: Pure window rules

**Files:**
- Modify: `src/lib/attendance/rules.ts`
- Test: `tests/attendance-rules.test.ts`

**Interfaces:**
- Consumes: existing `CHECKIN_OPEN_MINUTES`, `CHECKIN_CLOSE_MINUTES` (15 and 15), `WindowOverride`.
- Produces:
  - `export const MAX_WINDOW_MINUTES = 180`
  - `export type WindowMinutes = { open: number; close: number }`
  - `export function checkinWindow(startsAtIso: string, override: WindowOverride, now: Date, minutes?: WindowMinutes): WindowState` (minutes default to 15/15, so old callers still compile)
  - `export function effectiveWindow(session: { checkin_open_minutes?: number | null; checkin_close_minutes?: number | null }, batch: { checkin_open_minutes?: number | null; checkin_close_minutes?: number | null } | null | undefined): WindowMinutes` (session value if not null/undefined, else batch value, else 15; each side resolved separately; use `??`)
  - `export function parseWindowMinutes(raw: string): number | null` (trimmed whole number 0 to 180 else null)

- [ ] **Step 1: Write failing tests** in `tests/attendance-rules.test.ts`: `checkinWindow` with `{open:30, close:5}` is "open" 30 min before and "closed" 6 min after; with `{open:0, close:0}` it is "open" only at the start minute and "before" one minute earlier; default call still behaves as 15/15; `effectiveWindow` cases: session own wins, batch used when session null, 15 when both missing, `0` is kept (not replaced); `parseWindowMinutes` accepts "0", "15", " 180 ", rejects "", "-1", "1.5", "181", "abc".
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the four exports in `rules.ts`, replacing the module-level `OPEN_MS` / `CLOSE_MS` use inside `checkinWindow` with the passed minutes.
- [ ] **Step 4: Run `tests/attendance-rules.test.ts` and `tests/share-messages.test.ts`, expect PASS.**
- [ ] **Step 5: Commit** `feat: configurable check-in window rules`.

### Task 3: Batch default (data, Setup form) and public check-in

**Files:**
- Modify: `src/lib/data/attendance.ts` (`getSessionByCode` also selects the batch window; return type adds `batchWindow: WindowMinutes`)
- Modify: `src/app/attend/[code]/page.tsx`, `src/app/attend/[code]/actions.ts` (all three `checkinWindow` calls pass `effectiveWindow(session, ...)`)
- Modify: `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/setup-actions.ts` (`ClassDefaults` stays; add `checkinOpen`/`checkinClose` to the stored defaults, `storeDefaults` writes the new landing_pages columns, `checkDefaults` validates with `parseWindowMinutes`, loader returns them)
- Modify: `src/lib/classes/plan.ts` (`ClassDefaults` type gets `checkinOpen: number; checkinClose: number`; update `planClasses` / `applyDefaultsToClasses` callers only as far as the type needs)
- Modify: `src/components/admin/classes/SetupForm.tsx` (two small number fields under the default times)
- Test: `tests/attendance-checkin-actions.test.ts`, `tests/classes-setup-actions.test.ts`, `tests/classes-setup-ui.test.tsx`, `tests/attendance-data.test.ts`

**Interfaces:**
- Consumes: Task 2 `effectiveWindow`, `parseWindowMinutes`, `MAX_WINDOW_MINUTES`.
- Produces: `getSessionByCode(code)` returns `SessionRow & { batchTitle; coverUrl; batchWindow: WindowMinutes }`. `SetupState.defaults` includes `checkinOpen` and `checkinClose` (default 15 and 15 when the columns are missing). Public page text: `Check-in opens ${open} minutes before the class.` (singular "minute" when 1).

- [ ] **Step 1: Write failing tests:** (a) `checkInShared` returns `{status:"closed"}` for a class that started 20 minutes ago when the batch window is 15 close, and `{status:"marked"...}` when the batch close is 30; (b) own session override beats the batch; (c) `saveDefaults` rejects `checkinOpen` of 181, -1 and 1.5 with a plain message and writes nothing, accepts 0; (d) Setup UI renders two fields labelled "Check-in opens (minutes before)" and "Check-in closes (minutes after)" with 15 and 15 and sends the typed numbers; (e) `getSessionByCode` falls back to 15/15 when the page row has no window columns.
- [ ] **Step 2: Run the four test files, expect FAIL.**
- [ ] **Step 3: Implement** the data, action, type and form changes above. Public page copy via a small `windowText(state, open)` in the page file (before/open/closed). Reads treat missing columns as 15.
- [ ] **Step 4: Run the four files plus `tsc --noEmit`, expect PASS and no new errors.**
- [ ] **Step 5: Commit** `feat: batch check-in window default and public page`.

### Task 4: Per-class override, Attendance tab note, share messages

**Files:**
- Modify: `src/lib/data/attendance.ts` (`SessionInput` and `updateSession`/create path accept `checkinOpenMinutes?: number | null`, `checkinCloseMinutes?: number | null`; null writes null)
- Modify: the action that saves the Edit class form (`SessionForm` and its save action in `sessions/actions.ts`): validate with `parseWindowMinutes`, pass through
- Modify: `src/components/admin/classes/EditClassDialog.tsx` (new "Check-in window" group: choice "Same as the batch" or "Set for this class", two number fields when the second is chosen; "Same as the batch" sends null for both)
- Modify: `src/components/admin/classes/AttendanceTab.tsx` (`overrideNote` and `checkinWindow` use real numbers: "Automatic: opens N minutes before the start and closes M minutes after.")
- Modify: `src/components/admin/classes/TodayPanel.tsx`, `LinksTab.tsx`, `ClassActionRow.tsx` (pass `openMinutes` / `closeMinutes` into `attendanceMessage`)
- Modify: `src/components/admin/attendance/SessionsPanel.tsx` and the classes page that renders it, to pass a `batchWindow: WindowMinutes` prop down to `TodayPanel` (read from the landing page row, fallback 15/15)
- Test: `tests/classes-attendance-tab.test.tsx`, `tests/classes-action-row.test.tsx`, `tests/attendance-admin-actions.test.ts`, `tests/classes-layout.test.tsx` (only if prop types force it), a new `tests/edit-class-window.test.tsx`

**Interfaces:**
- Consumes: Task 2 helpers; Task 3 batch default stored on `landing_pages`; `attendanceMessage({ batchTitle, link, startsAtIso, openMinutes?, closeMinutes? })` from `share-messages.ts`.
- Produces: `TodayPanel`/`ClassActionRow`/`LinksTab`/`AttendanceTab` accept `batchWindow: WindowMinutes`.

- [ ] **Step 1: Write failing tests:** (a) Attendance tab with own 30/10 shows "opens 30 minutes before the start and closes 10 minutes after"; with no own numbers and batch 20/20 shows 20/20; (b) the attendance message built by `ClassActionRow` and `LinksTab` contains the real open and close clock times for a 20/10 window (compute expected strings with the same `clockWindowPkt` from `share-messages.ts`); (c) Edit class: choosing "Same as the batch" submits both as null; choosing own with 0 and 0 submits 0 and 0; typing 200 shows an error and does not call the save action; (d) `updateSession` with null clears both columns, and with 30/10 patches both.
- [ ] **Step 2: Run these files, expect FAIL.**
- [ ] **Step 3: Implement** the changes above.
- [ ] **Step 4: Run the files plus `tsc --noEmit` and eslint on touched paths, expect clean.**
- [ ] **Step 5: Commit** `feat: per-class check-in window and real numbers in messages`.

### Task 5: "Reminder set" status (job B)

**Files:**
- Modify: `src/components/admin/classes/email-status.ts` (`emailStatusLine` gains a third argument `now: Date` and reads `starts_at` and `email_lead_minutes` from the session pick)
- Modify: `src/components/admin/classes/LinksTab.tsx`, `EditClassDialog.tsx` (pass `now`; use the same ticking clock style as the cards, a 30 s interval like `AttendanceTab`)
- Modify: `src/components/admin/classes/ClassEmailHistory.tsx` (new optional prop `reminderNote?: string | null`; when no rounds, show it instead of "No email has been sent for this class yet.")
- Test: `tests/email-status.test.ts`, a new `tests/class-email-history-reminder.test.tsx`

**Interfaces:**
- Produces: `emailStatusLine(session: Pick<SessionRow, "email_enabled" | "audience" | "starts_at" | "email_lead_minutes">, sends: SessionSendState | undefined, now: Date): string` with these results in order: reminder sent text unchanged; update sent text unchanged; enabled and no audience gives "Choose who gets this email"; switched off gives "Reminder email is switched off"; enabled, audience set, send time (start minus lead) in the future gives `Reminder set. Goes out ${formatPkt(sendIso)}`; enabled, audience set, send time passed but class not started gives "Reminder is due and goes out within a few minutes"; class already started gives "Reminder email not sent yet". `reminderNote` text: `Reminder set for ${formatPkt(sendIso)}. Nothing sent yet.`

- [ ] **Step 1: Write failing tests** in `tests/email-status.test.ts` for each result above using a fixed `now` (include: no audience stays "Choose who gets this email"; started class never says "Reminder set"); in the new test file: with `rounds` empty and `reminderNote` given the box shows the note, without it shows the old sentence.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Build the note in `LinksTab` from the same send-time rule; share one small helper in `email-status.ts` (`reminderSendIso(session, now): string | null`) so the line and the note agree.
- [ ] **Step 4: Run both files, `tests/classes-action-row.test.tsx`, `tsc --noEmit`, eslint, expect clean.**
- [ ] **Step 5: Commit** `feat: show Reminder set on the Classes page`.

### Task 6: Owner steps and browser check

**Files:**
- Create: `docs/superpowers/plans/2026-11-21-checkin-window-reminder-set-owner-steps.md` (the SQL as a code block, where to paste it, what to look at; plain words)

- [ ] **Step 1:** Write the owner steps file (SQL identical to the migration).
- [ ] **Step 2:** Start or reuse the dev server on port 3000. With Playwright (screenshots only, delete them after), log in on localhost with the admin test login from memory, open a Classes page, and check at 390px and 1440px: Setup defaults box with the two new fields, Edit class "Check-in window" group, Attendance tab note, "Reminder set" line and the empty "Who got the emails" note. Do not press Save or Apply on real data.
- [ ] **Step 3:** Fix any layout problems found, re-run focused tests, commit `docs: owner steps and browser fixes`.
- [ ] **Step 4:** Final whole-branch review on the most capable model, one fix wave, scoped re-review.
