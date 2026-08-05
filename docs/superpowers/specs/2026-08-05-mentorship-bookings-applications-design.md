# Mentorship Bookings & Applications: Dual-Write, Sync, Admin Review (Spec 2 of 2)

## Problem

Spec 1 ported the Mentorship Portal's booking and mentor-recruitment forms
into the platform as `/mentorship/book/[slug]` and the recruitment form on
`/mentorship`, unchanged: each still POSTs straight from the browser to its
own standalone Google Apps Script Web App, which appends a row to a Google
Sheet. That's the whole system today — the team works entirely out of two
Sheets, with no admin screen in the platform, no record in Supabase, and no
way for whoever booked a session or applied to be a mentor to check status
anywhere.

This spec adds that operational layer on top, without touching how the two
existing Sheets work today:

1. Every submission also lands in Supabase (dual-write), so the platform has
   real, queryable records — not just Sheet rows.
2. An admin review screen (mirroring the existing course-enrollment review
   screen) to see and act on both bookings and mentor applications.
3. Two-way sync between the Sheets and Supabase: a manual edit in the Sheet
   updates Supabase, and a status change in the admin screen writes back to
   the Sheet, so the team's Sheet view never drifts from what's in the app.
4. Status-change notifications (email + in-app) to whoever submitted, when
   they have a matched account.
5. A student-facing "My Bookings" view, reusing a dashboard route already
   scaffolded for it (`/dashboard/sessions` — see "Existing scaffolding"
   below), plus a new "My Application" view for mentor applicants.

## Decisions already made

- **Both forms keep posting through the platform now**, not straight to
  GAS — `BookingClient.tsx`/`RecruitmentForm.tsx` submit to two new platform
  API routes instead of `NEXT_PUBLIC_BOOKING_SCRIPT_URL`/
  `NEXT_PUBLIC_MENTOR_SCRIPT_URL` directly. Those routes still forward the
  same payload to the same GAS Web Apps server-side, so the Sheets keep
  getting rows exactly as before — the team's workflow is unaffected, only
  the request now passes through the platform first so it can also write to
  Supabase.
- **The Sheet↔Supabase sync is a separate, dedicated bridge** — its own new
  GAS project, its own webhook route — not an extension of the existing
  course-enrollment sheets-sync bridge (`gas/sheets-sync/Code.gs`), which is
  conceptually built around "a sheet belongs to a course" and shouldn't be
  bent to also mean "a sheet belongs to a booking type." Two fixed sheets
  (not one per batch like courses), so no self-service "register sheet" UI
  is needed — both sheet IDs are configured once as env vars.
- **Both entities get an identical 3-state status flow**: bookings are
  `pending → confirmed / cancelled`; applications are
  `pending → approved / rejected`. Same shape, same components, same
  sync/notification plumbing.
- **"Approved" does not auto-publish a mentor to the live `/mentorship`
  list.** `src/lib/mentorship/mentors.ts` stays the static, hand-edited file
  it is today. Turning it into a database-driven, admin-editable list is a
  real separate project, not something this spec folds in.
- **Status changes fire both an email and an in-app notification** to
  whoever submitted, when their submission is matched to an account by
  email. Reuses the existing email-sending helper and the existing
  DB-trigger-driven notifications system (see "Notifications" below) —
  nothing new needed on the notification bell/history UI itself.
- **File uploads (payment screenshot, CV, application photos) go through
  the platform's existing shared GAS project** (`gas/sheets-sync/Code.gs`'s
  dispatcher, which already handles `uploadCourseImage`/
  `uploadPrivateDocument`/`uploadPaymentScreenshot`), not the new dedicated
  sync bridge. Uploading a file to Drive is a different concern from "which
  sheet does this status belong to," and this platform's GAS project
  already has a proven, working upload path (base64-relay, `GAS_SHARED_SECRET`-gated)
  that the new dedicated bridge would otherwise have to duplicate.

## Existing scaffolding this spec completes

