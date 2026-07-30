# Phase 0: Google Sheets ↔ Supabase Enrollment Sync

## Context

WordPress landing pages are the actual front door for each program/batch. Their custom HTML
forms feed a per-batch Google Sheet (one sheet per program batch — e.g. "PPC B3"). The
PZ Academy team reviews payment proof off-sheet and marks each row's **Payment Confirmation**
dropdown to one of four values: `Paid`, `Pending`, `Underpaid`, `Reserved`. Today nothing
connects that sheet to Supabase — a submitted lead never becomes an `enrollments` row unless
someone manually recreates it in the app, and an approval made in the Phase 6 admin panel never
reaches the sheet the team actually works in day to day.

This is the original plan's **Phase 0 — GAS ↔ Supabase Bridge, Pipeline 1**, marked highest
priority in `Implementation_Plan_v3.1.md`. Pipeline 2 (student enrolls directly in the app,
uploads a screenshot, admin reviews in `/dashboard/admin/enrollments`) already shipped this
session as Phase 6 and is untouched by this spec — it's the same `enrollments` table underneath,
just fed from a second source.

**Goal:** a lead submitted through the WordPress→Sheet funnel becomes a real (or pending) student
account with no manual re-entry, and status changes made in *either* the sheet or the app
converge, without silently taking course access away from a student the team already approved.

## Non-goals

- Changing how WordPress writes rows into the Sheet — that pipeline already works and is out of
  scope.
- A generic multi-tenant "map any sheet to any course" admin UI. Only a couple of sheets exist
  today; `courses.sheet_id` is set by hand via SQL when a new batch's sheet goes live.
- Supporting Payment Confirmation values beyond the four known ones. A 5th value is a follow-up.
- Real-time push to the sheet outside of writing a cell value back after a confirmed status
  change — there's no live two-way UI, just eventually-consistent sync on each edit.
- Cloning PPC B3's course content from PPC B2 — that's a one-time manual data copy the admin runs
  once (see Rollout), not new product code.
- Retiring whatever pre-existing email automation the team already has tied to the sheet's
  dropdown (if any) — flagged as a manual rollout step, not something this spec's code can detect
  or turn off.

## Architecture

```
WordPress form ──(existing, unchanged)──▶ Google Sheet (per batch)
                                              │  onEdit (installable trigger)
                                              ▼
                                  GAS "Sheets Sync" script
                                  (new, bound to the Sheet)
                                              │  POST {token, action, row}
                                              ▼
                          Next.js  POST /api/webhooks/sheets-sync
                                              │
                                              ▼
                                    Supabase (enrollments,
                                    sheet_leads, courses.sheet_id)
                                              │
                              admin confirms in /dashboard/admin/enrollments
                                              │  PATCH (existing Phase 6 route)
                                              ▼
                          Next.js  pushStatusToSheet() ──POST {token, action:"applyStatus"}──▶
                                              │
                                              ▼
                                  GAS writes the Payment Confirmation
                                  cell + a hidden sync marker
```

This is a **third, separate GAS project** from both the existing `payment-screenshots` bridge and
the just-recovered "PZ Admin Portal" (`Router.gs`/`LMS.gs`, which handles admin lesson-PDF
uploads and is unrelated — see Appendix). It's bound directly to each batch's Sheet as a
container-bound script, so `onEdit` can be an installable trigger without extra setup per sheet
beyond authorizing it once.

Shared secret travels in the JSON POST body on both directions (`{token: ...}`), matching the
existing `payment-screenshots/Code.gs` convention — GAS `doPost` doesn't reliably set custom
request headers, so we deviate from the original written spec's "X-GAS-Secret header" the same
way that script already does.

## Data model

New migration `supabase/migrations/0016_sheet_sync.sql`:

```sql
alter table public.courses
  add column sheet_id text;

alter table public.enrollments
  add column payment_shortfall_pkr numeric,
  add column sheet_pending_status public.enrollment_status,
  add column sheet_pending_note text;

create table public.sheet_leads (
  id                    uuid primary key default gen_random_uuid(),
  sheet_id              text not null,
  course_id             uuid not null references public.courses(id),
  row_email             text not null,
  row_name              text,
  row_phone             text,
  payment_confirmation  text not null,
  payment_amount_pkr    numeric,
  raw_row               jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  resolved_at           timestamptz,
  resolved_enrollment_id uuid references public.enrollments(id)
);

alter table public.sheet_leads enable row level security;

create policy "sheet_leads: admin reads"
  on public.sheet_leads
  for select
  using (get_my_role() in ('admin', 'super_admin'));
```

