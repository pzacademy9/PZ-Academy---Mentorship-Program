# Sessions, Attendance and Session Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin adds sessions to a batch (date, PKT time, Zoom link, optional Kahoot link); live students check in with a one-tap personal link or a shared link; the batch shows per-student attendance percentages; each session emails its live students automatically before it starts.

**Architecture:** New service-role tables `batch_sessions` and `batch_session_marks` hang on `landing_pages` (the batch) and `pz_people` (the person from plan 1). The old `public.attendance` table (0 rows, keyed to app accounts) is left untouched. The check-in window is computed from the clock on every request (no job needed). Session emails reuse participant messaging: a `participant_sends` row is created per session by a timer endpoint and delivered by the existing `runEmailSend`, with new per-session tags. Vercel's free plan only allows daily crons, so the 5-minute timer is a `pg_cron` + `pg_net` job inside Supabase that calls the endpoint (both extensions are already installed).

**Tech Stack:** Next.js App Router (server actions), Supabase (owner pastes SQL; MCP is read-only), vitest, Brevo via `sendParticipantEmail`.

**Spec:** `docs/superpowers/specs/2026-10-27-attendance-results-design.md`, the part 2 text plus "Session email" rules and "Further calls". Plan 2 of 5. **Scope calls:** (a) the flag "took quiz, no check-in" needs quiz results, so it is built in plan 3; this plan only provides `markPresent` for it to call. (b) "Feeds certificate eligibility" is delivered as a per-batch minimum percentage (default 75) with a "meets minimum" mark in the admin grid; the certificate app (Firestore, read-only) is not touched. (c) The existing student-record Attendance tab keeps reading the old table; repointing it is later work.

## Global Constraints

