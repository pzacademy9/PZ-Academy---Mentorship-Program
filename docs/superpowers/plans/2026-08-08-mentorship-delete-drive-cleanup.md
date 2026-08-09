# Mentorship Delete: Drive File Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an admin deletes a mentorship booking or application, also trash its Drive files (payment screenshot / CV / applicant photos) instead of leaving them orphaned.

**Architecture:** A new pure `extractDriveFileIdFromViewUrl` function parses the Drive "view" URL shape mentorship uploads use (distinct from course images' "thumbnail" URL shape). `deleteBooking`/`deleteApplication` collect the fileIds their record owned, then run the existing `trashDriveFiles` helper in parallel with the existing Sheet-row delete. Both functions' return shape changes from a single optional Sheet message to a `warnings: string[]` list, threaded through the `DELETE` routes to one combined toast in the UI.

**Tech Stack:** TypeScript, Supabase (admin client), reuses existing GAS `trashFile` action and `trashDriveFiles` Next.js helper — no new backend infrastructure.

## Global Constraints

- Reuses `trashDriveFiles(fileIds: string[]): Promise<string | null>` from `src/lib/data/drive-cleanup.ts` unchanged — no new GAS action, no changes to that file.
- New extraction function is a **sibling** to `extractDriveFileId`, not an extension of it — `extractDriveFileId` in `src/lib/validations/drive-cleanup.ts` must be left untouched.
- Drive cleanup runs in parallel with the Sheet-row delete (`Promise.all`), both best-effort — neither failure blocks the other or the overall delete.
- `DeleteBookingResult`/`DeleteApplicationResult`'s success case changes from `{ ok: true; sheetDeleteMessage: string | null }` to `{ ok: true; warnings: string[] }` — a breaking change to the shape introduced by the mentorship delete feature's final review fix wave, updated in place.
- No new automated tests for `deleteBooking`/`deleteApplication`, the routes, or the UI — mirrors the existing convention for this whole feature area (manually verified). Only `extractDriveFileIdFromViewUrl` gets unit tests, matching its sibling `extractDriveFileId`.

---

### Task 1: `extractDriveFileIdFromViewUrl`

**Files:**
- Modify: `src/lib/validations/drive-cleanup.ts`
- Modify: `tests/drive-cleanup.test.ts`

**Interfaces:**
- Consumes: nothing new (pure function, no imports beyond what the file already has).
- Produces: `extractDriveFileIdFromViewUrl(url: string | null | undefined): string | null`. Task 2 imports this from `@/lib/validations/drive-cleanup`.

- [ ] **Step 1: Write the failing tests**

In `tests/drive-cleanup.test.ts`, change the import line at the top from:

```ts
import {
  extractDriveFileId,
  diffCourseImageFileIds,
  diffLessonFileIds,
  collectLessonFileIds,
} from "@/lib/validations/drive-cleanup";
```

to:

```ts
import {
  extractDriveFileId,
  extractDriveFileIdFromViewUrl,
  diffCourseImageFileIds,
  diffLessonFileIds,
  collectLessonFileIds,
} from "@/lib/validations/drive-cleanup";
```

Then add this new `describe` block, right after the existing `describe("extractDriveFileId", ...)` block (before `describe("diffCourseImageFileIds", ...)`):

```ts
describe("extractDriveFileIdFromViewUrl", () => {
  it("extracts the id from a Drive view URL", () => {
    expect(extractDriveFileIdFromViewUrl("https://drive.google.com/file/d/abc123/view?usp=drivesdk")).toBe("abc123");
  });

  it("returns null for a non-Drive URL", () => {
    expect(extractDriveFileIdFromViewUrl("https://example.com/file.pdf")).toBeNull();
  });

  it("returns null for a Drive URL that isn't the /file/d/ shape", () => {
    expect(extractDriveFileIdFromViewUrl("https://drive.google.com/thumbnail?id=abc123&sz=w1600")).toBeNull();
  });

  it("returns null for null, undefined, and empty string", () => {
    expect(extractDriveFileIdFromViewUrl(null)).toBeNull();
    expect(extractDriveFileIdFromViewUrl(undefined)).toBeNull();
    expect(extractDriveFileIdFromViewUrl("")).toBeNull();
  });

  it("returns null for a malformed URL", () => {
    expect(extractDriveFileIdFromViewUrl("not a url")).toBeNull();
  });

  it("returns null for a non-https Drive view URL", () => {
    expect(extractDriveFileIdFromViewUrl("http://drive.google.com/file/d/abc123/view")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run tests/drive-cleanup.test.ts`
Expected: FAIL — `extractDriveFileIdFromViewUrl` is not exported from `@/lib/validations/drive-cleanup`.

- [ ] **Step 3: Implement `extractDriveFileIdFromViewUrl`**

In `src/lib/validations/drive-cleanup.ts`, add this function directly after `extractDriveFileId`'s closing brace:

```ts
/**
 * Pulls the file id out of one of our own Drive "view" URLs
 * (`https://drive.google.com/file/d/<id>/view?usp=drivesdk`) — the shape
 * handleUploadMentorshipFile_ returns via file.getUrl() for payment
 * screenshots, CVs, and applicant photos. Distinct from the `/thumbnail?id=`
 * shape extractDriveFileId parses (course images) — kept as a separate
 * function rather than widening extractDriveFileId, so each stays a narrow
 * safety boundary for its own upload path. Returns null for anything else:
 * a manually pasted external URL, an empty/blank value, a malformed string,
 * a Drive URL that isn't this specific shape, or a well-formed URL with an
 * empty fileId segment.
 */
export function extractDriveFileIdFromViewUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "drive.google.com") return null;
  const prefix = "/file/d/";
  if (!parsed.pathname.startsWith(prefix)) return null;
  const fileId = parsed.pathname.slice(prefix.length).split("/")[0];
  return fileId || null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node node_modules/vitest/vitest.mjs run tests/drive-cleanup.test.ts`
Expected: PASS, all tests in the file green (existing `extractDriveFileId`/`diffCourseImageFileIds`/`diffLessonFileIds`/`collectLessonFileIds` tests plus the new `extractDriveFileIdFromViewUrl` ones).

- [ ] **Step 5: Typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validations/drive-cleanup.ts tests/drive-cleanup.test.ts
git commit -m "feat: add extractDriveFileIdFromViewUrl for mentorship upload URLs"
```

