# Native feedback system — design

Status: approved. Feeds subsystem D of the mentorship system's 4-subsystem
rebuild (A done, B done, C done — see memory
`pz-academy-mentorship-subsystem-status`), but scope is broader than D alone:
this replaces the existing GAS+Sheets feedback backend for *all* session
feedback (general workshops/courses, not just 1:1 mentorship). Messaging and
mentor notes — the other two D candidates — are explicitly deferred to a
later round; this spec covers feedback only.

## Context / what already exists

- **Old system** (`PZ Academy Feedback System/`, GAS + Google Sheets, live in
  production at `pz-academy.pharmacozyme.com/feedback/[slug]` and
  `/review/[token]`): sessions (name/speaker/date/3-5 questions,
  star-or-video type), programs (workshop/course grouping of 2+ sessions
  sharing a question set, responses collected into one `Feedbacks` tab of an
  admin-designated master sheet), an editable question bank, anonymous
  participant submission (name/email typed, honeypot + volatile-cache rate
  limit + 5-minute duplicate-window guard), admin CRUD with CSV export,
  share-token public aggregate-review pages (email stripped, video URLs
  converted to Drive embeds), and an audit log. Auth is a single shared
  admin password plus an admin/viewer key pair — no per-user accounts, no
  RLS. Fully documented by reading every `.gs` file in that directory before
  this spec was written.
- **This app already calls the old system**: `src/lib/mentorship/gas.ts`
  (`getPublicSession`), `src/app/feedback/[id]/page.tsx` +
  `FeedbackClient.tsx`, `src/app/review/[token]/*`. These stay wired to GAS
  unchanged until the native system is live and tested (see Cutover below).
- **`public.sessions`** (migration `0001`, activated by subsystem C) already
  has `mentor_notes`, `student_feedback`, `rating` columns — reserved
  explicitly for D, currently unwritten by any code path. This spec treats
  them as a **denormalized summary** synced from the new engine's tables
  (see Mentorship tie-in below), not as the primary feedback store — a
  single mentorship session can carry a multi-question breakdown (matching
  the general engine), which doesn't fit one scalar `rating` column alone.
- **Existing GAS→Supabase bridge precedent**: `api/webhooks/mentorship-sync`
  — a different GAS project (`gas/mentorship-sync/Code.gs`) posts
  status-change events with a shared secret (`MENTORSHIP_SYNC_SECRET`). The
  new Drive-upload proxy (below) follows the same shared-secret,
  server-to-server pattern.
- **Stitch project "PZ Academy Feedback System"** (`8093496535280885471`)
  already has the full screen set needed, one design system throughout
  (`PZ Academy System` — dark forest/green, Montserrat headlines + Plus
  Jakarta Sans body, matches the live public mentorship pages' dark theme):
  feedback wizard (Intro, Name, Overall Rating, Content Clarity, Practical
  Value, Recommendation, Comments, Email, Thank You), Admin (Session List,
  Session Detail, New Session Modal, Session Created Confirmation), Viewer
  (Session List, Session Detail dashboard). No new screens need generating;
  implementation extracts markup from these.

## Front-end source: Stitch (must-rule)

Every screen above lives in project `8093496535280885471`, design system
`PZ Academy System`. Public feedback-form screens are mobile-shaped (390w);
admin/viewer screens are desktop (1280w). The "Viewer" screens become the
mentor's read-only feedback view, role-scoped instead of key-scoped (see
Access below) — same visual design, different data-access boundary.

## Architecture / data flow

### Schema (new migration, starting at `0033`, last is `0032_mentorship_sessions_fixes.sql`)

Normalized instead of the old sheet's fixed `Question 1..5`/`Answer 1..5`
columns:

- `feedback_sessions` — `name`, `speaker_name`, `date`, `status`
  (`active`/`closed`), `slug` (unique), `program_id` (nullable FK), `order`,
  `cover_url`, `share_token`, `mentorship_session_id` (nullable FK to
  `public.sessions`), `mentor_id` (nullable FK to `mentors`) — the two
  mentorship-tie-in columns, both null for general workshop/course sessions.
- `feedback_questions` — `feedback_session_id` FK, `text`, `type`
  (`stars`|`video`), `order` (1-5).
- `feedback_question_bank` — admin-edited reusable defaults: `text`, `type`,
  `default_order`. Seeded with the old system's `DEFAULT_QUESTIONS`.
