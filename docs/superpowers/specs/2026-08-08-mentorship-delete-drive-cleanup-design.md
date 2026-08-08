# Mentorship Delete: Drive File Cleanup

## Problem

The mentorship delete feature ([2026-08-07-mentorship-delete-design.md](2026-08-07-mentorship-delete-design.md))
removes a booking or application from Supabase and its Google Sheet, but
never touches the Drive files it owns — a booking's payment screenshot, or
an application's CV and photos. Those files stay in Drive forever, orphaned,
every time a record is deleted. This was flagged as an explicit out-of-scope
gap during that feature's manual verification, logged as a follow-up rather
than fixed then.

This spec closes that gap by reusing the Drive-cleanup infrastructure
already built for course images and lesson documents
(`src/lib/validations/drive-cleanup.ts`, `src/lib/data/drive-cleanup.ts`,
GAS's `handleTrashFile_`/`isUnderPzAcademyRoot_`), rather than building a
new trash mechanism.

## Decisions already made

- **New sibling extraction function, not an extended one.** Mentorship
  uploads (`handleUploadMentorshipFile_` in `gas/payment-screenshots/Code.gs`)
  return `file.getUrl()` — `https://drive.google.com/file/d/<fileId>/view?usp=drivesdk`
  — a different URL shape than course images' `handleUploadCourseImage_`,
  which returns the `/thumbnail?id=<fileId>&sz=w1600` format the existing
  `extractDriveFileId` parses. Rather than widening that function to accept
  a second shape (broadening what every future caller of it silently
  accepts), this adds `extractDriveFileIdFromViewUrl` as its own function in
  the same file — same narrow safety-boundary shape, different pattern.
- **Best-effort, parallel with the Sheet-row delete, never blocking.**
  Mirrors how the Sheet-row delete itself relates to the Supabase delete:
  Supabase is authoritative and already committed by the time Drive cleanup
  runs; a Drive failure (already-deleted file, permission issue, GAS
  unreachable) is reported to the admin, never a reason to fail the overall
  delete. Runs via `Promise.all` alongside the existing `pushMentorshipDelete`
  call, since the two are independent — no reason to serialize them.
- **Reuses `trashDriveFiles` as-is, no new GAS action needed.** The
  existing `trashFile` GAS action, `isUnderPzAcademyRoot_` folder-scope
  guard, and the batched/concurrency-capped `trashDriveFiles(fileIds: string[])`
  Next.js helper (already used for course-image/lesson-document cleanup) are
  reused unchanged — mentorship uploads live under
  `PZ Academy/Mentorship Uploads/{Bookings,Applications}/`, inside the same
  root the guard already scopes to. `trashDriveFiles` already returns the
  exact human-readable partial-failure message shape needed here
  ("N of M old files couldn't be removed from Drive.") — no new message
  formatting to write.
- **Result shape changes from a single optional Sheet message to a list of
  warnings.** The delete feature's current `{ ok: true; sheetDeleteMessage: string | null }`
  becomes `{ ok: true; warnings: string[] }` — zero, one, or two entries
  (Sheet-cleanup message, Drive-cleanup message), each present only when
  that part actually failed. One warning toast joins whatever's in the
  array; an empty array is the plain success toast. This is a breaking
  change to the return shape introduced by the delete feature's final
  review fix wave, updated in place rather than left with two different
  "list of things that might not have worked" conventions.

## Data flow

1. `deleteBooking`/`deleteApplication`'s existing pre-delete read (currently
   selecting `id, email, created_at`) additionally selects
   `payment_screenshot_url` (bookings) or `cv_url, photo_urls`
   (applications).
2. After the Supabase delete succeeds, build the list of Drive fileIds this
   record owned: run each relevant URL through
   `extractDriveFileIdFromViewUrl`, filter out `null`s (a URL that was
   never actually a Drive upload — shouldn't happen in practice but the
   extractor is the same defensive shape as `extractDriveFileId` for
   exactly this case).
3. `Promise.all([pushMentorshipDelete(...), trashDriveFiles(fileIds)])`.
4. Collect a `warnings: string[]`: push `pushMentorshipDelete`'s message if
   its `ok` came back false, push `trashDriveFiles`'s return value if it's
   non-null.
5. Return `{ ok: true, warnings }` from `deleteBooking`/`deleteApplication`,
   threaded through both `DELETE` routes unchanged in shape, to the UI.

## UI

`MentorshipReviewActions.tsx`'s `submitDelete` currently reads
`{ sheetDeleteMessage?: string | null }` from the response and branches on
it. Changes to read `{ warnings?: string[] }`:

```ts
const payload = (await res.json().catch(() => null)) as { warnings?: string[] } | null;
setDeleteOpen(false);

if (!payload?.warnings || payload.warnings.length === 0) {
  toast.success(`${name} deleted.`);
} else {
  toast.warning(`${name} deleted from the database. ${payload.warnings.join(" ")}`);
}
```

## Testing

`extractDriveFileIdFromViewUrl` is a pure function — unit tests added to
the existing `tests/drive-cleanup.test.ts`, which already covers
`extractDriveFileId`. Cover: a well-formed view URL → the fileId, a
`/thumbnail?id=` URL → `null` (wrong shape, confirms the two extractors
stay properly separated), an external image URL → `null`, empty/malformed
→ `null`.

No new tests for `deleteBooking`/`deleteApplication` or the routes/UI —
mirrors the existing convention for this whole feature area (manually
verified, consistent with `applyBookingStatus`/`pushMentorshipStatusToSheet`/
the `DELETE` routes already having none).

Manual verification: delete a test booking with a screenshot attached,
confirm the Drive file lands in Trash (or is already gone — check via the
`fileId` if you have Drive access, or simply confirm the toast reports
success with no Drive warning). Delete a test application with a CV and at
least one photo, same check across multiple files. Confirm a delete with no
attached files (e.g., a booking with no screenshot) still works cleanly —
`fileIds` is an empty array, `trashDriveFiles([])` returns `null` per its
existing short-circuit, no warning fires.
