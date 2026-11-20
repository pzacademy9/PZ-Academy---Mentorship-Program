# Curriculum Import and Builder Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin bring a curriculum file into an existing program with tick-box approval, add tick-boxes to the page import, and add a Back button, video previews, a leave-warning and a curriculum-only AI prompt.

**Architecture:** A pure compare function lines a checked `ImportPlan` up against the program's current curriculum and returns change rows with stable ids. Two admin routes (check, apply) load the program on the server, recompute the rows from the file text and apply only the ticked ids. One shared checklist component renders rows for both import dialogs.

**Tech Stack:** Next.js (app router), TypeScript, Supabase (service-role admin client), Vitest, Tailwind (pz tokens).

**Spec:** `docs/superpowers/specs/2026-11-20-curriculum-import-tools-design.md`

## Global Constraints

- Branch `curriculum-import-tools`, all jobs on it. Never push or merge without the owner's yes.
- Owner is not technical: plain short words in every screen text. No exclamation marks.
- Source files use CRLF; keep it. Never regenerate `src/lib/supabase/database.types.ts`.
- No new migration expected. If a column is missing, stop and ask (next free number 0120).
- No new Stitch screens: reuse existing admin styling (`BTN`/`FIELD` style classes in `ImportPageDialog.tsx`, pz tokens, 44px touch targets via `max-md:min-h-11`).
- Pure logic goes in `src/lib/lms/course-import/` (client-safe, no `server-only`). DB code is server-only behind `requireAdmin("courses")`.
- Nothing is deleted by an import unless the admin ticks a Remove row and confirms.
- Run tools directly: `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/typescript/bin/tsc --noEmit` (ignore stale `.next/types` errors about `enrollments/app/page`), `node node_modules/eslint/bin/eslint.js <paths>`.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage by explicit path only; never `git add docs` (three untracked docs files are not ours).
- Known failing tests not ours: pz-tokens, participant-recipients, participant-whatsapp-ui, landing-route-hardening, gas-apply-registration-status, landing-event-sheet.

## Review Focus

- Two sessions in one module share a name once normalised: the second must show as New with a note, never silently merge.
- Names differing only by case, extra spaces or dash type ("Day 1 – Intro" vs "Day 1 - Intro") must match (Task 1 test).
- A file part left empty (no video, no notes, no quiz) must never blank what the program already has (Task 1 and Task 2 tests).
- The program changes between "Check" and "Apply": the route must refuse, not apply stale ids (Task 2 test).
- The file's type differs from the program's type: plain refusal (Task 2 test).
- Nothing ticked: Apply and Fill-in buttons disabled, and the server refuses an empty tick list (Tasks 2, 3, 4).
- Leave-warning stays on after a failed save (Task 8 test).

---

### Task 1: Compare function (pure)

**Files:**
- Create: `src/lib/lms/course-import/compare.ts`
- Test: `tests/course-curriculum-compare.test.ts`

**Interfaces:**
- Consumes: `ImportPlan`, `ImportModule`, `ImportSession` from `./analyze`; `LessonResourceLink`, `QuizQuestionInput` types from `@/lib/data/admin-lms`.
- Produces (all exported from `compare.ts`):
  - `type CurrentLesson = { id: string; title: string; videoUrl: string; videoUrl2: string; notes: LessonResourceLink[]; questions: QuizQuestionInput[] }`
  - `type CurrentModule = { id: string; title: string; notes: LessonResourceLink[]; lessons: CurrentLesson[] }`
  - `type CurrentCurriculum = { flat: boolean; modules: CurrentModule[] }`
  - `type SessionPart = "video" | "video2" | "notes" | "quiz"`
  - `type CurriculumChange` with a common `{ id: string; label: string; defaultOn: boolean }` plus a `kind`:
    - `"new-module"`: `moduleIndex: number; sessionCount: number`
    - `"new-session"`: `moduleIndex: number; sessionIndex: number; moduleId: string | null` (matched module id, null in flat programs where the hidden module is used), `note?: string`
    - `"update-session"`: `lessonId: string; moduleIndex: number; sessionIndex: number; rows: { part: SessionPart; from: string; to: string }[]`
    - `"update-module-notes"`: `moduleId: string; moduleIndex: number; from: string; to: string`
    - `"remove-session"`: `lessonId: string` (defaultOn false)
    - `"remove-module"`: `moduleId: string` (defaultOn false)
  - `normalizeName(s: string): string` (lowercase, collapse whitespace, map en/em dashes to `-`, trim)
  - `compareCurriculum(current: CurrentCurriculum, plan: ImportPlan): CurriculumChange[]`