`src/app/dashboard/page.tsx` already has a `StatCard` labeled "Sessions
Booked" (hardcoded to `0`) and an "Upcoming Sessions" section with a
"Book a session →" link to `/dashboard/sessions`. `src/components/dashboard/Sidebar.tsx`
already lists a "Sessions" nav item (`/dashboard/sessions`, visible to
`student` and `mentor` roles) — but no `src/app/dashboard/sessions/page.tsx`
exists, so today it 404s. This spec builds that page as the student-facing
booking-status view, and wires the dashboard stat card to a real count.
(The nav item's visibility to the `mentor` role is pre-existing and
untouched by this spec — the platform's `mentor` role, course instructors,
is a different concept from the marketplace mentors in `mentors.ts`, who
per the decision above are not necessarily platform accounts at all. That
pre-existing nav entry will simply show an empty/irrelevant page to a
mentor-role user, same as its current 404 — not a regression, not this
spec's problem to solve.)

Mentor-application status has no equivalent scaffolding — this spec adds a
new route and nav entry for it.

## 1. Data model

New migration `supabase/migrations/0025_mentorship_bookings_and_applications.sql`:

```sql
create type mentorship_booking_status as enum ('pending', 'confirmed', 'cancelled');
create type mentor_application_status as enum ('pending', 'approved', 'rejected');

create table public.mentorship_bookings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles(id), -- null until matched by email
  full_name text not null,
  email text not null,
  phone text not null,
  mentor_slug text not null,
  mentor_name text not null,
  package_name text not null,
  goals text,
  payment_screenshot_url text,
  status mentorship_booking_status not null default 'pending',
  cancellation_reason text,
  status_changed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.mentor_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid references public.profiles(id), -- null until matched by email
  full_name text not null,
  email text not null,
  phone text not null,
  country text,
  profession text,
  position text,
  expertise text,
  organization text,
  years_experience text,
  linkedin_url text,
  roles text,
  why_join text,
  value_provide text,
  cv_url text,
  photo_urls text[] not null default '{}',
  status mentor_application_status not null default 'pending',
  rejection_reason text,
  status_changed_at timestamptz,
  created_at timestamptz not null default now()
);

create index mentorship_bookings_student_idx on public.mentorship_bookings(student_id);
create index mentorship_bookings_email_idx on public.mentorship_bookings(email);
create index mentor_applications_applicant_idx on public.mentor_applications(applicant_id);
create index mentor_applications_email_idx on public.mentor_applications(email);

alter table public.mentorship_bookings enable row level security;
alter table public.mentor_applications enable row level security;

-- Owner can read their own row once matched; only service-role/admin writes.
create policy "own bookings" on public.mentorship_bookings
  for select using (auth.uid() = student_id);
create policy "own applications" on public.mentor_applications
  for select using (auth.uid() = applicant_id);
```

Field lists above are the actual current form fields (verified against
`BookingClient.tsx`'s submit payload — `name`/`email`/`phone`/`mentorName`/
`packageName`/`goals`/screenshot — and `RecruitmentForm.tsx`'s — `fullName`/
`email`/`phone`/`country`/`profession`/`position`/`expertise`/`organization`/
`years`/`linkedin`/`roles`/`whyJoin`/`valueProvide`/cv/photos). No admin
write policy is needed — all admin writes go through the service-role
client, same as `admin-enrollments.ts`.

## 2. Write path — form submission

`BookingClient.tsx`'s submit target changes from `BOOKING_SCRIPT_URL` to
`/api/mentorship/bookings`; `RecruitmentForm.tsx`'s changes from
`MENTOR_SCRIPT_URL` to `/api/mentorship/applications`. Both new routes are
public — no auth required, matching the forms' own public nature (this is
the same reasoning that already makes `/api/upload-video` unauthenticated,
unlike `/api/uploads/payment-screenshot`, which requires a logged-in
student because course enrollment does).

**`POST /api/mentorship/bookings`:**
1. Validate the body with a new Zod schema (`src/lib/validations/mentorship-booking.ts`).
2. If a screenshot was included, upload it to Drive via the existing shared
   GAS dispatcher's new `uploadMentorshipFile` action (see section 5) into a
   `Mentorship Uploads/Bookings/` folder — get back a URL.