- One academy time zone, PKT (UTC+5, no daylight saving). Admins type session times in PKT; storage is `timestamptz`.
- Check-in window: opens 15 minutes before and closes 15 minutes after the session start. Admin override per session: `auto`, `open` (force open), `closed` (force closed).
- Live students only: only a person with a `paid` or `free`, non-test, `mode = 'live'` registration on that session's batch can check in or be marked. Recorded students never get a mark or a live-session email.
- Percentage per person per batch = marks on sessions already started / sessions already started (future sessions are not counted). 0 started sessions shows no percentage.
- A GET request must never mark anyone present (email scanners open links). Marking is a button press (POST / server action).
- Personal link token = HMAC-SHA256 over `sessionId.personId` keyed from `SUPABASE_SERVICE_ROLE_KEY` with a fixed label (`attendance-link-v1`), compared in constant time. No new environment variable.
- Shared link: the student types their email; it is matched to a person, then to a live enrolled registration on that batch. Never reveal other people's emails; show the first name only on success. Rate limited with `allowRequest` from `src/lib/pzid/rate-limit.ts`.
- Session email: Zoom link and the student's PZ ID always; Kahoot link and attendance link optional per session (Kahoot off by default, attendance link on by default). Sent `email_lead_minutes` before start (default 60). Unsubscribed people are skipped by the existing recipient planner. One send per session, ever (unique `participant_sends.session_id`).
- New tables: RLS on, zero policies. Never regenerate `database.types.ts`: hand-add entries.
- Tools: `node node_modules/typescript/bin/tsc --noEmit` (baseline 0 errors), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`. No `eslint-disable` for `@typescript-eslint`. Source files often use CRLF: use the Edit tool.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Next migration number is 0089.

## Review Focus

- A session whose time is typed as `2026-11-03 20:00` PKT is stored as `2026-11-03T15:00:00Z` and shown back as 20:00 PKT, on a server running in UTC.
- Opening the personal link in a scanner (GET) leaves zero marks; only the button marks. Pressing it twice leaves one mark.
- A recorded-only student, an unpaid student, and an email not in the batch are all refused on both links, with different wording that reveals no other person's data.
- A token for session A fails on session B; a tampered or truncated token fails; a token for a person later merged (`pz_merge_people` deletes the dropped person) fails cleanly, not with a crash.
- Window edges: exactly 15 minutes before opens, 14:59 before is still `before`; exactly 15 minutes after is still open, one second later is `closed`; override `open` works after close, override `closed` works inside the window.
- The timer firing twice, or two timers overlapping, creates exactly one send for a session and no duplicate emails.
- A session created less than the lead time before it starts (for example 20 minutes ahead, lead 60) still emails once, immediately, as long as it has not started yet; a session already started is never emailed.
- A batch with 0 live students, or a session with no Zoom link, does not crash the grid or the email run (no Zoom link: the send is not created and the admin sees "No Zoom link").
- The session did not happen at its time, or the website was down: the admin can change the time at any moment (also after it started), force the check-in open or closed at any moment, mark any live student present or absent for any session at any time (the window never limits an admin), and mark everyone present in one step. Changing the time after the reminder went out shows a notice and offers a one-click "update email" to the same students.
- The old People link in the admin sidebar is gone after the move; the old address `/dashboard/admin/people` still works (redirects), so no saved bookmark breaks.

---

### Task 1: Migration 0089, tables and types

**Files:**
- Create: `supabase/migrations/0089_attendance_sessions.sql`
- Modify: `src/lib/supabase/database.types.ts` (hand-add)
- Test: `tests/migrations-attendance-sessions.test.ts` (same style as `tests/migrations-pz-people.test.ts`: read the SQL, assert its text)

**Interfaces:**
- Produces (SQL):
  - `batch_sessions(id uuid pk, page_id uuid not null references landing_pages on delete cascade, number int not null check (number >= 1), title text not null default '', starts_at timestamptz not null, zoom_url text not null default '', kahoot_url text not null default '', include_kahoot boolean not null default false, include_attendance_link boolean not null default true, window_override text not null default 'auto' check (window_override in ('auto','open','closed')), email_enabled boolean not null default true, email_lead_minutes int not null default 60 check (email_lead_minutes between 0 and 10080), public_code text not null unique, created_at timestamptz default now())`; unique `(page_id, number)`; index on `(page_id, starts_at)`.
  - `batch_session_marks(id uuid pk, session_id uuid not null references batch_sessions on delete cascade, person_id uuid not null references pz_people on delete cascade, source text not null check (source in ('personal','shared','admin')), marked_at timestamptz not null default now(), marked_by uuid references profiles on delete set null)`; unique `(session_id, person_id)`; index on `(person_id)`.
  - `landing_pages.attendance_min_pct int not null default 75 check (attendance_min_pct between 0 and 100)`.
  - `participant_sends.session_id uuid references batch_sessions on delete set null` and `participant_sends.session_kind text check (session_kind in ('reminder','update'))`, with `check ((session_id is null) = (session_kind is null))` and `create unique index participant_sends_reminder_key on participant_sends (session_id) where session_kind = 'reminder'` (one automatic reminder per session; update emails are not limited by the index, the app limits them to one per minute).
  - `pz_merge_people` is replaced (`create or replace`) so it also moves `batch_session_marks` from the dropped person to the kept one, skipping sessions the kept person already has (`on conflict do nothing`, then delete the rest); keeps everything else from 0088 identical.
  - `public_code`: generated by the app (8 lowercase letters/digits), not by SQL.

- [ ] **Step 1: Write the failing test.** Assert the SQL contains: both `create table if not exists`, `enable row level security` for each, the three `check (... in (...))` lists, `unique (page_id, number)`, `unique (session_id, person_id)`, `add column if not exists attendance_min_pct`, `add column if not exists session_id`, `add column if not exists session_kind`, `participant_sends_reminder_key`, `create or replace function public.pz_merge_people`, `insert into public.batch_session_marks` with `on conflict do nothing`, and that it contains no `drop table` and no `delete from public.landing_registrations`.
- [ ] **Step 2: Run it, expect FAIL** (file missing): `node node_modules/vitest/vitest.mjs run tests/migrations-attendance-sessions.test.ts`.
- [ ] **Step 3: Write the migration** to the Interfaces above. Header comment as in 0088 (owner pastes it; safe to re-run). Re-grant execute on `pz_merge_people` to `service_role` only, as in 0088. Hand-add the two tables, the two columns, and the `pz_merge_people` Functions entry stays as is.
- [ ] **Step 4: Run the test, expect PASS.** Then `tsc --noEmit`, expect 0 errors.
- [ ] **Step 5: Commit** `feat: add attendance sessions and marks tables`.

### Task 2: Pure rules (window, PKT, percentage)

**Files:**
- Create: `src/lib/attendance/rules.ts`
- Test: `tests/attendance-rules.test.ts`

**Interfaces:**
- Produces:
  - `type WindowOverride = "auto" | "open" | "closed"`
  - `type WindowState = "before" | "open" | "closed"`
  - `checkinWindow(startsAtIso: string, override: WindowOverride, now: Date): WindowState`
  - `pktToIso(local: string): string | null` (input `YYYY-MM-DDTHH:mm` as typed in PKT, output UTC ISO; `null` when malformed or not a real date)
  - `isoToPktInput(iso: string): string` (inverse, `YYYY-MM-DDTHH:mm`)
  - `formatPkt(iso: string): string` (for example `Tue 3 Nov, 8:00 pm PKT`)
  - `attendancePercent(marked: number, started: number): number | null` (whole percent, rounded half up, `null` when `started` is 0, capped at 100)
  - `meetsMinimum(pct: number | null, min: number): boolean` (`null` is false)
  - `generateSessionCode(): string` (8 chars from `a-z0-9`, via `crypto.randomInt`)

- [ ] **Step 1: Write the failing tests** with these exact assertions: `pktToIso("2026-11-03T20:00") === "2026-11-03T15:00:00.000Z"`; `isoToPktInput("2026-11-03T15:00:00.000Z") === "2026-11-03T20:00"`; `pktToIso("2026-02-30T10:00") === null`; `pktToIso("nonsense") === null`; with start `15:00Z`: `checkinWindow` at `14:45:00Z` is `open`, at `14:44:59Z` is `before`, at `15:15:00Z` is `open`, at `15:15:01Z` is `closed`; override `open` at `18:00Z` is `open`; override `closed` at `15:00Z` is `closed`; `attendancePercent(3, 4) === 75`, `(1, 3) === 33`, `(2, 3) === 67`, `(0, 0) === null`, `(5, 4) === 100`; `meetsMinimum(75, 75) === true`, `(74, 75) === false`, `(null, 0) === false`; `generateSessionCode()` matches `/^[a-z0-9]{8}$/` and 200 calls give at least 199 distinct values.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the signatures above in `rules.ts`. PKT is a fixed +5 offset: no time zone library; build with `Date.UTC`. Validate by round-tripping the parsed date.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: attendance window, PKT and percentage rules`.