- Change ids are stable for the same inputs: `new-module:<mi>`, `new-session:<mi>:<si>`, `update-session:<lessonId>`, `update-module-notes:<moduleId>`, `remove-session:<lessonId>`, `remove-module:<moduleId>`. Rows with `kind` update-* and new-* have `defaultOn: true`; remove-* false.

- [ ] **Step 1: Write the failing tests** in `tests/course-curriculum-compare.test.ts`. Build small `current` and `plan` fixtures with helper functions. Cases, each asserting ids and kinds:
  - identical program and file returns `[]`.
  - file module not in program gives one `new-module:<mi>` row with `sessionCount` equal to its sessions, and no separate new-session rows for that module.
  - file session missing from a matched module gives `new-session:<mi>:<si>` with `moduleId` set.
  - matched session with a different `videoUrl` gives `update-session:<id>` whose rows are exactly `[{part:"video", from, to}]`.
  - file session with empty `videoUrl` and empty notes and no questions, against a program session that has all three, returns no row (empty parts leave existing alone).
  - different quiz (same count, one option changed) gives a `quiz` row.
  - names `"Day 1 – Intro"` (en dash, double space) and `"day 1 - intro"` match.
  - two file sessions with the same normalised name in one module: first matches, second is `new-session` with a `note` mentioning the repeated name.
  - program module/session not in file give `remove-module:<id>` / `remove-session:<id>` with `defaultOn:false`.
  - module notes differing give `update-module-notes:<moduleId>`; file module with empty notes gives none.
  - `flat: true`: sessions match across the whole program by name ignoring module titles; missing ones are `new-session` with `moduleId: null`; no module rows, no `update-module-notes`, no `remove-module`.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/course-curriculum-compare.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the types and functions in `compare.ts`. Match modules then sessions by `normalizeName`, first unused match wins. Labels are plain words, e.g. `New module: <title> (5 sessions)`, `New session: <title>`, `Update session: <title>`, `Module notes: <title>`, `Not in the file: <title>. Will stay unless removed.` Row `from`/`to` text: videos show the URL (shortened to 60 characters); notes show `N links`; quiz shows `N questions`.
- [ ] **Step 4: Run** the test file again. Expected: PASS. Run `node node_modules/eslint/bin/eslint.js src/lib/lms/course-import/compare.ts` and tsc.
- [ ] **Step 5: Commit** `git add src/lib/lms/course-import/compare.ts tests/course-curriculum-compare.test.ts` then `git commit -m "feat: compare a curriculum file with a program"` (with trailer).

---

### Task 2: Server load, apply and routes

**Files:**
- Create: `src/lib/data/course-curriculum-import.ts`
- Create: `src/app/api/admin/courses/[id]/import-curriculum/check/route.ts`
- Create: `src/app/api/admin/courses/[id]/import-curriculum/apply/route.ts`
- Test: `tests/course-curriculum-import-routes.test.ts` (copy the mocking style of `tests/course-import-routes.test.ts`)

**Interfaces:**
- Consumes: `compareCurriculum`, `CurrentCurriculum`, `CurriculumChange` (Task 1); `analyzeCourseFile` from `@/lib/lms/course-import/analyze`; `readImportText` from `@/lib/lms/course-import/read-body`; `requireAdmin` from `@/lib/auth/require-admin`; `createAdminSupabase`; `ensureDefaultModule`; `deriveContentType`; `usesFlatSessions`.
- Produces:
  - `loadCurrentCurriculum(courseId: string): Promise<{ type: CourseType; curriculum: CurrentCurriculum } | null>` (null when the course does not exist).
  - `applyCurriculumChanges(courseId: string, plan: ImportPlan, changes: CurriculumChange[]): Promise<{ ok: true; applied: number } | { ok: false; applied: number; message: string }>` applies exactly the rows passed in. New module: insert module (order after last), its module_notes row if notes, its lessons and quiz rows. New session: insert lesson (order after last in that module; hidden module via `ensureDefaultModule` when `moduleId` is null), quiz rows. Update session: only the parts in `rows`: video, video2, notes (replace `resource_urls`), quiz (delete the lesson's `quiz_questions` then insert the file's); recompute `content_type` with `deriveContentType`. Update module notes: set `module_notes.resource_urls` (update the row if it exists, else insert). Remove: delete the lesson or module (cascades). Rows run in order modules, sessions, updates, removes; the first failure stops and returns what was applied.
  - Check route `POST` body is the file text (same body reader as the preview route). Returns `{ type, warnings, changes }` where `changes` are the `CurriculumChange` rows. 404 when the course is missing; 400 `{ errors }` when the file fails; 400 with a plain message when the file's `plan.type` differs from the program's type ("This file is for a different kind of program.").
  - Apply route `POST` JSON `{ text: string, ids: string[] }`. Re-analyses the file, reloads the program, recomputes rows, then: empty `ids` gives 400 "Nothing is ticked."; any id not in the recomputed rows gives 409 "The program changed. Check the file again."; otherwise applies the matching rows and returns `{ applied }`. Uses `requireAdmin("courses")`.