3. Look up a `profiles` row by email (same `findStudentIdByEmail`-style
   lookup already used by the enrollment sheet-sync webhook); insert the
   `mentorship_bookings` row with `student_id` set if matched, null if not.
4. Forward the original payload (unchanged) to `NEXT_PUBLIC_BOOKING_SCRIPT_URL`
   server-side, so the Sheet still gets its row exactly as today.
5. If the GAS forward fails, the Supabase row still exists — return success
   with a warning, never block the user on it (mirrors the soft-fail pattern
   used throughout this codebase, e.g. `trashDriveFiles`).
6. Send a "booking received" email (new template, section 6).

**`POST /api/mentorship/applications`:** same shape — validate
(`src/lib/validations/mentorship-application.ts`), upload CV + photos to
`Mentorship Uploads/Applications/`, look up/insert with `applicant_id`,
forward to `NEXT_PUBLIC_MENTOR_SCRIPT_URL`, soft-fail on GAS forward
failure, send an "application received" email.

Both routes' data-access logic lives in `src/lib/data/mentorship-bookings.ts`
and `src/lib/data/mentorship-applications.ts` respectively — kept as two
files, not one, since they're genuinely different tables with no shared
logic beyond the status-transition shape (which the shared Zod/UI pieces
already capture).

## 3. Sheet → Supabase sync (team edits the Sheet by hand)

New GAS project `gas/mentorship-sync/Code.gs` (its own deployment, own
secret `MENTORSHIP_SYNC_SECRET`, own `MENTORSHIP_SYNC_URL`) — structurally
the same `onEdit`-trigger-plus-tracking-columns pattern as
`gas/sheets-sync/Code.gs`, but generalized only as far as "two known,
hardcoded sheet IDs" rather than course's arbitrary-many-sheets registry:

- Script Properties: `MENTORSHIP_SYNC_SECRET`, `WEBHOOK_URL` (points at
  `/api/webhooks/mentorship-sync`), `BOOKING_SHEET_ID`, `APPLICATION_SHEET_ID`,
  plus each sheet's status-column header name.
- On install (one-time, manual — not self-service, since there are only
  two sheets ever), an `onEdit` trigger is installed on each of the two
  sheet IDs directly (`ScriptApp.newTrigger("onEdit").forSpreadsheet(id)...`).
- `onEdit` reads the edited sheet's ID to know whether it's the booking or
  application sheet, reuses the existing `SyncedAt`/`AppSyncValue` tracking
  columns to distinguish a fresh row from an edit and avoid re-firing on its
  own outbound writes, and POSTs `{ secret, action: "statusChange" | "newSubmission", sheetKind: "booking" | "application", row }`
  to the webhook.

**`POST /api/webhooks/mentorship-sync`** (`src/app/api/webhooks/mentorship-sync/route.ts`):
validates the secret, then based on `sheetKind` updates the matching
`mentorship_bookings` or `mentor_applications` row (matched by email) with
the new status — mapping the Sheet's own status wording to the enum values,
the same way `mapSheetRow`/`displayValueForStatus_` do for enrollments.

## 4. Supabase → Sheet sync (admin changes status in-app)

`src/lib/gas/mentorship-sync-client.ts` exports `pushMentorshipStatusToSheet({ sheetKind, email, status })`
— structurally identical to `pushStatusToSheet`, POSTing
`{ secret, action: "applyStatus", sheetKind, email, status }` to
`MENTORSHIP_SYNC_URL`. The GAS side's `handleApplyStatus_` picks the right
sheet by `sheetKind`, finds the row by email, writes the status. Fire-and-forget,
same never-throw contract as the enrollment equivalent — a dead GAS
deployment must never block an admin's in-app decision.

## 5. File uploads

`gas/sheets-sync/Code.gs`'s existing doPost dispatcher gains one more
action, following the same pattern as `uploadCourseImage`/`uploadPaymentScreenshot`:

