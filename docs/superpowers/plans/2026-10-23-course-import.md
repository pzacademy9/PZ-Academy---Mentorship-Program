# Build a Course From a File Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff upload one AI-written text file, see a no-save preview with plain-word warnings, and create a draft course (modules, sessions, videos, notes links, quizzes).

**Architecture:** A pure parser + validator module (`src/lib/lms/course-import/`) turns the file text into a normalised plan plus warnings; a data function inserts it all-or-nothing (insert, delete the course on any failure, as `copyCourse` does); two admin-only API routes (preview, create) both re-parse the posted text; one admin page with the three-step UI; the master prompt lives in code.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (service-role admin client), Vitest, zod. No new dependency, no migration.

**Spec:** `docs/superpowers/specs/2026-10-23-course-import-design.md` (read it first; this plan only decides what the spec leaves open).

## Global Constraints

- Format id `pz-course/1`. Types allowed: `course`, `workshop`, `webinar` (never `mentorship`).
- Upload only ever CREATES a draft: `status: "draft"`, `is_published: false`, `price_pkr: 0` (what `createCourse` does). Never updates or overwrites.
- Blocks creation only for: unreadable/empty/over-size file, wrong or missing `format`, missing course title, unknown `type`, malformed structure, no sessions at all, any cap exceeded, a title over 200 characters. Everything else is a warning and the draft is still created.
- A broken quiz question is left out; the rest of that session's questions are kept; warning names the session and question number.
- Caps (each over = blocking error): 400,000 characters, 12 modules, 60 sessions, 200 questions per session, 2,000 questions per course.
- Staff-visible text is plain words: say "session", "video link", "quiz question", "notes link". No "parse", "YAML", "schema", "RPC".
- Admin only: every route calls `requireAdmin()` (`src/lib/auth/require-admin.ts`); the page calls `requireAdminPage()`.
- The create route trusts only the posted text: it re-runs the same analysis, never a client-sent plan.
- Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. New commits only, never amend.
- Windows repo; `npm run` is broken (the `&` in the path). Use `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js <paths>`. Source files are often CRLF: use the Edit tool. Never add `eslint-disable @typescript-eslint` comments. Never regenerate `database.types.ts`.
- Known failing tests not ours: `tests/pz-tokens.test.ts`, `tests/landing-route-hardening.test.ts`, `tests/gas-apply-registration-status.test.ts`, `tests/landing-event-sheet.test.ts`.

## Review Focus

Inputs the spec implies but a happy-path test would miss, most likely first. Each has a pinning test in the owning task.

1. AI chat output wrapped in a code fence with chatter before/after the file: the fence's content is used, outside text ignored (Task 1).
2. Windows line endings, a leading BOM, smart quotes, en-dashes, Urdu/Arabic or accented titles, `Day 1: Intro` (a colon inside a title) (Task 1).
3. A session whose quiz has zero good questions, or one bad question in the middle of ten: the good nine are kept and the bad one is named by number (Task 2).
4. Type mismatch: a `## Module:` heading in a workshop/webinar file; a `### Session:` before any module in a course file (Task 1).
5. Create fails halfway (a failing insert): no course row is left behind, and the staff message is plain (Task 3). Double-click on Create must not make two courses (Task 5, button disabled while the request is in flight).

---

## File Structure

- Create `src/lib/lms/course-import/format.ts`: format id, limits, shared types.
- Create `src/lib/lms/course-import/parse.ts`: text -> raw structure (headings, key lines, fence stripping).
- Create `src/lib/lms/course-import/analyze.ts`: raw -> normalised plan + warnings + summary (video links, notes links, quiz paste, caps).
- Create `src/lib/lms/course-import/prompts.ts`: `masterPrompt()`.
- Create `src/lib/data/course-import.ts`: `createCourseFromPlan(plan)`.
- Create `src/app/api/admin/courses/import/preview/route.ts` and `src/app/api/admin/courses/import/route.ts`.
- Create `src/app/dashboard/admin/courses/import/page.tsx` and `src/components/admin/program/CourseImport.tsx`.
- Modify `src/components/admin/program/ProgramLibraryTable.tsx` (add the "Build from file" link beside "New course", around line 151).
- Tests: `tests/course-import-parse.test.ts`, `tests/course-import-analyze.test.ts`, `tests/course-import-create.test.ts`, `tests/course-import-routes.test.ts`, `tests/course-import-prompt.test.ts`.