- `feedback_responses` — `feedback_session_id` FK, `participant_name`,
  `participant_email` (nullable), `participant_profile_id` (nullable FK to
  `profiles` — set when the submitter is a logged-in user), `comments`,
  `submitted_at`.
- `feedback_answers` — `response_id` FK, `question_id` FK, `star_value`
  (1-5, nullable) or `video_url` (nullable) — exactly one populated per row.
- `feedback_programs` — `name`, `type` (`workshop`|`course`), `cover_url`,
  `share_token`.
- `feedback_audit_log` — `action`, `detail`, `actor_profile_id`,
  `created_at`.

Question-bank seeding, slug uniqueness (`base`, `base-2`, `base-3`… on
collision), and program-type inference (`sessions.length >= 5` → course, else
workshop) port directly from `Validation.gs`/`Programs.gs`'s existing logic.

### Public feedback flow (`/feedback/[slug]`)

Same anonymous, keyless shape as today — no login required. Multi-step
wizard per the Stitch screens (Intro → Name → per-question ratings →
Comments → Email → Thank You). Server-side hardening ports from
`Validation.gs`/`Responses.gs`:

- `cleanText_`-equivalent sanitization (strip control chars, length caps)
  on every field.
- Honeypot field, silently dropped.
- Duplicate-submission guard: was a 5-minute window scan of prior rows by
  session+email; becomes a straightforward Postgres query in the same
  transaction as the insert (durable, not the old volatile
  `CacheService`-backed version — a native improvement, not a regression).
- Rate limit: same replacement — a bounded count-in-window query instead of
  `CacheService`, same `RATE_MAX_SUBMITS`/`RATE_WINDOW_SEC` thresholds.
- If the page is opened by a logged-in student (session cookie present),
  pre-fill name/email from their profile and stamp
  `participant_profile_id` on the response. Native improvement over the old
  fully-anonymous flow; flag during spec review if undesired.

Writes go through a Next.js route handler using the service-role client
(mirrors the old `doPost`'s server-mediated write model) — no
`SECURITY DEFINER` RPC needed here, since the caller is never authenticated
as the row owner the way B/C's self-service RPCs are.

### Admin access (`/dashboard/admin/feedback`, new section)

Gated by `requireAdmin()` (`require-admin.ts`), matching every other admin
surface. Covers, per the Stitch Admin screens: session + program CRUD
(create/edit/close/reopen/delete), question-bank editor, per-session detail
(per-question averages, response list, individual response delete), CSV
export, cover-image upload, share-token generation, audit log view. Replaces
the old shared admin-password + `assertAdmin_`/`logAudit_` pattern with real
`profiles.role = 'admin'` checks and `actor_profile_id` on every audit row.

### Mentor access (read-only, scoped)

Gated by `requireMentor()` (`require-mentor.ts`). Mirrors the Stitch
"Viewer" screens, but scoped to the caller's own `mentor_id` (via their
linked `mentors.profile_id`) instead of a shared viewer key — a mentor sees
only feedback for sessions where `feedback_sessions.mentor_id` matches
their own row. No CSV export, no audit log, no cross-mentor visibility.

### File storage (video answers + cover images)

Per your explicit choice, uploads keep going to Google Drive rather than
moving to Supabase Storage. A small dedicated Apps Script Web App (new,
separate from the old Feedback System's GAS project so the old system is
never touched) reuses `VideoUpload.gs`/`CoverUpload.gs`'s logic
near-verbatim: folder-per-program/session layout, 20MB size guard,
MIME-type check, `ANYONE_WITH_LINK` sharing. Next.js calls it server-to-server
with a shared secret (`FEEDBACK_UPLOAD_SECRET`), same pattern as
`mentorship-sync`. Returned URLs are converted to
`https://drive.google.com/thumbnail?id=<fileId>&sz=w1600` before storage —
the `/thumbnail?id=` pattern, never `uc?export=view` (CORP hotlink block,
see build-gotchas memory) — the old system's `driveThumbnailUrl_` already
does this conversion for its embed/share views; the new proxy does it once,
at upload time, so every consumer gets a pre-normalized URL.

### Share-token public review (`/review/[token]`)

Ports `ShareView.gs`'s sanitization rules exactly: no email, participant
name only, video URLs resolved to Drive preview/thumbnail form,
per-question + overall averages. Works for both a single `feedback_session`
and a `feedback_program` (aggregating its member sessions, ordered).