```js
if (body.action === "uploadMentorshipFile") {
  return handleUploadMentorshipFile_(body);
}
```

The handler (added to `gas/payment-screenshots/Code.gs`, where the sibling
upload handlers already live) takes `{ secret, folder: "Bookings" | "Applications", mimeType, base64, filename }`,
uploads into `Mentorship Uploads/<folder>/` under the `PZ Academy` Drive
root (same `getOrCreateFolder_` helper already used for `Course Images/`
and `Lesson Documents/`), and returns `{ ok, url }`. Gated by the existing
`GAS_SHARED_SECRET`, called from the platform's own `GAS_WEBAPP_URL` — no
new secret needed for this part, since it's the platform's own upload
pipeline being extended, not the new dedicated mentorship-sync bridge.

## 6. Notifications

**In-app:** new DB triggers, following migration 0015's exact pattern —
`notify_booking_status_change()` and `notify_application_status_change()`,
each firing `after update ... for each row`, calling the existing
`create_notification()` helper. Both guard `if new.student_id is null then return new; end if;`
(or `applicant_id`) — no notification is possible for an unmatched
submission, and a status change on one shouldn't error. New migration
`supabase/migrations/0026_mentorship_notification_triggers.sql`.

**Email:** new `src/lib/emails/mentorship.ts`, structurally parallel to
`src/lib/emails/enrollment.ts` (same `shell()`/`sendTransactionalEmail`
plumbing, its own `MentorshipEmailContext`/kind union — `bookingReceived`/
`bookingConfirmed`/`bookingCancelled`/`applicationReceived`/
`applicationApproved`/`applicationRejected`). Kept as a separate file/module
from the enrollment emails since the context shape genuinely differs (no
`courseTitle`/`courseSlug` for a booking or application) — not extending
`EnrollmentEmailContext`.

Both are called explicitly from the same server-side function that performs
the status update (mirroring how `admin-enrollments.ts` calls
`sendEnrollmentEmail` right after its own status write) — the DB trigger
handles the notification bell insert as a side effect of the same UPDATE
statement; the email is a separate explicit call in the same request.

## 7. Admin UI

`src/app/dashboard/admin/mentorship/page.tsx` — two tabs (Bookings /
Applications), each a table using a shared `src/components/admin/mentorship/MentorshipStatusBadge.tsx`
(parameterized by `kind: "booking" | "application"` to pick the right
label/color mapping, avoiding two near-identical badge components) and a
`src/components/admin/mentorship/MentorshipReviewActions.tsx` (confirm/cancel
or approve/reject — the action available depends on `kind`) that, on click:
updates the Supabase row's status, calls `pushMentorshipStatusToSheet`, and
sends the corresponding email. Visual pattern matches the existing
`EnrollmentFilterTabs`/`EnrollmentStatCards`/`EnrollmentReviewActions` screen.

New Sidebar entry: `{ label: "Mentorship", href: "/dashboard/admin/mentorship", icon: Handshake, roles: ["admin", "super_admin"] }`.

## 8. Student-facing UI

`src/app/dashboard/sessions/page.tsx` — the already-scaffolded route (see
"Existing scaffolding"). Lists the logged-in student's `mentorship_bookings`
rows (matched by `student_id`) with status badges, matching the visual
weight of `dashboard/courses/page.tsx`. Also updates `dashboard/page.tsx`'s
hardcoded `StatCard label="Sessions Booked" value={0}` to a real count.

`src/app/dashboard/mentor-application/page.tsx` — new route, new Sidebar
entry (`{ label: "My Application", href: "/dashboard/mentor-application", icon: UserCheck, roles: ["student"] }`),
shows the logged-in user's `mentor_applications` row and status, if any.

## Testing

Unit tests for the pure logic: the two Zod validation schemas (valid/invalid
cases for each field), the Sheet-status-wording ↔ enum mapping functions for
both entities (mirroring the existing `mapSheetRow`/`displayValueForStatus_`
test coverage pattern). No live-GAS integration test is feasible without
hitting the real deployments — that stays a manual verification step, same
as Spec 1's final task.
