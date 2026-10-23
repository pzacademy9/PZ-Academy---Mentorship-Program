# Build a course from a file (Course Builder project 2)

Date: 2026-10-23. Branch `course-import` (off main after PR #30). Builds on Course Builder v2 (migration 0085 is live).

## Why

Building a course by hand means typing every module and session title, pasting every video link, and entering every quiz question. Staff find each of these slow and error-prone (copy-paste mistakes). Real shapes: PPC = 4 modules x 3 days, about 10 questions a day, notes per day; MDC = 1 module, 4 days, 20 questions a day.

Idea: staff give Claude or ChatGPT the course info files, a list of YouTube links with lecture names, a quiz file (Word or PDF, correct answers marked, no explanations) and Drive note links, together with a master prompt that this app provides. The AI returns ONE file in a fixed format. The app reads it, shows a preview (nothing saved), then creates the course as a DRAFT. Staff then add images and publish.

## Goals

- One extra way to start a course: "Build from file", next to "New course" on the Courses page. Manual building stays fully available.
- Everything the course *structure* needs comes from the file: course name and type, modules, sessions, one or two videos per session, notes links (per module or per session), one quiz per session.
- A preview that saves nothing and lists every problem in plain words.
- The file is plain text staff can open and edit; they can also go back to the AI, or create the draft anyway and fix by hand.

## Non-goals

- Course details (description, tagline, instructor, features, outcomes, FAQs, duration, timings): typed by hand as today. Decided by owner: "only the relevant data".
- Images, price, publishing: manual.
- Several courses in one file: one course per file.
- Updating an existing course. Upload only ever CREATES a new draft. A live course is edited by hand in the editor. A new draft with nobody enrolled can be deleted and re-imported from a corrected file.
- Reading inside Drive files: the app cannot. Note links are attached as links.
- Mentorship courses (no modules or quizzes).

## Anti-goals (failure even if it technically works)

- A preview or create that traps staff: only an unreadable file or a missing course name may stop creation.
- Invented quiz questions. The master prompt tells the AI never to invent questions or links.
- A half-created course left behind after a failure.
- Jargon in anything staff read.

## The flow (3 steps, mocked in the visual companion and approved)

1. **Get the file**: copy-instructions button (the master prompt), a plain list of what to attach (course info files, YouTube list with lecture names or days, quiz file, Drive note links), and a drop area for the file the AI returns.
2. **Check before saving**: course name and type, counts (modules, sessions, videos, quiz questions), a session-by-session list (title, video link, first quiz question) to spot mix-ups, a banner "Nothing saved yet", the list of warnings, a "Create draft course" button, and a hint that the file can be fixed and uploaded again.
3. **Done**: "Draft course created", still to do (images, publish), a "needs your attention" list (same warnings, session by session), button to open the course editor. Unassigned note links are shown here in full so they can be copied.

Stitch screens do not exist for this flow. Build in the existing admin style (follow the Course Builder v2 screens in `docs/design/course-builder-v2/`); owner may supply Stitch screens later.

## The file format `pz-course/1` (builder-check ruling: forgiving text layout, not YAML)

AI-written quiz text is full of colons, dashes and quotes, and one bad indent in YAML would block the whole file. So the file is plain markdown-style text with headings and simple `key: value` lines, read by a small custom line parser (no YAML library). Staff can read and edit it. Pattern otherwise copied from the landing import (`docs/superpowers/specs/2026-10-17-landing-import-format.md`, `src/lib/landing/import/`): format id first, master prompt in code, create-only, blocking errors vs warnings.

```
format: pz-course/1
title: Practical Pharmacology – Batch 2
type: course

## Module: Foundations of Clinical Pharmacology & Safe Prescribing
notes: Module 1 notes | https://drive.google.com/...
notes: Slides | https://drive.google.com/...

### Session: Day 1: Introduction to Clinical Pharmacology
video: https://youtu.be/xxxx
video2: https://youtu.be/yyyy
notes: Day 1 handout | https://drive.google.com/...
quiz:
Which vitamin is essential for blood clotting?
A) Vitamin A
B) Vitamin K
Answer: B

Next question?
A) ...
Answer: C

## Unassigned notes
notes: Extra slides | https://drive.google.com/...
```

Rules of the layout: top lines `format`, `title`, `type` (course | workshop | webinar); `## Module: <title>` starts a module (type course only); `### Session: <title>` starts a session (title is the rest of the line, so colons are fine); under a session the keys `video:`, `video2:`, `notes: <label> | <url>` (repeatable; label optional, then just the url), and `quiz:` which swallows every following line up to the next heading (or end) as paste-format text for `parseQuizPaste` (`src/lib/lms/quiz-paste.ts`). `notes:` right under a module (before its first session) is a module note. For `workshop`/`webinar` there are no `## Module` headings: sessions follow the top lines directly (flat types keep one hidden module; `usesFlatSessions`). Module-level notes in a flat file are a warning. Keys are case-insensitive; CRLF and a BOM are tolerated; the whole file may sit inside one markdown code fence (AI chats wrap it), which the parser strips. Unknown lines before the first heading are a warning, not an error.

Quiz questions use exactly the paste format `parseQuizPaste` already reads, so the AI is given `QUIZ_PASTE_EXAMPLE`. Known limit: the parser rejects `Answer: B - because...`; the prompt says no explanations, and the parser error is reported per question.

## Rules

**Blocks creation (nothing saved):** file empty, over the size limit, not readable as the format, wrong or missing `format`, missing course name, unknown `type`, a wrong shape (a module or session heading without a title, a module heading in a workshop or webinar file, etc.), counts over the limits below. Each message names where (module, session, line if known).

**Warns, still creates (draft made):**
- session without a video link (session is created with no video, listed as "needs a video link");
- a video link that `checkVideoLink` calls empty / invalid / unsupported (e.g. a Drive link as a video): the link is left out and listed;
- session with no quiz, session with a quiz that has zero good questions;
- a broken quiz question (no correct answer marked, too few options, over the limits): that question is left out, the others are kept; listed by session and question number, with the parser's plain message;
- note links that are not web links (e.g. `mailto:`): left out and listed; a note with no label gets the link's site name as its label;
- a video link `checkVideoLink` accepts (YouTube, Vimeo) is kept, for `video` and `video2` alike; anything else is dropped and listed;
- notes in a flat type at module level;
- notes under `## Unassigned notes`: not saved anywhere (my call), shown in full on the Done step so staff can copy them into the right place;
- a module with no sessions.

**Session content type** comes from `deriveContentType` (video present = video, else text). Titles, links and question text are trimmed; the importer never silently truncates: a value over a limit is a blocking error naming the field, same as `parseQuizPaste`.

**Duplicate course title:** allowed; slug gets `-2`, `-3` as `createCourse` does. Course is created `status: draft`, `is_published: false`, `price_pkr: 0` as `createCourse` does.

## Create (all or nothing)

Model on `copyCourse` in `src/lib/data/admin-lms.ts`: pre-generate UUIDs, bulk-insert modules, lessons (with `video_url`, `video_url_2`, `content_type`, `resource_urls` for session notes), `module_notes` rows, and `quiz_questions`; if any step fails, delete the course (children cascade, check this) and report a plain error. Order indexes are 0-based as in the existing helpers. Check `quiz_questions` and `lessons` column names, onConflict targets and RLS against `supabase/migrations/` and the live DB; do not trust mocked tests. `module_notes` has no `updated_at` trigger: the writer must set `updated_at`. Per-session quiz cap is `MAX_BULK_QUIZ_QUESTIONS` (200).

Server action is admin-only, same guard as the other course-builder actions. Preview parses on the server (or in a pure client-safe module reused by both; builder's choice) and the create step re-parses the same text rather than trusting preview data from the browser.

## Limits (builder to confirm against schemas in `src/lib/validations/admin-lms.ts`)

File size about 1 MB; at most 12 modules, 60 sessions, 200 questions per session, 2,000 questions per course (over a cap = blocking error). Title lengths and URL lengths follow the existing course/lesson schemas.

## The master prompt

Held in code (like `src/lib/landing/import/prompts.ts`), shown in the app with a copy button. It tells the AI: you are given course info files, a YouTube list with lecture names or days, a quiz file with correct answers marked, and Drive note links; produce one file exactly in `pz-course/1`; take module and session titles and order from the course info files; match links, notes and questions by lecture name or day; use the existing course type words; never invent a video link or a quiz question; leave `video` empty when there is no link; put note links it cannot place under `## Unassigned notes`; ask the user before guessing; return the file in one code block. The prompt includes one short complete example. The quiz example is `QUIZ_PASTE_EXAMPLE`. Prompt wording is plain language; it must not drift from the parser, so derive field names and limits from shared constants where possible.

## Tests that must exist

- Parser: good file, each blocking error, each warning, flat types, CRLF input, quiz with a bad question in the middle, non-Latin-1 text.
- Create: success counts, rollback on a failing step (no course left), flat type hidden-module behaviour, notes written to the right place.
- Admin-only guard; a non-admin cannot preview or create.
- The master prompt contains the format id and the quiz example (so it cannot drift).

## Left to the builder

File/route names, exact UI layout within the existing admin style, file size and count limits, whether parsing is shared client/server, the exact warning wording (plain words, no jargon: say "session", "video link", "quiz question"), and how the Done step presents the unassigned note links.

## Owner decisions on record

- Both manual building and file import must exist.
- Small edits by hand; many mistakes: fix the file and upload again; or fix the AI output, or create the draft anyway and edit by hand.
- Live course changes are manual only; upload never overwrites.
- Broken quiz question: draft is created without it, with an alert.
- One course per file.
- Only structure data is imported (no course details, images, price).
- YouTube list will carry lecture name or day beside each link.

## My calls (flagged for the owner)

- File format is a forgiving markdown-style text layout (headings plus key: value lines, no YAML), editable by staff.
- The preview lists every session with its video link and the first quiz question, so staff can spot AI mix-ups (a quiz under the wrong day). The app cannot detect a wrong match itself.
- No database migration: safe-create is insert-then-delete-on-failure, as `copyCourse` does. The course is a draft, so students never see a half-built one. Flat-type creation inserts its hidden module itself in the bulk insert (no `ensureDefaultModule` call) so everything is pre-generated and rolled back together.
- Caps: 200 questions per session AND 2,000 per course (real courses are 80 to 120), 60 sessions, 12 modules, about 1 MB file.
- Unassigned note links are shown but not stored.
- Module-level notes in workshop/webinar are warnings, not stored.
- Mentorship type excluded.
