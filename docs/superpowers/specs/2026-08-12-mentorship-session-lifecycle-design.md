# Subsystem C: Session lifecycle — design

Status: approved. Part of the mentorship system's 4-subsystem rebuild (A done,
B done, C this doc, D mentor↔mentee interaction — see memory
`pz-academy-mentorship-subsystem-status`).

## Context / what already exists

- `mentorship_bookings` (migration `0025`): `pending`/`confirmed`/`cancelled`
  only. No date/time field at all. `mentor_slug`/`mentor_name` are denormalized
  text, not an FK to `mentors`. `student_id` is nullable — set only if the
  booker's email matched an existing account at submit time.
- `sessions` (migration `0001`): `student_id`/`mentor_id` both `NOT NULL`
  references to `profiles(id)`, `session_type`, `status` enum
  (`pending`/`confirmed`/`completed`/`cancelled`), `scheduled_at`,
  `duration_min`, `mentor_notes`, `student_feedback`, `rating`. Completely
  unused by app code until now — this subsystem is what activates it.
- `mentors.packages` (migration `0028`) is `jsonb` array of
  `{name, sessions, price, savings?}` — `sessions` is a session *count* per
  package (e.g. a "3-Session Package").
- `mentors.availability_json` exists but is empty — migration `0028`'s own
  comment marks it "reserved for a future real slot-based scheduling
  subsystem." That future is this subsystem.
- `mentors.lead_time` and `mentors.session_duration_minutes` already exist,
  added in `0028` specifically so a scheduling subsystem wouldn't need new
  columns for minimum notice or slot length.
- Admin already has a working confirm/cancel flow for bookings
  (`/dashboard/admin/mentorship`, `applyBookingStatus` in
  `src/lib/data/mentorship-bookings.ts`) — this subsystem does not touch that,
  it adds what happens *after* confirm.
- The student-facing `/dashboard/sessions` page (`listMyBookings`) and the
  mentor dashboard's stat cards (`/dashboard/mentor/page.tsx`, currently
  hardcoded zeros per B's explicit scope note) are the two landing spots for
  this subsystem's data.

## Front-end source: Stitch (must-rule)