### Task 3: Personal link tokens

**Files:**
- Create: `src/lib/attendance/link-token.ts`
- Test: `tests/attendance-link-token.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `signCheckinToken(sessionId: string, personId: string, secret: string): string` (url-safe: `<personId>.<sig>` where `sig` is base64url HMAC-SHA256 of `attendance-link-v1:<sessionId>:<personId>`)
  - `verifyCheckinToken(token: string, sessionId: string, secret: string): { personId: string } | null`
  - `checkinSecret(): string | null` (reads `SUPABASE_SERVICE_ROLE_KEY`; `null` when unset)

- [ ] **Step 1: Write the failing tests:** round trip returns the person id; same token with a different `sessionId` returns `null`; flipping one character of the signature returns `null`; a token with no dot, an empty string, and a 5,000-character string return `null` without throwing; a wrong-length signature returns `null` (use `timingSafeEqual` only after a length check).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** with `node:crypto` (`createHmac`, `timingSafeEqual`). The person id must look like a UUID (regex) before it is returned.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: signed personal check-in link tokens`.

### Task 4: Attendance data layer

**Files:**
- Create: `src/lib/data/attendance.ts` (server-only, uses `createAdminSupabase()`)
- Test: `tests/attendance-data.test.ts` (mock `createAdminSupabase` the way the existing data-layer tests do; check `tests/` for the nearest example such as the pz-people tests and copy its mocking style)