`sheet_leads` has no public INSERT policy — only the service-role webhook writes it, same
pattern as `notifications`.

`payment_shortfall_pkr`: set when the sheet reports `Underpaid`. The enrollment's `status` stays
`pending` — underpaid is not a new access-gating state, it's a pending enrollment with a known
shortfall attached, so the existing `pending` screen in `EnrollmentStatusScreen` already gates
access correctly. The screen's copy gets a small conditional: if `payment_shortfall_pkr` is set,
show "We received a partial payment — Rs. `<amount>` still due" instead of the generic pending
message.

`sheet_pending_status` / `sheet_pending_note`: populated only when a sheet-driven status change
would be a **downgrade** (see Downgrade rule below) and needs an admin's explicit confirmation
before it takes effect. `null` in the common case.

## Status mapping

| Payment Confirmation (sheet) | `enrollments.status` | Notes |
|---|---|---|
| `Paid` | `active` | Same as an admin "Approve" in the Phase 6 panel — fires `on_enrollment_activated`, unlocks lesson 1. |
| `Pending` | `pending` | Default for a brand-new row. |
| `Reserved` | `reserved` | Seat held, no course access (existing Phase 6 status). |
| `Underpaid` | `pending` + `payment_shortfall_pkr` set | Not a distinct enum value — see Data model. |

