# Two-Way Drive Sync for Uploaded Course Images and Lesson Files

## Problem

The app uploads three kinds of files to Google Drive via the GAS relay:
course images (`courses.thumbnail_url` / `banner_url` / `mentor_avatar_url`),
lesson PDFs (`lessons.pdf_file_id`), and lesson Supporting Documents
(`lessons.documents` jsonb array of `{name, fileId}`).

Every write path today is a blind overwrite: `updateCourseConfig` and
`updateLesson` (`src/lib/data/admin-lms.ts`) replace the stored value/array
with whatever the client sends, with no awareness of what was there before.
Deleting a course, module, or lesson only removes the DB row (Postgres FK
cascades clean up descendant rows). In every case, the real file the old
value pointed to stays in Google Drive forever — orphaned, with no cleanup
path.

This spec makes app-side delete/edit of these fields also delete (trash) the
underlying Drive file, not just detach the app's reference to it.

## Scope

Both halves of the "if I delete/edit something in app it must also affect
Drive" request:

- **Course images**: thumbnail, banner, mentor avatar (public Drive files,
  `Course Images/<slug>/` folder).
- **Lesson files**: PDF and Supporting Documents (private Drive files,
  `Lesson Documents/<slug>/` folder).

Out of scope: payment screenshots (no edit/delete UI exists for them today).

## Delete semantics

Files are moved to Google Drive's own Trash (`DriveApp.setTrashed(true)`),
not permanently deleted. This gives a ~30-day recovery window inside Drive
itself if an app-side delete turns out to be a mistake, at the cost of not
freeing storage immediately.

Failures are soft: if the Drive-side trash call fails (GAS relay down,
network hiccup), the database save/delete still succeeds. The caller gets a
`warning` string describing what couldn't be cleaned up, surfaced as a
toast. A flaky external relay must never block someone from saving a plain
text-field edit.

## 1. GAS: new `trashFile` action

`gas/sheets-sync/Code.gs` doPost dispatcher gets one more branch, following
the existing pattern (checked before the `SYNC_SECRET`-gated actions, same
as `uploadCourseImage` etc.):

```js
if (body.action === "trashFile") {
  return handleTrashFile_(body);
}
```

`gas/payment-screenshots/Code.gs` gets the handler, same secret-check
convention as its siblings:

```js
function handleTrashFile_(body) {
  const expectedSecret = PropertiesService.getScriptProperties().getProperty("SHARED_SECRET");
  if (!expectedSecret || body.secret !== expectedSecret) {
    return jsonResponse_({ ok: false, error: "Unauthorized" });
  }
  const { fileId } = body;
  if (!fileId) {
    return jsonResponse_({ ok: false, error: "Missing fileId" });
  }
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
    return jsonResponse_({ ok: true });
  } catch (err) {
    // Already trashed or already gone is not a failure from the caller's
    // perspective — the end state (file not present) is what was asked for.
    if (String(err).indexOf("not found") !== -1) {
      return jsonResponse_({ ok: true });
    }
    return jsonResponse_({ ok: false, error: String(err) });
  }
}
```

## 2. Next.js: helper module

New `src/lib/drive-cleanup.ts`:

- `extractDriveFileId(url: string | null | undefined): string | null` —
  parses the `id` query param out of a `drive.google.com/thumbnail?...`
  URL via `new URL(url).searchParams.get("id")`. Returns `null` for
  anything that isn't recognizably one of our own Drive thumbnail URLs
  (a manually pasted external image link, empty string, malformed URL) —
  this is the safety boundary that guarantees the app only ever asks Drive
  to trash files it actually uploaded itself.
- `trashDriveFile(fileId: string): Promise<{ok: boolean; error?: string}>` —
  POSTs `{action: "trashFile", secret: GAS_SHARED_SECRET, fileId}` to
  `GAS_WEBAPP_URL`, same fetch shape as the existing upload calls.
- `trashDriveFiles(fileIds: string[]): Promise<string | null>` — runs
  `trashDriveFile` over a list in parallel, returns `null` if all succeeded
  or a human-readable warning string listing how many failed (e.g. "Saved,
  but 1 of 3 old files couldn't be removed from Drive.").

Pure-function unit tests cover `extractDriveFileId` (valid thumbnail URL →
id, external URL → null, empty/malformed → null).

## 3. Edit-time trigger (field-level)

**`updateCourseConfig`** (admin-lms.ts): before building the update patch,
select the course's current `thumbnail_url`, `banner_url`,
`mentor_avatar_url`. After the DB update succeeds, for each of the three
fields where the old value differs from the new one, run it through
`extractDriveFileId` — if it resolves, queue it for `trashDriveFiles`.
Trashing happens strictly *after* the DB write commits, never before, so an
edit that never gets saved (navigate away mid-form) can never orphan a
value the DB still points to. `UpdateCourseConfigResult`'s `ok: true` case
gains an optional `warning` field, same shape as the reorder fix.

**`updateLesson`** (admin-lms.ts): same pattern — select current
`pdf_file_id` and `documents` first. After the patch commits: if
`pdfFileId` was provided and differs from the old one and the old one was
non-null, trash it. If `documents` was provided, diff old vs new fileId
sets and trash whatever fileIds disappeared. `MutationResult`'s `ok: true`
case already carries `warning?: string | null` (added for the reorder
fix) — reused as-is.

Both API routes (`/api/admin/courses/[id]` PATCH, and the lesson update
route) pass `warning` through in the JSON response. `ProgramConfigForm.tsx`
and `LessonEditorPanel.tsx` toast it, same `toast.warning(...)` pattern
already used elsewhere in the builder.

## 4. Delete-time trigger (record-level, cascading)

Postgres FK cascades (`modules.course_id`, `lessons.module_id`, both
`ON DELETE CASCADE`) mean descendant rows vanish the instant a parent is
deleted — so every Drive fileId owned by a course/module/lesson must be
collected *before* the DB delete, not after.

- **`deleteLesson`**: collect its own `pdf_file_id` + `documents[].fileId`
  before deleting the row.
- **`deleteModule`**: collect `pdf_file_id`/`documents[].fileId` for every
  lesson under the module before deleting it (the delete cascades those
  lesson rows away).
- **`deleteCourse`**: collect the course's own three image fields, plus
  every lesson's PDF/documents across every module under it, before
  deleting the course row.

After each DB delete succeeds, `trashDriveFiles` runs over the full
collected list; a partial-failure warning is attached to the existing
`MutationResult`/`DeleteCourseResult` the same way as the edit path.

## Testing

- Unit: `extractDriveFileId` cases (valid, external, malformed, empty).
- Unit: the old-vs-new diff logic for course images and lesson
  documents/PDF (pure functions, no network) — given old/new field values,
  produces the expected trash list.
- One real integration check against the live GAS relay (upload a
  throwaway file, trash it, confirm via a second fetch/Drive check it's
  gone from the active folder), mirroring how the reorder-warning fix was
  verified earlier in this session — not mocked, since the whole point is
  confirming the real external call works.