**Interfaces:**
- Consumes: `generateSessionCode`, `checkinWindow`, `attendancePercent`, `meetsMinimum` (Task 2); `signCheckinToken`, `verifyCheckinToken`, `checkinSecret` (Task 3).
- Produces:
  - `type SessionRow = Tables<"batch_sessions">`
  - `type SessionInput = { number: number; title: string; startsAt: string; zoomUrl: string; kahootUrl: string; includeKahoot: boolean; includeAttendanceLink: boolean; emailEnabled: boolean; emailLeadMinutes: number }`
  - `listSessions(pageId: string): Promise<SessionRow[]>` (ordered by `number`)
  - `createSession(pageId: string, input: SessionInput): Promise<{ ok: true; id: string } | { ok: false; message: string }>` (generates `public_code`; retries once on a code collision; duplicate `number` gives message "Session number already used")
  - `updateSession(sessionId: string, input: Partial<SessionInput> & { windowOverride?: WindowOverride }): Promise<{ ok: boolean; message?: string }>`
  - `deleteSession(sessionId: string): Promise<void>` (cascades marks; refuses nothing, the UI confirms)
  - `getSessionByCode(code: string): Promise<(SessionRow & { batchTitle: string }) | null>`
  - `eligiblePersonForEmail(pageId: string, email: string): Promise<{ personId: string; firstName: string } | { reason: "no_person" | "not_live" | "not_in_batch" }>` (email lowercased and trimmed; `not_live` means enrolled but only as recorded)
  - `markPresent(sessionId: string, personId: string, source: "personal" | "shared" | "admin", markedBy?: string): Promise<{ created: boolean }>` (idempotent: second call returns `created: false`)
  - `unmarkPresent(sessionId: string, personId: string): Promise<void>`
  - `markAllPresent(sessionId: string, markedBy: string): Promise<{ added: number }>` (every live enrolled person of the batch who has no mark yet, source `admin`; idempotent)
  - `isLiveEnrolled(pageId: string, personId: string): Promise<boolean>`
  - `type GridRow = { personId: string; pzId: string; name: string; marks: Record<string, boolean>; started: number; marked: number; pct: number | null; meetsMin: boolean }`
  - `getBatchGrid(pageId: string, now?: Date): Promise<{ sessions: SessionRow[]; rows: GridRow[]; minPct: number }>` (rows = distinct people with a live, paid or free, non-test registration on the batch, sorted by name; `started` counts sessions whose `starts_at <= now`)
  - `setMinPct(pageId: string, pct: number): Promise<{ ok: boolean }>` (0 to 100 integers only)

- [ ] **Step 1: Write the failing tests** for the behaviors with the most risk: `markPresent` twice gives `created: true` then `false`; `getBatchGrid` with 4 sessions (3 started, 1 future) and one person marked on 2 gives `started: 3, marked: 2, pct: 67`; a person with only a `recorded` registration is absent from `rows`; `eligiblePersonForEmail` returns `{ reason: "not_live" }` for a recorded-only person and `"no_person"` for an unknown email; `setMinPct(pageId, 101)` returns `ok: false` without writing; `markAllPresent` with 5 live people, 2 already marked, returns `added: 3` and a second call returns `added: 0`; `updateSession` with a new `startsAt` and `windowOverride` works on a session whose start is already in the past.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the functions. Read registrations in pages of 1000 (see `fetchAllRows` in `participant-sends.ts`; do not copy the whole file, write a small local helper). Person name for the grid comes from `pz_people.display_name`.
- [ ] **Step 4: Run, expect PASS**; `tsc --noEmit` 0 errors.
- [ ] **Step 5: Commit** `feat: attendance sessions and marks data layer`.

### Task 5: Public check-in page (personal and shared)

**Files:**
- Create: `src/app/attend/[code]/page.tsx`, `src/app/attend/[code]/actions.ts`, `src/components/attendance/CheckinForm.tsx`
- Test: `tests/attendance-checkin-actions.test.ts`