- [ ] **Step 1: Write failing route tests**: not admin gives the guard response; wrong type gives 400 with the plain message; check returns rows for a small fixture; apply with `ids: []` gives 400; apply with an id that is not in the recomputed rows gives 409 and the apply function is never called; apply with a valid id calls `applyCurriculumChanges` with only that row. Mock `@/lib/data/course-curriculum-import` in the route tests.
- [ ] **Step 2: Run** the test file. Expected: FAIL.
- [ ] **Step 3: Implement** the data module and both routes. Use the admin client; read `modules`, `lessons` (id, title, video_url, video_url_2, resource_urls, module_id, order_index), `quiz_questions` (lesson_id, question, options, correct_index, order_index ordered) and `module_notes` (module_id, resource_urls). Confirm `module_notes` has a unique `module_id` before choosing update-or-insert.
- [ ] **Step 4: Run** the route tests, eslint on the new files, tsc. Expected: PASS and clean.
- [ ] **Step 5: Commit** the five files with message `feat: check and apply a curriculum file to an existing program`.

---

### Task 3: Shared checklist and tick-boxes in the page import

**Files:**
- Create: `src/components/admin/program/ImportChangeList.tsx`
- Modify: `src/lib/lms/course-import/page-changes.ts` (add `key`, add filter helper)
- Modify: `src/components/admin/program/ImportPageDialog.tsx`
- Test: `tests/course-page-import.test.ts` (update and extend), `tests/course-page-import-ui.test.tsx` (extend)

**Interfaces:**
- Produces:
  - `PageChange` becomes `{ key: string; label: string; from: string; to: string }`. Keys: `"title"`, the detail field names from `COURSE_DETAIL_FIELDS` (`f.field`), `"price"`, `"topic"`, `"startsAt"`, `"publicVideoUrl"`, `"outcomes"`, `"features"`, `"faqs"`, `"pageSections"`.
  - `filterPageImport(plan: PageImport, keys: ReadonlySet<string>): PageImport` returns a copy keeping only the ticked parts (unticked parts become undefined / absent).
  - `ImportChangeList` props: `items: { id: string; label: string; from?: string; to?: string; note?: string; defaultOn?: boolean; danger?: boolean }[]`, `checked: ReadonlySet<string>`, `onChange: (next: Set<string>) => void`. Renders a checkbox per row (min 44px tap target on phone), a counter "N of M changes ticked", and "Tick all" / "Untick all" buttons. Danger rows (Remove) show red text.
- Consumes in dialog: `ImportChangeList`, `filterPageImport`.

- [ ] **Step 1: Write failing tests.** In `tests/course-page-import.test.ts` assert `pageImportChanges` rows carry the keys above and that `filterPageImport` with only `"price"` ticked returns a plan with `page.pricePkr` set and `title`, details, `page.topic` absent. In `tests/course-page-import-ui.test.tsx` assert: each row shows a checked checkbox after checking a file; unticking one row and pressing "Fill in the boxes" calls `onApply` with a plan lacking that part; unticking all disables the button.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement** keys and `filterPageImport` in `page-changes.ts`; build `ImportChangeList`; use it in `ImportPageDialog` (state `Set<string>` of ticked keys, all ticked when a file is checked; header text becomes "What will change. Untick anything you do not want."). `Fill in the boxes` is disabled when the ticked set is empty and passes `filterPageImport(plan, ticked)`.
- [ ] **Step 4: Run** both test files, `tests/course-import-analyze.test.ts`, eslint and tsc. Expected: PASS and clean.
- [ ] **Step 5: Commit** with message `feat: tick or untick each change in the page import`.

---

### Task 4: Curriculum import dialog and builder button

**Files:**
- Create: `src/components/admin/program/ImportCurriculumDialog.tsx`
- Modify: `src/components/admin/program/CourseBuilder.tsx` (button in the header cluster, dialog mount, refresh on success)
- Test: `tests/course-curriculum-import-ui.test.tsx`

**Interfaces:**
- Consumes: `ImportChangeList` (Task 3); `CurriculumChange` (Task 1); the two routes (Task 2).
- Produces: `ImportCurriculumDialog({ open, onOpenChange, courseId, onApplied }: { open: boolean; onOpenChange: (o: boolean) => void; courseId: string; onApplied: () => void })`.

