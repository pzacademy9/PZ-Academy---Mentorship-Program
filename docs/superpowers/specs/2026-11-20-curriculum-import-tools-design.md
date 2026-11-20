# Curriculum import and builder tools: design

Date: 2026-11-20. Branch: `curriculum-import-tools` (cut from main). One branch for all five jobs.

## Why

The owner wanted to rebuild the Diabetes Management program's curriculum (new video links, quizzes, notes links). The program is published and has enrolments, so deleting and recreating it is not acceptable. They deleted its modules and then found there is no way to bring a curriculum file into an existing program: the full course file importer only creates a NEW program. The builder also lacks safety and clarity that a non-technical admin needs.

## Goals

1. **Import curriculum into an existing program.** A button in the curriculum builder reads a `pz-course/1` file, lines it up against what the program already has, and shows one list of changes. The admin ticks what to apply. Nothing is saved until Apply.
2. **Per-change approve or reject** in the existing "Import page from a file" box (program editor, public page fields): every change has a tick-box; only ticked changes are filled in.
3. **A clear way back** from the curriculum builder to the program editor ("Back to program"), replacing the unclear "Basics" link as the main route.
4. **Video preview** under every pasted video link in the builder (small player or thumbnail), so the admin can see it is the right video.
5. **Unsaved-changes warning** when leaving with work that has not been saved.

## Non-goals and anti-goals

- No wipe-and-rebuild button. A change that breaks students' saved progress on a live program is a failure even if it "works".
- Nothing is ever deleted by an import unless the admin explicitly ticks a removal.
- No new Stitch screens (owner ruling): build in the existing admin style.
- No changes to the new-program importer, the public pages or student views.
- No student, affiliate or registration data is touched.

## Constraints

- Owner is not technical: short plain words, calm wording.
- Pure checking logic stays in `src/lib/lms/course-import/` (client-safe, unit-tested). Database writes go through a server route behind `requireAdmin("courses")`.
- Reuse `analyzeCourseFile` / `ImportPlan` (modules, sessions, notes, questions). Flat types (course types where `usesFlatSessions`) keep all sessions in one hidden module: the compare must handle both shapes.
- Source files use CRLF. Do not regenerate `database.types.ts`. Browser-check narrow components at phone and PC width.
- Migration only if a database column is needed. None is expected (see "Matching").

## Approaches considered

1. **Compare, then tick what you want. (Chosen by the owner.)** Match the file to the program by name, show New / Different / Missing-from-file rows, apply only ticked rows. Keeps lesson ids, so student progress survives. Costs: a compare function and an apply route.
2. **Replace everything.** Simple, but deletes lesson ids and breaks progress on a live program. Rejected.
3. **Add only.** Safe, but a wrong link still has to be fixed by hand. Rejected, though the "New" rows behave like it.

A per-session "replace this session fully" choice lives inside approach 1 as the Update option (it overwrites links, notes and quiz of that session).

## Design

### 1. Curriculum import (existing program)