Rank for downgrade comparison: `rejected/expired = 0, pending = 1, reserved = 2, active = 3`.
(`Underpaid` ranks as `pending`'s `1` even though it carries a note.)

## Downgrade rule

A sheet-driven status change is a **downgrade** if its target rank is lower than the
enrollment's current rank (e.g. `active → pending`, `active → Underpaid`, `reserved → rejected`).
Per the explicit decision on this: **the app never auto-applies a downgrade from a sheet edit.**
The team can fat-finger a dropdown, and a student who was already told "you're in" must never
silently lose access from a stray Sheets edit.

- Non-downgrade (new row, or any change that holds or raises rank): applied immediately by the
  webhook, same as today's Phase 6 approve/reserve logic, then synced back to the sheet.
- Downgrade: the webhook does **not** touch `status`. It sets `sheet_pending_status` (the
  requested target) and `sheet_pending_note` (e.g. `"Sheet requested: active → pending"`), and
  sends an in-app notification to admins (reusing the existing Phase 6b notifications system —
  no new notification infrastructure needed). The enrollment's real status is untouched until an
  admin confirms.

Admin-side handling in `/dashboard/admin/enrollments`: a small banner component,
`SheetPendingBanner.tsx`, renders on any row/detail page where `sheet_pending_status is not null`:
"Sheet requests: Active → Pending. [Confirm] [Dismiss]."
- **Confirm** applies `sheet_pending_status` as a real transition (reusing the same
  status-application logic as the existing `PATCH /api/admin/enrollments/[id]` route — that
  logic is extracted into a shared `applyEnrollmentStatus()` function so both routes call one
  implementation), clears the two pending columns, and pushes the new status back to the sheet.
- **Dismiss** clears the two pending columns without changing `status`, and pushes the
  *unchanged* current status back to the sheet — correcting the stray cell back to what the app
  actually has, so the sheet and app don't stay visibly out of sync.

New route: `src/app/api/admin/enrollments/[id]/sheet-sync/route.ts` — `POST { action: "confirm" |
"dismiss" }`, `requireAdmin()`-gated like every other admin route in this codebase.

## Identity resolution

Matching is by email, per the explicit decision. On a new-row event:

- Email matches an existing `auth.users` row → upsert an `enrollments` row (service-role client,
  same as the rest of this codebase's admin-side writes) for that `student_id` + the course
  resolved from `courses.sheet_id`, apply the status mapping above, fire the matching
  `enrollmentReceived`/`enrollmentApproved`/`enrollmentReserved` email (existing templates from
  Phase 6), then push the row's synced state back to the sheet.
- Email doesn't match any account → insert into `sheet_leads` instead of `enrollments` (no
  student to attach it to yet). Send an email to that address: "We received your submission —
  create your PZ Academy account to access it [signup link]. Already have an account under a
  different email? Reply and let us know." This directly implements the decision to ask about an
  existing account in the same email rather than blocking on it.

**Auto-resolving a lead on signup:** extend the existing `handle_new_user` trigger (the one that
creates a `profiles` row on `auth.users` insert) to also check `sheet_leads` for an unresolved row
matching the new user's email. If found: create the real `enrollments` row from the lead's stored
data, mark the lead `resolved_at`/`resolved_enrollment_id`, and let the normal enrollment-created
notification fire. This closes the loop the moment a lead actually signs up, with no manual admin
step.

## Multi-sheet onboarding (post-launch revision)

Originally scoped as one GAS deployment per sheet, matching the "container-bound script" pattern.
Changed to: **one standalone GAS project serves every batch's sheet.** An installable trigger can
be created programmatically for any spreadsheet the deploying account can edit, via
`ScriptApp.newTrigger(...).forSpreadsheet(sheetId)` — it does not need to live inside that
spreadsheet's own bound-script project. This means onboarding a new batch is a `registerSheet`
call, not a new deployment.

- New `doPost` action `registerSheet({sheetId})`: idempotently installs the `onEdit` trigger on
  that spreadsheet ID (checks `ScriptApp.getProjectTriggers()` first, so calling it twice for the
  same sheet is a harmless no-op).
- `onEdit` derives the sheet ID from the edit event itself (`e.range.getSheet().getParent().getId()`)
  rather than a hardcoded script property — the same shared function already served every sheet
  correctly, since GAS triggers dispatch to one shared handler regardless of which registered
  spreadsheet fired them.
- `applyStatus` now takes `sheetId` in its payload (opens that sheet by ID) instead of reading a
  single `SHEET_ID` script property.
- Column header names (`COL_EMAIL`, etc.) remain global script properties, shared across every
  registered sheet — assumes all batch sheets come from the same WordPress form template. A sheet
  with genuinely different headers is a follow-up, not supported here.
- New admin UI, `src/app/dashboard/admin/sheet-sync/page.tsx` + `ConnectSheetForm.tsx`: pick a
  course, paste a sheet ID, "Connect" — saves `courses.sheet_id` and calls `registerSheet` in one
  action. New route `PATCH /api/admin/courses/[id]/connect-sheet` (service-role write, whitelisted
  to `sheet_id` only, since the `courses` RLS write policy is `super_admin`-only but `requireAdmin`
  also allows plain `admin`). `src/lib/gas/sheets-sync-client.ts` gains `registerSheet(sheetId)` —
  unlike `pushStatusToSheet`, this one does NOT swallow its own errors, since the admin clicking
  "Connect" needs a real success/failure signal, not silence.

## GAS script (new)

New file group `gas/sheets-sync/` (mirrors the existing `gas/payment-screenshots/` layout):

- **`Code.gs`** — `onEdit(e)` installable trigger (must be installed via Apps Script's trigger UI
  once per sheet, since simple triggers can't call `UrlFetchApp`):
  - Ignores edits outside the data range / header row.
  - If the edited row has no "Synced" marker in its hidden tracking column → treat as a new
    submission: `POST {token, action: "newSubmission", sheetId, row: {email, name, phone,
    paymentConfirmation, amountPkr}}`.
  - If the edit is specifically to the Payment Confirmation column on an already-synced row →
    `POST {token, action: "statusChange", sheetId, row: {...}}`.
  - Before firing either POST, compares the new cell value against a "last value the app itself
    wrote" marker (stored in a hidden column alongside the sync marker). If they match, this edit
    *is* our own outbound write landing back as an onEdit event — skip, no POST. This is the loop
    breaker for the two-way sync.
- **`doPost(e)`** — single new action, `applyStatus`: given `{email, status, shortfallPkr}`,
  finds the matching row by email, writes the Payment Confirmation cell to the mapped display
  value, and updates the hidden "last value the app wrote" marker to that same value (so the next
  `onEdit` from this exact write is recognized and skipped).
- Script properties: `SYNC_SECRET` (shared with the Next.js side's `SHEETS_SYNC_SECRET`),
  `WEBHOOK_URL` (points at `/api/webhooks/sheets-sync`).

## Next.js additions

- `src/lib/validations/sheet-sync.ts` — zod discriminated union on `action`:
  `newSubmission` / `statusChange`, both requiring `sheetId` and a `row` shape with `email`
  (required), `name`, `phone`, `paymentConfirmation` (enum of the four known values),
  `amountPkr` (optional number).
- `src/app/api/webhooks/sheets-sync/route.ts` — `POST`. Verifies `body.token ===
  process.env.SHEETS_SYNC_SECRET` before touching anything (mirrors the existing
  `payment-screenshots` webhook's ordering — token check strictly before any DB/Drive access).
  Resolves `courses` by `sheet_id`, applies the identity-resolution and downgrade-rule logic
  above, and always responds with the same `{status: "success"|"error", message}` shape GAS
  expects.
- `src/lib/gas/sheets-sync-client.ts` — `pushStatusToSheet(sheetId, email, status,
  shortfallPkr?)`, POSTs to `process.env.GAS_SHEETS_SYNC_URL`. Wrapped in try/catch that only
  logs — a dead GAS deployment must never block an in-app approval, same philosophy already
  applied to email sends.
- `src/lib/data/admin-enrollments.ts` — extend the existing review-row query to also select
  `payment_shortfall_pkr`, `sheet_pending_status`, `sheet_pending_note`.
- `src/components/admin/SheetPendingBanner.tsx` (new) — renders the Confirm/Dismiss banner
  described above.
- `EnrollmentStatCards`/table row styling — small inline badge when `payment_shortfall_pkr` is
  set: "Rs. `<amount>` short", so underpaid rows stand out in the queue without a new filter tab.
- `src/components/lms/EnrollmentStatusScreen.tsx` — `pending` variant copy branches on an
  optional `shortfallPkr` prop.
- Refactor: pull the status-transition-plus-email logic currently inline in `PATCH
  /api/admin/enrollments/[id]/route.ts` into a shared `applyEnrollmentStatus()` in
  `src/lib/data/admin-enrollments.ts`, used by both that route and the new sheet-sync confirm
  route, so the whitelist-writes/409-guard/email-firing logic exists in exactly one place.

New env vars: `SHEETS_SYNC_SECRET`, `GAS_SHEETS_SYNC_URL`. Added to `.env.local` (values supplied
by the user once the GAS script is deployed) and documented in `.env.example` if one exists.

## Testing

- `tests/sheet-sync.schema.test.ts` — zod schema acceptance/rejection, following the existing
  `tests/notification.schema.test.ts` pattern.
- `tests/sheet-sync.rank.test.ts` — pure-function test of the downgrade-rank comparison (no
  Supabase mocking needed; this logic doesn't touch the DB).
- Manual E2E against the **real** PPC B3 sheet
  (`1OEl4BIi53bsecA562n7fci659r6I6umBj2cG-t4Bc`) with a disposable
  `*@pharmacozyme.test`-style row the team doesn't otherwise use: add a test row, flip through
  `Pending → Paid`, confirm the enrollment appears/activates and the sheet's marker updates;
  flip `Paid → Pending` (a downgrade) and confirm it does **not** silently deactivate — it shows
  up as a pending confirmation in the admin panel instead. Delete the test row afterward.
  **This is a real, shared, in-use team sheet — the test row must be clearly labeled and removed
  immediately after, never left for the team to find.**

## Rollout (manual steps, not code)

1. Set `courses.sheet_id` for the PPC B3 course row via SQL once its course record exists.
2. Copy PPC B2's modules/lessons rows into PPC B3 (one-time SQL, same content per the "same
   content — copy B2's modules/lessons" decision).
3. Deploy the new `gas/sheets-sync/` script as a Web App bound to the PPC B3 sheet, install the
   `onEdit` trigger, set its script properties.
4. If the sheet already has any pre-existing email-on-edit automation the team relies on, turn it
   off before go-live — this system becomes the single sender for status-change emails, and the
   spec has no way to detect or disable an automation it doesn't know about.
5. Set `SHEETS_SYNC_SECRET` / `GAS_SHEETS_SYNC_URL` in `.env.local` (and production env) from the
   values chosen in step 3.

## Files touched (summary)

- New: `supabase/migrations/0016_sheet_sync.sql`
- New: `gas/sheets-sync/Code.gs`
- New: `src/lib/validations/sheet-sync.ts`
- New: `src/app/api/webhooks/sheets-sync/route.ts`
- New: `src/app/api/admin/enrollments/[id]/sheet-sync/route.ts`
- New: `src/lib/gas/sheets-sync-client.ts`
- New: `src/components/admin/SheetPendingBanner.tsx`
- New: `tests/sheet-sync.schema.test.ts`, `tests/sheet-sync.rank.test.ts`
- Edited: `src/lib/data/admin-enrollments.ts` (new columns, extracted `applyEnrollmentStatus()`)
- Edited: `src/app/api/admin/enrollments/[id]/route.ts` (delegates to `applyEnrollmentStatus()`)
- Edited: `src/components/lms/EnrollmentStatusScreen.tsx` (shortfall copy)
- Edited: admin enrollment list/detail pages (shortfall badge, `SheetPendingBanner` mount)

## Appendix: the recovered "PZ Admin Portal" GAS files

`gas/Router.gs` / `gas/LMS.gs` (recovered this session, currently unwired) are a separate,
unrelated GAS project for a still-unbuilt feature — an admin uploading a lesson PDF from inside
the Next.js admin UI, landing in Drive via `handleUploadLessonPdf`. That's Phase 3 (Admin LMS
Builder), not this phase. Keeping the files as-is; nothing in this spec depends on or modifies
them.