- [ ] **Step 1: Write failing UI tests** (mock `fetch`): choosing a file posts the text to the check route and shows rows grouped under "New", "Different" and "Not in the file"; remove rows start unticked; ticking a Remove row shows a confirm line "This deletes it. Students' saved progress on it is lost." and requires pressing a second "Yes, remove" before Apply is enabled (builder may implement as a checkbox inside the row); "Apply the ticked changes" posts `{ text, ids }` with only ticked ids; success calls `onApplied` and closes; a 409 shows its message and returns to the start; Apply disabled when nothing is ticked; the dialog contains a link to `/dashboard/admin/courses/ai`.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement** the dialog following `ImportPageDialog` structure (choose file or paste, "Check the file", list, Back, Apply). Warnings from the check route show under "Please note". After apply show "Done. N changes saved." and call `onApplied` (builder calls `router.refresh()`). Button label in the builder: "Import curriculum from a file" with a `FileUp` icon.
- [ ] **Step 4: Run** the UI test, eslint, tsc. Expected: PASS and clean.
- [ ] **Step 5: Commit** with message `feat: import a curriculum file into an existing program`.

---

### Task 5: Curriculum-only AI prompt

**Files:**
- Modify: `src/lib/lms/course-import/prompts.ts` (add `curriculumPrompt()`)
- Modify: `src/components/admin/program/CourseAiPrompts.tsx` (Kind `"curriculum"`, fourth tab)
- Modify: `src/app/dashboard/admin/courses/ai/page.tsx` (pass the prompt)
- Test: `tests/course-import-prompt.test.ts` (extend)

**Interfaces:**
- Produces: `curriculumPrompt(): string`. Same layout rules as `masterPrompt()` (reuse its shared pieces rather than copying text) but asks only for the format line, `type:`, modules, sessions, video links, notes links and quiz questions. No tagline, description, price, FAQs or page-section headings. Tells the AI to keep module and session names exactly as in the program and to ask for the current names if it does not have them.
- Tab text: label "Curriculum only"; steps: copy the instructions; paste into your AI chat with your YouTube links, quiz file and notes links; save the file; open the program's curriculum builder and press "Import curriculum from a file".

- [ ] **Step 1: Write failing tests**: `curriculumPrompt()` contains `COURSE_IMPORT_FORMAT_ID`, contains none of the `PAGE_LIST_HEADINGS` values, does not contain `price:` or `tagline:`, and contains the words about keeping names exactly.
- [ ] **Step 2: Run** `tests/course-import-prompt.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the prompt, the tab and the page prop.
- [ ] **Step 4: Run** the prompt test and any existing AI-page test (`grep -l CourseAiPrompts tests`), eslint, tsc. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat: AI prompt for a curriculum-only file`.

---

### Task 6: Back to program

**Files:**
- Modify: `src/components/admin/program/CourseBuilder.tsx` (header)
- Modify: `src/components/admin/program/ProgramConfigForm.tsx` (only if no obvious link to the builder exists)
- Test: `tests/course-builder-header.test.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test**: render `CourseBuilder` with a minimal `initialState` (mock `next/navigation`, `CurriculumMap`, `LessonEditorPanel`, `ModuleNotesPanel`); expect a link named "Back to program" with `href` `/dashboard/admin/courses/<id>` placed before the title, and no link named "Basics".
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement**: first item in the header is a `Link` with a `ChevronLeft` icon and the text "Back to program", `max-md:min-h-11`; remove the "Basics" link. Check `ProgramConfigForm.tsx` for an existing link to `/builder`; if none is easy to see, add a clear "Open curriculum builder" link near the top.
- [ ] **Step 4: Run** the test, eslint, tsc.
- [ ] **Step 5: Commit** with message `feat: Back to program link in the curriculum builder`.

---

### Task 7: Video preview

**Files:**
- Modify: `src/lib/video-embed.ts` (add `videoThumbnail`)
- Modify: `src/components/admin/program/VideoField.tsx`
- Test: `tests/video-embed.test.ts` (extend), `tests/video-field-preview.test.tsx`

**Interfaces:**
- Produces: `videoThumbnail(url: string): string | null` returns `https://img.youtube.com/vi/<id>/hqdefault.jpg` for YouTube watch, youtu.be, shorts, embed and live links; null for Vimeo and anything else.
- Consumes: `toEmbedUrl`, `checkVideoLink`.

