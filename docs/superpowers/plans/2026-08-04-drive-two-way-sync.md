# Two-Way Drive Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an admin deletes or replaces an uploaded course image, lesson PDF, or lesson Supporting Document — or deletes the lesson/module/course that owns one — the real file gets trashed in Google Drive too, not just detached from the database.

**Architecture:** A new GAS `trashFile` action wraps `DriveApp.setTrashed(true)`. A pure helper module computes *which* Drive fileIds need trashing by diffing old vs new DB values (or collecting every descendant fileId before a cascading delete). A thin server-only module makes the actual network call. Five existing mutation functions in `src/lib/data/admin-lms.ts` (`updateCourseConfig`, `updateLesson`, `deleteCourse`, `deleteModule`, `deleteLesson`) call the diff/collect helpers before or after their existing DB write, and attach a `warning` string to their result if any trash call failed — soft-fail, never blocking the save/delete itself.

**Tech Stack:** Next.js 14 App Router, Supabase (service-role client), Google Apps Script (single project, `doPost` dispatcher), vitest.

## Global Constraints

- Never run `npm run <script>` — the `&` in the folder path truncates it. Call binaries directly: `node_modules/.bin/tsc`, `node_modules/.bin/vitest`, `node_modules/.bin/next`, `node_modules/.bin/clasp`.
- Never run `next build` while a dev server is live — it corrupts the route manifest.
- Files are moved to Drive's Trash (`setTrashed(true)`), never permanently deleted.
- If a Drive trash call fails, the DB save/delete must still succeed — collect a warning string, never throw or block.
- `tsc --noEmit`, `vitest run`, and `next lint` must stay clean after every task.
- This repo has no configured git identity (`user.name`/`user.email`) — do not run `git config`. If a commit step fails for that reason, stop and surface it rather than configuring identity yourself.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `gas/sheets-sync/Code.gs` | Modify | Add `trashFile` dispatch branch |
| `gas/payment-screenshots/Code.gs` | Modify | Add `handleTrashFile_` |
| `gas/clasp-project/Sheet Sync.gs.js` | Modify | Mirror of `sheets-sync/Code.gs` — must stay byte-identical, this is what actually gets pushed |
| `gas/clasp-project/Code.js` | Modify | Mirror of `payment-screenshots/Code.gs` — same |
| `src/lib/validations/drive-cleanup.ts` | Create | Pure functions: `extractDriveFileId`, `diffCourseImageFileIds`, `diffLessonFileIds`, `collectLessonFileIds` |
| `tests/drive-cleanup.test.ts` | Create | Unit tests for the above |
| `src/lib/data/drive-cleanup.ts` | Create | Server-only: `trashDriveFile`, `trashDriveFiles` (the actual GAS network call) |
| `src/lib/data/admin-lms.ts` | Modify | Wire diff/collect + trash into `updateCourseConfig`, `updateLesson`, `deleteCourse`, `deleteModule`, `deleteLesson` |
| `src/app/api/admin/courses/[id]/route.ts` | Modify | Pass `warning` through PATCH and DELETE responses |
| `src/app/api/admin/lessons/[lessonId]/route.ts` | Modify | Pass `warning` through PATCH and DELETE responses |
| `src/app/api/admin/modules/[moduleId]/route.ts` | Modify | Pass `warning` through DELETE response |
| `src/components/admin/program/ProgramConfigForm.tsx` | Modify | Toast the warning from save() and confirmDelete() |
| `src/components/admin/program/LessonEditorPanel.tsx` | Modify | Toast the warning from patchLesson() |
| `src/components/admin/program/CurriculumMap.tsx` | Modify | Toast the warning from confirmDelete() (covers both module and lesson delete) |

---

### Task 1: GAS `trashFile` action + deploy

**Files:**
- Modify: `gas/sheets-sync/Code.gs:138-152` (dispatcher)
- Modify: `gas/payment-screenshots/Code.gs` (add handler near the other handlers, after `handleFetchPrivateDocument_` at line 156)
- Modify: `gas/clasp-project/Sheet Sync.gs.js` (mirror of sheets-sync/Code.gs)
- Modify: `gas/clasp-project/Code.js` (mirror of payment-screenshots/Code.gs)

**Interfaces:**
- Produces: GAS action `"trashFile"` — request `{action: "trashFile", secret: string, fileId: string}`, response `{ok: true} | {ok: false, error: string}`. This is the network contract `trashDriveFile` (Task 3) depends on.

- [ ] **Step 1: Add the handler to `gas/payment-screenshots/Code.gs`**

Insert this function after `handleFetchPrivateDocument_` (after line 156, before the `getOrCreateFolder_` helper comment on line 158):

```js
/**
 * Moves a file to Drive's Trash rather than permanently deleting it — gives
 * a ~30-day recovery window inside Drive itself if an app-side delete (an
 * admin clearing/replacing an image, or deleting a lesson/course that owned
 * one) turns out to be a mistake. Treats "already gone" as success: the
 * caller only cares that the file is no longer live, not whether this
 * specific call was the one that removed it.
 */
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
    if (String(err).indexOf("not found") !== -1) {
      return jsonResponse_({ ok: true });
    }
    return jsonResponse_({ ok: false, error: String(err) });
  }
}
```

- [ ] **Step 2: Add the dispatch branch to `gas/sheets-sync/Code.gs`**

In `doPost` (line 130), add this branch immediately after the `fetchPrivateDocument` branch (after line 152, before the `SYNC_SECRET` check on line 154):