### CSV export

Straight port of `exportSessionCsv`'s column shape and `csvCell_` quoting
rules, querying the new normalized tables instead of a sheet range.

### Mentorship 1:1 tie-in (the subsystem-D integration point)

When a `public.sessions` row transitions to `completed` (mirrors C's
`applyBookingStatus` commit-point pattern for `sessions_total` — freeze
derived state at the state-transition commit, not lazily later), the same
transition handler creates a `feedback_sessions` row: `mentorship_session_id`
set to the session's id, `mentor_id` resolved from the session's mentor,
`speaker_name` the mentor's display name, questions cloned from a
`feedback_question_bank` entries flagged for mentorship use (a new
`is_mentorship_default` boolean column on the bank, or a fixed small set —
implementation detail for the plan). One session, one expected respondent
(the student) — no program grouping, no slug collision risk since mentorship
feedback links are delivered directly (dashboard prompt / email), not
publicly discoverable.

On submission of that response, a lightweight sync writes the aggregate
back onto `sessions.rating` (overall star average) and
`sessions.student_feedback` (the comments field) — a frozen denormalized
summary so any UI reading `sessions` directly (list views, mentor dashboard
cards) doesn't need to join into the feedback tables for a quick glance.
`sessions.mentor_notes` stays untouched — that's the deferred mentor-notes
feature, not session feedback.

## Security boundary

Matches B/C's established convention: service-role data layer + route-level
auth gate (`requireAdmin()`/`requireMentor()`) is the default for every
authenticated surface. No new `SECURITY DEFINER` RPC is needed anywhere in
this subsystem — public submission is server-mediated through a route
handler (same shape as the old `doPost`), not a caller writing their own
`auth.uid()`-scoped row the way B's `update_own_mentor_profile` or C's
`book_mentorship_sessions` do. If a future round adds authenticated
self-service actions (e.g. a student editing their own already-submitted
feedback), that would need its own RPC with the explicit
`revoke execute ... from public, anon, authenticated` pattern, per B's
footgun — not needed for this spec's scope.

All new tables/enums get hand-added to `database.types.ts`'s `Tables`
block — no codegen script exists in this repo.

## Cutover strategy (old system stays untouched until new is proven)

No big-bang data migration. `/feedback/[slug]` and `/review/[token]`'s
route handlers look up the slug/token in the new native tables first; if
not found, fall back to the existing `getPublicSession`/GAS call exactly as
today. New sessions get created in the native admin UI going forward once
it's live; every link already issued for an old GAS-backed session keeps
resolving through the fallback indefinitely — the old system needs no
changes, no data export, and can keep running for as long as any
old-issued link might still be clicked. The old system is only formally
retired (GAS deployment taken down, Sheets archived) as a separate,
later, explicit decision — not part of this build.

## Testing

- Existing `tsc` + vitest + lint gates, no ad hoc curl/manual verification
  beyond that (per prior feedback in this repo).
- Vitest coverage: slug uniqueness, sanitization helpers, duplicate/rate-limit
  query logic, CSV column/quoting shape, share-view sanitization (no email
  leak), the `sessions.rating`/`student_feedback` sync on mentorship
  feedback submission, program type inference.
- Live click-through using the user's own allowlisted test account
  (`hamzaansari4you@gmail.com` — mentor role, see memory
  `pz-academy-test-accounts`) and the admin account
  (`pharmacozymeofficial@gmail.com`): create a session, submit feedback
  anonymously, submit feedback while logged in, admin views detail +
  exports CSV, mentor views only their own session's feedback, share-token
  page renders without emails, a 1:1 mentorship session completes and its
  feedback prompt + `sessions.rating` sync work end to end.

## Out of scope for this round (explicitly deferred)

- Messaging and mentor notes — the other two D candidates, next brainstorm
  after this ships.
- Migrating historical GAS/Sheets data into the native tables — old sessions
  stay served by the fallback indefinitely; a one-time backfill can be a
  separate later task if ever needed.
- Retiring the old GAS deployment/Sheets — explicit later decision, not part
  of this build.
- Supabase Storage migration for uploads — Drive stays the target per your
  choice; revisit only if the Drive-proxy dependency becomes a real problem.
- Editing an already-submitted response as the original submitter (no
  self-service RPC for this yet).