- [ ] **Step 1: Write failing tests**: `videoThumbnail` for each YouTube form and null for Vimeo and junk; `VideoField` with a good YouTube link shows an image preview and a "Play preview" button; pressing it shows an `iframe` whose `src` is the `toEmbedUrl` result (use `youtube-nocookie.com` host for YouTube); a Vimeo link shows a plain placeholder with "Play preview"; an empty or invalid link shows no preview.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement** the helper and the preview block under the check line in `VideoField` (16:9 box, `max-w-sm`, lazy `img`, iframe `title="Video preview"`, `allow` limited to `encrypted-media; picture-in-picture`). Preview reflects the typed draft once valid, not only the saved value. Confirm no Content-Security-Policy in `next.config.*` blocks `img.youtube.com` or the embed hosts; adjust only if one exists.
- [ ] **Step 4: Run** both test files, eslint, tsc.
- [ ] **Step 5: Commit** with message `feat: video preview under each video link in the builder`.

---

### Task 8: Unsaved-changes warning

**Files:**
- Create: `src/hooks/useUnsavedGuard.ts`
- Modify: `src/components/admin/program/LessonEditorPanel.tsx` (report dirty state), `src/components/admin/program/CourseBuilder.tsx` (use the guard, make Save Draft flush), `src/components/admin/program/ProgramConfigForm.tsx` (use the guard)
- Test: `tests/use-unsaved-guard.test.tsx`

**Interfaces:**
- Produces: `useUnsavedGuard(dirty: boolean): { confirmLeaveDialog: React.ReactNode }`. While `dirty`: registers a `beforeunload` handler (`preventDefault`, `returnValue = ""`) and a capturing document click handler for same-site `<a href>` clicks that opens a confirm dialog "You have changes that are not saved. Leave anyway?" with "Stay" and "Leave anyway"; "Leave anyway" continues the navigation (`router.push` of the link href). Handlers are removed when not dirty or on unmount. Use the existing confirm/dialog component pattern from `LandingEditor.tsx`.
- `LessonEditorPanel` gets a new optional prop `onDirtyChange?: (dirty: boolean) => void`, true while a debounced text save is pending, a save is in flight, or the last save failed; false after a successful save.
- `CourseBuilder` keeps a `lessonDirty` boolean, passes `onDirtyChange`, calls `useUnsavedGuard(lessonDirty)`. "Save Draft" calls a flush of pending saves (reuse the panel's existing flush used by "Save & Continue" through a ref or callback) and then toasts "Saved." only when nothing failed, else "Some changes could not be saved." The old "Everything here saves automatically" toast is removed.
- `ProgramConfigForm`: dirty means the form values differ from the last saved values (find the existing comparison or snapshot; add one if missing). Use `useUnsavedGuard(dirty)`.

- [ ] **Step 1: Write failing tests** for the hook: when dirty, a `beforeunload` event is default-prevented; when not dirty it is not; clicking an internal link while dirty opens the dialog and does not navigate; pressing "Stay" keeps the page; "Leave anyway" navigates; handler removed after dirty turns false; dirty stays true after a failed save (test via a small harness component).
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement** hook and wire the three components.
- [ ] **Step 4: Run** the hook test, `tests/course-builder-header.test.tsx`, any existing builder or program-form tests (`grep -l "LessonEditorPanel\|ProgramConfigForm" tests`), eslint, tsc.
- [ ] **Step 5: Commit** with message `feat: warn before leaving with unsaved changes`.

---

### Task 9: Final checks and browser check

**Files:** none (fixes only if something fails).

- [ ] **Step 1:** Run tsc (0 errors apart from the stale `.next/types` ones), eslint on every touched path, and every test file named in this plan plus `tests/course-import-routes.test.ts`, `tests/course-import-create.test.ts`, `tests/client-boundary-values.test.ts`. All pass except the known failing ones.
- [ ] **Step 2:** Start the dev server (`node node_modules/next/dist/bin/next dev -p 3000`) if not running. Sign in on localhost only with the admin test login from memory, waiting for the login page to finish loading first. With the chrome-devtools tools, at 390px and 1440px width check: builder header with Back to program; import curriculum dialog (check only, do NOT press Apply on real data); the tick list in the narrow dialog; Import page box ticks; video preview under a link; leave warning on the lesson text and on the program editor. Use screenshots, not full snapshots.
- [ ] **Step 3:** Run `node node_modules/next/dist/bin/next build` only if the dev server is stopped (a build corrupts a live dev server); otherwise note it as not run.
- [ ] **Step 4:** Report to the owner in plain words: what was checked, what was not (the live Apply on the Diabetes Management program is theirs to try), and that the branch is not pushed.
