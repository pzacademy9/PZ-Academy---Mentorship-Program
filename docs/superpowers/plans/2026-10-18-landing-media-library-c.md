# Landing media library (C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared picture library for the landing page builder: upload, search, folders, picker in every image field, and delete blocked while a page uses the picture.

**Architecture:** Files stay in Google Drive via the existing upload route and GAS bridge. A new service-role table `landing_media` holds the records. A data module and admin routes mirror the WhatsApp-numbers feature (0071). A picker dialog plugs into `LandingImageField`, and an admin "Media Library" page uses the same data.

**Tech Stack:** Next.js 14 App Router, Supabase (service role via `createAdminSupabase`), vitest, existing `Dialog`, `ConfirmDialog`, `Button`, `ChipTabs` UI parts.

**Spec:** `docs/superpowers/specs/2026-10-18-landing-media-library-c-design.md` (parent: `2026-10-16-landing-builder-easy-mode-design.md` section C). Branch `landing-media-library`, cut from `landing-hero`.

## Global Constraints

- `npm run` is broken. Type check: `node node_modules/typescript/bin/tsc --noEmit` (baseline 0, ignore `.next/types` noise). Tests: `node node_modules/vitest/vitest.mjs run tests/<file>`. Known failing: `tests/pz-tokens.test.ts`.
- Never regenerate `src/lib/supabase/database.types.ts`; hand-add the `landing_media` entry next to `landing_whatsapp_numbers`.
- Migration `0072_landing_media.sql` is written but NOT applied by an agent. The owner pastes it (Supabase MCP is read-only).
- Table is service role only: RLS on, zero policies, as in 0067/0070/0071. Nothing in the browser touches it.
- Every `/api/admin/*` route calls `requireAdmin()` itself. All permission checks for the library go through one helper `canManageMedia` so a new role can be allowed later.
- Drive images display through `coverProxyUrl` / `LandingImage` (`/api/cover/[fileId]`). Never use `uc?export=view`.
- Upload limits stay as in `/api/admin/uploads/image`: 5 MB, JPEG/PNG/WEBP/GIF. Images are shrunk first with `compressImage`.
- Visible words: "picture", "folder", "Choose from library", "Upload new", "Used by". Never "asset", "media record", "orphan", "resolve", "schema".
- Folders are exactly `heroes`, `instructors`, `misc` (shown as Heroes, Instructors, Misc). Default `misc`.
- Delete removes only the library entry; the Drive file stays.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. New commits only, never amend.
- Do not touch the untracked `docs/lead-capture-go-live-guide.md`.

## Review Focus

- Same picture uploaded twice: second upload must not create a duplicate row (unique on Drive file id) and the picker still selects it.
- Picture used only in a link's own edits (variant draft or published), not on the main page: delete is still blocked and the page name is shown.
- Picture whose stored URL is a hand-pasted non-Drive link or has no file id: never matches, never crashes the usage scan.
- Upload succeeds on Drive but saving the library record fails: the field still gets the picture and the page keeps working; the person sees a plain note that it was not added to the library.
- Image with no readable size (broken file): record saved with null width, height and orientation; picker must still list it and never tag it "Fits computers" or "Fits phones" (task 4 test).
- Very long name or empty rename: rejected with a plain message, row unchanged.

---

## File Structure

- Create `supabase/migrations/0072_landing_media.sql`: table `landing_media`.
- Modify `src/lib/supabase/database.types.ts`: hand-add `landing_media`.
- Create `src/lib/landing/media.ts`: pure helpers (folders, orientation, fit, file id, name rules, `canManageMedia`).
- Create `src/lib/data/landing-media.ts`: list, add, update, delete, usage scan. Server only.
- Create `src/app/api/admin/landing-media/route.ts` (GET, POST) and `[id]/route.ts` (PATCH, DELETE).
- Modify `src/app/api/admin/uploads/image/route.ts`: also return `fileId`.
- Create `src/components/admin/landing/MediaPicker.tsx`: pop-up picker.
- Create `src/components/admin/landing/media-client.ts`: browser helpers (`readImageSize`, `uploadToLibrary`).
- Modify `src/components/admin/landing/LandingImageField.tsx` and `FieldInput.tsx`: buttons, hero hint.
- Create `src/app/dashboard/admin/landing-media/page.tsx`, `loading.tsx` and `src/components/admin/landing/MediaLibrary.tsx`.
- Modify `src/components/dashboard/nav.ts`: "Media Library" entry.

