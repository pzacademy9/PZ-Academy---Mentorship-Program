# Feedback System Phase 2 — Viewing, Mentor Reviews, Covers, Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close six gaps the user identified after using the shipped native feedback system: no attractive place to view feedback, no mentor↔session linking or reviews on mentor profiles, no cover upload at creation time, no surfaced public share link, a broken social share image, and a handful of smaller improvements.

**Architecture:** Same conventions as the plan this extends (`2026-08-15-native-feedback-system.md`) — service-role data layer (`src/lib/data/feedback-*.ts`, `src/lib/data/mentor-reviews.ts`) behind route-handler auth gates, RLS-enabled-zero-policies tables, hand-edited `database.types.ts`. UI is extracted from Stitch mockups already generated and verified this session — see "Stitch source screens" below. **This plan's own Task 0 (Stitch prompts + the `CLAUDE.md` standing rule) is already complete** — do not redo it.

**Tech Stack:** Next.js App Router, Supabase (Postgres + service-role client), Zod, Vitest, `next/og` (already used, no new image lib), `qrcode` (new dependency — pure-JS QR PNG/SVG generator, zero native deps).

**Spec:** No separate spec doc — this plan file is authoritative, written directly from a verified codebase audit (see Global Constraints for what was independently confirmed against current source, not assumed).

## Stitch source screens (already generated, fetched, and verified this session)

Persisted at `docs/superpowers/stitch-screens/2026-08-17-feedback-phase-2/`:

| File | Stitch title | Used by |
|---|---|---|
| `A-new-session-modal.html` | "New Session Modal Redesign" | Task 3 |
| `B-session-detail.html` | "Admin: Feedback Session Detail" | Task 2, Task 4 |
| `C-share-modal.html` | "Share Review Page Modal" | Task 5 |
| `D-mentor-reviews.html` | "Mentor Profile: Reviews Section" | Task 4 |

All 4 verified clean: colors confined to a `<script id="tailwind-config">` block mapping Material-3 semantic names (`primary-container`, `on-surface-variant`, etc.) to hex — no raw hex or custom brand classes in `class=`/`style=` attributes, **except** two arbitrary-value `shadow-[0_0_15px_rgba(126,217,87,...)]` classes in `B-session-detail.html` (lines ~174, ~272) — replace both with a semantic-token shadow (e.g. `shadow-lg shadow-primary/20`) during extraction, don't port the raw rgba. `B-session-detail.html` also references `from-surface-lowest` (its hero gradient scrim) which **does not exist** in this repo's `tailwind.config.ts` color list (only `surface-container-lowest` and `surface-dim` do) — use `from-surface-dim` instead when extracting that gradient.