**Interfaces:**
- Consumes: `getSessionByCode`, `eligiblePersonForEmail`, `markPresent`, `isLiveEnrolled` (Task 4); `checkinWindow`, `formatPkt` (Task 2); `verifyCheckinToken`, `checkinSecret` (Task 3); `allowRequest` (plan 1).
- Produces:
  - route `/attend/<code>` (shared link) and `/attend/<code>?t=<token>` (personal link)
  - `type CheckinResult = { status: "marked"; firstName: string; already: boolean } | { status: "before" | "closed" } | { status: "not_live" | "not_found" | "bad_link" | "rate_limited" | "error" }`
  - server actions `checkInPersonal(code: string, token: string): Promise<CheckinResult>` and `checkInShared(code: string, email: string): Promise<CheckinResult>`

- [ ] **Step 1: Write the failing tests** for the actions with `data/attendance` mocked: a closed window returns `closed` and never calls `markPresent`; `before` likewise; a bad token returns `bad_link`; a valid token for a recorded-only person returns `not_live`; a token for a deleted person returns `bad_link` or `not_found` (not a throw); shared with an unknown email returns `not_found`; eleven calls from one IP in a minute make the eleventh `rate_limited`; a marked result carries the first name only and no email.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the actions (IP from `x-forwarded-for` as in `src/app/ids/[slug]/actions.ts`; never leak raw error text, return `error`). The page is a server component that loads the session, shows batch title, session title, time in PKT and the window state; with a valid `t` it greets the person and shows a single "Mark me present" button; without `t` it shows an email field and the same button. It performs no write on render. Unknown code is a 404. Use the app's existing public page styling (see `src/app/ids/[slug]/page.tsx` for layout and tokens). Mark the route `dynamic = "force-dynamic"`.
- [ ] **Step 4: Run, expect PASS**; `tsc` and eslint clean on the new files.
- [ ] **Step 5: Commit** `feat: public check-in page with personal and shared links`.

### Task 6: Admin sessions screen

**Files:**
- Create: `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/page.tsx`, `.../sessions/actions.ts`, `src/components/admin/attendance/SessionsPanel.tsx`, `src/components/admin/attendance/AttendanceGrid.tsx`
- Modify: `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/page.tsx` (add a "Sessions and attendance" link next to "Sheet sync")
- Test: `tests/attendance-admin-actions.test.ts`

**Interfaces:**
- Consumes: Task 4 functions; `pktToIso`, `isoToPktInput`, `formatPkt` (Task 2); `requireAdminPage` and the admin action guard used in `campaign/[pageId]/id-actions.ts` (copy its guard pattern).
- Produces: admin server actions `addSession`, `saveSession`, `removeSession`, `setOverride`, `toggleMark(sessionId, personId, present: boolean)`, `markEveryonePresent(sessionId)`, `saveMinPct`. All require admin and return `{ ok: boolean; message?: string }`. Admin actions are never limited by the check-in window or by whether the session has started.

- [ ] **Step 1: Write the failing tests:** a non-admin caller gets a refusal from every action and nothing is written; `addSession` with a malformed PKT string returns `ok: false` and does not call `createSession`; `toggleMark` for a person who is not live enrolled returns `ok: false`; `saveSession` and `setOverride` succeed for a session that started yesterday; `toggleMark(…, true)` succeeds while the window is `closed`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Sessions list shows number, title, PKT time, window state now, the shared link (copy button, `<base>/attend/<code>`, base from `NEXT_PUBLIC_APP_URL` with the same fallback the ID page uses), "Send reminder now", override selector (auto / open / closed), edit, delete (confirm). Add form: number (default next), title, PKT date-time, Zoom link, Kahoot link, two tick boxes (include Kahoot link, include attendance link), email on/off, "send how many minutes before" (default 60). Grid below: one row per live person, one column per session, tick = present (click toggles via `toggleMark`), percentage column, "meets minimum" mark, and the batch minimum field (default 75). Plain wording, no jargon, per the owner's non-technical audience. "Session did not happen / site was down" tools, all visible per session: time editor (works any time), a big three-way switch "Check-in: Automatic / Force open / Force closed" with a one-line note saying what each does and the current state, "Mark everyone present" (confirm first, shows how many will be added), and a notice after a time change when the reminder email already went out ("Students were told the old time") with an "Email updated time" button that calls `createSessionSend(sessionId, "update")` (Task 7).
- [ ] **Step 4: Run, expect PASS**; `tsc` and eslint clean.
- [ ] **Step 5: Commit** `feat: admin sessions and attendance grid`.