---

### Task 1: Format constants and the file reader

**Files:**
- Create: `src/lib/lms/course-import/format.ts`, `src/lib/lms/course-import/parse.ts`
- Test: `tests/course-import-parse.test.ts`

**Interfaces:**
- Produces (format.ts):
  - `COURSE_IMPORT_FORMAT_ID = "pz-course/1"`
  - `COURSE_IMPORT_LIMITS = { maxChars: 400_000, maxModules: 12, maxSessions: 60, maxQuestionsPerSession: 200, maxQuestionsPerCourse: 2000, maxTitle: 200, maxLabel: 150, maxNotesPerSession: 20 } as const`
  - `type ImportCourseType = "course" | "workshop" | "webinar"`
  - `type RawNote = { label: string; url: string; line: number }`
  - `type RawSession = { title: string; line: number; video: string; video2: string; notes: RawNote[]; quizText: string; quizLine: number }`
  - `type RawModule = { title: string; line: number; notes: RawNote[]; sessions: RawSession[] }` (flat types: exactly one module with `title: ""`)
  - `type RawCourse = { title: string; type: ImportCourseType; modules: RawModule[]; unassignedNotes: RawNote[] }`
- Produces (parse.ts): `parseCourseFile(text: string): { ok: true; raw: RawCourse; warnings: string[] } | { ok: false; errors: string[] }`

- [ ] **Step 1: Write failing tests in `tests/course-import-parse.test.ts`.** Names and assertions:
  - `reads a course file with two modules` : title, type `course`, module titles, session titles, video, video2, a `notes: Label | https://x.y/z` line under a module and one under a session (label/url split), quiz text kept verbatim and `quizLine` equal to the 1-based line of the first quiz text line.
  - `a note with no label keeps the link` : `notes: https://x.y/z` gives `label: ""`, `url: "https://x.y/z"`.
  - `session titles may contain colons` : `### Session: Day 1: Intro` gives title `Day 1: Intro`.
  - `workshop file has sessions straight under the top lines` : one module with `title: ""`.
  - `strips a code fence and chat text around it` (Review Focus 1).
  - `accepts CRLF, a BOM, smart quotes and non-Latin titles` (Review Focus 2): title `پریکٹیکل فارماکولوجی – Batch 2` survives unchanged.
  - `keys are case-insensitive` (`Video:`, `TITLE:`).
  - `unknown lines before the first heading are a warning, not an error`.
  - Blocking errors (assert exact plain messages, each also tested): empty text; missing/wrong `format` ("This file is not in the right layout. The first line must say format: pz-course/1."); missing title ("The course needs a title."); unknown type ("The type must be course, workshop or webinar."); `## Module:` in a workshop file ("Workshops and webinars have sessions only, no modules."); `### Session:` before any module in a course file ("A session at line N is not inside a module."); a heading with no title ("The module at line N has no title."); more than `maxChars`.
  - Content under `quiz:` stops at the next `## `/`### ` heading; a `notes:` line after `quiz:` text started is treated as quiz text (quiz swallows everything until the next heading).
- [ ] **Step 2: Run, expect FAIL** (`node node_modules/vitest/vitest.mjs run tests/course-import-parse.test.ts`; modules not found).
- [ ] **Step 3: Implement `format.ts` and `parse.ts`.** Line-by-line state machine; headings matched by `^##\s+Module:\s*(.*)$`, `^###\s+Session:\s*(.*)$`, `^##\s+Unassigned notes\s*$` (case-insensitive); keys by `^(format|title|type|video|video2|notes|quiz)\s*:\s*(.*)$` (case-insensitive) but only outside quiz mode; once `quiz:` is seen every line (including blank ones, kept verbatim) is quiz text until the next heading. Note split: first ` | ` separates label from url, otherwise the whole value is the url. Fence stripping: if the text contains a line starting with three backticks, use the content of the first fenced block that contains `format:`; otherwise use the whole text. Normalise CRLF to LF and drop a BOM first. Messages are the exact strings above; no error mentions the parser.
- [ ] **Step 4: Run tests, expect PASS.** Also `node node_modules/typescript/bin/tsc --noEmit` and eslint on the new files: clean.
- [ ] **Step 5: Commit** `feat: course import file reader`.