---

### Task 1: Table, types and pure helpers

**Files:**
- Create: `supabase/migrations/0072_landing_media.sql`
- Modify: `src/lib/supabase/database.types.ts` (add `landing_media` Row/Insert/Update/Relationships after `landing_whatsapp_numbers`)
- Create: `src/lib/landing/media.ts`
- Test: `tests/landing-media.test.ts`

**Interfaces:**
- Produces (`src/lib/landing/media.ts`):
  - `type MediaFolder = "heroes" | "instructors" | "misc"`; `MEDIA_FOLDERS: readonly { key: MediaFolder; label: string }[]`.
  - `type MediaOrientation = "wide" | "tall" | "square"`.
  - `orientationOf(width: number | null, height: number | null): MediaOrientation | null`: `wide` when ratio w/h >= 1.2, `tall` when <= 0.83, else `square`; null if either is missing or <= 0.
  - `fitFor(o: MediaOrientation | null, want: "wide" | "tall"): "fits" | "other" | "unknown"`.
  - `fileIdFromUrl(url: string | null | undefined): string | null` (same patterns as `coverProxyUrl`: `id=` query or `/d/<id>`; ids match `[A-Za-z0-9_-]{10,}`).
  - `cleanMediaName(raw: string): { ok: true; name: string } | { ok: false }` (trimmed, 1 to 80 chars).
  - `canManageMedia(role: Role | null | undefined): boolean` (delegates to `isAdminRole`).
- Table columns: `id uuid pk default gen_random_uuid()`, `drive_file_id text not null unique`, `url text not null`, `name text not null check (char_length between 1 and 80)`, `folder text not null default 'misc' check (folder in ('heroes','instructors','misc'))`, `width int`, `height int`, `orientation text check (orientation in ('wide','tall','square'))`, `size_bytes int`, `created_by uuid references profiles(id) on delete set null`, `created_at timestamptz default now()`, index on `(folder, created_at desc)`. RLS enabled, no policies. Header comment in the style of 0071.

- [ ] **Step 1: Write the failing tests** in `tests/landing-media.test.ts`: `orientationOf(1600,900)` is `wide`; `(900,1600)` is `tall`; `(1000,1000)` is `square`; `(0,10)` and `(null,5)` are `null`; `fitFor("wide","wide")` is `fits`, `fitFor("tall","wide")` is `other`, `fitFor(null,"tall")` is `unknown`; `fileIdFromUrl("https://drive.google.com/thumbnail?id=ABCDEFGHIJ1&sz=w1600")` is `ABCDEFGHIJ1`; `fileIdFromUrl("https://example.com/a.jpg")` is `null`; `fileIdFromUrl("")` and `undefined` are `null`; `cleanMediaName("  Dr Sara  ")` gives `Dr Sara`; `cleanMediaName("   ")` and an 81-char name are `{ ok: false }`; `canManageMedia("admin")` true, `("student")` false, `(null)` false.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/landing-media.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the helpers above in `src/lib/landing/media.ts`.
- [ ] **Step 4: Write the migration and the hand-added types.** Run tsc. Expected: 0 errors.
- [ ] **Step 5: Run** the test again. Expected: PASS.
- [ ] **Step 6: Commit** `feat(landing-media): table and helpers`.

---

### Task 2: Data layer with usage scan