- Builder header gets a button "Import curriculum from a file". It opens a dialog: choose a file or paste, "Check the file", then the change list, then "Apply the ticked changes".
- **Matching:** module by title, session by title inside its module, both compared after trimming, lowercasing and collapsing spaces. Flat types match sessions across the program by title. No new column needed. If two items share a normalised name, the later one is shown as New with a note (builder's call).
- **Row kinds**
  - New module / New session: ticked by default. Brings its links, notes and quiz.
  - Different session: shows plain old to new for each part that differs (video 1, video 2, notes links, quiz questions count and first question). Each row has Update (ticked) or Keep. Update overwrites only the parts the file contains; a part the file leaves empty is left alone.
  - Different module notes: same, one row.
  - In the program but not in the file: listed as "Not in the file. Will stay." Unticked "Remove" option exists but is off and needs a second confirm. Removing a session with student progress shows a warning (builder's call: show the count if cheap, otherwise a plain warning).
- Group tick: "Tick all / Untick all" per kind. Counter: "12 of 14 changes ticked".
- Plain-words warnings from `analyzeCourseFile` are shown above the list unchanged.
- **Apply:** one server route `POST /api/admin/courses/[id]/import-curriculum` receives the file text and the ticked change ids, re-checks the file on the server (never trusts the browser), re-reads the program, recomputes the change list, applies only the ticked ids. All-or-nothing where possible: inserts and updates run in order and a failure reports what was and was not saved. After success the builder refreshes (`router.refresh`).
- If the program changed between check and Apply (change list differs), the route refuses with "The program changed. Check the file again."
- Course type from the file must equal the program's type, else a plain error.
- The public-page parts of a full file (title, price, FAQs...) are NOT applied here; this button is curriculum only. The page-parts import stays in the program editor.

### 2. Tick-boxes in "Import page from a file"

`PageChange` gets a stable `key`. `ImportPageDialog` shows a tick-box per row (all ticked by default), a counter, and Select/Unselect all. "Fill in the boxes" passes only ticked keys; a new pure helper filters the `PageImport` plan to the ticked parts. The button is disabled when nothing is ticked. Landing-page copy of this dialog (`components/admin/landing/ImportPageDialog.tsx`) is out of scope unless it shares the code trivially (builder's call).

### 3. Back to program

In the builder header, a clear first-position link "‹ Back to program" to `/dashboard/admin/courses/[id]`, with the program title beside it. "Basics" is removed from the cluster (it was the same destination). On phone it stays at least 44px tall. The program editor gets a matching "Open curriculum builder" link if one is not obvious (check; builder's call).

### 4. Video preview

`VideoField` shows, when `checkVideoLink` says ok, a small 16:9 preview under the field: YouTube thumbnail image (`img.youtube.com/vi/<id>/hqdefault.jpg`) and a "Play preview" that swaps in the embedded player (`youtube-nocookie` / Vimeo player). Thumbnail first to keep the page light with many fields. Vimeo has no stable thumbnail URL without an API call, so Vimeo shows the embedded player only on "Play preview" with a plain placeholder. Add a pure `videoEmbed(url)` helper next to `checkVideoLink`, tested. Check the app's Content-Security-Policy allows these hosts (builder's call to adjust if needed).

### 5. Unsaved-changes warning

- Builder: lesson text autosaves on a debounce and the title saves on blur, so there is a short window with unsaved work. Add a `dirty` signal from `LessonEditorPanel` (pending debounce, in-flight save, or failed save) up to `CourseBuilder`. While dirty: `beforeunload` guard (same pattern as `LandingEditor.tsx`), plus an in-app guard so clicking a sidebar link or Back to program asks "You have changes that are not saved. Leave anyway?" in our own dialog. The "Save Draft" button flushes pending saves and then says what was saved; it no longer only says "everything saves automatically".
- Program editor (`ProgramConfigForm`): the "Import page" fill-in changes boxes that are not saved until Save. Same guard while the form differs from the saved values.
- Failed save keeps the warning on.
- In-app link guard: a capturing click listener on anchors inside the dashboard, shown only while dirty (builder's call; keep it small and removable).

## Parts left to the builder

Exact component split, naming of change ids, wording of rows, the dirty-state plumbing, whether the landing dialog shares the new tick-box code, CSP tweaks, and how session-progress warnings are counted.

## Testing and checks

- Vitest: compare function (new/different/same/missing, flat and modular, duplicate names, empty-part-leaves-alone), plan filtering by ticked ids, page-change keys and filter, `videoEmbed`.
- Route test for refusal cases (type mismatch, changed program, not admin).
- tsc 0 errors, eslint clean, focused vitest runs.
- Browser check at 390px and 1440px of: import dialog list, tick-boxes, header Back link, video preview, leave warning. Localhost only, admin test login, no data changed (use the import check step without Apply, or a throwaway program the owner OKs).

## Open items for the owner after build

- Live check by the owner on the Diabetes Management program with the real file.
- Nothing needs SQL unless the builder finds a missing column (then the next free migration is 0120, owner pastes by hand).