---

### Task 2: Analyze — validate, normalise, warn, summarise

**Files:**
- Create: `src/lib/lms/course-import/analyze.ts`
- Test: `tests/course-import-analyze.test.ts`

**Interfaces:**
- Consumes: `parseCourseFile`, the Raw* types, `COURSE_IMPORT_LIMITS` (Task 1); `parseQuizPaste` and `QuizPasteError` from `src/lib/lms/quiz-paste.ts`; `checkVideoLink` from `src/lib/video-link.ts`; `QuizQuestionInput`, `LessonResourceLink` from `src/lib/data/admin-lms.ts` (import types only; do not pull server code into client bundles: use `import type`).
- Produces:
  - `type ImportSession = { title: string; videoUrl: string; videoUrl2: string; notes: LessonResourceLink[]; questions: QuizQuestionInput[] }`
  - `type ImportModule = { title: string; notes: LessonResourceLink[]; sessions: ImportSession[] }`
  - `type ImportPlan = { title: string; type: ImportCourseType; modules: ImportModule[] }`
  - `type ImportSummary = { modules: number; sessions: number; videos: number; questions: number; sessionList: { module: string; title: string; videoUrl: string; firstQuestion: string }[]; unassignedNotes: LessonResourceLink[] }`
  - `analyzeCourseFile(text: string): { ok: true; plan: ImportPlan; warnings: string[]; summary: ImportSummary } | { ok: false; errors: string[] }`
  - `videos` counts every non-empty kept video link (video + video2).

- [ ] **Step 1: Write failing tests** in `tests/course-import-analyze.test.ts`:
  - `good file gives plan, counts and session list`: counts match; `sessionList[i].firstQuestion` is the first question text.
  - `session without a video link warns "needs a video link" and is still created`: warning text `Day 7 (Module 2): needs a video link.`
  - `Drive link as a video is dropped and named`; `invalid link dropped`; `Vimeo and YouTube kept for video and video2` (rules from spec).
  - `one bad question in the middle keeps the others` (Review Focus 3): ten questions, number 6 has no `Answer:` line; plan has 9 questions; warning is `Day 4, question 6: left out (<parser message>).`
  - `session with no quiz warns`; `session whose quiz has no good question warns and has zero questions`.
  - `note with no label gets the site name` (`drive.google.com`); `non-web note link (mailto:) dropped and named`; `note label over 150 characters dropped and named`; `more than 20 notes on one session: first 20 kept, warning`.
  - `flat type with notes before the first session warns and lists them as unassigned`; module with no sessions warns.
  - `unassigned notes are returned in summary and not in the plan`.
  - Blocking: no sessions at all ("The file has no sessions."); a title over 200 characters; 13 modules; 61 sessions; 201 questions in a session; 2,001 questions in the course. Parser errors pass through unchanged.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement `analyzeCourseFile`.** Label session in messages as the session title, plus the module title in brackets only when the course type has modules. Question numbers come from `QuizPasteError.questionNumber`. Count questions after dropping bad ones when applying the caps (cap on questions the parser returned). Site name for an unlabelled note is `new URL(url).hostname` without `www.`.
- [ ] **Step 4: Run tests, tsc, eslint: PASS/clean.**
- [ ] **Step 5: Commit** `feat: course import checks and warnings`.

---

### Task 3: Create the draft course (all or nothing)

**Files:**
- Create: `src/lib/data/course-import.ts`
- Test: `tests/course-import-create.test.ts`

**Interfaces:**
- Consumes: `ImportPlan` (Task 2); `createCourse`, `ensureDefaultModule`, `usesFlatSessions` helpers from `src/lib/data/admin-lms.ts` / validations; `deriveContentType` from `src/lib/lms/lesson-parts.ts`; `createAdminSupabase`.
- Produces: `createCourseFromPlan(plan: ImportPlan): Promise<{ ok: true; id: string; slug: string } | { ok: false; reason: "db-error" }>`