---

### Task 2: Collect and trash Drive files on delete

**Files:**
- Modify: `src/lib/data/mentorship-bookings.ts`
- Modify: `src/lib/data/mentorship-applications.ts`

**Interfaces:**
- Consumes: `extractDriveFileIdFromViewUrl` (Task 1, from `@/lib/validations/drive-cleanup`); `trashDriveFiles(fileIds: string[]): Promise<string | null>` (existing, from `@/lib/data/drive-cleanup`); `pushMentorshipDelete` (existing, already imported in both files, returns `{ ok: boolean; message?: string }`).
- Produces: `DeleteBookingResult`/`DeleteApplicationResult`'s success case becomes `{ ok: true; warnings: string[] }` (replacing `{ ok: true; sheetDeleteMessage: string | null }`). Task 3's routes read `result.warnings` instead of `result.sheetDeleteMessage`.

- [ ] **Step 1: Update `mentorship-bookings.ts`**

Add two imports, alongside the existing ones at the top of the file:

```ts
import { extractDriveFileIdFromViewUrl } from "@/lib/validations/drive-cleanup";
import { trashDriveFiles } from "@/lib/data/drive-cleanup";
```

Replace the entire `DeleteBookingResult` type and `deleteBooking` function (currently the last 33 lines of the file) with:

