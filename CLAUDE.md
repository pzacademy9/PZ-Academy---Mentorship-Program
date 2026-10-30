# PZ Academy — Project Instructions

## Stitch is the design source of truth

Before building or redesigning ANY UI, check the relevant Stitch project for an existing
screen covering the requirement:

- `11811490301995978699` — "PZ Academy website" (screens generated through Phase 8)
- `8093496535280885471` — "PZ Academy Feedback System"
- `963183329053087808` — "PZ Academy Mentorship Portal"
- Run `mcp__stitch__list_projects` for the full list if the need falls outside these.

If a screen exists, extract its layout and copy exhaustively — port every section, don't
simplify or drop pieces because they look secondary or their backing feature isn't built yet
(stub the feature, but keep the real layout/copy from the screen).

**If no screen exists for the need, stop and hand over a generation prompt rather than
improvising a design.** Screen generation via `generate_screen_from_text` has repeatedly timed
out on this account — hand the user a prompt to run themselves rather than fighting the MCP
tool.

`mcp__stitch__get_screen` / `list_screens` return `htmlCode.downloadUrl`, not inline markup —
fetch that URL for the actual frontend code.

## Build gotchas

- `npm run <script>` is broken by the `&` in this workspace's path
  (`...\PZ Academy\PZ Academy LMS & Site\...`) — call the binary directly instead, e.g.
  `./node_modules/.bin/vitest run`, `./node_modules/.bin/tsc --noEmit`.
- `next build` corrupts the live dev server — don't run it while a dev server is up.
- Google Drive image URLs need `/thumbnail?id=` proxied through this app's own `/api/cover`
  route, not `uc?export=view` directly — Drive's CORP header blocks the latter when hotlinked.
- Checks: `tsc --noEmit` must stay at 0 errors; `eslint` clean; focused `vitest run tests/<file>`
  (the whole suite is slow). Known failing tests that are NOT ours: `tests/pz-tokens.test.ts`
  (SalesTeamPanel.tsx), `tests/participant-recipients.test.ts` and
  `tests/participant-whatsapp-ui.test.tsx` ("not a real phone number"),
  `tests/landing-route-hardening.test.ts`, `tests/gas-apply-registration-status.test.ts`,
  `tests/landing-event-sheet.test.ts`. In a cloud session the `&` path problem does not exist,
  so `npm run` works there.
- Never regenerate `src/lib/supabase/database.types.ts` (reintroduces ~20 unrelated tsc errors):
  hand-add entries per migration, including `Functions` entries for RPCs.
- Never add `eslint-disable` for `@typescript-eslint`. Source files often use CRLF.

## Working rules

- The owner is NOT technical: short plain words in anything they read, ONE question at a time,
  no jargon.
- Database changes: write migrations in `supabase/migrations/` (next free number is 0090;
  check the folder). The owner pastes SQL into the Supabase SQL editor by hand; no tool applies
  migrations. Tables are service-role only (RLS on, zero policies), read through
  `createAdminSupabase()` behind admin guards.
- Never merge or push to `main` without the owner's explicit yes. Feature branches only. `gh` is
  not logged in on the owner's PC: give the PR link, the owner opens and merges it.
- Commits end with the trailer `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Process that works here: write a plan in `docs/superpowers/plans/`, get the owner's approval,
  build task by task, one review per task, one final whole-branch review. Look at the shipped
  plans there for the style.
- Vercel is the free plan (daily crons only; runtime logs keep 1 hour). Anything that must run
  more often goes into a Supabase `pg_cron` + `pg_net` job (see the session-emails owner steps).
- Do not use the live site's certificate database for dev work (free daily read limit).

## Project state (2026-10-27)

Main goal now: move the old Google Apps Script attendance + Kahoot results system into the app,
with ONE permanent PZ ID per person (email is the identity, ID like `Hamid-4821`, typed as the
Kahoot nickname). Design (approved, five parts):
`docs/superpowers/specs/2026-10-27-attendance-results-design.md`. READ IT FIRST.

- Plan 1 permanent PZ ID: DONE, live (PR #42). Tables `pz_people`, `pz_person_emails`,
  `pz_id_aliases`; public find-your-ID page `/ids/<batch-slug>`; admin tab "Student IDs".
- Plan 2 sessions + attendance + session emails: DONE, live (PR #43). Tables `batch_sessions`,
  `batch_session_marks` (NOT `attendance_sessions`: live DB has unrelated unused legacy tables
  `attendance_sessions` and `attendance_events`; leave them alone). Public check-in `/attend/<code>`,
  admin screen under a batch's "Sessions and attendance", timer route
  `/api/cron/session-emails` called every 5 min by the Supabase job. The owner has not yet
  clicked through a real session end to end.
- Plan 3 quiz results: DONE on branch `quiz-results-plan`, awaiting owner paste of migration 0090 and a real click-through (plan `docs/superpowers/plans/2026-10-27-quiz-results.md`, owner steps beside it). Code: `src/lib/quiz/` (parser, rejoin match, review model), `src/lib/data/quiz-results.ts`, `sessions/quiz-actions.ts`, screen `sessions/[sessionId]/quiz` (`src/components/admin/quiz/`), linked from each session card as "Quiz results". The owner chose to build the screen without a Stitch design (2026-10-27). Quiz maximum defaults to questions x 1000. Next free migration: 0092 (0091 is the batch classes migration, below).
- Batch classes: BUILT on branch `batch-classes` (spec `docs/superpowers/specs/2026-10-29-batch-classes-design.md`, owner steps `docs/superpowers/plans/2026-10-29-batch-classes-owner-steps.md`). One setup screen + one Classes overview with a Today panel; feedback links auto-created per class; combined feedback report + per-student attendance summary; feedback email button. MERGED (PR #46); migration 0091 is live. `landing_pages.kind` is the batch type. The combined feedback report link (`/review/<token>` is public and shows student names and comments) is shown/opened only on an admin click; the program share token itself is created with the program, but no page shows its URL until an admin clicks. Cover allowlist helper `src/lib/classes/cover.ts` needs `NEXT_PUBLIC_SUPABASE_URL` for Supabase-hosted covers; the public attendance page shows the cover only when it passes it.
- ID and class-email audience picker: BUILT on branch `id-audience-picker` (not pushed). Migration 0092 (`batch_sessions.audience`, class audience; NULL = send nothing) is built and awaiting owner paste, so the NEXT FREE MIGRATION IS 0093. Plan `docs/superpowers/plans/2026-10-30-id-audience-picker.md`, spec `docs/superpowers/specs/2026-10-30-id-audience-and-progress-design.md`, owner steps `docs/superpowers/plans/2026-10-30-id-audience-picker-owner-steps.md`. Project B (Track Your Progress) is not started.
- Then plan 4 (public home-page cards Attendance / Results / Certificates and "my totals" by ID),
  plan 5 (careful, idempotent history import from the old sheets; see spec part 5).
- Open items: admin cannot yet correct a wrong name or reissue an ID; batch PDF uses Helvetica
  (Urdu/Arabic names print badly); plan 5 must make `pz_ensure_person` skip sequence values that
  collide with a legacy alias; the public rate limit is per server instance, not shared.
- Old Apps Script weakness to keep in mind (do not copy it): hardcoded admin password in
  `SETUP_ADMIN`. The old system folder is `PZ Academy Attendance System/` (a behaviour
  reference only, not code to keep).
