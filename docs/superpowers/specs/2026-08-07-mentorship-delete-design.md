# Mentorship Bookings & Applications: Delete

## Problem

The mentorship admin review screen (`/dashboard/admin/mentorship`, built in
[2026-08-05-mentorship-bookings-applications-design.md](2026-08-05-mentorship-bookings-applications-design.md))
lets an admin confirm/cancel bookings and approve/reject applications, but
there's no way to remove a record entirely. Test/junk submissions (inevitable
during Task 8's manual end-to-end verification, and going forward whenever
someone fat-fingers a form) just accumulate in both Supabase and the Sheet
with no cleanup path.

This spec adds a Delete action to both tabs of the admin screen.

## Decisions already made

- **Deletes both the Supabase row and the matching Sheet row.** Sheets
  remain the team's real source of truth per the standing project rule —
  deleting only from Supabase would leave the Sheet, the thing the team
  actually looks at, cluttered with the same junk this feature exists to
  clear.
- **The Sheet row is deleted outright** (`sheet.deleteRow`), not cleared or
  status-marked — matches the "clean data" intent. Rows below shift up.
- **Row matching is email + submission-timestamp proximity, not email
  alone.** The existing status-push action (`applyStatus` in
  `gas/mentorship-sync/Code.gs`) matches by email only, taking the most
  recent row — acceptable there because a wrong status write is just wrong
  until the next edit. A wrong row *delete* is permanent, so this action is
  more conservative: it requires the Sheet row's Timestamp to fall within a
  tolerance window of the Supabase row's `created_at`, and refuses to guess
  if that doesn't uniquely identify one row.
- **The Sheet-delete response is checked, unlike `pushMentorshipStatusToSheet`.**
  That function is fire-and-forget by design (a dead GAS deployment must
  never block an admin's status decision) — and its silence is exactly what
  hid the Script-Properties bug found during this session's Task 8
  verification. Delete is destructive and rarer; the extra round-trip cost
  of checking the response is worth surfacing a real failure instead of
  repeating that mistake.
- **No email is sent on delete.** Unlike confirm/cancel/approve/reject,
  deleting a record isn't a status the submitter needs to hear about — it's
  cleanup, often of their own duplicate/test submission.
- **Available regardless of current status.** This isn't a state-machine
  transition like the existing actions; any booking or application, in any
  status, can be deleted.

## Data flow

1. Admin clicks **Delete** on a row → confirmation dialog → confirms.
2. `DELETE /api/admin/mentorship/bookings/[id]` (or `.../applications/[id]`),
   gated by the same `requireAdmin()` as the existing `PATCH`.
3. Route reads the row first (need `email`, `created_at`, `full_name` before
   it's gone), then deletes it from Supabase.
   - Supabase delete fails → return 500, nothing else attempted.
4. Route calls a new `pushMentorshipDelete` helper (`src/lib/gas/mentorship-sync-client.ts`,
   alongside `pushMentorshipStatusToSheet`) with
   `{ sheetKind, email, timestamp: row.createdAt }`, POSTed to
   `MENTORSHIP_SYNC_URL` as `action: "deleteRow"`.
   - Unlike `pushMentorshipStatusToSheet`, this helper awaits and parses the
     JSON response and returns whether the Sheet row was confirmed deleted.
5. Route responds `{ ok: true, sheetDeleted: boolean }`. The Supabase delete
   already happened regardless of step 4's outcome.

## Row matching (GAS side)

New action in `gas/mentorship-sync/Code.gs`'s `doPost` dispatch:
`action: "deleteRow"`, payload `{ secret, sheetKind, email, timestamp }`.

`handleDeleteRow_(body, props)`:

1. Resolve the sheet the same way `handleApplyStatus_` does
   (`BOOKING_SHEET_ID`/`APPLICATION_SHEET_ID` → `getSheets()[0]`).
2. Read the header row, resolve the email column (`BOOKING_COL_EMAIL`/
   `APPLICATION_COL_EMAIL`) and the `Timestamp` column (first column, same
   as every existing sheet in this project).
3. Scan data rows: collect every row whose email cell matches
   (case-insensitive, trimmed) **and** whose Timestamp cell is within 5
   minutes of `body.timestamp`. Supabase insert and the legacy Sheet-append
   happen in the same request (see `src/app/api/mentorship/bookings/route.ts`
   and `.../applications/route.ts`), so a real match is seconds apart, not
   minutes — 5 minutes is generous headroom for slow requests, not a window
   wide enough to plausibly catch two different submissions by the same
   person.
4. Exactly one match → `sheet.deleteRow(matchedRow)`, return
   `{ status: "success" }`.
   Zero or more than one match → return `{ status: "error", message: "..." }`
   without touching the sheet — never guess on a destructive action.

## UI

Third button in `MentorshipReviewActions` (`src/components/admin/mentorship/MentorshipReviewActions.tsx`),
available alongside Confirm/Cancel (bookings) or Approve/Reject
(applications) regardless of current status:

- Trash icon, destructive styling (reuses the existing danger color used for
  Cancel/Reject).
- Opens the same `Dialog` component already used for the other two actions,
  with copy:
  > **Delete this booking?** (or *application*)
  > This permanently removes it from the database and the Google Sheet.
  > This cannot be undone.
- No reason textarea (no email is sent).
- On confirm: `DELETE` request, `router.refresh()` on success (the row is
  already gone from Supabase regardless of the Sheet-side outcome).

## Error handling / toasts

- Supabase delete fails → `toast.error`, row stays in the list.
- Supabase delete succeeds, Sheet delete confirms → `toast.success("{name} deleted.")`.
- Supabase delete succeeds, Sheet delete fails/ambiguous/unreachable →
  a distinct warning toast naming that the Sheet row wasn't removed and
  needs manual cleanup — never a plain success message when the Sheet side
  didn't actually confirm.

## Testing

No new unit tests — `gas/mentorship-sync/Code.gs` has none today (nothing in
`gas/` does; there's no test runner over `.gs` files in this repo), and the
new API route/UI pieces are thin wrappers around already-tested primitives
(Supabase delete, the existing Dialog/toast patterns). Manually verified as
part of Task 8-style end-to-end checks: delete a booking and an application,
confirm both the Supabase row and the Sheet row are gone, and confirm the
"can't uniquely match" path by attempting a delete against a row whose email
has multiple close-together submissions.