```ts
export type DeleteBookingResult =
  | { ok: true; warnings: string[] }
  | { ok: false; reason: "not-found" | "db-error" };

/**
 * Deletes the booking from Supabase first — that's the authoritative delete
 * from the admin's perspective. The Sheet-row delete and the Drive-file
 * cleanup (payment screenshot) are both attempted afterward regardless of
 * whether the Supabase delete already succeeded (it always has, by this
 * point), run in parallel since they're independent of each other, and
 * each failure is reported back as its own entry in `warnings` so the
 * admin knows what still needs manual cleanup, and why.
 */
export async function deleteBooking(bookingId: string): Promise<DeleteBookingResult> {
  const admin = createAdminSupabase();
  const { data: existing, error: readError } = await admin
    .from("mentorship_bookings")
    .select("id, email, created_at, payment_screenshot_url")
    .eq("id", bookingId)
    .maybeSingle();

  if (readError) return { ok: false, reason: "db-error" };
  if (!existing) return { ok: false, reason: "not-found" };

  const { error } = await admin.from("mentorship_bookings").delete().eq("id", bookingId);
  if (error) return { ok: false, reason: "db-error" };

  const fileIds = [extractDriveFileIdFromViewUrl(existing.payment_screenshot_url)].filter(
    (id): id is string => id !== null,
  );

  const [sheetResult, driveWarning] = await Promise.all([
    pushMentorshipDelete({
      sheetKind: "booking",
      email: existing.email,
      timestamp: existing.created_at,
    }),
    trashDriveFiles(fileIds),
  ]);

  const warnings: string[] = [];
  if (!sheetResult.ok) warnings.push(sheetResult.message ?? "Unknown error");
  if (driveWarning) warnings.push(driveWarning);

  return { ok: true, warnings };
}
```

- [ ] **Step 2: Update `mentorship-applications.ts`**

Same two imports, added alongside the existing ones at the top of the file:

```ts
import { extractDriveFileIdFromViewUrl } from "@/lib/validations/drive-cleanup";
import { trashDriveFiles } from "@/lib/data/drive-cleanup";
```

Replace the entire `DeleteApplicationResult` type and `deleteApplication` function (currently the last 27 lines of the file) with:

```ts
export type DeleteApplicationResult =
  | { ok: true; warnings: string[] }
  | { ok: false; reason: "not-found" | "db-error" };

/** Mirrors deleteBooking in mentorship-bookings.ts — see its comment. */
export async function deleteApplication(applicationId: string): Promise<DeleteApplicationResult> {
  const admin = createAdminSupabase();
  const { data: existing, error: readError } = await admin
    .from("mentor_applications")
    .select("id, email, created_at, cv_url, photo_urls")
    .eq("id", applicationId)
    .maybeSingle();

  if (readError) return { ok: false, reason: "db-error" };
  if (!existing) return { ok: false, reason: "not-found" };

  const { error } = await admin.from("mentor_applications").delete().eq("id", applicationId);
  if (error) return { ok: false, reason: "db-error" };

  const fileIds = [existing.cv_url, ...(existing.photo_urls ?? [])]
    .map((url) => extractDriveFileIdFromViewUrl(url))
    .filter((id): id is string => id !== null);

  const [sheetResult, driveWarning] = await Promise.all([
    pushMentorshipDelete({
      sheetKind: "application",
      email: existing.email,
      timestamp: existing.created_at,
    }),
    trashDriveFiles(fileIds),
  ]);

  const warnings: string[] = [];
  if (!sheetResult.ok) warnings.push(sheetResult.message ?? "Unknown error");
  if (driveWarning) warnings.push(driveWarning);

  return { ok: true, warnings };
}
```

- [ ] **Step 3: Typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: two errors, both in `src/app/api/admin/mentorship/*/[id]/route.ts` — `Property 'sheetDeleteMessage' does not exist on type '{ ok: true; warnings: string[]; }'`. This is expected: Task 3 fixes the routes. Confirm no *other* new errors beyond these two.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/mentorship-bookings.ts src/lib/data/mentorship-applications.ts
git commit -m "feat: trash Drive files when deleting a booking/application"
```

---

### Task 3: Update `DELETE` route responses

**Files:**
- Modify: `src/app/api/admin/mentorship/bookings/[id]/route.ts`
- Modify: `src/app/api/admin/mentorship/applications/[id]/route.ts`

**Interfaces:**
- Consumes: `DeleteBookingResult`/`DeleteApplicationResult` (Task 2) — specifically `result.warnings: string[]`.
- Produces: both `DELETE` routes now return `{ ok: true, warnings: string[] }` on success (was `{ ok: true, sheetDeleteMessage: string | null }`). Task 4's UI reads this shape.

- [ ] **Step 1: Update the bookings route**

In `src/app/api/admin/mentorship/bookings/[id]/route.ts`, change the last line of the `DELETE` function from:

```ts
  return NextResponse.json({ ok: true, sheetDeleteMessage: result.sheetDeleteMessage });