Per standing instruction, every new UI surface in this subsystem must be
extracted from a Stitch screen, not hand-authored. Four screens were missing
from both Stitch projects ("PZ Academy Mentorship Portal" and "PZ Academy
website") and were generated this session, project `11811490301995978699`,
design systems `PZ Academy` (assets/574b02af36ab45bb8c20118ab51a3930 — matches
the live `/dashboard/mentor` forest/lime theme) and `Clinical Excellence Admin`
(assets/77a4b1b5e619499ebed8faefbeeb0b8b — matches the live admin M3 tokens
and `/dashboard/sessions`). Canonical screens, confirmed against the original
prompts and approved:

| Surface | Screen | Design system |
|---|---|---|
| Mentor: Manage Availability (`/dashboard/mentor/availability`) | `projects/11811490301995978699/screens/62dc9f15679443768e05b6927c33c586` | PZ Academy |
| Mentor Dashboard: Overview (`/dashboard/mentor`) | `projects/11811490301995978699/screens/b76eab1b90aa487fa1fa641f959d807c` | PZ Academy |
| Student: Book Your Sessions (`/dashboard/sessions`) | `projects/11811490301995978699/screens/511756cff8594e5984d836a42c9c5ec3` | Clinical Excellence Admin |
| Admin: Schedule Mentorship Session (modal on `/dashboard/admin/mentorship`) | `projects/11811490301995978699/screens/cecd1220635244f497bdd692ba8bd1db` | Clinical Excellence Admin |

Two other Stitch screens were found and deliberately **not** used:
`Mentorship Hub: Personalized Success` (student-side portal shell, mostly
non-rendering) and the dark/gold-themed `App Shell: Interactive Booking` /
`Mentorship Booking: Immersive Flow` — real screens, but built under the
`Forest Gold Modern` design system, which nothing in the live app uses (the
live app is entirely `PZ Academy` / `Clinical Excellence` / `Clinical
Excellence Admin`, all light-mode). Treated as an unadopted earlier
exploration; the four screens above are the ones implementation must extract
markup from.

## Rejected slot-picker had already shipped a different flow — resolved

Subsystem A's public booking form (`/mentorship/book/[slug]`) never asked for
a date/time — it's a form + payment-screenshot upload, and that's staying
as-is; nothing here changes it. What was actually in question was *after* a
booking is confirmed: originally scoped as admin/mentor manually typing in a
date. That was revised mid-design once the Stitch "Book Your Sessions"
slot-picker screen surfaced — self-serve slot booking is real scope for C,
not deferred.

## Architecture / data flow

**Schema** (migration `0031_mentorship_sessions.sql`):

- `sessions.booking_id uuid references public.mentorship_bookings(id) on
  delete set null` — nullable, `set null` not `cascade`, so deleting a
  booking (admin's existing `deleteBooking`) never destroys session history.
- `mentorship_bookings.sessions_total integer` — frozen the first time a
  student books any slot for that booking, read from `mentors.packages` by
  matching `package_name`. Same "frozen at write time, unaffected by later
  admin edits" convention as `package_name`/`mentor_name` themselves. If the
  package was since renamed/removed from `mentors.packages`, fall back to `1`
  and surface a warning in the booking UI — not a hard failure.
- `mentors.availability_json` populated with shape
  `{ "weeklyRanges": [{ "day": 0-6, "start": "09:00", "end": "17:00" }] }`,
  interpreted in the mentor's existing `timezone` column. No new column for
  this — reuses what `0028` already reserved.
- `mentors.lead_time` (existing column) gates the earliest bookable slot.

**Availability (mentor-side)**: new page `/dashboard/mentor/availability`
(sourced from the Stitch screen above). Mentor sets a recurring weekly
pattern. Saved via a new `SECURITY DEFINER` RPC,
`update_own_mentor_availability(p_timezone text, p_weekly_ranges jsonb)` —
`where profile_id = auth.uid()`, column-whitelisted to
`availability_json`/`timezone` only, same self-service pattern as B's
`update_own_mentor_profile`. Full-replace semantics, not merge — documented
explicitly on the function, per the caveat B already hit once.

**Booking a session (student-side)**: once a booking is `confirmed`,
`/dashboard/sessions` shows a "Book Your Sessions" action (sourced from the
Stitch stepper screen) if `sessions_total` slots aren't all booked yet.
Available slots are computed on the fly — mentor's weekly pattern, sliced by
`session_duration_minutes`, minus any `sessions` rows already occupying that
mentor+time, minus anything inside `lead_time` of now. Per the locked
decision, the student picks **all** `sessions_total` slots in one sitting
(stepper: Session 1 of N → N of N) before anything commits. Committed via a
new `SECURITY DEFINER` RPC, `book_mentorship_sessions(p_booking_id uuid,
p_slots jsonb)` — `where student_id = auth.uid()` implicitly (booking's
`student_id` must match caller), re-validates every slot is still free and
within availability at commit time (not just at picker-render time) inside
one transaction, so two students racing for the same slot can't both win.
On any slot conflict, the whole call fails atomically — no partial booking of
N-1 sessions.

**Manual override (admin-side)**: `/dashboard/admin/mentorship` gets a
"Schedule Session" action (sourced from the Stitch modal) on confirmed
bookings, for cases the student can't self-serve (phone booking, account
issues). Same shape as the self-serve path minus the RPC — runs through the
service-role data layer directly (`src/lib/data/mentorship-sessions.ts`),
`requireAdmin()`-gated, no `auth.uid()` scoping needed since the caller's own
session isn't what's being written. Disabled with an inline nudge if the
booking's mentor has no linked `profile_id` (subsystem B) or the booking has
no matched `student_id` — both are hard requirements since `sessions.mentor_id`
and `sessions.student_id` are `NOT NULL`.

**Session lifecycle after creation**: `pending` (should not occur in this
flow — sessions are only ever created already dated, `confirmed`, per the
"book all N now" decision) → `confirmed` → `completed` (admin or mentor
marks it, only after `scheduled_at` has passed) → or `cancelled`
(independently per-session, admin or mentor). No writes to `mentor_notes`,
`student_feedback`, or `rating` from any C surface — explicitly deferred to
subsystem D.

**Mentor dashboard** (`/dashboard/mentor` rewrite, sourced from the Stitch
"Overview" screen): stat cards become real —

- **Active Students**: distinct students with a `confirmed` future session or
  at least one `completed` session for this mentor, ever — deliberately not
  time-windowed, since there's no "student graduated" state to distinguish
  from "hasn't booked again yet."
- **Sessions This Month**: count of this mentor's `sessions` rows
  (`confirmed` or `completed`) with `scheduled_at` in the current calendar
  month.
- **Earnings (PKR)**: stays out of scope for C — no payment-amount-per-session
  data exists anywhere in the schema yet; leave as `—` placeholder as B left
  it, do not invent a computation.
- **Pending Bookings**: confirmed bookings for this mentor where
  `sessions_total` hasn't been fully booked yet (replaces the old
  "Availability Slots" placeholder, which had no real data source since
  there was no availability system until this subsystem).

"Upcoming Sessions" and "My Students" panels populate from the same `sessions`
query, matching the Stitch screen's layout (session-number badge for
multi-session packages, "Mark Completed" action once past-due).

## Security boundary

Mirrors B: service-role data layer + route-level auth gate is the default;
a `SECURITY DEFINER` RPC only where the caller's own session needs
`auth.uid()`-scoped writes the service-role layer can't safely expose without
one. Two new RPCs this subsystem (`update_own_mentor_availability`,
`book_mentorship_sessions`) — both need the explicit
`revoke execute ... from public, anon, authenticated` pattern before their
narrower `grant`, per B's footgun (Supabase auto-grants execute by default).
Both get added to `database.types.ts`'s hand-maintained `Functions` block —
no codegen in this repo.

## Testing

- Existing `tsc` + vitest + lint gates, no ad hoc curl/manual verification
  beyond that (per prior feedback in this repo).
- Vitest coverage: slot computation (weekly pattern minus booked minus
  lead-time), the atomic double-booking guard in `book_mentorship_sessions`,
  the `sessions_total` package-lookup fallback, RPC column-whitelist
  behavior for both new RPCs.
- Live click-through using the user's own allowlisted test account
  (`hamzaansari4you@gmail.com` — see memory `pz-academy-test-accounts`):
  mentor sets availability → student books all N slots → admin sees them →
  mark one completed → dashboard stat cards reflect it.

## Out of scope for C (explicitly deferred)

- `mentor_notes`, `student_feedback`, `rating` — subsystem D.
- Earnings computation — no payment-per-session data model exists yet.
- Rescheduling a single already-confirmed session to a different slot (a
  session can be cancelled and a new one booked, but no dedicated
  "reschedule" action) — not asked for, can be added later without schema
  changes.
- Messaging/notifications beyond the existing booking-status emails.