### Task 7: Session email (tags and send)

**Files:**
- Modify: `src/lib/landing/participants/merge.ts` (new optional tags), `src/lib/data/participant-sends.ts` (`runEmailSend` renders session tags when `send.session_id` is set)
- Create: `src/lib/attendance/session-email.ts` (default subject and body text), `src/lib/data/session-emails.ts` (`createSessionSend`)
- Test: `tests/attendance-session-email.test.ts`, extend `tests/` for `renderParticipantTags` (find the existing merge-tags test file and add cases there)

**Interfaces:**
- Consumes: `signCheckinToken`, `checkinSecret` (Task 3); `SessionRow`, `listSessions` (Task 4); `plan`-style candidate resolution via `resolveCandidates` and `planRecipients` already used in `participant-sends.ts`.
- Produces:
  - `TagContext` gains optional `session?: { zoomUrl: string; kahootUrl: string; timeText: string; attendanceUrl: string }`; new tags `zoom_link`, `kahoot_link`, `session_time`, `attendance_link` render from it; when `session` is absent they stay verbatim (like unknown tags today). Empty string for a link the session leaves out.
  - `buildSessionEmail(session: SessionRow): { subject: string; body: string }` (plain text with tags; always has `{{pz_id}}`, `{{zoom_link}}`, `{{session_time}}`; adds a Kahoot line only when `include_kahoot` and a Kahoot URL exist; adds an attendance line only when `include_attendance_link`)
  - `createSessionSend(sessionId: string, kind: "reminder" | "update" = "reminder"): Promise<{ ok: true; sendId: string; count: number } | { ok: false; reason: "no_zoom" | "already_sent" | "started" | "disabled" | "no_recipients" | "not_set_up" | "too_soon" }>` (inserts `participant_sends` with `session_id`, `session_kind = kind`, `channel = 'email'`, `created_by = null`; recipients = enrolled live head and member rows; skips recorded; for `reminder` the unique index makes a concurrent second call return `already_sent`; `started` and `disabled` apply to `reminder` only, so an admin can still send an `update` after a start-time change; `update` within 60 seconds of the previous one returns `too_soon`; the `update` subject starts with "Updated:" and the body says the time changed)
  - `runEmailSend` per-recipient `attendanceUrl` = `<base>/attend/<public_code>?t=<signCheckinToken(session.id, person_id)>`; a recipient with no person gets the shared link instead.

- [ ] **Step 1: Write the failing tests:** `renderParticipantTags("{{zoom_link}} {{attendance_link}}", ctx-with-session, "text")` fills both; without `session` they stay verbatim; `buildSessionEmail` omits the Kahoot line unless `include_kahoot` is true and a URL exists; `createSessionSend` returns `no_zoom` for an empty Zoom URL, `started` when `starts_at` is past, `disabled` when `email_enabled` is false, and a second call returns `already_sent`; an `update` send works for a session that already started and has a reminder, and a second `update` right after returns `too_soon`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** In `runEmailSend` load the session once per run when `send.session_id` is set; the message links need no portal link. Keep all existing behavior for sends without a session unchanged (existing tests must still pass).
- [ ] **Step 4: Run, expect PASS**, including the existing `tests/participant-*.test.ts` files that passed before (the known failing ones listed in memory stay failing, nothing new).
- [ ] **Step 5: Commit** `feat: session reminder emails reuse participant messaging`.

### Task 8: Timer endpoint, "send now", owner scheduler steps

**Files:**
- Create: `src/app/api/cron/session-emails/route.ts`, `docs/superpowers/plans/2026-10-27-sessions-attendance-owner-steps.md`
- Modify: the admin sessions actions (Task 6) so "Send reminder now" calls `createSessionSend` then `runEmailSend`
- Test: `tests/session-emails-cron.test.ts`