- [ ] **Step 1: Write failing tests** following `tests/admin-lms-copy.test.ts` (same `createSupabaseMock` / `memoryHandler` helpers, `vi.mock("server-only")`):
  - `creates modules, lessons, notes and quiz questions in order`: 2 modules x 2 sessions; order_index 0.. per parent; `video_url`, `video_url_2` stored (empty becomes null); `content_type` from `deriveContentType`; session notes in `resource_urls`; module notes rows in `module_notes` with `resource_urls` and `updated_at` set; each question has `correct_index`, `order_index`.
  - `workshop plan puts sessions in the hidden module`: no module titles needed; uses `ensureDefaultModule`; no `module_notes` rows.
  - `a failing lesson insert leaves no course behind` and `a failing quiz insert leaves no course behind` (Review Focus 5): afterwards `courses` store is empty; result `{ ok:false, reason:"db-error" }`.
  - `quiz rows are inserted in chunks of 500`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Call `createCourse({ title, type })` (gives the draft, unique slug, and the hidden module for flat types); then pre-generate UUIDs for modules and lessons with `crypto.randomUUID()`; bulk insert `modules` (`id, course_id, title, order_index`), `lessons` (`id, module_id, title, content_type, order_index, video_url, video_url_2, resource_urls`), `module_notes` (`module_id, resource_urls, updated_at: new Date().toISOString()`, only for modules with notes, course type only), `quiz_questions` (`lesson_id, question, options, correct_index, order_index`) in chunks of 500. Any error: delete the course by id (children cascade; confirm the cascade in `supabase/migrations/`) and return `db-error`. Before coding, check every column name and the `resource_urls` JSON shape against `supabase/migrations/` and the live DB (read-only Supabase MCP, project `whqdasotjlhvrjmgiffk`); the mock hides wrong names.
- [ ] **Step 4: Run tests, tsc, eslint: PASS/clean.**
- [ ] **Step 5: Commit** `feat: create a draft course from an import plan`.

---

### Task 4: Preview and create routes

**Files:**
- Create: `src/app/api/admin/courses/import/preview/route.ts`, `src/app/api/admin/courses/import/route.ts`
- Test: `tests/course-import-routes.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `analyzeCourseFile` (Task 2), `createCourseFromPlan` (Task 3).
- Produces (JSON):
  - `POST /api/admin/courses/import/preview` body `{ text: string }` -> `200 { title, type, warnings: string[], summary: ImportSummary }` or `400 { errors: string[] }`
  - `POST /api/admin/courses/import` body `{ text: string }` -> `201 { id, slug, warnings: string[], summary: ImportSummary }`, `400 { errors }`, `500 { errors: ["Something went wrong while creating the course. Nothing was saved; please try again."] }`
  - Both: non-admin gets the `requireAdmin()` response unchanged; body larger than the character cap (checked on the raw body before JSON parse, same approach as `src/app/api/admin/landing-pages/import/route.ts`) gets `400 { errors: ["That file is too big to import."] }`; bad body gets `400 { errors: ["Choose a file or paste the text first."] }`. `export const maxDuration = 60`.

- [ ] **Step 1: Write failing tests** (mock `requireAdmin`, `analyzeCourseFile` real, `createCourseFromPlan` mocked): non-admin returns the auth response and never calls create; preview never calls create; create returns 201 with warnings; analysis errors return 400 and never call create; create failure returns the 500 message; oversize body; missing `text`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement both routes** modelled on `src/app/api/admin/landing-pages/import/route.ts`.
- [ ] **Step 4: Run tests, tsc, eslint: PASS/clean.**
- [ ] **Step 5: Commit** `feat: course import preview and create routes`.

---

### Task 5: Master prompt, page and three-step screen

**Files:**
- Create: `src/lib/lms/course-import/prompts.ts`, `src/app/dashboard/admin/courses/import/page.tsx`, `src/components/admin/program/CourseImport.tsx`
- Modify: `src/components/admin/program/ProgramLibraryTable.tsx` (link beside "New course" near line 151)
- Test: `tests/course-import-prompt.test.ts`

**Interfaces:**
- Consumes: `COURSE_IMPORT_FORMAT_ID`, `COURSE_IMPORT_LIMITS` (Task 1), `QUIZ_PASTE_EXAMPLE` (`src/lib/lms/quiz-paste.ts`), the two routes (Task 4).
- Produces: `masterPrompt(): string`; component `CourseImport({ prompt }: { prompt: string })`.

- [ ] **Step 1: Write failing test `tests/course-import-prompt.test.ts`**: the prompt contains `pz-course/1`, `QUIZ_PASTE_EXAMPLE` verbatim, each limit number, the words "never invent", "## Unassigned notes", and a complete example that itself passes `analyzeCourseFile` with no blocking error (guards drift between prompt and parser).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement `masterPrompt()`** per the spec's "The master prompt" section: what the AI receives, the exact file layout with one short complete example, rules (titles and order from the course info files; match links, notes, questions by lecture name or day; never invent a video link or quiz question; empty `video:` when no link; unplaceable notes under `## Unassigned notes`; ask before guessing; no explanations in the quiz; return the whole file in one code block). Plain language. Derive numbers from `COURSE_IMPORT_LIMITS`.
- [ ] **Step 4: Run test, expect PASS.**
- [ ] **Step 5: Implement the page and component.** Page: `requireAdminPage()`, heading "Build a course from a file", renders `<CourseImport prompt={masterPrompt()} />`; copy the page/heading/class patterns from `src/app/dashboard/admin/landing-pages/ai/page.tsx` and the copy-button logic from `src/components/admin/landing/MakeWithAi.tsx`. Component states: `start` (copy button, list of what to attach, file picker or paste box), `preview` (title and type, counts, "Nothing saved yet" banner, session-by-session list, warnings list, "Create draft course" and "Choose a different file" buttons), `done` ("Draft course created", still-to-do: add images then publish, the same warnings as "Needs your attention", the unassigned notes shown in full as copyable text, "Open course editor" link to `/dashboard/admin/courses/<id>`). Errors from `400` shown as a list in plain words, staying on `start`. The Create button is disabled while the request runs (Review Focus 5). Layout follows the approved mock (3 steps) in the existing admin style and tokens; follow the `pz-` tokens (see the known `pz-tokens` test) and use `pz-solid-danger` for non-text danger utilities. Reading the file: `file.text()` in the browser, same as the landing import.
- [ ] **Step 6: Entry point.** Add a "Build from file" link (to `/dashboard/admin/courses/import`) beside "New course" in `ProgramLibraryTable.tsx`, same button styling as its neighbour.
- [ ] **Step 7: Run** the new tests, tsc, eslint on the touched files, plus `tests/pz-tokens.test.ts` (only the pre-existing `SalesTeamPanel.tsx` offender may fail).
- [ ] **Step 8: Commit** `feat: build a course from a file screen`.