Known gaps in the static mocks to fill in during extraction (not defects to "fix" in Stitch — just things the implementer builds directly in React since a static mock can't demonstrate them):
- **A**: the cover dropzone only shows its filled/preview state — build the empty/upload state yourself (dashed border already present in the file; add a centered `add_photo_alternate` icon + "Drag a 16:9 cover image or click to upload" + "Recommended 1920×1080 · JPG or PNG · max 5 MB" hint, same token classes as the filled state). The mentor-link field is a static "already selected" mock — build the actual searchable combobox behavior (type to filter, click a result to select) yourself; the file only proves the selected-state visual.
- **B**: apply consistent eye/delete/chevron controls to every response row (the mock only fully demonstrates all three on one row) — this is exactly what Task 4 implements.

## Global Constraints

- Everything below was verified against the actual current source this session (file paths, function signatures, exact current behavior) — not inferred from the original plan or memory. Where this plan quotes existing code, treat the quote as ground truth over any conflicting assumption.
- Same security boundary as the original plan: `createAdminSupabase()` (service-role) + `requireAdmin()`/`requireMentor()`/`requireAdminPage()`/`requireMentorPage()` (`src/lib/auth/require-admin.ts`, `src/lib/auth/require-mentor.ts`) is the only auth boundary used — no `SECURITY DEFINER` RPC anywhere in this plan.
- New/altered tables follow the same RLS convention: `enable row level security` with **zero** policies. `mentors` already has RLS policies (public-read-published + admin-write) from `0028_mentor_registry.sql` — a new `show_reviews`/`is_featured`-reading query still goes through `createAdminSupabase()` from `src/lib/data/mentor-reviews.ts`, matching every other feedback-table read, since `feedback_responses`/`feedback_answers` themselves have zero policies and are unreadable by the anon client `src/lib/data/mentors.ts` uses.
- `database.types.ts` is hand-edited — no codegen script exists in this repo.
- Migrations start at `0035` (last is `0034_feedback_session_stats.sql`).
- `npm run <script>` is broken by the `&` in this workspace's path — call binaries directly (`./node_modules/.bin/vitest run`, `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/next lint`). This is now documented in `CLAUDE.md`.
- Test files live under top-level `tests/`, one file per module, pure-function style, no Supabase-client mocking (matches `tests/feedback-sessions.test.ts`'s convention).
- `tsc`, `vitest`, and `eslint` must stay clean after every task.
- Every Stitch-derived component must use this repo's `pz-*`-prefixed Tailwind classes (e.g. `bg-primary-container` in the Stitch source → `bg-pz-primary-container` in the ported component), matching `tailwind.config.ts:90`'s documented 1:1 port convention — never the Stitch file's raw class names directly, and never a hardcoded hex.
- `coverProxyUrl` currently exists as 2 independent copies (`SessionDetailClient.tsx:37`, `src/app/review/[token]/page.tsx:10`) with identical bodies:
  ```ts
  function coverProxyUrl(url: string): string {
    const m = url.match(/[?&]id=([A-Za-z0-9_-]+)/) ?? url.match(/\/d\/([A-Za-z0-9_-]+)/);
    return m ? `/api/cover/${m[1]}` : url;
  }
  ```
  Task 2 consolidates these into one shared module.

---

## File Structure

**Schema**
- `supabase/migrations/0035_feedback_review_visibility.sql` — new
- `src/lib/supabase/database.types.ts` — modified

**Data layer**
- `src/lib/mentorship/share-card-data.ts` — modified (native-first branch)
- `src/lib/data/feedback-sessions.ts` — modified (`setFeedbackSessionMentor`)
- `src/lib/data/feedback-programs.ts` — modified (`setFeedbackProgramCover`)
- `src/lib/data/feedback-responses.ts` — modified (`ResponseDetail.isPublic`/`isFeatured`, `setResponseVisibility`)
- `src/lib/data/mentor-reviews.ts` — new
- `src/lib/feedback/cover-url.ts` — new (consolidated `coverProxyUrl`)

**API routes**
- `src/app/api/admin/feedback/sessions/[id]/route.ts` — modified (PATCH accepts `mentorId`)
- `src/app/api/admin/feedback/sessions/[id]/responses/[responseId]/route.ts` — modified (add PATCH)
- `src/app/api/admin/feedback/programs/[id]/cover/route.ts` — new
- `src/app/api/admin/feedback/programs/[id]/share-token/route.ts` — new
- `src/app/api/admin/mentors/route.ts` — modified (add GET)

**UI**
- `src/app/dashboard/admin/feedback/NewSessionModal.tsx` — modified (cover uploader, mentor combobox)
- `src/app/dashboard/admin/feedback/[id]/SessionDetailClient.tsx` — modified (16:9 hero, mentor attribution, response visibility toggle, Share modal launch)
- `src/app/dashboard/admin/feedback/ShareReviewModal.tsx` — new
- `src/app/dashboard/admin/feedback/page.tsx` — modified (thumbnail column)
- `src/app/dashboard/admin/feedback/NewSessionModal.tsx`'s `ProgramRowActions` — modified (share action)
- `src/app/dashboard/mentor/feedback/page.tsx` — modified (thumbnail)
- `src/components/mentorship/MentorReviews.tsx` — new
- `src/components/mentorship/MentorProfileClient.tsx` — modified (mount `MentorReviews`)
- `src/components/admin/mentors/MentorConfigForm.tsx` — modified (`show_reviews` toggle)
- `src/components/ui/StarRating.tsx` — new (promoted shared component)

**Homepage / marketing**
- `src/app/page.tsx` — modified (real testimonial instead of hardcoded stars)
- `src/components/mentorship/HeroSection.tsx` — modified (drop hardcoded "4.9★")
- `src/components/mentorship/TrustBar.tsx` — modified (drop hardcoded "4.9★")
- `src/components/mentorship/MentorCard.tsx` — modified (real avg-rating line)

**Tests**
- `tests/share-card-data.test.ts` — new
- `tests/mentor-reviews.test.ts` — new

**Dependencies**
- `package.json` — add `qrcode` + `@types/qrcode`

---

### Task 1: Fix the social share card's native data source

No UI, no Stitch dependency. This is the highest-value, lowest-risk change in the plan.

**Files:**
- Modify: `src/lib/mentorship/share-card-data.ts`
- Create: `tests/share-card-data.test.ts`

**Interfaces:**
- Consumes: `getNativeShareView` from `src/lib/data/feedback-share.ts` (already exists, returns `ShareView | null` — see its exact current source below).
- Produces: `flattenShareView(view: ShareView): ShareCardData` (new, exported, pure function).

**Current file in full** (`src/lib/mentorship/share-card-data.ts`, 55 lines):

```ts
export interface ShareCardData {
  title:    string;
  avg:      number | null;
  count:    number;
  coverUrl: string | null;
}

export async function fetchShareCardData(token: string): Promise<ShareCardData | null> {
  const GAS_URL = process.env.MENTORSHIP_GAS_WEBAPP_URL ?? '';
  if (!GAS_URL) return null;
  try {
    const url = new URL(GAS_URL);
    url.searchParams.set('page',   'api');
    url.searchParams.set('action', 'shareview');
    url.searchParams.set('token',  token);
    const res  = await fetch(url.toString(), { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const json = await res.json() as { /* ... */ };
    if (!json.ok || !json.data) return null;
    const d = json.data;
    if (d.type === 'session' && d.session) {
      return { title: d.session.name, avg: d.session.avgRating, count: d.session.responseCount, coverUrl: d.session.coverUrl ?? null };
    }
    if (d.type === 'program' && d.program && d.sessions) {
      const rated = d.sessions.filter(s => s.avgRating != null);
      const avg = rated.length ? Math.round((rated.reduce((a, s) => a + (s.avgRating ?? 0), 0) / rated.length) * 10) / 10 : null;
      const count = d.sessions.reduce((a, s) => a + s.responseCount, 0);
      return { title: d.program.name, avg, count, coverUrl: d.program.coverUrl ?? null };
    }
    return null;
  } catch { return null; }
}
```

Note `ShareView`'s actual shape (`src/lib/mentorship/gas.ts`, unchanged): `{type:'session', session: ShareSession} | {type:'program', program: ShareProgram, sessions: ShareSession[]}`, where `ShareSession = {id, name, speaker, date, coverUrl, responseCount, avgRating: number|null, perQuestion, responses}` and `ShareProgram = {id, name, type, coverUrl}`.

- [ ] **Step 1: Extract the flattening logic into a pure, exported function**

Add to `share-card-data.ts`:

```ts
import type { ShareView } from "@/lib/mentorship/gas";

/**
 * Flattens either branch of ShareView into the flat shape the two og-image
 * generators (api/share-card/[token]/route.tsx, review/[token]/opengraph-image.tsx)
 * consume. Program avg is the mean of member sessions' own avgRating (skipping
 * unrated sessions), matching the pre-existing GAS-path arithmetic exactly —
 * do not change this formula, only relocate it.
 */
export function flattenShareView(view: ShareView): ShareCardData {
  if (view.type === "session") {
    return {
      title: view.session.name,
      avg: view.session.avgRating,
      count: view.session.responseCount,
      coverUrl: view.session.coverUrl || null,
    };
  }
  const rated = view.sessions.filter((s) => s.avgRating != null);
  const avg = rated.length
    ? Math.round((rated.reduce((a, s) => a + (s.avgRating ?? 0), 0) / rated.length) * 10) / 10
    : null;
  const count = view.sessions.reduce((a, s) => a + s.responseCount, 0);
  return { title: view.program.name, avg, count, coverUrl: view.program.coverUrl || null };
}
```

- [ ] **Step 2: Add the native-first branch to `fetchShareCardData`**

```ts
import { getNativeShareView } from "@/lib/data/feedback-share";

export async function fetchShareCardData(token: string): Promise<ShareCardData | null> {
  const native = await getNativeShareView(token);
  if (native) return flattenShareView(native);
  return fetchFromGas(token); // the existing function body, renamed, unchanged
}
```

Rename the current body of `fetchShareCardData` to a private `fetchFromGas(token: string)` — same GAS-only implementation, verbatim, just re-flatten its two return branches through `flattenShareView` too so there is exactly one flattening implementation (call `flattenShareView` with a locally-constructed `ShareView`-shaped object from the GAS JSON, or keep the GAS branch's inline flattening as-is and only require `flattenShareView` for the native branch — either is acceptable; prefer the single-implementation version if it doesn't complicate the GAS JSON's looser typing).

- [ ] **Step 3: Tests**

`tests/share-card-data.test.ts` — pure-function tests for `flattenShareView`, no network/DB:
- Session branch: `avgRating` and `responseCount` pass through unchanged; `coverUrl` empty string → `null`.
- Program branch with 3 sessions, one `avgRating: null` — confirm the null-rated session is excluded from the average (not treated as 0), and `count` sums all 3 sessions' `responseCount` including the unrated one.
- Program branch where every session is unrated → `avg: null`, `count` still sums real response counts.

- [ ] **Step 4: Verify**

Run `./node_modules/.bin/vitest run`, `./node_modules/.bin/tsc --noEmit`. Then live-verify against the real Supabase project: open an existing native session's `/review/{token}`, hit `/api/share-card/{token}` directly, confirm the PNG shows the real title/average/star-count/cover instead of the "Instructor Feedback / 0 feedbacks" placeholder. Also check `/review/{token}`'s link-preview metadata (the 1200×630 `opengraph-image.tsx`) picks up the same fix for free (it shares `fetchShareCardData`).

---

### Task 2: Cover images — upload at creation, program covers, consolidated proxy

**Files:**
- Create: `src/lib/feedback/cover-url.ts`
- Modify: `src/app/dashboard/admin/feedback/[id]/SessionDetailClient.tsx` (import shared proxy, remove local copy, extract Stitch hero)
- Modify: `src/app/review/[token]/page.tsx` (import shared proxy, remove local copy — behavior must stay byte-identical, this file is otherwise untouched per the original plan's constraint)
- Modify: `src/app/dashboard/admin/feedback/NewSessionModal.tsx` (cover dropzone)
- Modify: `src/lib/data/feedback-programs.ts` (`setFeedbackProgramCover`)
- Create: `src/app/api/admin/feedback/programs/[id]/cover/route.ts`
- Modify: `src/app/dashboard/admin/feedback/page.tsx` (thumbnail column)
- Modify: `src/app/dashboard/mentor/feedback/page.tsx` (thumbnail)

**Interfaces:**
- Produces: `coverProxyUrl(url: string): string` (moved, not renamed — same signature both call sites already use).
- Produces: `setFeedbackProgramCover(id: string, coverUrl: string | null, actorProfileId: string | null): Promise<void>` in `feedback-programs.ts`, mirroring `setFeedbackSessionCover` (`feedback-sessions.ts:241-246`) exactly — same `logFeedbackAudit` call shape with actions `"setCoverImage"`/`"removeCoverImage"`.
- Consumes: existing `POST/DELETE /api/admin/feedback/sessions/[id]/cover` (unchanged, reused as-is from the modal after creation).

- [ ] **Step 1: Consolidate `coverProxyUrl`**

`src/lib/feedback/cover-url.ts`:
```ts
/**
 * Rewrites a Drive-hosted cover URL through /api/cover/{fileId} so a browser
 * <img> doesn't hit Drive's thumbnail endpoint directly (Drive's CORP header
 * blocks hotlinked thumbnails). Was duplicated verbatim in SessionDetailClient.tsx
 * and review/[token]/page.tsx — this is the single shared copy.
 */
export function coverProxyUrl(url: string): string {
  const m = url.match(/[?&]id=([A-Za-z0-9_-]+)/) ?? url.match(/\/d\/([A-Za-z0-9_-]+)/);
  return m ? `/api/cover/${m[1]}` : url;
}
```
Delete the local copy in both `SessionDetailClient.tsx:37-40` and `review/[token]/page.tsx:10-14`, import from here instead. `review/[token]/page.tsx`'s `rewriteCoverUrls` function body must not otherwise change — the original plan's Task 14 explicitly froze this file's behavior for the GAS-fallback path.

- [ ] **Step 2: `setFeedbackProgramCover` + its route**

In `feedback-programs.ts`, add:
```ts
export async function setFeedbackProgramCover(id: string, coverUrl: string | null, actorProfileId: string | null): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("feedback_programs").update({ cover_url: coverUrl }).eq("id", id);
  if (error) throw new Error(error.message);
  await logFeedbackAudit({ action: coverUrl ? "setCoverImage" : "removeCoverImage", detail: id, actorProfileId });
}
```
`src/app/api/admin/feedback/programs/[id]/cover/route.ts` — copy `sessions/[id]/cover/route.ts`'s `POST`/`DELETE` verbatim structure (same `uploadFeedbackCover` call from `src/lib/gas/feedback-upload-client.ts`, same multipart handling), calling `setFeedbackProgramCover` instead of `setFeedbackSessionCover`.

- [ ] **Step 3: Cover uploader in `NewSessionModal.tsx`**

Extract the dropzone from `docs/superpowers/stitch-screens/2026-08-17-feedback-phase-2/A-new-session-modal.html`, building both states (empty upload prompt + filled preview — see "known gaps" above for the empty state, which the file doesn't show). Add to the modal's local state: `const [coverFile, setCoverFile] = useState<File | null>(null)` and a preview `URL.createObjectURL` object-url (revoked on change/unmount). Enforce 16:9 client-side: on file select, load into an `Image`, and if its aspect ratio isn't within a small tolerance of 16:9, center-crop it on an offscreen `<canvas>` to 16:9 before storing (canvas → `canvas.toBlob()` → `File`). Reuse the existing 5 MB guard pattern from the video-upload path in `FeedbackClient.tsx` (VideoStep) for consistency — same limit, same error message shape.

In `submit()`, after the existing session-creation `fetch` succeeds and returns `{id, slug}` (or, for a program, after the first created session's `id`), if `coverFile` is set, immediately `POST` it to `/api/admin/feedback/sessions/{id}/cover` (existing route, unchanged) as multipart `FormData` with key `cover` — exactly what `SessionDetailClient.tsx`'s `handleCoverChange` already does. Non-fatal on failure: toast a warning but still proceed to the success step (the session exists; a missing cover shouldn't block the whole flow).

Add the "Link to mentor" combobox in this same step — see Task 3, which specifies its wiring; this task only owns the cover uploader, but they land in the same file edit since both come from screen A.

- [ ] **Step 4: Display covers in list surfaces**

`src/app/dashboard/admin/feedback/page.tsx`: add a `w-12 h-8` (or similar small `aspect-[16/9]`) thumbnail before the session-name cell in the sessions table, using `coverProxyUrl(session.coverUrl)` when present, a muted placeholder icon otherwise. Same treatment for `src/app/dashboard/mentor/feedback/page.tsx`'s card rows.

Extract the 16:9 cover hero for the session detail page from `B-session-detail.html` (see the Global Constraints note on its two fixable defects: the `shadow-[...rgba...]` classes and the `from-surface-lowest` gradient stop). Use a real `<img>` with `object-cover` (not the mock's `background-image` div — the app's existing convention everywhere else is `<img>`), fixed `aspect-video` at all breakpoints (not the mock's `md:aspect-[21/9] lg:aspect-[3/1]` escalation — the prompt asked for 16:9 throughout and the app should stay consistent with that). Keep the existing "Change cover"/"Remove" hover affordance from `SessionDetailClient.tsx`'s current 80×80 thumbnail (upload-on-click, `X` to remove), just re-skinned onto the larger hero — same `fileInputRef`/`handleCoverChange`/`removeCover` handlers, no new upload endpoint.

- [ ] **Step 5: Verify**

`./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/vitest run`, `./node_modules/.bin/next lint`. Live: create a session with a 16:9 cover from the modal, confirm it appears in the admin list thumbnail, the detail hero, and (existing, unmodified) the feedback wizard intro and review-page hero. Upload a non-16:9 image and confirm the crop behaves.

---

### Task 3: Link sessions to mentors

**Files:**
- Modify: `src/app/dashboard/admin/feedback/NewSessionModal.tsx` (mentor combobox — same file as Task 2 Step 3)
- Modify: `src/lib/data/feedback-sessions.ts` (`setFeedbackSessionMentor`)
- Modify: `src/app/api/admin/feedback/sessions/[id]/route.ts` (PATCH schema)
- Modify: `src/app/api/admin/mentors/route.ts` (add GET)

**Interfaces:**
- Produces: `GET /api/admin/mentors` → `{mentors: {id: string; slug: string; name: string; title: string; photo: string; hasLinkedAccount: boolean}[]}`.
- Produces: `setFeedbackSessionMentor(id: string, mentorId: string | null, actorProfileId: string | null): Promise<void>`.
- No migration needed — `feedback_sessions.mentor_id → mentors(id)` and its index already exist (`0033_feedback_system.sql:29,39`); `CreateFeedbackSessionInput.mentorId` is already accepted by `createFeedbackSession` (`feedback-sessions.ts:173,211`).

- [ ] **Step 1: `GET /api/admin/mentors`**

`src/app/api/admin/mentors/route.ts` currently only exports `POST`. Add:
```ts
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const admin = createAdminSupabase(); // or reuse whatever client admin-mentors.ts's list function already uses
  const { data } = await admin
    .from("mentors")
    .select("id, slug, name, title, photo_url, profile_id")
    .order("order_index", { ascending: true });
  return NextResponse.json({
    mentors: (data ?? []).map((m) => ({
      id: m.id, slug: m.slug, name: m.name, title: m.title ?? "",
      photo: m.photo_url ?? "", hasLinkedAccount: m.profile_id != null,
    })),
  });
}
```
Check `src/lib/data/admin-mentors.ts` first for an existing list function to reuse instead of a raw query here — if one already selects this shape (or close to it), call that instead of duplicating the query.

- [ ] **Step 2: `setFeedbackSessionMentor` + PATCH route**

`feedback-sessions.ts`:
```ts
export async function setFeedbackSessionMentor(id: string, mentorId: string | null, actorProfileId: string | null): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("feedback_sessions").update({ mentor_id: mentorId }).eq("id", id);
  if (error) throw new Error(error.message);
  await logFeedbackAudit({ action: "setFeedbackSessionMentor", detail: `${id} -> ${mentorId ?? "none"}`, actorProfileId });
}
```
`src/app/api/admin/feedback/sessions/[id]/route.ts`'s `PATCH` currently only accepts `{status}` (`z.object({ status: z.enum(["active","closed"]) })`, line 6). Extend to:
```ts
const patchSchema = z.object({
  status: z.enum(["active", "closed"]).optional(),
  mentorId: z.string().uuid().nullable().optional(),
}).refine((v) => v.status !== undefined || v.mentorId !== undefined, { message: "No changes provided" });
```
In the handler, branch on which field(s) are present and call `setFeedbackSessionStatus`/`setFeedbackSessionMentor` accordingly (both, if both provided).

- [ ] **Step 3: Mentor combobox in `NewSessionModal.tsx`**

Extract from `A-new-session-modal.html`'s "Link to mentor" block (see Global Constraints — the file only shows a static selected state; build the interactive combobox yourself). Fetch `/api/admin/mentors` once on modal open (same lazy-load pattern already used for the question bank, `useEffect` gated on `open && bank === null`). Local state: `mentorQuery: string`, `selectedMentorId: string | null`, a filtered dropdown list matching `mentorQuery` against `name` (case-insensitive substring). Selecting a row sets `selectedMentorId` and closes the dropdown, showing the selected-state card from the Stitch file (avatar + name + title + clear button). If the selected mentor's `hasLinkedAccount` is `false`, show a small warning line beneath the field: **"No linked account — mentorship feedback won't auto-create for this mentor."** (this surfaces the pre-existing `freezeMentorshipFeedbackSession` silent-`console.warn` bail — see the original plan's ledger — as a visible admin-facing fact instead of a server log nobody reads).

Pass `mentorId: selectedMentorId` through to the existing `POST /api/admin/feedback/sessions` body (the create route/schema/`createFeedbackSession` call already accept `mentorId` end-to-end per the Interfaces note above — confirm this by reading `src/app/api/admin/feedback/sessions/route.ts`'s current zod schema before assuming; add `mentorId: z.string().uuid().nullable().optional()` there too if it's missing).

- [ ] **Step 4: Same warning badge on the mentor registry**

In `src/components/admin/mentors/MentorRegistryTable.tsx`, add a small badge/icon next to any mentor row where `profile_id == null`, tooltip "No linked account — mentorship feedback won't auto-create." Reuses the same fact Step 3 surfaces, now visible without opening the session-creation modal.

- [ ] **Step 5: Verify**

`tsc`/`vitest`/`lint` clean. Live: create a session, pick a mentor with a linked account via the combobox, confirm `feedback_sessions.mentor_id` is set and the session now appears on that mentor's `/dashboard/mentor/feedback` list (existing, unmodified — it already filters by `mentor_id`).

---

### Task 4: Reviews on mentor profiles, with admin visibility control

**Files:**
- Create: `supabase/migrations/0035_feedback_review_visibility.sql`
- Modify: `src/lib/supabase/database.types.ts`
- Modify: `src/lib/data/feedback-responses.ts` (`ResponseDetail.isPublic`/`isFeatured`, `setResponseVisibility`)
- Modify: `src/app/api/admin/feedback/sessions/[id]/responses/[responseId]/route.ts` (add PATCH)
- Create: `src/lib/data/mentor-reviews.ts`
- Create: `tests/mentor-reviews.test.ts`
- Modify: `src/app/dashboard/admin/feedback/[id]/SessionDetailClient.tsx` (eye/eye-off per response row, extracted from `B-session-detail.html`)
- Modify: `src/components/admin/mentors/MentorConfigForm.tsx` (`show_reviews` toggle)
- Create: `src/components/mentorship/MentorReviews.tsx`
- Modify: `src/components/mentorship/MentorProfileClient.tsx` (mount it)

**Interfaces:**
- Produces: `feedback_responses.is_public boolean not null default true`, `feedback_responses.is_featured boolean not null default false`, `mentors.show_reviews boolean not null default true`.
- Produces: `setResponseVisibility(responseId: string, sessionId: string, isPublic: boolean, actorProfileId: string | null): Promise<void>`.
- Produces: `getMentorReviewSummary(mentorId: string): Promise<{avg: number|null; count: number; distribution: Record<1|2|3|4|5, number>}>`.
- Produces: `listMentorReviews(mentorId: string, opts?: {limit?: number}): Promise<MentorReview[]>` where `MentorReview = {id: string; name: string; submittedAt: string; avgStars: number|null; comment: string; sessionName: string; isFeatured: boolean}`.

- [ ] **Step 1: Migration**

```sql
-- Migration 0035: per-response and per-mentor review visibility controls.
-- New responses default public (admin decision: populate profiles with zero
-- setup, hide individual bad ones after the fact — see plan decision log).

alter table public.feedback_responses
  add column is_public boolean not null default true,
  add column is_featured boolean not null default false;

alter table public.mentors
  add column show_reviews boolean not null default true;

create index feedback_responses_public_idx
  on public.feedback_responses (feedback_session_id) where is_public;
```
Apply via `mcp__claude_ai_Supabase__apply_migration` against project `whqdasotjlhvrjmgiffk`, name `feedback_review_visibility`. Hand-edit `database.types.ts`: add `is_public`, `is_featured` to `feedback_responses`'s Row/Insert/Update (Insert optional, default `true`/`false`), `show_reviews` to `mentors`'s Row/Insert/Update (Insert optional, default `true`).

- [ ] **Step 2: `ResponseDetail` gains visibility fields + `setResponseVisibility`**

In `feedback-responses.ts`, extend `ResponseDetail`:
```ts
export interface ResponseDetail {
  id: string;
  submittedAt: string;
  name: string;
  email: string;
  answers: Record<string, KeyedAnswer>;
  comments: string;
  isPublic: boolean;
  isFeatured: boolean;
}
```
Add `is_public, is_featured` to `loadResponses`'s `.select(...)` and `RawResponse`, and map them through in `getFeedbackSessionDetail`'s `responses.map(...)`. Add:
```ts
export async function setResponseVisibility(
  responseId: string, sessionId: string, isPublic: boolean, actorProfileId: string | null,
): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("feedback_responses")
    .update({ is_public: isPublic })
    .eq("id", responseId)
    .eq("feedback_session_id", sessionId);
  if (error) throw new Error(error.message);
  await logFeedbackAudit({ action: isPublic ? "showResponse" : "hideResponse", detail: `${sessionId} · ${responseId}`, actorProfileId });
}
```
`exportFeedbackSessionCsv` and `toShareSession`/`getNativeShareView` (`feedback-share.ts`) must **not** filter on `is_public` — the admin CSV export and the session's own `/review/{token}` page show every response regardless of the mentor-profile visibility flag (per the plan's decision: hidden only affects the mentor-profile surface, not the session's own review page or CSV — those are session-scoped admin/public views the admin already controls via `share-token` generation, distinct from the mentor-profile aggregation this task adds). Only `mentor-reviews.ts` (Step 4) filters on it.

- [ ] **Step 3: PATCH route for per-response visibility**

`src/app/api/admin/feedback/sessions/[id]/responses/[responseId]/route.ts` currently only exports `DELETE`. Add:
```ts
const patchSchema = z.object({ isPublic: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; responseId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id, responseId } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    await setResponseVisibility(responseId, id, parsed.data.isPublic, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not update this response." }, { status: 400 });
  }
}
```

- [ ] **Step 4: `src/lib/data/mentor-reviews.ts`**

```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export interface MentorReview {
  id: string;
  name: string;
  submittedAt: string;
  avgStars: number | null;
  comment: string;
  sessionName: string;
  isFeatured: boolean;
}

/**
 * Reads through the admin client, same as every other feedback-table access —
 * feedback_responses/feedback_answers carry zero RLS policies (0033), so the
 * anon client src/lib/data/mentors.ts uses cannot see them. Both is_public
 * and mentors.show_reviews are enforced HERE, not left to callers, so no
 * consumer can accidentally render a hidden review or a mentor who's turned
 * the whole section off.
 */
async function reviewsEnabledFor(mentorId: string): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("mentors").select("show_reviews").eq("id", mentorId).maybeSingle();
  return data?.show_reviews ?? false;
}

export async function getMentorReviewSummary(
  mentorId: string,
): Promise<{ avg: number | null; count: number; distribution: Record<1 | 2 | 3 | 4 | 5, number> }> {
  const empty = { avg: null, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1|2|3|4|5, number> };
  if (!(await reviewsEnabledFor(mentorId))) return empty;

  const admin = createAdminSupabase();
  const { data } = await admin
    .from("feedback_responses")
    .select("id, comments, is_public, feedback_sessions!inner(mentor_id), feedback_answers(star_value)")
    .eq("feedback_sessions.mentor_id", mentorId)
    .eq("is_public", true);

  const perResponseAvgs: number[] = [];
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1|2|3|4|5, number>;
  for (const r of data ?? []) {
    if (!r.comments?.trim()) continue; // non-empty-comment filter per plan decision
    const stars = (r.feedback_answers ?? []).map((a) => a.star_value).filter((v): v is number => v != null);
    if (!stars.length) continue;
    const avg = stars.reduce((a, b) => a + b, 0) / stars.length;
    perResponseAvgs.push(avg);
    const rounded = Math.min(5, Math.max(1, Math.round(avg))) as 1|2|3|4|5;
    distribution[rounded] += 1;
  }
  const avg = perResponseAvgs.length
    ? Math.round((perResponseAvgs.reduce((a, b) => a + b, 0) / perResponseAvgs.length) * 10) / 10
    : null;
  return { avg, count: perResponseAvgs.length, distribution };
}

export async function listMentorReviews(mentorId: string, opts: { limit?: number } = {}): Promise<MentorReview[]> {
  if (!(await reviewsEnabledFor(mentorId))) return [];
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("feedback_responses")
    .select(
      "id, participant_name, submitted_at, comments, is_featured, feedback_answers(star_value), feedback_sessions!inner(mentor_id, name)",
    )
    .eq("feedback_sessions.mentor_id", mentorId)
    .eq("is_public", true)
    .order("submitted_at", { ascending: false })
    .limit(opts.limit ?? 50);

  return (data ?? [])
    .filter((r) => r.comments?.trim())
    .map((r) => {
      const stars = (r.feedback_answers ?? []).map((a) => a.star_value).filter((v): v is number => v != null);
      const avgStars = stars.length ? Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10 : null;
      return {
        id: r.id,
        name: r.participant_name || "Anonymous",
        submittedAt: r.submitted_at,
        avgStars,
        comment: r.comments,
        sessionName: (r.feedback_sessions as unknown as { name: string }).name,
        isFeatured: r.is_featured,
      };
    });
}
```
Confirm the `feedback_sessions!inner(mentor_id)` embedded-filter syntax against this Supabase client version (check an existing embedded-filter query elsewhere in the codebase, e.g. any `!inner` usage, for the exact working syntax this project's supabase-js version expects) before trusting it verbatim — adjust to whatever this repo's established pattern for filtering on a joined table's column actually is if `!inner` isn't it.

- [ ] **Step 5: Response visibility toggle in `SessionDetailClient.tsx`**

Extract the response-card layout from `B-session-detail.html` (eye/eye-off + delete + chevron per row, "Hidden" pill + dimmed state for `!isPublic` rows — apply this consistently to every row, fixing the mock's one inconsistent row per Global Constraints). Add a `toggleVisibility(r: ResponseDetail)` handler calling the new `PATCH .../responses/{id}` route, optimistic `router.refresh()` on success, toast on failure — same pattern as every other mutation in this file (`toggleStatus`, `confirmDeleteResponse`).

- [ ] **Step 6: `show_reviews` toggle on the mentor config form**

In `MentorConfigForm.tsx`, add a toggle next to (or reusing the pattern of) the existing `visibility` select (line ~215) for `show_reviews`, wired the same way the rest of that form's fields are (check `set(...)` helper and existing PATCH submission to `/api/admin/mentors/[id]`).

- [ ] **Step 7: `MentorReviews.tsx` + mount into the public profile**

Extract from `D-mentor-reviews.html` (fully clean, no known gaps): section heading, rating-summary band (avg + stars + count, and the 5-row distribution histogram side by side), responsive review-card grid (one variant with the "Featured" border+pill for `isFeatured` reviews), "Show all N reviews" button, and the empty state (the file's second section) as the render path when `count === 0`.

```tsx
// src/components/mentorship/MentorReviews.tsx
export async function MentorReviews({ mentorId }: { mentorId: string }) {
  const [summary, reviews] = await Promise.all([
    getMentorReviewSummary(mentorId),
    listMentorReviews(mentorId, { limit: 8 }),
  ]);
  if (summary.count === 0) return <EmptyState />;
  // ...rating band + grid, ported from D-mentor-reviews.html
}
```
Mount in `MentorProfileClient.tsx` — this is a client component (`"use client"` at the top), so `MentorReviews` (an async server component reading the DB) cannot be a direct child call; either (a) fetch the reviews server-side in the parent page (`src/app/mentorship/mentors/[slug]/page.tsx`) and pass them down as props to a new client sub-component that just renders the Stitch layout, or (b) wrap `MentorReviews` in `<Suspense>` from the page if it's rendered as a server-component sibling rather than nested inside `MentorProfileClient`. Check `page.tsx`'s current structure before choosing — prefer whichever keeps `MentorProfileClient`'s existing props/behavior unchanged (server-fetch-and-pass-as-props is the safer default given `MentorProfileClient` is already a large existing client component).

Decide whether `mentor.testimonials` (admin-authored jsonb, currently rendered at `MentorProfileClient.tsx:318-340` as "What Mentees Say") survives alongside real reviews: keep both, but relabel the existing hand-authored block "Editor's Picks" or similar so a reader doesn't confuse admin copy with real submitted feedback — do not delete the existing testimonials feature.

- [ ] **Step 8: Tests**

`tests/mentor-reviews.test.ts` — since `getMentorReviewSummary`/`listMentorReviews` are DB-touching (not pure functions), and this repo's convention is pure-function unit tests only (no DB mocking), extract the aggregation math (per-response avg, distribution bucketing, overall avg) into a small pure helper (e.g. `summarizeStarValues(perResponseStarLists: number[][])`) that both functions call, and unit-test that helper directly instead of the DB-touching wrappers — matching how `average()`/`clampStar()` in `validations/feedback.ts` are tested today.

- [ ] **Step 9: Verify**

`tsc`/`vitest`/`lint` clean. Live: submit 2 responses (one with a comment+stars, one anonymous) to a mentor-linked session, load `/mentorship/mentors/{slug}`, confirm the reviews section shows the right average/histogram/cards. Hide one response from the admin detail page, confirm it vanishes from the mentor profile but the CSV export still includes it. Toggle `show_reviews` off, confirm the whole section disappears (renders nothing, or the empty state per Step 4's `reviewsEnabledFor` gate — confirm which and that it's not a broken/error state).

---

### Task 5: Two-tier share modal, QR code, program share tokens

**Files:**
- Modify: `package.json` (add `qrcode`, `@types/qrcode`)
- Create: `src/app/dashboard/admin/feedback/ShareReviewModal.tsx`
- Modify: `src/app/dashboard/admin/feedback/[id]/SessionDetailClient.tsx` (launch the modal instead of the current single-link row)
- Modify: `src/lib/data/feedback-sessions.ts` (auto-generate share token at creation)
- Create: `src/app/api/admin/feedback/programs/[id]/share-token/route.ts`
- Modify: `src/app/dashboard/admin/feedback/NewSessionModal.tsx`'s `ProgramRowActions` (share action)

**Interfaces:**
- Consumes: existing `generateFeedbackShareToken(type, id, actorProfileId)` (`feedback-share.ts`, already supports `"program"`, unused by any route today).
- Consumes: existing `POST /api/admin/feedback/sessions/[id]/share-token` (unchanged).
- Produces: `POST /api/admin/feedback/programs/[id]/share-token` (new, mirrors the session one exactly, calling `generateFeedbackShareToken("program", id, actorProfileId)`).

- [ ] **Step 1: Install `qrcode`**

`qrcode` (npm) — pure-JS, generates a QR as a data-URL PNG or raw SVG string client-side, no native deps, no server round-trip needed since these are public URLs. Add `qrcode` + `@types/qrcode` to `package.json`.

- [ ] **Step 2: Auto-generate the share token at session creation**

In `createFeedbackSession` (`feedback-sessions.ts`), after the session row insert succeeds, call `generateFeedbackShareToken("session", session.id, actorProfileId)` — it's already idempotent (reuses an existing token, never double-generates) so this is safe to call unconditionally. Every session gets a public link from the moment it exists, not only after an admin clicks "Generate Share Link" — which also means `SessionDetailClient.tsx`'s current `shareUrl` initial state (`session.shareToken ? ... : null`) will simply always be non-null for new sessions going forward (existing sessions without a token are unaffected until edited).

- [ ] **Step 3: `ShareReviewModal.tsx`**

Extract from `C-share-modal.html` (fully clean, no known gaps): two stacked cards (public `/review/{token}`, members `/review/{token}?member=1`, second one visually emphasized with the border + "Recommended" pill), each with its explainer copy from the prompt ("Viewers see reviews only — no filter, search, or share controls" / "Includes filter, search, sort, and social share-card download" — these are the old `Admin.html`'s exact explainer lines, keep them verbatim), read-only URL + copy button + "Open" ghost button for each. Below both: the social-share-card section — render an `<img>` pointed at `/api/share-card/{token}` (the real existing route, already fixed by Task 1) as the 1:1 preview instead of a placeholder, with a real "Download image" button (`fetch` the same URL, `blob()`, trigger a download — same pattern `ReviewClient.tsx`'s existing `ShareModal.handleDownload` already uses, copy it). Below that, the QR block: generate a real QR (`qrcode.toDataURL(publicUrl)`) of the **public** (non-member) link into an `<img>`, with a "Download QR" button saving that data-URL.

```tsx
interface ShareReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  sessionName: string;
  shareToken: string | null;
}
```
Trigger it from `SessionDetailClient.tsx`'s existing "Share Link"/"Generate Share Link" button (replacing the current inline copyable-input-row behavior, not the button itself) — if `shareToken` is already set (per Step 2, true for every new session), the modal opens directly with both links ready; if null (a pre-existing session never token'd), call the existing `generateShareLink()` first, same as today, then open the modal.

- [ ] **Step 4: Program share tokens**

`src/app/api/admin/feedback/programs/[id]/share-token/route.ts`:
```ts
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const result = await generateFeedbackShareToken("program", id, auth.user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not generate a share link." }, { status: 400 });
  }
}
```
Add a "Share" action to `ProgramRowActions` in `NewSessionModal.tsx` (currently only has a delete button) — reuse `ShareReviewModal` with `sessionId` generalized to accept either a session or program id/type (or accept a small prop change: `{targetType: "session"|"program"; targetId: string; targetName: string; shareToken: string|null}`, hitting the session or program share-token route accordingly).

- [ ] **Step 5: Verify**

`tsc`/`vitest`/`lint` clean. Live: open the share modal for a session, confirm the public link has no filter bar when visited and `?member=1` does (existing, unmodified `ReviewClient.tsx` behavior — this task only builds the UI that surfaces both links, not the gating logic itself). Confirm the QR decodes to the public link (scan it, or decode the data-URL manually). Confirm "Download image" saves a real PNG matching the preview. Do the same for a program via `ProgramRowActions`.

---

### Task 6: Shared star component + real ratings on marketing surfaces

Smallest, cheapest, real-value cleanup — everything else the user's "suggest more improvements" prompt surfaced is listed under Deferred below rather than task-ified now (see rationale there).

**Files:**
- Create: `src/components/ui/StarRating.tsx`
- Modify: `src/app/dashboard/mentor/feedback/[id]/page.tsx` (use shared component, drop local `StarRow`)
- Modify: `src/app/dashboard/admin/feedback/[id]/SessionDetailClient.tsx` (use shared component, drop local `StarRow`)
- Modify: `src/components/mentorship/MentorCard.tsx` (real avg-rating line)
- Modify: `src/components/mentorship/HeroSection.tsx` (drop hardcoded "4.9★")
- Modify: `src/components/mentorship/TrustBar.tsx` (drop hardcoded "4.9★")
- Modify: `src/app/page.tsx` (real testimonial/rating instead of 5 hardcoded filled stars)

**Interfaces:**
- Produces: `StarRating({value, size, max}: {value: number; size?: number; max?: number}): JSX.Element`, a server-safe component (no client-only hooks) so it can be used from both the fully-server `dashboard/mentor/feedback/[id]/page.tsx` and the client `SessionDetailClient.tsx`.

- [ ] **Step 1: Promote `StarRating`**

Both existing `StarRow` implementations (`dashboard/mentor/feedback/[id]/page.tsx:17-29` and `SessionDetailClient.tsx:47-59`) are already byte-identical and already use `pz-*` tokens — this is a pure extraction, not a redesign:
```tsx
// src/components/ui/StarRating.tsx
import { Star } from "lucide-react";

export function StarRating({ value, size = 14, max = 5 }: { value: number; size?: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i < Math.round(value) ? "fill-pz-secondary text-pz-secondary" : "text-pz-outline-variant"}
        />
      ))}
    </span>
  );
}
```
Replace both local `StarRow` definitions with imports of this component (keep the name `StarRow` as a local alias if that minimizes the diff, or rename call sites to `StarRating` — controller's call at implementation time, either is fine). Do **not** touch the two satori `StarPath` implementations (`opengraph-image.tsx`, `api/share-card/[token]/route.tsx`) — those exist because satori can't render lucide icons, and must stay separate.

- [ ] **Step 2: Real avg-rating on `MentorCard`**

`MentorCard.tsx` currently shows zero rating info. Add `getMentorReviewSummary(mentor.id)`'s `avg`/`count` (from Task 4) as a small `StarRating` + "4.8 (24)" line, matching the card's existing compact layout — only render it when `count > 0` (an unreviewed mentor shows no rating line, not a fake "No ratings yet" placeholder that implies the feature is broken). Since `MentorCard` is likely rendered in a list (`/mentorship`'s grid), fetch summaries in bulk from the parent page rather than N+1-querying per card — check whether `getMentorReviewSummary` needs a batch variant (`getMentorReviewSummaries(mentorIds: string[])`) for this call site; add one if the grid has more than a handful of mentors, reusing Task 4's `reviewsEnabledFor` + aggregation logic per id.

- [ ] **Step 3: Drop the hardcoded "4.9★" claims**

`HeroSection.tsx:14`, `TrustBar.tsx:43-44`, and `src/app/page.tsx:60`'s 5 hardcoded filled stars — each currently asserts a specific, fabricated rating. Replace with either a real sitewide aggregate (average across all mentors with `show_reviews` and at least one public review) or, if real review volume is still low at implementation time, remove the specific number and keep only qualitative copy ("Trusted by students across Pakistan" style) rather than ship a fabricated stat. Controller's call at implementation time based on how much real review data exists by then.

- [ ] **Step 4: Verify**

`tsc`/`vitest`/`lint` clean. Visual check: `/mentorship` grid shows real ratings where reviews exist and no rating line where they don't; homepage and hero no longer assert a specific fabricated number.

---

## Deferred (not task-ified this round)

These surfaced during the original "suggest more improvements" ask but are each a substantial sub-feature in their own right, not a bounded fix — ruling them out of this plan's scope rather than silently dropping them or inflating this plan past what one SDD pass should carry:

- **Session edit** (name/speaker/date/questions immutable after creation; `SessionRowActions`' "Edit" is a permanently disabled stub) — a real CRUD surface with its own validation/migration-safety questions (e.g. can question type change after responses exist?), deserves its own plan.
- **Audit-log viewer** — `feedback_audit_log` is written by every mutation (including every new one this plan adds) and read by nothing; a real admin page for it is separable from this plan's feature work.
- **`feedback_sessions.session_date text → date`** migration + backfill — a schema-safety cleanup unrelated to any of the six user-requested gaps, better done as its own focused migration task with its own verification.
- **Notify the mentor when feedback arrives** — needs an actual notification/email delivery mechanism this repo doesn't have yet for this domain; out of scope until one exists.

---

## Final Verification

After all 6 tasks:
```bash
./node_modules/.bin/vitest run     # confirm no regressions vs. the 269/269 baseline
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/next lint
```
Full live click-through against the real Supabase project (`whqdasotjlhvrjmgiffk`) and real allowlisted test accounts, dev server on port 3000:
1. Share card fixed (Task 1) — already spot-verified per-task, re-confirm post-merge.
2. Create a session with a cover + linked mentor from the redesigned modal (Tasks 2+3) — cover appears everywhere, session shows on the mentor's dashboard.
3. Submit feedback, confirm it reaches the mentor's public profile reviews section (Task 4), confirm hide/show + `show_reviews` both work.
4. Share modal (Task 5): public vs. member link behavior, share-card download, QR decode, program share token.
5. Marketing surfaces (Task 6) show real or honestly-absent ratings, no fabricated numbers.
6. Clean up every synthetic session/response/review created during verification; confirm zero orphans.