**Interfaces:**
- Consumes: `createSessionSend` (Task 7), `runEmailSend`, `listSessions`.
- Produces: `GET /api/cron/session-emails` guarded like `src/app/api/cron/landing-jobs/route.ts` (fail closed without `CRON_SECRET`, `Authorization: Bearer`). Each call: (1) find sessions with `email_enabled`, no send yet, not started, and `now >= starts_at - email_lead_minutes`; call `createSessionSend` for each; (2) for every send with a `session_id` that still has pending recipients, call `runEmailSend(sendId, 40)`. Returns `{ ok: true, created: number, sent: number, failed: number }`. `export const dynamic = "force-dynamic"`.

- [ ] **Step 1: Write the failing tests:** missing or wrong bearer gives 401 and calls nothing; with no `CRON_SECRET` it is 401; a due session creates one send and runs it; calling the route twice for the same due session creates one send (second result `created: 0`); a not-yet-due session is untouched.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the route and wire the "send now" action.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Write the owner steps doc**, plain words, short. It holds one SQL block the owner pastes in Supabase: store the cron secret with `select vault.create_secret('<paste CRON_SECRET here>', 'session_cron_secret');` then `select cron.schedule('session-emails', '*/5 * * * *', $$ select net.http_get(url := 'https://pz-academy.pharmacozyme.com/api/cron/session-emails', headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'session_cron_secret'))); $$);`, plus a one-line way to check it ran (`select * from cron.job_run_details order by start_time desc limit 5;`) and how to stop it (`select cron.unschedule('session-emails');`). Also lists the owner's other step: paste migration 0089. Confirm in the doc that `CRON_SECRET` already exists in Vercel (the daily job uses it).
- [ ] **Step 6: Commit** `feat: timer endpoint for session emails and owner steps`.

### Task 9: Move People under Students

The "People" item in the admin sidebar (the page from plan 1 with the permanent IDs and the merge tool) is a second, separate list beside "Students" and feels like an extra section. It becomes a tab of the Students section, renamed "Student IDs". Attendance stays on each batch page (Task 6); only the sidebar changes.

**Files:**
- Modify: `src/components/dashboard/nav.ts` (remove the "People" item at line 40), the Students admin page (`src/app/dashboard/admin/students/page.tsx`, add a two-tab header "All students" and "Student IDs" that links to the new address), `src/app/dashboard/admin/people/page.tsx` (becomes a redirect)
- Create: `src/app/dashboard/admin/students/ids/page.tsx` (the existing People page content, moved), tab component `src/components/admin/students/StudentsTabs.tsx`
- Test: `tests/admin-people-move.test.ts`

**Interfaces:**
- Consumes: the existing People page content and components from plan 1 (move, do not rewrite; keep their imports working).
- Produces: route `/dashboard/admin/students/ids`; `/dashboard/admin/people` redirects (permanent) to it; tab labels exactly "All students" and "Student IDs"; page heading "Student IDs".

- [ ] **Step 1: Write the failing test:** the nav list has no item with `href` `/dashboard/admin/people` and still has "Students"; the `people` page source calls `redirect` or `permanentRedirect` to `/dashboard/admin/students/ids`; the new `students/ids/page.tsx` exists and contains `requireAdminPage`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Move and wire.** Search the code for other links to `/dashboard/admin/people` (copy-link buttons, registration PZ ID column, tests) and point them to the new address. Wording: no "People" left in visible text for this page; use "Student IDs".
- [ ] **Step 4: Run, expect PASS**; `tsc` and eslint clean; existing people/pzid tests still pass.
- [ ] **Step 5: Commit** `feat: move People under Students as Student IDs`.

### Task 10: Whole-branch check and memory

- [ ] **Step 1:** `node node_modules/typescript/bin/tsc --noEmit` (0 errors), `node node_modules/eslint/bin/eslint.js` on every changed path (clean), and `node node_modules/vitest/vitest.mjs run` on every new test file plus the existing `tests/participant-*.test.ts`, `tests/pzid-*.test.ts` (only the known failing files may fail).
- [ ] **Step 2:** Browser check by the controller on the dev server: add a session in PKT, open the shared link (before and inside the window via the override), mark present through the personal link, and see the grid percentage. No `next build` while the dev server runs.
- [ ] **Step 3:** Update `pz-academy-attendance-results-status.md` in memory with the branch, commit and what the owner still has to paste (0089 and the scheduler SQL).
