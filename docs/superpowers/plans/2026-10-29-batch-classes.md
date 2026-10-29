# Batch Classes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One setup screen creates every class of a batch (course, workshop or webinar) with its attendance link and feedback link; one overview screen runs each class day (attendance, quiz results, feedback) and shows combined feedback and per-student attendance.

**Architecture:** Classes stay `batch_sessions` rows. A new pure planner turns the setup form into creates, updates and removals. Each class gets one `feedback_sessions` row (via the existing `createFeedbackSession`), grouped by one `feedback_programs` row per course or workshop. The old Sessions page route is replaced by the Classes overview; `/sessions/setup` is the new setup screen. Existing attendance, quiz and feedback code is reused, not rewritten.

**Tech Stack:** Next.js App Router server actions, Supabase (service-role from server code), Vitest, Tailwind with the existing `pz-*` tokens.

**Spec:** `docs/superpowers/specs/2026-10-29-batch-classes-design.md` (read it first; its "My calls" list 1-13 binds this plan). Stitch screens: project `4651274386787527431`, screen ids `f3067a27...` (setup desktop), `3048e870...` (setup mobile), `bb3ce809...` (overview desktop), `1767fca3...` (overview mobile); fetch with the Stitch tools, use for layout only.

## Global Constraints

- Owner is non-technical: plain words in every label and message; no "session code", "window override", "sync", "Command Center".
- Times are Pakistan time (PKT); use `pktToIso` / `isoToPktInput` / `formatPkt` from `src/lib/attendance/rules.ts`.
- Mobile: one column, buttons and calendar days at least 48px tall, body text at least 16px, no sideways scroll, full-width bottom action. Desktop follows the Stitch screens.
- Existing feedback links, slugs and responses are never changed. Admin > Feedback keeps working.
- Attendance and feedback links never change when a class is edited. Class numbers are never renumbered. Feedback slugs use a random suffix (`randomizeSlug: true`).
- Question rules: bank questions only, 3 to 5 (same as `createFeedbackSession`).
- Blank speaker -> `"PZ Academy"`. Feedback session name = `"<batch title> - Day N"`, or `"<batch title> - <topic>"` when a topic is given.
- Next free migration is `0091`. The owner pastes all write SQL; you only write the file and an owner-steps doc. Never regenerate `src/lib/supabase/database.types.ts`; hand-add entries.
- Checks are run directly (the `&` in the path breaks `npm run`): `node node_modules/typescript/bin/tsc --noEmit` (baseline 0 errors), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`. Known failing tests that are not ours: `tests/pz-tokens.test.ts`, `tests/participant-recipients.test.ts`, `tests/participant-whatsapp-ui.test.tsx`, `tests/landing-route-hardening.test.ts`, `tests/gas-apply-registration-status.test.ts`, `tests/landing-event-sheet.test.ts`.
- Never add `eslint-disable` for `@typescript-eslint`. Source files often use CRLF: use the Edit tool. Do not run `next build` while a dev server runs.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. New commits only; never amend.

## Review Focus

- Setup submitted twice (double click, retry after a timeout): no duplicate classes, no duplicate feedback sessions (Task 3, Task 4 tests).
- Webinar (one day) never creates a feedback program; a program needs 2+ classes only in the old helper, so it must not be used for one class (Task 3).
- Unticking a day that has marks, quiz results or feedback responses: asks before removing and names what is lost (Task 4, Task 5).
- Admin adds an earlier day to an existing batch: gets next free number, list stays date-ordered, no link changes (Task 2).
- Existing classes with no end time and custom values are untouched by changing the batch defaults (Task 2, Task 4).
- A batch with zero responses / zero started classes shows "no data yet", not NaN or 0% (Task 7).
- Feedback email goes only to enrolled students, once per press, and is blocked while a previous one is still sending (Task 8).

---

### Task 1: Database columns, types, owner steps

**Files:**
- Create: `supabase/migrations/0091_batch_classes.sql`
- Create: `docs/superpowers/plans/2026-10-29-batch-classes-owner-steps.md`
- Modify: `src/lib/supabase/database.types.ts` (hand-add only)
- Test: `tests/migrations-batch-classes.test.ts` (model on `tests/migrations-quiz-results.test.ts`)

**Interfaces:**
- Produces (columns, all nullable or defaulted, safe to re-run with `if not exists`):
  - `landing_pages.class_default_start time`, `class_default_end time`, `class_default_zoom text not null default ''`, `class_cover_url text`, `feedback_program_id uuid references feedback_programs(id) on delete set null`.
  - `batch_sessions.ends_at timestamptz` (null for existing rows), `speaker text not null default ''`, `feedback_session_id uuid references feedback_sessions(id) on delete set null`, `custom_time boolean not null default true`, `custom_zoom boolean not null default true` (existing rows count as custom so changing defaults never touches them).
  - `participant_sends.session_kind` check widened to `('reminder','update','feedback')`; the reminder-only unique index stays as is.

- [ ] **Step 1: Write the failing test** `tests/migrations-batch-classes.test.ts` asserting the SQL text contains each column above, `'feedback'` in the widened check, and `if not exists` / `drop constraint if exists` idempotency guards.
- [ ] **Step 2: Run it; expect FAIL** (file missing): `node node_modules/vitest/vitest.mjs run tests/migrations-batch-classes.test.ts`
- [ ] **Step 3: Write `0091_batch_classes.sql`** (header comment style like 0089/0090) and hand-add the new columns to the `landing_pages`, `batch_sessions`, `participant_sends` Row/Insert/Update entries in `database.types.ts`.
- [ ] **Step 4: Write the owner-steps doc**: one step "paste 0091 in the Supabase SQL editor", then a read-only check the owner/agent can run: `select count(*) from batch_sessions where custom_time and custom_zoom` equals the existing row count.
- [ ] **Step 5: Run the test and `tsc --noEmit`; expect PASS and 0 errors. Commit** `feat: batch classes columns (0091)`.

---

### Task 2: Class planner (pure logic)

**Files:**
- Create: `src/lib/classes/plan.ts`
- Test: `tests/classes-plan.test.ts`

**Interfaces:**
- Produces:
  - `type ClassDefaults = { start: string /* "HH:mm" PKT */; end: string; zoom: string }`
  - `type ClassDayInput = { date: string /* "YYYY-MM-DD" */; start?: string; end?: string; zoom?: string; title?: string; speaker?: string; existingId?: string }`
  - `type ExistingClass = { id: string; number: number; startsAtIso: string; endsAtIso: string | null; zoom: string; customTime: boolean; customZoom: boolean }`
  - `type ClassOp = { kind: "create"; number: number; date: string; startsAt: string; endsAt: string; zoom: string; customTime: boolean; customZoom: boolean; title: string; speaker: string } | { kind: "update"; id: string; /* same fields minus number */ } | { kind: "remove"; id: string }`
  - `planClasses(days: ClassDayInput[], defaults: ClassDefaults, existing: ExistingClass[], type: "course" | "workshop" | "webinar"): { ok: true; ops: ClassOp[] } | { ok: false; message: string }`
  - `applyDefaultsToClasses(existing: ExistingClass[], defaults: ClassDefaults): { id: string; startsAt: string; endsAt: string; zoom: string }[]` (only rows whose `customTime` / `customZoom` is false, only the part that is not custom).
- Rules: a day with no own time/zoom follows defaults (`customTime`/`customZoom` false); webinar allows exactly 1 day, others 1+; days must be unique; end must be after start; numbers: new classes get the next free numbers (max existing + 1, ...) assigned in date order; existing days matched by `existingId`, unmatched existing classes become `remove` ops; message strings are plain words.

- [ ] **Step 1: Write failing tests** with these names: `webinar rejects two days`, `course follows defaults and marks not custom`, `own time marks custom and keeps defaults for zoom`, `new earlier day gets next free number, existing numbers untouched`, `unticked existing day becomes remove`, `end before start is rejected`, `duplicate day is rejected`, `applyDefaultsToClasses skips custom rows and rows with no end time`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** both functions in `src/lib/classes/plan.ts` using `pktToIso` for every date+time pair. No database access.
- [ ] **Step 4: Run tests; expect PASS. Commit** `feat: class planner`.

---

### Task 3: Feedback links per class

**Files:**
- Create: `src/lib/data/batch-feedback.ts`
- Test: `tests/batch-feedback.test.ts` (mock `createAdminSupabase` and the feedback data functions the way `tests/feedback-sessions.test.ts` does)

**Interfaces:**
- Consumes: `createFeedbackSession`, `updateFeedbackSessionQuestions`, `setFeedbackSessionCover` (`src/lib/data/feedback-sessions.ts`); `setFeedbackProgramCover` (`feedback-programs.ts`); `generateFeedbackShareToken` (`feedback-share.ts`); `getFeedbackSessionDetail` (`feedback-responses.ts`).
- Produces:
  - `type BatchFeedbackSetup = { type: "course" | "workshop" | "webinar"; questions: { text: string; type: "stars" | "video" }[]; coverUrl: string | null }`
  - `ensureClassFeedback(pageId: string, sessionId: string, setup: BatchFeedbackSetup, actorProfileId: string | null): Promise<{ feedbackSessionId: string; slug: string }>` — idempotent: if `batch_sessions.feedback_session_id` is already set, return it and change nothing. Creates the program once per batch for course/workshop when `landing_pages.feedback_program_id` is null (direct insert into `feedback_programs` with a share token, NOT `createFeedbackProgram`, which demands 2+ sessions); webinar creates no program. Creates the feedback session with `randomizeSlug: true`, `programId`, `programOrder` = class number, `sessionDate` = PKT date, cover = `setup.coverUrl`; writes `feedback_session_id` back.
  - `batchQuestionSet(pageId: string): Promise<BatchFeedbackSetup["questions"]>` — questions of the batch's first feedback session (used when classes are added later).
  - `createMissingFeedback(pageId: string, actorProfileId: string | null): Promise<{ created: number }>` — classes of the batch with no `feedback_session_id`; uses `batchQuestionSet`, falls back to the first 3 bank questions only if the batch has none.
  - `applyQuestionsToBatch(pageId: string, questions: BatchFeedbackSetup["questions"], actorProfileId: string | null): Promise<{ updated: number; skipped: number }>` — updates only classes whose feedback session has 0 responses (spec call 3).
  - `setBatchCover(pageId: string, coverUrl: string | null, actorProfileId: string | null): Promise<void>` — writes `landing_pages.class_cover_url`, the program cover, and `cover_url` of every feedback session of the batch.

- [ ] **Step 1: Write failing tests**: `second call for same class creates nothing`, `webinar creates a session and no program`, `course creates one program for many classes`, `blank speaker becomes PZ Academy`, `name uses topic when given, otherwise Day N`, `question update skips classes that have responses`, `createMissingFeedback only touches classes without feedback`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** the five functions in `src/lib/data/batch-feedback.ts`.
- [ ] **Step 4: Run tests and `tsc --noEmit`. Commit** `feat: feedback links for classes`.

---

### Task 4: Setup and edit actions

**Files:**
- Modify: `src/lib/data/attendance.ts` (`SessionInput`, `createSession`, `updateSession`, `getSessionByCode`)
- Modify: `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions.ts`
- Create: `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/setup-actions.ts`
- Test: `tests/classes-setup-actions.test.ts` (model on `tests/attendance-admin-actions.test.ts`)

**Interfaces:**
- Consumes: Task 2 `planClasses`, `applyDefaultsToClasses`; Task 3 functions.
- Produces:
  - `SessionInput` gains `endsAt: string | null; speaker: string; customTime: boolean; customZoom: boolean`; `createSession` / `updateSession` persist them; `getSessionByCode` also returns `coverUrl: string | null` (from `landing_pages.class_cover_url`).
  - `loadSetup(pageId: string): Promise<SetupState>` where `SetupState = { title: string; defaults: ClassDefaults | null; coverUrl: string | null; classes: (ExistingClass & { date: string; title: string; speaker: string; hasData: boolean })[]; questions: BatchFeedbackSetup["questions"]; type: "course" | "workshop" | "webinar" }`. `type` is derived: 1 class and no program -> webinar, program type otherwise, "course" for a new batch.
  - `saveSetup(pageId: string, form: SetupForm): Promise<ActionResult>` where `SetupForm = { type; days: ClassDayInput[]; defaults: ClassDefaults; coverUrl: string | null; questions: BatchFeedbackSetup["questions"]; confirmRemoveIds: string[] }`. Admin-only via `requireAdmin`. Removal of a class with `hasData` is refused unless its id is in `confirmRemoveIds`. Executes the planner ops, then `ensureClassFeedback` for every class, `setBatchCover`, stores the batch defaults on `landing_pages`, and revalidates the sessions path. Safe to call twice.
  - `saveDefaults(pageId: string, defaults: ClassDefaults): Promise<ActionResult>` — stores defaults and applies `applyDefaultsToClasses`.
  - `createMissingFeedbackAction(pageId: string): Promise<ActionResult>`.

- [ ] **Step 1: Write failing tests**: `saveSetup creates classes and feedback for each`, `saveSetup twice makes no duplicates`, `removing a class with marks is refused without confirmation`, `non-admin is refused`, `saveDefaults leaves custom classes alone`, `loadSetup derives webinar for one class and no program`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** (extend the data layer and write the actions). Keep the existing `addSession`/`saveSession`/`removeSession` actions working with the new fields (the edit dialog in Task 6 uses `saveSession`).
- [ ] **Step 4: Run these tests, `tests/attendance-data.test.ts`, `tests/attendance-admin-actions.test.ts`, `tsc --noEmit`, eslint on touched paths. Commit** `feat: setup and edit actions for classes`.

---

### Task 5: Setup screen (desktop and mobile)

**Files:**
- Create: `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/setup/page.tsx`
- Create: `src/components/admin/classes/SetupForm.tsx`, `ClassCalendar.tsx`, `ClassDayRow.tsx`, `QuestionPicker.tsx`
- Test: `tests/classes-setup-ui.test.tsx`

**Interfaces:**
- Consumes: `loadSetup`, `saveSetup` (Task 4); `LibraryImageField` (`src/components/admin/landing/LibraryImageField.tsx`) for the cover; the question bank list from `GET /api/admin/feedback/question-bank` (same data the old modal uses).
- Produces: route `/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/setup`. `ClassCalendar` props: `{ month: string; selected: string[]; max: number | null; onToggle(date: string): void }`.

Follow the setup Stitch screens (desktop and mobile) for layout: type toggle, calendar, defaults box, day rows ("same as default" greyed, own values highlighted), question chips, cover picker, sticky bottom "Create all classes" (label becomes "Save changes" when classes already exist), the note "Attendance link and feedback link are made for every class automatically." Unticking a day that has data opens a plain confirmation naming what is lost (attendance marks, quiz results, feedback answers) and fills `confirmRemoveIds`. Webinar mode: the calendar allows exactly one selection.

- [ ] **Step 1: Write failing UI tests**: `webinar toggle allows only one day`, `day with its own time shows highlighted, others show same as default`, `unticking a day with data asks for confirmation naming the loss`, `submit sends one saveSetup call with the chosen days`, `button says Save changes when classes exist`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** the page (server component calling `loadSetup`, admin guard like the existing sessions page) and the components. Mobile first: check at 390px that nothing scrolls sideways.
- [ ] **Step 4: Run tests, `tsc`, eslint. Commit** `feat: class setup screen`.

---

### Task 6: Classes overview and Today panel

**Files:**
- Modify: `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/page.tsx`
- Create: `src/lib/data/class-overview.ts`
- Create: `src/components/admin/classes/ClassList.tsx`, `TodayPanel.tsx`, `AttendanceCard.tsx`, `QuizCard.tsx`, `FeedbackCard.tsx`, `EditClassDialog.tsx`
- Modify: `src/components/admin/attendance/SessionsPanel.tsx` (reuse its edit form fields, reminder controls and "mark everyone present"/"email updated time" inside the new dialog and card; delete what becomes unused)
- Test: `tests/class-overview-data.test.ts`, `tests/classes-overview-ui.test.tsx`

**Interfaces:**
- Produces: `getClassOverview(pageId: string, now?: Date): Promise<ClassOverview>` with `ClassOverview = { title: string; classes: { id; number; title; speaker; startsAt; endsAt: string | null; status: "done" | "today" | "upcoming"; presentCount: number; enrolledLive: number; attendanceLink: string; feedbackLink: string | null; feedbackCount: number; feedbackAvg: number | null; quiz: { saved: boolean; players: number; needCheck: number } }[]; selectedId: string }`. Per-class numbers come from batched queries (one marks query, one responses query, one quiz query for the whole batch, not one per class). `selectedId` = today's class, else the next upcoming, else the last.
- Cards, in order and following the overview Stitch screens: Attendance (Copy link first, Email to students second, count, open the attendance list = existing `AttendanceGrid` for that class), Quiz results (upload button routes to the existing `sessions/[sessionId]/quiz` screen; shows "N players, M need checking" after saving), Feedback (Copy link first, Email to students second, response count and average, "See responses" to `/dashboard/admin/feedback/<feedbackSessionId>`). A banner names the single next step: attendance not open yet -> "Share the attendance link"; class started and no quiz saved -> "Upload today's quiz results"; quiz saved -> "Check feedback responses". "Edit this class" opens `EditClassDialog` (date, time, Zoom link, topic, speaker, reminder on/off and minutes before, existing rules). "Add a class" and "Create missing feedback links" buttons. Existing batch settings kept: attendance minimum percentage, shared check-in link.
- Mobile: day strip (3 columns) on top, cards stacked, bottom nav is the app's own.

- [ ] **Step 1: Write failing tests**: data: `status is today/upcoming/done by PKT date`, `selectedId prefers today then next upcoming then last`, `counts come from one query per kind`; UI: `banner names the next step for each state`, `copy link button is first and email second on both cards`, `class with no feedback shows Create missing feedback links`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** the data function, page and components.
- [ ] **Step 4: Run tests plus `tests/attendance-data.test.ts`, `tests/quiz-review-ui.test.tsx`, `tsc`, eslint. Commit** `feat: classes overview and today panel`.

---

### Task 7: Combined feedback and per-student attendance

**Files:**
- Create: `src/lib/classes/summary.ts`
- Modify: `src/lib/data/class-overview.ts`, `src/components/admin/attendance/AttendanceGrid.tsx`
- Create: `src/components/admin/classes/BatchSummary.tsx`
- Test: `tests/classes-summary.test.ts`

**Interfaces:**
- Produces (pure): `summarizeFeedback(perClass: { number: number; responses: number; avg: number | null }[]): { totalResponses: number; overallAvg: number | null; perClass: typeof perClass }` (overall average weighted by responses; null when 0 responses). `summarizeAttendance(rows: GridRow[], minPct: number): { averagePct: number | null; meetingMin: number; total: number }` (null when no class has started).
- `ClassOverview` gains `batchFeedback: ReturnType<typeof summarizeFeedback>` and a link to the program's public review view (`/review/<share_token>`) when a program exists.
- `AttendanceGrid` keeps its current columns (per-student classes attended out of started, percentage, meets-minimum tick) and a header line shows the batch average and "N of M meet the minimum".

- [ ] **Step 1: Write failing tests**: `no responses gives null average, not NaN`, `average is weighted by responses`, `no started class gives null attendance average`, `meetingMin counts students at or above minPct`.
- [ ] **Step 2: Run; expect FAIL.** **Step 3: Implement.** **Step 4: Run tests, `tsc`, eslint. Commit** `feat: combined feedback and attendance summary`.

---

### Task 8: Feedback email

**Files:**
- Modify: `src/lib/data/session-emails.ts` (`createSessionSend` accepts kind `"feedback"`), `src/lib/attendance/session-email.ts` (add `buildFeedbackEmail`), the sessions `actions.ts`
- Test: `tests/classes-feedback-email.test.ts` (model on `tests/attendance-session-email.test.ts`)

**Interfaces:**
- Produces: `buildFeedbackEmail(source: { batchTitle: string; classTitle: string; feedbackUrl: string; firstName: string }): { subject: string; html: string; text: string }` (short, plain words, one button "Give your feedback"); `createSessionSend(sessionId: string, kind: "reminder" | "update" | "feedback")`; action `emailFeedbackLink(sessionId: string): Promise<ActionResult>`. Recipients: every enrolled student of the batch (the same people the reminder reaches). Uses the same send log and sending path as the reminder; refuses when the class has no feedback link or a feedback send is still sending.

- [ ] **Step 1: Write failing tests**: `feedback email contains the link and the class name`, `refuses when no feedback link exists`, `refuses a second press while one is sending`, `non-admin refused`.
- [ ] **Step 2: Run; expect FAIL.** **Step 3: Implement.** **Step 4: Run tests, `tests/session-emails-cron.test.ts`, `tsc`, eslint. Commit** `feat: email feedback link to students`.

---

### Task 9: Cover on the public pages, wiring and cleanup

**Files:**
- Modify: `src/app/attend/[code]/page.tsx` (show `coverUrl` as a header image only; no other change)
- Modify: `CLAUDE.md` ("Project state": batch classes built; next free migration after 0091 is 0092)
- Create: `docs/superpowers/plans/2026-10-29-batch-classes-owner-steps.md` additions if any (Task 1 file)
- Test: `tests/classes-public-cover.test.tsx`

- [ ] **Step 1: Write failing test**: `attendance page shows the cover when set and nothing extra when not`.
- [ ] **Step 2: Run; expect FAIL.** **Step 3: Implement the cover and update CLAUDE.md.**
- [ ] **Step 4: Run the full focused set: all `tests/classes-*.test.ts*`, `tests/batch-feedback.test.ts`, `tests/class-overview-data.test.ts`, `tests/migrations-batch-classes.test.ts`, `tests/attendance-*.test.ts`, `tests/quiz-*.test.ts*`, `tests/feedback-*.test.ts`; then `tsc --noEmit` and eslint on all touched paths. Commit** `feat: cover on attendance page, project notes`.
- [ ] **Step 5: Whole-branch review** by one fresh reviewer (model set explicitly), then owner browser check after migration 0091 is pasted: set up a test webinar and a 2-day workshop on a test batch, check both links, the Today panel on a phone-width window, and an old feedback link still opening.