**Files:**
- Create: `src/lib/data/landing-media.ts`
- Test: `tests/landing-media-data.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers; `createAdminSupabase`.
- Produces (all `import "server-only"`):
  - `type MediaItem = { id: string; driveFileId: string; url: string; name: string; folder: MediaFolder; width: number | null; height: number | null; orientation: MediaOrientation | null; sizeBytes: number | null; createdAt: string }`.
  - `listMedia(opts?: { q?: string; folder?: MediaFolder }): Promise<MediaItem[]>`: newest first; `q` matches name case-insensitively (escape `%` and `_`). Throws on read error.
  - `addMedia(input: { url: string; name: string; folder?: MediaFolder; width?: number | null; height?: number | null; sizeBytes?: number | null }, userId: string): Promise<{ ok: true; item: MediaItem; existing: boolean } | { ok: false; reason: "invalid" | "error" }>`: file id from `fileIdFromUrl(url)`, orientation from `orientationOf`; when the file id already exists returns that row with `existing: true` and changes nothing.
  - `updateMedia(id: string, patch: { name?: string; folder?: MediaFolder }): Promise<{ ok: true; item: MediaItem } | { ok: false; reason: "invalid" | "not-found" | "error" }>`.
  - `findMediaUsage(driveFileId: string): Promise<{ id: string; title: string; slug: string }[]>`: pages whose `draft`, `published`, or any of their variants' `draft`/`published` JSON text contains the file id. Read pages and variants with the admin client and scan serialized JSON in code. Each page listed once. Throws on read error.
  - `deleteMedia(id: string): Promise<{ ok: true } | { ok: false; reason: "in-use"; pages: { id: string; title: string; slug: string }[] } | { ok: false; reason: "not-found" | "error" }>`: runs `findMediaUsage` first; a failed scan counts as `error` and deletes nothing.

- [ ] **Step 1: Write failing tests** with a hand-rolled supabase mock like `tests/landing-data.test.ts`. Cases: `addMedia` with a non-Drive url returns `invalid`; duplicate file id returns `existing: true` without insert; `listMedia({ q: "50%" })` escapes the wildcard; `findMediaUsage` finds an id that is only inside a variant's published JSON and lists that page once even if it also appears in draft; ignores an id that appears nowhere; `deleteMedia` returns `in-use` with page names and does not delete; returns `error` and does not delete when the scan read fails; deletes when unused.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement** the functions above in `src/lib/data/landing-media.ts`.
- [ ] **Step 4: Run it plus tsc.** Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `feat(landing-media): data layer and usage scan`.

---

### Task 3: Admin routes and upload route fileId

**Files:**
- Create: `src/app/api/admin/landing-media/route.ts` (GET, POST), `src/app/api/admin/landing-media/[id]/route.ts` (PATCH, DELETE)
- Modify: `src/app/api/admin/uploads/image/route.ts`
- Test: `tests/landing-media-routes.test.ts`

**Interfaces:**
- Consumes: Task 2 data functions; `requireAdmin`; `canManageMedia` is checked against the profile role through a small `requireMediaManager()` in the routes file area (reuse `requireAdmin`; keep the call to `canManageMedia` in one place).
- Produces:
  - `GET /api/admin/landing-media?q=&folder=` returns `{ items: MediaItem[] }`; 500 `{ error }` on failure.
  - `POST` body `{ url, name, folder?, width?, height?, sizeBytes? }` returns 201 `{ item, existing }`; 400 for invalid; 500 otherwise.
  - `PATCH /[id]` body `{ name?, folder? }` returns `{ item }`; 400, 404.
  - `DELETE /[id]` returns `{ ok: true }`; 409 `{ error: "This picture is used by: <titles>", pages }` when in use; 404; 500.
  - Upload route response becomes `{ url, fileId }` (additive; existing callers read only `url`). `fileId` comes from the GAS response (`json.fileId`).

- [ ] **Step 1: Write failing tests** like `tests/landing-whatsapp-routes.test.ts`: all four handlers answer the gate's 403 and touch no data; GET passes `q` and a valid `folder` and ignores an unknown folder; POST rejects a missing url with 400; DELETE in-use returns 409 with the page titles in the message; upload route test (mock global `fetch` returning `{ ok: true, url, fileId }`) returns both.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement** the routes. Error texts are plain ("Could not load the pictures", "This picture is used by: X, Y. Remove it from those pages first.").
- [ ] **Step 4: Run it plus tsc.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(landing-media): admin routes, upload returns file id`.

---

### Task 4: Picker pop-up and field wiring

**Files:**
- Create: `src/components/admin/landing/media-client.ts`, `src/components/admin/landing/MediaPicker.tsx`
- Modify: `src/components/admin/landing/LandingImageField.tsx`, `src/components/admin/landing/FieldInput.tsx`
- Test: `tests/landing-media-picker.test.tsx`