---

### Task 6: Prove it on real data (no new code unless a bug shows)

**Files:** none planned; fix anything found in its owning file with a new commit and a test.

- [ ] **Step 1:** Start the dev server (`node node_modules/next/dist/bin/next dev -p 3000`, never `next build` meanwhile). Log in as the admin test account (see memory `pz-academy-test-accounts`).
- [ ] **Step 2:** Write a realistic file for PPC Batch 2 from `PZ Academy Databases/Data Base (PPC-B2).md` (4 modules x 3 days, titles from the file; some YouTube links, one day with none, one Drive link in the wrong place, one question with no answer). Upload; check the preview: counts, warnings in plain words, nothing saved (courses list unchanged).
- [ ] **Step 3:** Create; open the new draft in the course editor (Course Builder v2): modules, sessions, videos, notes, quiz count per session match; session readiness shows the missing video; students see nothing (draft).
- [ ] **Step 4:** Repeat with a workshop-type file. Delete both test courses afterwards through the normal course delete.
- [ ] **Step 5:** Full suite in the background (`node node_modules/vitest/vitest.mjs run`, about 3 minutes): only the known failing tests fail. Note the result.

---

## Self-review

- Spec coverage: flow (Task 5), file layout (Tasks 1, 5 prompt), rules blocking/warn (Tasks 1, 2), create all-or-nothing (Task 3), admin-only and re-parse (Task 4), caps (Tasks 1, 2), master prompt (Task 5), tests listed in the spec (each task), unassigned notes shown not stored (Tasks 2, 5), no migration (none planned).
- Deviation from the spec text, a builder call: flat types call `createCourse` (which already calls `ensureDefaultModule`) and then read the hidden module, instead of inserting that module inside the bulk insert. Same rollback.
- Type names consistent across tasks: `RawCourse`, `ImportPlan`, `ImportSummary`, `analyzeCourseFile`, `createCourseFromPlan`, `masterPrompt`.