```js
  if (body.action === "trashFile") {
    return handleTrashFile_(body);
  }
```

Also update the doc comment above `doPost` (lines 120-129) to mention `trashFile` in the list of actions that share `SHARED_SECRET`:

Replace:
```
 * Each
 * action checks its own secret property (SYNC_SECRET here, SHARED_SECRET for
 * uploadPaymentScreenshot/uploadCourseImage/uploadPrivateDocument/
 * fetchPrivateDocument) rather than one shared gate, since they're logically
```
with:
```
 * Each
 * action checks its own secret property (SYNC_SECRET here, SHARED_SECRET for
 * uploadPaymentScreenshot/uploadCourseImage/uploadPrivateDocument/
 * fetchPrivateDocument/trashFile) rather than one shared gate, since they're logically
```

- [ ] **Step 3: Mirror both edits into the clasp-project copies**

`gas/clasp-project/Sheet Sync.gs.js` must stay byte-identical to `gas/sheets-sync/Code.gs`, and `gas/clasp-project/Code.js` byte-identical to `gas/payment-screenshots/Code.gs` — this is the existing convention (verified before writing this plan: both pairs currently diff as identical). After Steps 1-2, copy the full updated contents of `gas/sheets-sync/Code.gs` over `gas/clasp-project/Sheet Sync.gs.js`, and `gas/payment-screenshots/Code.gs` over `gas/clasp-project/Code.js`. Verify with:

```bash
diff "gas/sheets-sync/Code.gs" "gas/clasp-project/Sheet Sync.gs.js"
diff "gas/payment-screenshots/Code.gs" "gas/clasp-project/Code.js"
```

Both must print nothing (exit 0).

- [ ] **Step 4: Deploy**

```bash
cd gas/clasp-project
../../node_modules/.bin/clasp push --force
../../node_modules/.bin/clasp version "Add trashFile action"
../../node_modules/.bin/clasp deployments
```

Note the deployment ID from `clasp deployments` output (should match `AKfycbziAgPGm187O3nScUO1wd9RsIuaiGoUd8Z_MC55f7Lv6PaMJuc3lC9So7TyWt9xqeeE` per project convention) and the version number `clasp version` just created, then:

```bash
../../node_modules/.bin/clasp redeploy AKfycbziAgPGm187O3nScUO1wd9RsIuaiGoUd8Z_MC55f7Lv6PaMJuc3lC9So7TyWt9xqeeE -V <version-number> -d "Add trashFile action"
```

- [ ] **Step 5: Verify against the live relay**

Using `GAS_WEBAPP_URL` and `GAS_SHARED_SECRET` from `.env.local`, send a request with a garbage fileId and confirm the shape matches the contract (this doesn't require a real file yet — that end-to-end check happens in Task 9 once the whole path is wired):

```bash
curl -s -X POST "$GAS_WEBAPP_URL" -H "Content-Type: application/json" \
  -d '{"action":"trashFile","secret":"'"$GAS_SHARED_SECRET"'","fileId":"nonexistent-id-12345"}'
```

Expected: `{"ok":false,"error":"..."}` (Drive will error on a garbage ID that isn't literally "not found" text — any well-formed `{ok, ...}` JSON response confirms the action is wired and secret-gated correctly; a `{"ok":false,"error":"Unauthorized"}` on a deliberately wrong secret confirms the gate).

- [ ] **Step 6: Commit**

```bash
git add gas/sheets-sync/Code.gs gas/payment-screenshots/Code.gs "gas/clasp-project/Sheet Sync.gs.js" gas/clasp-project/Code.js
git commit -m "feat(gas): add trashFile action for Drive cleanup"
```

---

### Task 2: Pure diff/extraction helpers + unit tests

**Files:**
- Create: `src/lib/validations/drive-cleanup.ts`
- Test: `tests/drive-cleanup.test.ts`

**Interfaces:**
- Produces:
  - `extractDriveFileId(url: string | null | undefined): string | null`
  - `diffCourseImageFileIds(oldUrls: CourseImageUrls, newUrls: CourseImageUrls): string[]` where `CourseImageUrls = {thumbnailUrl: string | null; bannerUrl: string | null; mentorAvatarUrl: string | null}`
  - `diffLessonFileIds(old: LessonFileState, next: LessonFileUpdate): string[]` where `LessonFileState = {pdfFileId: string | null; documents: Array<{fileId: string}>}` and `LessonFileUpdate = {pdfFileId?: string | null; documents?: Array<{fileId: string}>}`
  - `collectLessonFileIds(lessons: LessonFileState[]): string[]`
- Consumes: nothing (pure, no imports beyond TypeScript itself)

- [ ] **Step 1: Write the failing tests**

Create `tests/drive-cleanup.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  extractDriveFileId,
  diffCourseImageFileIds,
  diffLessonFileIds,
  collectLessonFileIds,
} from "@/lib/validations/drive-cleanup";

describe("extractDriveFileId", () => {
  it("extracts the id from a Drive thumbnail URL", () => {
    expect(extractDriveFileId("https://drive.google.com/thumbnail?id=abc123&sz=w1600")).toBe("abc123");
  });

  it("returns null for a non-Drive URL", () => {
    expect(extractDriveFileId("https://example.com/image.png")).toBeNull();
  });

  it("returns null for a Drive URL that isn't the thumbnail endpoint", () => {
    expect(extractDriveFileId("https://drive.google.com/file/d/abc123/view")).toBeNull();
  });

  it("returns null for null, undefined, and empty string", () => {
    expect(extractDriveFileId(null)).toBeNull();
    expect(extractDriveFileId(undefined)).toBeNull();
    expect(extractDriveFileId("")).toBeNull();
  });

  it("returns null for a malformed URL", () => {
    expect(extractDriveFileId("not a url")).toBeNull();
  });
});

describe("diffCourseImageFileIds", () => {
  const drive = (id: string) => `https://drive.google.com/thumbnail?id=${id}&sz=w1600`;

  it("returns the old fileId when a field is cleared", () => {
    const result = diffCourseImageFileIds(
      { thumbnailUrl: drive("old-thumb"), bannerUrl: null, mentorAvatarUrl: null },
      { thumbnailUrl: null, bannerUrl: null, mentorAvatarUrl: null },
    );
    expect(result).toEqual(["old-thumb"]);
  });

  it("returns the old fileId when a field is replaced with a different Drive file", () => {
    const result = diffCourseImageFileIds(
      { thumbnailUrl: drive("old-thumb"), bannerUrl: null, mentorAvatarUrl: null },
      { thumbnailUrl: drive("new-thumb"), bannerUrl: null, mentorAvatarUrl: null },
    );
    expect(result).toEqual(["old-thumb"]);
  });

  it("returns nothing when the value is unchanged", () => {
    const result = diffCourseImageFileIds(
      { thumbnailUrl: drive("same"), bannerUrl: null, mentorAvatarUrl: null },
      { thumbnailUrl: drive("same"), bannerUrl: null, mentorAvatarUrl: null },
    );
    expect(result).toEqual([]);
  });

  it("returns nothing when the old value wasn't a Drive file (external URL)", () => {
    const result = diffCourseImageFileIds(
      { thumbnailUrl: "https://example.com/pic.png", bannerUrl: null, mentorAvatarUrl: null },
      { thumbnailUrl: null, bannerUrl: null, mentorAvatarUrl: null },
    );
    expect(result).toEqual([]);
  });

  it("checks all three fields independently", () => {
    const result = diffCourseImageFileIds(
      { thumbnailUrl: drive("t1"), bannerUrl: drive("b1"), mentorAvatarUrl: drive("m1") },
      { thumbnailUrl: drive("t1"), bannerUrl: null, mentorAvatarUrl: drive("m2") },
    );
    expect(result.sort()).toEqual(["b1", "m1"]);
  });
});