**Interfaces:**
- Consumes: Task 3 routes; `compressImage`; `ImageUploadField` (unchanged).
- Produces:
  - `readImageSize(file: File): Promise<{ width: number; height: number } | null>` (via `createImageBitmap` or `Image`; null on failure).
  - `registerUpload(args: { url: string; name: string; width: number | null; height: number | null; sizeBytes: number | null }): Promise<boolean>`: POST to `/api/admin/landing-media`; false on any failure, never throws.
  - `<MediaPicker open onClose onPick={(url: string) => void} want?: "wide" | "tall" />`: loads `GET /api/admin/landing-media`, search box, folder tabs All/Heroes/Instructors/Misc, picture grid through `coverProxyUrl`, fit tag "Fits computers" / "Fits phones" only when `want` is set and `fitFor` is `fits`, matching shapes listed first, empty state "No pictures yet. Use Upload new to add one."
  - `LandingImageField` new optional prop `want?: "wide" | "tall"`; shows a "Choose from library" button beside the existing Upload; picking sets the value through the latest `onChange`. The existing capture-phase compress step stays. After a successful upload (the field's value changes to a new Drive url while an upload was in flight) it calls `registerUpload`; on false shows a plain note "Added to the page, but not saved to the library." The field must keep working with the library routes unreachable.
  - `FieldInput` passes `want` = `"wide"` for key `imagePc`, `"tall"` for key `imagePhone`, none otherwise.

- [ ] **Step 1: Write failing tests** (jsdom, mock `fetch`): picker lists items and filters by typed search; folder tab refetches with `folder=heroes`; with `want="wide"` a wide item sorts before a tall one and carries the "Fits computers" tag, a tall item does not; picking calls `onPick` with the item url and closes; empty list shows the empty text; fetch failure shows "Could not load the pictures" and a retry button; `LandingImageField` still renders its Upload button and text box when the library fetch rejects; a hand-typed link calls `onChange` and never calls `registerUpload`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement** the files above. Use the existing `Dialog` component and brand tokens used by neighbouring editor components.
- [ ] **Step 4: Run** the new test, `tests/landing-hero-editor.test.tsx`, `tests/landing-admin-ui.test.tsx`, then tsc. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `feat(landing-media): picture picker in image fields`.

---

### Task 5: Media Library page and sidebar entry

**Files:**
- Create: `src/app/dashboard/admin/landing-media/page.tsx`, `loading.tsx`, `src/components/admin/landing/MediaLibrary.tsx`
- Modify: `src/components/dashboard/nav.ts`
- Test: `tests/landing-media-library.test.tsx`

**Interfaces:**
- Consumes: Task 2 `listMedia`, Task 3 routes, `requireAdminPage`, `ConfirmDialog`, `registerUpload`, `readImageSize`, `compressImage`, `ImageUploadField` or a plain file input posting to `/api/admin/uploads/image`.
- Produces: page `/dashboard/admin/landing-media` (server page gated by `requireAdminPage`, passes initial items to the client); `MediaLibrary` client component with search, folder tabs, upload button (shrink, upload, register), per-picture rename, move to folder, delete with confirm; a blocked delete shows the 409 message ("Used by: ..."). Nav entry `{ label: "Media Library", shortLabel: "Media", href: "/dashboard/admin/landing-media", icon: <existing lucide icon>, roles: ["admin","super_admin"] }` placed right after "Landing Pages". Check any nav test that counts items and update it.

- [ ] **Step 1: Write failing tests**: renders initial pictures; search narrows; rename sends PATCH and updates the name; empty rename is refused with a message and sends nothing; delete asks to confirm, then on 409 shows "Used by: <page title>" and keeps the picture; successful delete removes it; nav contains "Media Library" for admin and not for student.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement** page, loading skeleton (copy the pattern from `landing-pages/loading.tsx`) and component.
- [ ] **Step 4: Run** the new test, any nav tests, then tsc and `tests/landing-*.test.*`. Expected: PASS (only `pz-tokens` may fail, known).
- [ ] **Step 5: Commit** `feat(landing-media): media library page`.

---

### Task 6: Browser check and handoff (controller with a verifier subagent)

**Files:** none (notes go in the gitignored ledger `.superpowers/sdd/2026-10-18-landing-media-c/progress.md`).

- [ ] **Step 1:** The owner pastes `0072_landing_media.sql` into Supabase and says so.
- [ ] **Step 2:** Start dev server `node node_modules/next/dist/bin/next dev -p 3945` (no `next build` while it runs). Log in as the admin test account.
- [ ] **Step 3:** Verify at 1280 and 390 wide: upload a hero picture on the `test` page (it lands in the library with a size and orientation); open the picker from another image field and pick it; hero PC field shows the "Fits computers" tag on wide pictures; Media Library page rename, move, search; delete a picture used by `test` is blocked with the page name; delete an unused one works; hand-typed link still works.
- [ ] **Step 4:** Update memory `pz-academy-landing-easy-mode-status.md` with C status. Push the branch only if the owner says yes.