```

to:

```ts
  return NextResponse.json({ ok: true, warnings: result.warnings });
```

- [ ] **Step 2: Update the applications route**

In `src/app/api/admin/mentorship/applications/[id]/route.ts`, same change:

```ts
  return NextResponse.json({ ok: true, warnings: result.warnings });
```

- [ ] **Step 3: Typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors (the two Task 2 left behind are now fixed).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/mentorship/bookings/[id]/route.ts src/app/api/admin/mentorship/applications/[id]/route.ts
git commit -m "feat: return warnings array from mentorship DELETE routes"
```

---

### Task 4: Update the delete toast

**Files:**
- Modify: `src/components/admin/mentorship/MentorshipReviewActions.tsx`

**Interfaces:**
- Consumes: `{ warnings?: string[] }` from the `DELETE` response (Task 3).
- Produces: no new exports — `submitDelete`'s internal response handling only.

- [ ] **Step 1: Update `submitDelete`**

In `src/components/admin/mentorship/MentorshipReviewActions.tsx`, inside `submitDelete`, replace:

```ts
        const payload = (await res.json().catch(() => null)) as { sheetDeleteMessage?: string | null } | null;
        setDeleteOpen(false);

        if (!payload?.sheetDeleteMessage) {
          toast.success(`${name} deleted.`);
        } else {
          toast.warning(`${name} deleted from the database, but the Sheet row needs manual cleanup: ${payload.sheetDeleteMessage}`);
        }
```

with:

```ts
        const payload = (await res.json().catch(() => null)) as { warnings?: string[] } | null;
        setDeleteOpen(false);

        if (!payload?.warnings || payload.warnings.length === 0) {
          toast.success(`${name} deleted.`);
        } else {
          toast.warning(`${name} deleted from the database. ${payload.warnings.join(" ")}`);
        }
```

- [ ] **Step 2: Typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run the full test suite**

Run: `node node_modules/vitest/vitest.mjs run`
Expected: all tests pass (this component has no test file; this confirms nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/mentorship/MentorshipReviewActions.tsx
git commit -m "feat: surface Drive cleanup outcome in the delete toast"
```

---

### Task 5: Manual verification

This task has no code changes. No GAS deployment or redeploy is needed — this feature only calls the existing `trashFile` GAS action, already live.

- [ ] **Step 1: Start the dev server**

Run: `node node_modules/next/dist/bin/next dev`
Expected: clean start, no compile errors.

- [ ] **Step 2: Delete a booking with a screenshot**

As an admin, go to `/dashboard/admin/mentorship`, Bookings tab. Delete a test booking that has a payment screenshot attached (`paymentScreenshotUrl` populated — visible via its "View" link in the Receipt column). Confirm the toast shows plain success (not a warning) if the file was already reachable, and check the file's Drive folder (`PZ Academy/Mentorship Uploads/Bookings/`) to confirm the file landed in Trash.

- [ ] **Step 3: Delete an application with a CV and photo**

Same on the Applications tab, against a test application with `cvUrl` and at least one `photoUrls` entry populated. Confirm both files show up trashed in `PZ Academy/Mentorship Uploads/Applications/`.

- [ ] **Step 4: Delete a record with no attached files**

Delete a booking with no payment screenshot (or an application with no CV/photos). Confirm it still deletes cleanly with a plain success toast — `fileIds` is an empty array, `trashDriveFiles([])` short-circuits to `null`, no warning fires from the Drive side.