describe("diffLessonFileIds", () => {
  it("trashes the old pdf when replaced", () => {
    const result = diffLessonFileIds(
      { pdfFileId: "old-pdf", documents: [] },
      { pdfFileId: "new-pdf" },
    );
    expect(result).toEqual(["old-pdf"]);
  });

  it("does not trash the pdf when it wasn't part of this update", () => {
    const result = diffLessonFileIds({ pdfFileId: "old-pdf", documents: [] }, { documents: [] });
    expect(result).toEqual([]);
  });

  it("does not trash anything when the pdf is unchanged", () => {
    const result = diffLessonFileIds(
      { pdfFileId: "same-pdf", documents: [] },
      { pdfFileId: "same-pdf" },
    );
    expect(result).toEqual([]);
  });

  it("trashes documents removed from the array", () => {
    const result = diffLessonFileIds(
      { pdfFileId: null, documents: [{ fileId: "doc1" }, { fileId: "doc2" }] },
      { documents: [{ fileId: "doc1" }] },
    );
    expect(result).toEqual(["doc2"]);
  });

  it("does not trash documents when the array wasn't part of this update", () => {
    const result = diffLessonFileIds(
      { pdfFileId: null, documents: [{ fileId: "doc1" }] },
      { pdfFileId: "some-pdf" },
    );
    expect(result).toEqual([]);
  });

  it("combines pdf and document removals in one call", () => {
    const result = diffLessonFileIds(
      { pdfFileId: "old-pdf", documents: [{ fileId: "doc1" }] },
      { pdfFileId: "new-pdf", documents: [] },
    );
    expect(result.sort()).toEqual(["doc1", "old-pdf"]);
  });
});

