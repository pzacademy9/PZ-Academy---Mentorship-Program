# Course Builder v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin course builder fast and hard to get wrong for non-technical staff: one session shows video(s), notes, quiz and optional text together, with readiness dots, paste-many quiz questions, copy module/course, and a student page that renders by what a session has.

**Architecture:** Keep the stored `lessons.content_type` column (icons, PDF route, webinar seed use it) but derive it on save from what the session contains. Add one nullable column `lessons.video_url_2` and one new table `module_notes` (enrolled-only RLS, because `modules` rows are publicly readable for published courses and notes are paid content). Pure helpers (video link check, readiness, quiz paste parser) live in `src/lib` with unit tests; data functions extend `src/lib/data/admin-lms.ts` and `src/lib/data/lms.ts`; UI replaces the Lesson Editor panel and extends the Curriculum Map and builder header.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (service-role admin client for writes, `createServerSupabase` for student reads), Tiptap, dnd-kit, Vitest + Testing Library, zod.

**Spec:** `docs/superpowers/specs/2026-10-23-course-builder-v2-design.md`

## Global Constraints

- Manual editing stays fully available; nothing here removes an existing capability except the visible Text/Video/PDF switch.
- Never regenerate `src/lib/supabase/database.types.ts`; hand-add `video_url_2` to `lessons` Row/Insert/Update and add a `module_notes` table entry.
- Supabase MCP is read-only: the migration is `supabase/migrations/0085_course_builder_v2.sql`, pasted by the owner. Student-facing reads of the NEW column/table must tolerate "column/table does not exist" (separate tolerant query, error ignored, empty default) so deploying code before the paste never breaks a live lesson page. Admin-side reads may select the new column directly.
- `quiz_questions.correct_index` never reaches students; keep using `get_quiz` / existing RPCs. Paste/copy/bulk are admin-only (`requireAdmin()`).
- Quiz stays: question, 2 to 6 options, one correct, order. No explanations.
- Paste-many quiz only appends. Copy never duplicates uploaded Drive files; it lists files to re-upload. Copy course carries: title + " (copy)", type, catalog text fields, structure, videos, links, quiz; NOT students, enrollments, progress, images, instructor photo, landing pages, sheet connection; new unique slug; always draft.
- Readiness: video needed for every type; quiz also needed for `course` and `workshop`; `mentorship` gets no badge. Publish stays allowed with gaps (confirm lists them); zero sessions stays blocked (existing `publishEligibility`).
- Module notes only for `course` type (non-flat). Student module notes show in the lesson side panel under "Module notes".
- Max two videos per session. Video check is shape-only (YouTube watch/youtu.be/live/embed/shorts, Vimeo); Google Drive video links are flagged "not supported, use YouTube or Vimeo".
- Quiz paste layout: question line; option lines starting `A)` `B)` `C)`...; a line `Answer: B`.
- Plain, non-technical wording in all admin copy. Use existing `pz-*` tokens and `Button`/`useAsyncAction`; mobile tap targets `max-md:min-h-11`.
- Source files are often CRLF: use the Edit tool, never whole-file rewrites with LF. tsc baseline 0 (`node node_modules/typescript/bin/tsc --noEmit`); `npm run` is broken, call node directly: `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`. Never add `eslint-disable @typescript-eslint` comments. Known 5 failing tests are not ours.
- Commits: new commits only, never amend; trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Quiz paste input from Word/PDF copy: CRLF line endings, blank lines between questions, `a.` / `(A)` / `1)` option markers, lowercase `answer: b`, an `Answer:` that names a letter with no matching option, a question with no answer line, fewer than 2 options, more than 6. Expect: line-numbered errors, nothing saved. (Task 3)
- Video links: `m.youtube.com`, `youtube.com/shorts/ID`, trailing spaces, `youtu.be/ID?t=30`, a Drive link, plain text. (Task 2)
- A session with only a second video, or video cleared later: derived type must not flip a PDF/text session wrongly. (Task 4)
- Copy course when `<slug>-copy` already exists; copying a course with zero modules. (Task 5)
- Deploy-order: lesson page and sidebar must still load if migration 0085 is not yet applied. (Task 6)
- Module notes must not leak: an un-enrolled or pending student cannot read `module_notes` or `/api/modules/[id]/documents/[fileId]`; deleting a module trashes its notes' Drive files. (Tasks 1, 5, 6)
- Readiness for a course with 0 sessions or a webinar with no quiz must show sensible text, not "0 of 0 ready" confusion. (Task 2)