describe("collectLessonFileIds", () => {
  it("collects pdf and document fileIds across every lesson", () => {
    const result = collectLessonFileIds([
      { pdfFileId: "pdf1", documents: [{ fileId: "doc1" }, { fileId: "doc2" }] },
      { pdfFileId: null, documents: [{ fileId: "doc3" }] },
    ]);
    expect(result.sort()).toEqual(["doc1", "doc2", "doc3", "pdf1"]);
  });

  it("returns an empty array for lessons with no files", () => {
    expect(collectLessonFileIds([{ pdfFileId: null, documents: [] }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "Recovered Files/pz-academy-platform"
node_modules/.bin/vitest run tests/drive-cleanup.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/validations/drive-cleanup'`.

- [ ] **Step 3: Implement**

Create `src/lib/validations/drive-cleanup.ts`:

```typescript
/**
 * Pure Drive-fileId bookkeeping — no network calls, no server-only import,
 * so these stay unit-testable. The actual GAS trash call lives in
 * src/lib/data/drive-cleanup.ts.
 */

/**
 * Pulls the file id out of one of our own Drive thumbnail URLs
 * (`https://drive.google.com/thumbnail?id=<id>&sz=w1600`). Returns null for
 * anything else — a manually pasted external image URL, an empty/blank
 * value, or a malformed string — which is the safety boundary that keeps
 * the app from ever asking Drive to trash a file it didn't itself upload.
 */
export function extractDriveFileId(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "drive.google.com" || parsed.pathname !== "/thumbnail") return null;
  return parsed.searchParams.get("id");
}

export interface CourseImageUrls {
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  mentorAvatarUrl: string | null;
}

/** Given the course's old and new image field values, returns every old Drive fileId that got cleared or replaced. */
export function diffCourseImageFileIds(oldUrls: CourseImageUrls, newUrls: CourseImageUrls): string[] {
  const pairs: Array<[string | null, string | null]> = [
    [oldUrls.thumbnailUrl, newUrls.thumbnailUrl],
    [oldUrls.bannerUrl, newUrls.bannerUrl],
    [oldUrls.mentorAvatarUrl, newUrls.mentorAvatarUrl],
  ];
  const toTrash: string[] = [];
  for (const [oldUrl, newUrl] of pairs) {
    if (oldUrl === newUrl) continue;
    const fileId = extractDriveFileId(oldUrl);
    if (fileId) toTrash.push(fileId);
  }
  return toTrash;
}

export interface LessonFileState {
  pdfFileId: string | null;
  documents: Array<{ fileId: string }>;
}

export interface LessonFileUpdate {
  pdfFileId?: string | null;
  documents?: Array<{ fileId: string }>;
}

/**
 * `pdf_file_id` and each document's `fileId` are already raw Drive file ids
 * (not URLs) — no extraction step needed here, unlike the course-image
 * fields. Only diffs fields that were actually part of this update: a
 * lesson-title-only PATCH must never trash the pdf just because the caller
 * didn't mention it.
 */
export function diffLessonFileIds(old: LessonFileState, next: LessonFileUpdate): string[] {
  const toTrash: string[] = [];
  if (next.pdfFileId !== undefined && next.pdfFileId !== old.pdfFileId && old.pdfFileId) {
    toTrash.push(old.pdfFileId);
  }
  if (next.documents !== undefined) {
    const newIds = new Set(next.documents.map((d) => d.fileId));
    for (const doc of old.documents) {
      if (!newIds.has(doc.fileId)) toTrash.push(doc.fileId);
    }
  }
  return toTrash;
}

/** Every Drive fileId a set of lessons owns — used before a cascading module/course delete removes them from the DB. */
export function collectLessonFileIds(lessons: LessonFileState[]): string[] {
  const ids: string[] = [];
  for (const lesson of lessons) {
    if (lesson.pdfFileId) ids.push(lesson.pdfFileId);
    for (const doc of lesson.documents) ids.push(doc.fileId);
  }
  return ids;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node_modules/.bin/vitest run tests/drive-cleanup.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/drive-cleanup.ts tests/drive-cleanup.test.ts
git commit -m "feat: add pure Drive fileId diff/extraction helpers"
```

---

### Task 3: Server-only Drive trash caller

**Files:**
- Create: `src/lib/data/drive-cleanup.ts`

**Interfaces:**
- Consumes: nothing new (reads `process.env.GAS_WEBAPP_URL`, `process.env.GAS_SHARED_SECRET`, matching the existing pattern in `src/app/api/admin/uploads/course-image/route.ts:4-5`)
- Produces:
  - `trashDriveFile(fileId: string): Promise<{ok: boolean}>`
  - `trashDriveFiles(fileIds: string[]): Promise<string | null>` — returns a warning string if any failed, `null` if the list was empty or everything succeeded. This is what Task 4-8 call.

This module has no automated test (it's a thin network wrapper — same as the existing upload routes, which also aren't unit tested). It's verified for real in Task 9.

- [ ] **Step 1: Implement**

Create `src/lib/data/drive-cleanup.ts`:

```typescript
import "server-only";

const GAS_URL = process.env.GAS_WEBAPP_URL ?? "";
const GAS_SHARED_SECRET = process.env.GAS_SHARED_SECRET ?? "";

/** Moves one Drive file to Trash via the GAS relay's trashFile action. Never throws — callers treat a failure as "couldn't clean up," not a reason to fail their own operation. */
export async function trashDriveFile(fileId: string): Promise<{ ok: boolean }> {
  if (!GAS_URL || !GAS_SHARED_SECRET) return { ok: false };
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "trashFile", secret: GAS_SHARED_SECRET, fileId }),
    });
    if (!res.ok) return { ok: false };
    const json: { ok?: boolean } = await res.json().catch(() => ({}));
    return { ok: json.ok === true };
  } catch {
    return { ok: false };
  }
}

/**
 * Runs trashDriveFile over every id in parallel. Returns null if the list
 * was empty or everything succeeded — the common case, meaning "nothing to
 * tell the admin." Returns a human-readable warning if anything failed, for
 * the caller to attach to its own result and surface as a toast.
 */
export async function trashDriveFiles(fileIds: string[]): Promise<string | null> {
  if (fileIds.length === 0) return null;
  const results = await Promise.all(fileIds.map((id) => trashDriveFile(id)));
  const failedCount = results.filter((r) => !r.ok).length;
  if (failedCount === 0) return null;
  return `Saved, but ${failedCount} of ${fileIds.length} old file${fileIds.length === 1 ? "" : "s"} couldn't be removed from Drive.`;
}
```

- [ ] **Step 2: Typecheck**

```bash
node_modules/.bin/tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/drive-cleanup.ts
git commit -m "feat: add server-side Drive trash caller"
```

---

### Task 4: Wire course image edits

**Files:**
- Modify: `src/lib/data/admin-lms.ts:280-282` (type), `:294-342` (function)
- Modify: `src/app/api/admin/courses/[id]/route.ts:17-28` (PATCH handler)
- Modify: `src/components/admin/program/ProgramConfigForm.tsx:102-108` (save)

**Interfaces:**
- Consumes: `diffCourseImageFileIds` and `trashDriveFiles` from Tasks 2-3
- Produces: `UpdateCourseConfigResult`'s `ok: true` case now carries `warning: string | null`, consumed by the route and then the toast

- [ ] **Step 1: Update the result type and function** (`src/lib/data/admin-lms.ts`)

Add these two imports at the top of the file, alongside the existing ones (after line 16):

```typescript
import { diffCourseImageFileIds } from "@/lib/validations/drive-cleanup";
import { trashDriveFiles } from "@/lib/data/drive-cleanup";
```

Replace the `UpdateCourseConfigResult` type (lines 280-282):

```typescript
export type UpdateCourseConfigResult =
  | { ok: true; warning: string | null }
  | { ok: false; reason: "not-found" | "type-switch-blocked" | "db-error"; message?: string };
```

Replace the body of `updateCourseConfig` (lines 294-342) — the switch-eligibility check and patch object stay exactly as they are, only the section from the DB update onward changes:

```typescript
export async function updateCourseConfig(
  id: string,
  input: CourseConfigInput,
): Promise<UpdateCourseConfigResult> {
  const admin = createAdminSupabase();

  const { count: moduleCount } = await admin
    .from("modules")
    .select("id", { count: "exact", head: true })
    .eq("course_id", id);
  const switchCheck = typeSwitchEligibility(input.type, moduleCount ?? 0);
  if (!switchCheck.ok) {
    return { ok: false, reason: "type-switch-blocked", message: switchCheck.reason };
  }

  const { data: existing } = await admin
    .from("courses")
    .select("thumbnail_url, banner_url, mentor_avatar_url")
    .eq("id", id)
    .maybeSingle();

  const patch: Database["public"]["Tables"]["courses"]["Update"] = {
    title: input.title,
    type: input.type,
    tagline: input.tagline ?? null,
    description: input.description ?? null,
    status: input.status,
    price_pkr: input.pricePkr,
    level: input.level ?? null,
    duration_text: input.durationText ?? null,
    timings: input.timings ?? null,
    register_url: input.registerUrl ?? null,
    thumbnail_url: input.thumbnailUrl ?? null,
    banner_url: input.bannerUrl ?? null,
    mentor_name: input.mentorName ?? null,
    mentor_title: input.mentorTitle ?? null,
    mentor_bio: input.mentorBio ?? null,
    mentor_avatar_url: input.mentorAvatarUrl ?? null,
    gas_webapp_url: input.gasWebappUrl ?? null,
  };
  if (input.features !== undefined) patch.features = input.features;
  if (input.outcomes !== undefined) patch.outcomes = input.outcomes;
  if (input.faqs !== undefined) patch.faqs = input.faqs;

  // Switching into a flat type needs its hidden module to exist the moment
  // the Builder is opened next.
  if (usesFlatSessions(input.type)) {
    await ensureDefaultModule(id);
  }

  const { data, error } = await admin.from("courses").update(patch).eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (!data) return { ok: false, reason: "not-found" };

  const warning = existing
    ? await trashDriveFiles(
        diffCourseImageFileIds(
          {
            thumbnailUrl: existing.thumbnail_url,
            bannerUrl: existing.banner_url,
            mentorAvatarUrl: existing.mentor_avatar_url,
          },
          {
            thumbnailUrl: input.thumbnailUrl ?? null,
            bannerUrl: input.bannerUrl ?? null,
            mentorAvatarUrl: input.mentorAvatarUrl ?? null,
          },
        ),
      )
    : null;

  return { ok: true, warning };
}
```

- [ ] **Step 2: Pass the warning through the API route** (`src/app/api/admin/courses/[id]/route.ts`)

Replace line 28 (`return NextResponse.json({ ok: true });` inside `PATCH`):

```typescript
  return NextResponse.json({ ok: true, warning: result.warning });
```

- [ ] **Step 3: Toast it** (`src/components/admin/program/ProgramConfigForm.tsx`)

Replace lines 107-109:

```typescript
      const payload = (await res.json().catch(() => null)) as { warning?: string | null } | null;
      if (payload?.warning) toast.warning(payload.warning);
      toast.success("Changes saved.");
      router.refresh();
```

- [ ] **Step 4: Typecheck and lint**

```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/next lint
```

Expected: no errors.

- [ ] **Step 5: Manual verification**

With the dev server running, open any course's Configuration page, upload a thumbnail, save, then upload a *different* thumbnail and save again. Confirm: no error toast, "Changes saved." appears (a warning toast would only appear if the GAS relay call itself failed — not expected here). This confirms the diff-and-trash path runs without breaking the existing save flow. Full proof the old file actually left Drive happens in Task 9.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/admin-lms.ts src/app/api/admin/courses/[id]/route.ts src/components/admin/program/ProgramConfigForm.tsx
git commit -m "feat: trash replaced/cleared course images in Drive on save"
```

---

### Task 5: Wire lesson PDF/document edits

**Files:**
- Modify: `src/lib/data/admin-lms.ts:629-648` (`updateLesson`)
- Modify: `src/app/api/admin/lessons/[lessonId]/route.ts:29-34` (PATCH handler)
- Modify: `src/components/admin/program/LessonEditorPanel.tsx:101-114` (`patchLesson`)

**Interfaces:**
- Consumes: `diffLessonFileIds` and `trashDriveFiles` from Tasks 2-3
- Produces: `updateLesson`'s `MutationResult` now sets `warning` (the field already exists on the type from the reorder work — no type change needed here)

- [ ] **Step 1: Update `updateLesson`** (`src/lib/data/admin-lms.ts`)

Add this import alongside the ones added in Task 4:

```typescript
import { diffLessonFileIds } from "@/lib/validations/drive-cleanup";
```

Replace the body of `updateLesson` (lines 629-648):

```typescript
export async function updateLesson(lessonId: string, input: UpdateLessonInput): Promise<MutationResult> {
  const admin = createAdminSupabase();

  const { data: existing } = await admin
    .from("lessons")
    .select("pdf_file_id, documents")
    .eq("id", lessonId)
    .maybeSingle();

  const patch: Database["public"]["Tables"]["lessons"]["Update"] = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.contentType !== undefined) patch.content_type = input.contentType;
  if (input.videoUrl !== undefined) patch.video_url = input.videoUrl || null;
  if (input.textContent !== undefined) patch.text_content = sanitizeLessonHtml(input.textContent);
  if (input.resources !== undefined) {
    patch.resource_urls = input.resources as unknown as Database["public"]["Tables"]["lessons"]["Update"]["resource_urls"];
  }
  if (input.pdfFileId !== undefined) patch.pdf_file_id = input.pdfFileId;
  if (input.documents !== undefined) {
    patch.documents = input.documents as unknown as Database["public"]["Tables"]["lessons"]["Update"]["documents"];
  }

  const { data, error } = await admin.from("lessons").update(patch).eq("id", lessonId).select("id").maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (!data) return { ok: false, reason: "not-found" };

  const warning = existing
    ? await trashDriveFiles(
        diffLessonFileIds(
          {
            pdfFileId: existing.pdf_file_id,
            documents: (existing.documents as unknown as LessonDocument[]) ?? [],
          },
          { pdfFileId: input.pdfFileId, documents: input.documents },
        ),
      )
    : null;

  return { ok: true, id: data.id, warning };
}
```

- [ ] **Step 2: Pass the warning through the API route** (`src/app/api/admin/lessons/[lessonId]/route.ts`)

Replace line 34 (`return NextResponse.json({ ok: true });` inside `PATCH`):

```typescript
  return NextResponse.json({ ok: true, warning: result.warning ?? null });
```

- [ ] **Step 3: Toast it** (`src/components/admin/program/LessonEditorPanel.tsx`)

Replace the body of `patchLesson` (lines 101-114):

```typescript
  async function patchLesson(patch: Record<string, unknown>): Promise<boolean> {
    if (!lesson) return false;
    const res = await fetch(`/api/admin/lessons/${lesson.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      toast.error("Could not save.");
      return false;
    }
    const payload = (await res.json().catch(() => null)) as { warning?: string | null } | null;
    if (payload?.warning) toast.warning(payload.warning);
    setLastSaved(new Date());
    return true;
  }
```

- [ ] **Step 4: Typecheck and lint**

```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/next lint
```

Expected: no errors.

- [ ] **Step 5: Manual verification**

Open a lesson in the Curriculum Builder, upload a PDF, then upload a different PDF to replace it. Confirm no error toast appears and the lesson editor still shows "Saved" behavior as before.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/admin-lms.ts src/app/api/admin/lessons/[lessonId]/route.ts src/components/admin/program/LessonEditorPanel.tsx
git commit -m "feat: trash replaced lesson PDFs/documents in Drive on save"
```

---

### Task 6: Wire course delete cascade

**Files:**
- Modify: `src/lib/data/admin-lms.ts:344-369` (`DeleteCourseResult`, `deleteCourse`)
- Modify: `src/app/api/admin/courses/[id]/route.ts:54` (DELETE handler)
- Modify: `src/components/admin/program/ProgramConfigForm.tsx:121-123` (`confirmDelete`)

**Interfaces:**
- Consumes: `extractDriveFileId`, `collectLessonFileIds` (Task 2), `trashDriveFiles` (Task 3)
- Produces: `DeleteCourseResult`'s `ok: true` case now carries `warning: string | null`

- [ ] **Step 1: Update `DeleteCourseResult` and `deleteCourse`** (`src/lib/data/admin-lms.ts`)

Tasks 4 and 5 already added imports from `@/lib/validations/drive-cleanup` (`diffCourseImageFileIds`, `diffLessonFileIds`) and from `@/lib/data/drive-cleanup` (`trashDriveFiles`). Add `extractDriveFileId` and `collectLessonFileIds` to that same existing `@/lib/validations/drive-cleanup` import line — don't add a second, separate import statement for the same module:

```typescript
import {
  diffCourseImageFileIds,
  diffLessonFileIds,
  extractDriveFileId,
  collectLessonFileIds,
} from "@/lib/validations/drive-cleanup";
```

Replace `DeleteCourseResult` (lines 344-346):

```typescript
export type DeleteCourseResult =
  | { ok: true; warning: string | null }
  | { ok: false; reason: "not-found" | "has-enrollments" | "db-error"; enrollmentCount?: number };
```

Replace the body of `deleteCourse` (lines 354-369):

```typescript
export async function deleteCourse(id: string): Promise<DeleteCourseResult> {
  const admin = createAdminSupabase();

  const { count } = await admin
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("course_id", id);
  if ((count ?? 0) > 0) {
    return { ok: false, reason: "has-enrollments", enrollmentCount: count ?? 0 };
  }

  const { data: course } = await admin
    .from("courses")
    .select("thumbnail_url, banner_url, mentor_avatar_url")
    .eq("id", id)
    .maybeSingle();

  const { data: modules } = await admin.from("modules").select("id").eq("course_id", id);
  const moduleIds = (modules ?? []).map((m) => m.id);
  let lessons: Array<{ pdf_file_id: string | null; documents: unknown }> = [];
  if (moduleIds.length > 0) {
    const { data } = await admin.from("lessons").select("pdf_file_id, documents").in("module_id", moduleIds);
    lessons = data ?? [];
  }

  const { data, error } = await admin.from("courses").delete().eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (!data) return { ok: false, reason: "not-found" };

  const fileIdsToTrash = [
    ...(course
      ? [course.thumbnail_url, course.banner_url, course.mentor_avatar_url]
          .map((url) => extractDriveFileId(url))
          .filter((id): id is string => id !== null)
      : []),
    ...collectLessonFileIds(
      lessons.map((l) => ({
        pdfFileId: l.pdf_file_id,
        documents: (l.documents as unknown as Array<{ fileId: string }>) ?? [],
      })),
    ),
  ];
  const warning = await trashDriveFiles(fileIdsToTrash);

  return { ok: true, warning };
}
```

- [ ] **Step 2: Pass the warning through the API route** (`src/app/api/admin/courses/[id]/route.ts`)

Replace line 54 (`return NextResponse.json({ ok: true });` inside `DELETE`):

```typescript
  return NextResponse.json({ ok: true, warning: result.warning });
```

- [ ] **Step 3: Toast it** (`src/components/admin/program/ProgramConfigForm.tsx`)

Replace lines 121-123 (inside `confirmDelete`):

```typescript
      const payload = (await res.json().catch(() => null)) as { warning?: string | null } | null;
      if (payload?.warning) toast.warning(payload.warning);
      toast.success("Program deleted.");
      router.push("/dashboard/admin/courses");
```

- [ ] **Step 4: Typecheck and lint**

```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/next lint
```

Expected: no errors.

- [ ] **Step 5: Manual verification**

Create a throwaway draft program (same steps as the smoke-test checklist earlier this session: New Program → title → type → Create Draft), then delete it. Confirm "Program deleted." toast, no error, and it disappears from the Programs list — same behavior as before, now with cascade-collection running underneath (a fresh draft has no images/lessons, so no warning is expected here; this only proves the new code path doesn't break the existing delete).

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/admin-lms.ts src/app/api/admin/courses/[id]/route.ts src/components/admin/program/ProgramConfigForm.tsx
git commit -m "feat: trash a deleted program's images and lesson files in Drive"
```

---

### Task 7: Wire module delete cascade + shared delete-toast wiring

**Files:**
- Modify: `src/lib/data/admin-lms.ts:567-587` (`deleteModule`)
- Modify: `src/app/api/admin/modules/[moduleId]/route.ts:63` (DELETE handler)
- Modify: `src/components/admin/program/CurriculumMap.tsx:183-213` (`confirmDelete`)

**Interfaces:**
- Consumes: `collectLessonFileIds` (Task 2), `trashDriveFiles` (Task 3)
- Produces: `deleteModule`'s `MutationResult` now sets `warning` on success. `CurriculumMap.tsx`'s `confirmDelete` toast wiring added here covers Task 8's `deleteLesson` warning too — Task 8 does not need to touch this component again.

- [ ] **Step 1: Update `deleteModule`** (`src/lib/data/admin-lms.ts`)

Replace the body of `deleteModule` (lines 567-587):

```typescript
export async function deleteModule(moduleId: string, confirm = false): Promise<MutationResult> {
  const admin = createAdminSupabase();

  const { data: mod } = await admin.from("modules").select("id, course_id").eq("id", moduleId).maybeSingle();
  if (!mod) return { ok: false, reason: "not-found" };

  const { data: lessons } = await admin.from("lessons").select("id, pdf_file_id, documents").eq("module_id", moduleId);
  const lessonIds = (lessons ?? []).map((l) => l.id);
  const recordCount = await countStudentRecords(lessonIds);

  if (recordCount > 0) {
    if (await isPublishedWithActiveEnrollments(mod.course_id)) {
      return { ok: false, reason: "blocked-published-active", recordCount };
    }
    if (!confirm) return { ok: false, reason: "needs-confirmation", recordCount };
  }

  const { error } = await admin.from("modules").delete().eq("id", moduleId);
  if (error) return { ok: false, reason: "db-error" };

  const warning = await trashDriveFiles(
    collectLessonFileIds(
      (lessons ?? []).map((l) => ({
        pdfFileId: l.pdf_file_id,
        documents: (l.documents as unknown as Array<{ fileId: string }>) ?? [],
      })),
    ),
  );

  return { ok: true, id: moduleId, warning };
}
```

- [ ] **Step 2: Pass the warning through the API route** (`src/app/api/admin/modules/[moduleId]/route.ts`)

Replace line 63 (`return NextResponse.json({ ok: true });` inside `DELETE`):

```typescript
  return NextResponse.json({ ok: true, warning: result.warning ?? null });
```

- [ ] **Step 3: Toast it in the shared delete handler** (`src/components/admin/program/CurriculumMap.tsx`)

Replace lines 208-212 (the success tail of `confirmDelete`, after the `if (!res.ok)` block):

```typescript
    const payload = (await res.json().catch(() => null)) as { warning?: string | null } | null;
    if (payload?.warning) toast.warning(payload.warning);
    toast.success(deleteTarget.kind === "module" ? "Module deleted." : "Session deleted.");
    setDeleteTarget(null);
    setDeleteWarning(null);
    router.refresh();
```

This same block runs for both module and lesson deletes (the `path` variable branches earlier in the function at line 186-187), so Task 8's `deleteLesson` warning is already covered by this wiring — no further frontend change needed there.

- [ ] **Step 4: Typecheck and lint**

```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/next lint
```

Expected: no errors.

- [ ] **Step 5: Manual verification**

On a course with a module that has no student records (e.g. a throwaway test course), delete a module. Confirm "Module deleted." toast, no error.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/admin-lms.ts src/app/api/admin/modules/[moduleId]/route.ts src/components/admin/program/CurriculumMap.tsx
git commit -m "feat: trash a deleted module's lesson files in Drive"
```

---

### Task 8: Wire lesson delete cascade

**Files:**
- Modify: `src/lib/data/admin-lms.ts:650-673` (`deleteLesson`)
- Modify: `src/app/api/admin/lessons/[lessonId]/route.ts:70` (DELETE handler)

**Interfaces:**
- Consumes: `trashDriveFiles` (Task 3); no new pure helper needed — a single lesson's own fileIds are just `[pdf_file_id, ...documents.map(d => d.fileId)]` filtered for null, not worth a dedicated function
- Produces: `deleteLesson`'s `MutationResult` now sets `warning` on success. Frontend toast already wired in Task 7.

- [ ] **Step 1: Update `deleteLesson`** (`src/lib/data/admin-lms.ts`)

Replace the body of `deleteLesson` (lines 650-673):

```typescript
export async function deleteLesson(lessonId: string, confirm = false): Promise<MutationResult> {
  const admin = createAdminSupabase();

  const { data: lesson } = await admin
    .from("lessons")
    .select("id, module_id, pdf_file_id, documents, modules!lessons_module_id_fkey(course_id)")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson) return { ok: false, reason: "not-found" };

  const courseId = (lesson as unknown as { modules: { course_id: string } | null }).modules?.course_id;
  const recordCount = await countStudentRecords([lessonId]);

  if (recordCount > 0) {
    if (courseId && (await isPublishedWithActiveEnrollments(courseId))) {
      return { ok: false, reason: "blocked-published-active", recordCount };
    }
    if (!confirm) return { ok: false, reason: "needs-confirmation", recordCount };
  }

  const { error } = await admin.from("lessons").delete().eq("id", lessonId);
  if (error) return { ok: false, reason: "db-error" };

  const documents = (lesson.documents as unknown as Array<{ fileId: string }>) ?? [];
  const fileIdsToTrash = [lesson.pdf_file_id, ...documents.map((d) => d.fileId)].filter(
    (id): id is string => !!id,
  );
  const warning = await trashDriveFiles(fileIdsToTrash);

  return { ok: true, id: lessonId, warning };
}
```

- [ ] **Step 2: Pass the warning through the API route** (`src/app/api/admin/lessons/[lessonId]/route.ts`)

Replace line 70 (`return NextResponse.json({ ok: true });` inside `DELETE`):

```typescript
  return NextResponse.json({ ok: true, warning: result.warning ?? null });
```

- [ ] **Step 3: Typecheck and lint**

```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/next lint
```

Expected: no errors.

- [ ] **Step 4: Run the full test suite**

```bash
node_modules/.bin/vitest run
```

Expected: every test passes, including the new `tests/drive-cleanup.test.ts` cases.

- [ ] **Step 5: Manual verification**

Delete a single lesson from a throwaway test course (no student records). Confirm "Session deleted." toast, no error — reuses Task 7's toast wiring.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/admin-lms.ts src/app/api/admin/lessons/[lessonId]/route.ts
git commit -m "feat: trash a deleted lesson's PDF/documents in Drive"
```

---

### Task 9: End-to-end verification against the live GAS relay

**Files:** none (verification only)

**Interfaces:** none — this task proves Tasks 1-8 work together against the real external service, not mocks.

- [ ] **Step 1: Real upload-then-trash round trip**

With the dev server running and logged in as admin, open a throwaway/test program's Configuration page. Upload a real image as the thumbnail (this hits the live GAS relay and creates a real Drive file, same as verified earlier this session for MDC). Note the fileId from the resulting URL. Click Save. Then upload a *different* image over it, and Save again.

- [ ] **Step 2: Confirm the old file is actually trashed**

Query the old fileId directly against the relay to confirm it's gone from the active folder:

```bash
curl -s -X POST "$GAS_WEBAPP_URL" -H "Content-Type: application/json" \
  -d '{"action":"trashFile","secret":"'"$GAS_SHARED_SECRET"'","fileId":"<old-fileId-from-step-1>"}'
```

Expected: `{"ok":true}` (trashing an already-trashed file is idempotent success, confirming the first trash call from Step 1 already succeeded — if it had NOT been trashed yet, this second call trashes it now and still returns `{"ok":true}`, so also spot-check in the Drive UI's "Course Images" folder that the old file is genuinely absent from the live folder, not just technically trashable).

- [ ] **Step 3: Full verification suite**

```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run
node_modules/.bin/next lint
```

Expected: all three clean.

- [ ] **Step 4: Clean up test artifacts**

Revert the throwaway program's Configuration fields back to empty (or delete the throwaway program entirely, per the same pattern used in the smoke-test checklist earlier this session), so no test data survives in the live database or Drive folders.