---

### Task 1: Migration 0085 and hand-added types

**Files:**
- Create: `supabase/migrations/0085_course_builder_v2.sql`
- Modify: `src/lib/supabase/database.types.ts` (hand edit: `lessons` Row/Insert/Update gain `video_url_2: string | null` (optional on Insert/Update); new `module_notes` table entry with Row/Insert/Update/Relationships)

**Interfaces:**
- Produces: column `public.lessons.video_url_2 text null`; table `public.module_notes(module_id uuid pk references modules(id) on delete cascade, resource_urls jsonb not null default '[]', documents jsonb not null default '[]', updated_at timestamptz default now())`.

- [ ] **Step 1: Check live state first.** Read-only SQL: list lessons where `content_type='text'` and `video_url` non-empty (expect the 4 Hypertension rows) and confirm migration number 0085 is free (`ls supabase/migrations`).
- [ ] **Step 2: Write the migration.** `alter table lessons add column if not exists video_url_2 text`; `create table if not exists module_notes` as above; enable RLS; policy "module_notes: read if enrolled or admin" copying the `lessons` policy shape (admin/super_admin OR active enrollment in the module's course via `modules m join enrollments e`), select only; no write policies (writes go through the service role). Backfill: `update lessons set content_type='video' where content_type='text' and coalesce(video_url,'')<>'' and coalesce(text_content,'')=''`. File header comment states "Run in SQL Editor; safe to re-run".
- [ ] **Step 3: Hand-edit `database.types.ts`.** Add the column and the table entry mirroring neighbouring entries' style.
- [ ] **Step 4: Verify.** `node node_modules/typescript/bin/tsc --noEmit` reports 0 new errors.
- [ ] **Step 5: Commit** `feat: migration 0085 second video column and module notes table`.

### Task 2: Pure helpers: video link check, derived type, readiness

**Files:**
- Create: `src/lib/video-link.ts`, `src/lib/lms/lesson-parts.ts`
- Test: `tests/video-link.test.ts`, `tests/lesson-parts.test.ts`

**Interfaces:**
- Produces (video-link.ts): `type VideoLinkCheck = { status: "empty" } | { status: "ok"; provider: "youtube" | "vimeo" } | { status: "unsupported"; message: string } | { status: "invalid"; message: string }` and `checkVideoLink(url: string): VideoLinkCheck` (trims input; reuses `toEmbedUrl` knowledge; adds `youtube.com/shorts/<id>` and `m.youtube.com`; Drive hosts return `unsupported` with message "Google Drive videos cannot be played here. Use a YouTube or Vimeo link."; non-URL text returns `invalid` "That doesn't look like a web link."). Also extend `toEmbedUrl` in `src/lib/video-embed.ts` to convert `/shorts/<id>` (add a case in `tests/video-embed.test.ts`).
- Produces (lesson-parts.ts): `deriveContentType(p: { videoUrl?: string | null; pdfFileId?: string | null }): LessonContentType` (video if videoUrl non-empty, else pdf if pdfFileId, else text); `type SessionReadiness = { ready: boolean; missing: ("video" | "quiz")[] }`; `sessionReadiness(courseType: CourseType, s: { hasVideo: boolean; quizCount: number }): SessionReadiness | null` (null for `mentorship`; quiz required only for `course`/`workshop`); `courseReadiness(courseType, sessions): { readyCount: number; total: number; label: string }` where label is e.g. "Ready: 10 of 12 sessions", and "No sessions yet" when total is 0; `missingSummary(...)` returning plain-text lines like "Day 6: Pain Management: no video" for the publish confirm.

- [ ] **Step 1: Write failing tests** for: `checkVideoLink("https://youtu.be/abc?t=30")` ok youtube; `"https://m.youtube.com/watch?v=abc"` ok; `"https://www.youtube.com/shorts/abc"` ok; `"https://vimeo.com/123"` ok vimeo; `"https://drive.google.com/file/d/x/view"` unsupported with the exact message; `"hello"` invalid; `"  "` empty. `deriveContentType`: video wins over pdf; pdf when no video; text otherwise. `sessionReadiness("webinar", {hasVideo:true, quizCount:0})` ready; `("course", {hasVideo:true, quizCount:0})` not ready, missing `["quiz"]`; `("mentorship", ...)` null. `courseReadiness("course", [])` label "No sessions yet".
- [ ] **Step 2: Run to confirm failure.** `node node_modules/vitest/vitest.mjs run tests/video-link.test.ts tests/lesson-parts.test.ts` fails (modules missing).
- [ ] **Step 3: Implement** both files and the `toEmbedUrl` shorts case.
- [ ] **Step 4: Run tests** (incl. `tests/video-embed.test.ts`) pass; lint the new files.
- [ ] **Step 5: Commit** `feat: video link check, derived lesson type and readiness helpers`.

### Task 3: Quiz paste parser

**Files:**
- Create: `src/lib/lms/quiz-paste.ts`
- Test: `tests/quiz-paste.test.ts`

**Interfaces:**
- Produces: `type ParsedQuestion = { question: string; options: string[]; correctIndex: number }`; `type QuizPasteResult = { questions: ParsedQuestion[]; errors: { questionNumber: number; line: number; message: string }[] }`; `parseQuizPaste(text: string): QuizPasteResult`; `QUIZ_PASTE_EXAMPLE: string` (the example shown inside the paste box). Output must satisfy `quizQuestionCreateSchema` limits (question max 1000, 2 to 6 options); anything violating becomes an error, never a silent truncation.

- [ ] **Step 1: Write failing tests** with these cases (name each): clean 2-question block parses; CRLF input; blank lines between and within blocks; leading numbering on the question line (`1.` / `Q1.`) stripped; option markers `A)`, `a.`, `(A)`, `A:`; `Answer: b` lowercase and `Ans: B`; answer letter with no matching option gives an error naming the question number; missing answer line gives an error; one option only gives an error; seven options gives an error; empty input returns no questions and no errors; an error in question 2 does not stop question 3 from parsing.
- [ ] **Step 2: Run** the file and see it fail.
- [ ] **Step 3: Implement `parseQuizPaste`.** A line-based state machine: a question starts at the first non-option, non-answer line after a completed block (or at start); options are lines matching the marker patterns above; an answer line closes the block.
- [ ] **Step 4: Run** and see pass; lint.
- [ ] **Step 5: Commit** `feat: quiz paste parser`.

### Task 4: Admin data layer and lesson/quiz/module-notes routes

**Files:**
- Modify: `src/lib/data/admin-lms.ts`, `src/lib/validations/admin-lms.ts`, `src/app/api/admin/lessons/[lessonId]/route.ts` (no change expected beyond schema), `src/lib/data/lms.ts` is NOT touched here
- Create: `src/app/api/admin/lessons/[lessonId]/quiz-questions/bulk/route.ts`, `src/app/api/admin/modules/[moduleId]/notes/route.ts`
- Test: `tests/admin-lms-builder-v2.test.ts` (mocked admin client in the style of `tests/admin-enrollments-double.test.ts`), plus extend `tests/admin-lms.schema.test.ts`

**Interfaces:**
- Consumes: `deriveContentType`, `sessionReadiness` (Task 2), `ParsedQuestion` (Task 3).
- Produces: `BuilderLesson` gains `hasVideo: boolean; quizCount: number`; `BuilderModule` gains `notesCount: number`; `LessonDetail` and `UpdateLessonInput` gain `videoUrl2: string`/`videoUrl2?: string` (schema: `videoUrl2: url`, same coercion as `videoUrl`); `updateLesson` sets `content_type` itself via `deriveContentType` using the post-update `video_url` and `pdf_file_id` (ignore a client-sent `contentType` for that decision; keep the field accepted for compatibility); `appendQuizQuestions(lessonId: string, items: QuizQuestionInput[]): Promise<MutationResult & { created?: number }>` (single insert, order_index continues from max+1; rejects >200 items per call); `interface ModuleNotes { resources: LessonResourceLink[]; documents: LessonDocument[] }`, `getModuleNotes(moduleId): Promise<ModuleNotes>`, `updateModuleNotes(moduleId, input: Partial<ModuleNotes>): Promise<MutationResult>` (rejects flat-type courses with `reason: "flat-type"`, upserts `module_notes`, trashes removed Drive files via the existing `diffLessonFileIds`/`trashDriveFiles`); `deleteModule` also trashes the module's `module_notes.documents` files. `getBuilderState` computes `hasVideo` (video_url or video_url_2 non-empty) and `quizCount` per lesson; quiz counts are read in pages of 1000 rows (PostgREST cap) or via grouped counts, and `notesCount` from `module_notes`.
- Routes: `POST /api/admin/lessons/[lessonId]/quiz-questions/bulk` body `{ questions: [{question, options, correctIndex}] }` returns `{ created: number }`; `GET|PATCH /api/admin/modules/[moduleId]/notes` (PATCH body `{ resources?, documents? }` validated with the same zod shapes as lessons).

- [ ] **Step 1: Write failing tests**: `updateLesson` with video then cleared sets content_type `video` then `text`; with `pdfFileId` and no video sets `pdf`; `appendQuizQuestions` inserts 3 rows with order_index continuing after the current max (mock max=4 gives 5,6,7) and never deletes; `updateModuleNotes` on a flat-type course returns `flat-type`; `getBuilderState` marks a lesson with only `video_url_2` as `hasVideo`; schema test: `lessonUpdateSchema` accepts `videoUrl2`.
- [ ] **Step 2: Run** and see failures.
- [ ] **Step 3: Implement** the functions, schema fields and the two routes (mirror existing route files for auth, parsing and error shapes).
- [ ] **Step 4: Run** new and existing `tests/admin-lms.schema.test.ts`; tsc clean.
- [ ] **Step 5: Commit** `feat: admin data layer for second video, module notes, bulk quiz append`.

### Task 5: Copy module, copy course, module-notes document route

**Files:**
- Modify: `src/lib/data/admin-lms.ts`
- Create: `src/app/api/admin/modules/[moduleId]/copy/route.ts`, `src/app/api/admin/courses/[id]/copy/route.ts`, `src/app/api/modules/[id]/documents/[fileId]/route.ts`
- Test: `tests/admin-lms-copy.test.ts`

**Interfaces:**
- Produces: `copyModule(moduleId: string): Promise<MutationResult & { filesToReupload?: number }>` (new module appended at the end with title + " (copy)", lessons with title/content_type/video_url/video_url_2/text_content/resource_urls and their quiz questions copied; `pdf_file_id` and `documents` NOT copied; module notes links copied, documents not; returns count of skipped files); `copyCourse(courseId: string): Promise<{ ok: true; id: string; slug: string; filesToReupload: number } | { ok: false; reason: "not-found" | "db-error" }>` (carry/not-carry list from Global Constraints; slug `<slug>-copy`, then `-copy-2`, `-copy-3`... until unused; `is_published=false`, `status='draft'`; if a later insert fails, delete the partly created course so no half-copy is left).
- Route `GET /api/modules/[id]/documents/[fileId]`: same shape as `src/app/api/lessons/[id]/documents/[fileId]/route.ts` but reads `module_notes.documents` through the student's own Supabase client (so RLS enforces enrollment) and 404s when the file id is not in that module's list.

- [ ] **Step 1: Write failing tests**: copyModule creates N lessons and the same number of questions, skips documents and reports the count; copyCourse picks `-copy-2` when `-copy` exists; copyCourse of a zero-module course succeeds; a failing lesson insert removes the new course (assert delete called).
- [ ] **Step 2: Run** and see failures.
- [ ] **Step 3: Implement** both functions with explicit column lists (check every column name against `supabase/migrations`), the two copy routes (`requireAdmin`), and the document route.
- [ ] **Step 4: Run** tests; tsc; lint.
- [ ] **Step 5: Commit** `feat: copy module, copy course, module notes document route`.

### Task 6: Student side renders by parts

**Files:**
- Modify: `src/lib/data/lms.ts`, `src/components/lms/LessonContent.tsx`, `src/components/lms/LessonSidePanel.tsx`, `src/app/portal/[slug]/lessons/[lessonId]/page.tsx`
- Test: `tests/lesson-content.test.tsx`

**Interfaces:**
- Consumes: `module_notes` and `lessons.video_url_2` (Task 1).
- Produces: `LessonView` gains `videoUrl2: string | null` and `moduleNotes: { resources: LessonResource[]; documents: LessonDocument[]; moduleId: string }`. In `getLessonForStudent`, keep the existing select unchanged and run two extra TOLERANT queries (`select("video_url_2")` on the lesson; `module_notes` by the lesson's module id) whose errors are ignored and default to null/empty, so a missing migration changes nothing. `LessonContent` renders: video 1, then video 2 (each in the existing aspect-video iframe, titled "Part 1/Part 2" only when two exist), then the lesson PDF if present, then written text if non-empty; it no longer picks one branch by `contentType`, and shows the old "No content." only when none exist. `LessonSidePanel` gains a `moduleNotes` prop and renders a "Module notes" group (links via the same markup as resources; documents via `/api/modules/<moduleId>/documents/<fileId>`) below the lesson's own notes, hidden when empty.

- [ ] **Step 1: Write failing tests** (render `LessonContent`): video only; two videos show two iframes with Part 1/Part 2; type `text` lesson that has a video URL still shows the video (the Hypertension case); text only; nothing gives "No content."; side panel shows "Module notes" only when present.
- [ ] **Step 2: Run** and see failures.
- [ ] **Step 3: Implement** the changes; pass `moduleNotes` and `videoUrl2` through the page.
- [ ] **Step 4: Run** tests; tsc; lint.
- [ ] **Step 5: Commit** `feat: student lesson page shows every part a session has`.

### Task 7: Lesson editor rebuilt around parts

**Files:**
- Modify: `src/components/admin/program/LessonEditorPanel.tsx`, `src/components/admin/program/QuizEditor.tsx`
- Create: `src/components/admin/program/VideoField.tsx`, `src/components/admin/program/NotesSection.tsx`, `src/components/admin/program/QuizPasteDialog.tsx`
- Test: `tests/course-builder-editor.test.tsx`

**Interfaces:**
- Consumes: `checkVideoLink` (Task 2), `parseQuizPaste` + `QUIZ_PASTE_EXAMPLE` (Task 3), bulk route (Task 4).
- Produces: `VideoField({ label, value, onSave })` showing the checked state ("YouTube video found" / the unsupported or invalid message) as soon as input blurs; `NotesSection({ links, documents, onLinksChange, onDocumentsChange, onUploadFile, documentHref })` reused for lesson and module notes (Drive/other link rows exactly like today's External Resources, plus PDF upload list); `QuizPasteDialog({ lessonId, onAdded })` with a text area prefilled placeholder `QUIZ_PASTE_EXAMPLE`, a live preview list of parsed questions, a red list of errors with question numbers, and an "Add N questions" button disabled while errors exist or zero questions parse.
- `LessonEditorPanel`: remove the Text/Video/PDF toggle; sections in order Video, optional "+ Add a second video" (max two), Notes for this session (links + PDFs; the old single "Lesson PDF" upload is dropped from the UI, an existing `pdfFileId` shows as a read-only document row with View), Quiz (QuizEditor, with "+ Add question" and "+ Paste many questions" buttons and a question count), Written text (collapsed "Extra reading (optional)" using `RichTextEditor`, open when text exists). Keep autosave behaviour, "Preview Lesson" link, Save & Continue. New default question text for "Add Question" stays but the card is focused on its text field. Admin copy in plain words.

- [ ] **Step 1: Write failing tests**: `VideoField` shows the unsupported message for a Drive link; `QuizPasteDialog` disables the add button while an error exists, enables it for a clean paste, and posts the parsed questions to the bulk route on click (mock fetch); `LessonEditorPanel` renders no "Text"/"Video"/"PDF" toggle and shows the "Add a second video" control only until two videos are set.
- [ ] **Step 2: Run** and see failures.
- [ ] **Step 3: Implement** components and wire the editor; keep each new file under ~200 lines.
- [ ] **Step 4: Run** tests; tsc; lint.
- [ ] **Step 5: Commit** `feat: lesson editor shows video, notes, quiz together with paste-many questions`.

### Task 8: Outline readiness, module notes, copy buttons, publish confirm

**Files:**
- Modify: `src/components/admin/program/CurriculumMap.tsx`, `src/components/admin/program/CourseBuilder.tsx`, `src/app/dashboard/admin/courses/[id]/builder/page.tsx` (only if props change)
- Create: `src/components/admin/program/ModuleNotesPanel.tsx`, `src/components/admin/program/PublishConfirmDialog.tsx`
- Test: `tests/course-builder-outline.test.tsx`

**Interfaces:**
- Consumes: `BuilderLesson.hasVideo/quizCount`, `BuilderModule.notesCount` (Task 4), `sessionReadiness`/`courseReadiness`/`missingSummary` (Task 2), copy routes and module notes route (Tasks 4-5), `NotesSection` (Task 7).
- Produces: each outline row shows a green dot when ready, an amber ring plus a short reason ("no video", "no quiz") when not, and the old content-type icon is replaced by the dot; module header shows a "Notes" chip (count) that opens `ModuleNotesPanel` (the lesson editor area switches to module notes via a `selectedModuleId` state in `CourseBuilder`), a "Copy module" button (calls the copy route then `router.refresh()`, toasts any `filesToReupload`); header shows `courseReadiness(...).label`; "Publish" (not "Unpublish") opens `PublishConfirmDialog` listing `missingSummary` lines when anything is missing ("Publish anyway" / "Go back"), and publishes directly when everything is ready; a "Copy course" action beside "Basics" calls the course copy route and navigates to the new course's builder. Flat types (`flat === true`) show no module header, no module notes, no module copy. `handleLessonPatched` keeps `hasVideo` in sync after edits and quiz count changes update `quizCount` (QuizEditor reports the new count up).

- [ ] **Step 1: Write failing tests**: a row with no quiz in a `course` shows the "no quiz" reason and a webinar row without a quiz does not; header label reads "Ready: 1 of 2 sessions"; clicking Publish with a gap opens the confirm listing "Day 6: no video"; clicking Publish when all ready calls the publish route directly; flat course renders no "Copy module".
- [ ] **Step 2: Run** and see failures.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests; tsc; lint.
- [ ] **Step 5: Commit** `feat: course outline readiness, module notes, copy, publish confirm`.

### Task 9: Whole-branch verification and owner handoff

**Files:**
- Modify: none expected (fixes only)
- Create: `docs/superpowers/plans/2026-10-23-course-builder-v2-owner-steps.md` (plain-language steps: paste migration 0085 first, then deploy; what to click to check Hypertension, PPC, a new test course; how to delete the test course)

- [ ] **Step 1: Full checks.** tsc 0; eslint on all touched paths; full vitest in the background (about 3 minutes): only the 5 known unrelated failures remain.
- [ ] **Step 2: Review against the database.** Verify every column and table named in new code exists in `supabase/migrations` (including 0085), every `onConflict`/upsert target is a real unique key (`module_notes.module_id`), and nothing new selects `video_url_2`/`module_notes` on a student path without the tolerant wrapper.
- [ ] **Step 3: Manual check list** in the owner-steps doc (owner clicks; do not use the Playwright browser against the live site): Hypertension lessons show videos after migration; PPC unchanged (12 videos, 10 questions per day, notes); build a 2-day test course using paste-many; copy it; delete both.
- [ ] **Step 4: Commit** `docs: course builder v2 owner steps`.
