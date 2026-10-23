# Course Builder v2 (project 1 of 2)

Date: 2026-10-23. Owner: PZ Academy admin. Project 2 ("Build from file", AI-prepared import) is a separate design that sits on top of this one and is NOT part of this document.

## Why

Building a recorded course is slow and error-prone for non-technical staff. Today they add every module and lesson by title, open each lesson, pick one content type (Text / Video / PDF), paste a video link, then add every quiz question one at a time (a new question starts as "New question" with "Option A / Option B"). There is no copy, no list of what is still missing, and the video link is not checked. A real example of the damage: the live course "Practical Management of Hypertension" has all four YouTube links saved but every lesson is set to type Text, so students see "No content." instead of the video.

Real shape of the courses built so far (read from the live DB, 2026-10-23):
- PPC Batch 2: 4 modules, 12 days, one YouTube video per day, 10 quiz questions per day, 1 to 2 resource links per day.
- MDC: 1 module ("Workshop Sessions"), 4 days, one video per day, 20 questions per day.
- Hypertension: 1 module, 4 days, videos saved but lessons typed Text, no quiz.
- Diabetes (Dr Christine): 4 modules, 12 lessons, 9 videos, no quiz, draft.
- About 17 single-lesson webinar courses.
Staff confirmed: a session has one video (sometimes a second one), notes are mostly per module but can be per session, and every session has exactly one quiz.

## Goals

1. A session shows all its parts together (videos, notes, quiz, optional written text). No content-type switch in the builder.
2. A session can have a second video (optional, max two).
3. Notes can be attached to a module (course type only) or to a single session. Notes are Drive/other links or uploaded PDFs, as today.
4. The course outline shows, per session, whether it is ready (has a video, has a quiz) and the course header shows "Ready: X of Y sessions", so staff always see what is missing.
5. Paste a YouTube/Vimeo link and the builder confirms it is a recognised video link at once; a link the player cannot embed is flagged.
6. "Paste many questions at once": staff paste quiz text in a simple fixed layout (question, options on following lines, correct answer marked) and see a preview before saving. This is the same layout the AI will produce in project 2, so project 2 reuses the parser.
7. Copy a module (with its sessions, videos, notes, quiz) and copy a whole course as a new draft.
8. Student lesson page shows whatever the session has: video, second video, written text, notes, quiz. This also fixes the Hypertension course without anyone retyping links.
9. Manual editing stays fully available forever (the file import in project 2 is an addition, not a replacement).

## Non-goals

- No quiz explanations, no new question types, no shuffling, no quiz pass-mark changes. Quiz stays: question, 2 to 6 options, one correct answer, order.
- No new student features (comments, certificates, new locking rules). Sequential unlocking and "pass the quiz to continue" stay as they are.
- Not building Drive file reading. A Drive link is stored as a link.
- Not redoing the whole admin look (colours, fonts). Use the existing pz design tokens and components; this is a layout and flow change of the course builder.
- The AI file import and master prompt are project 2.

## Anti-goals (failure even if it technically works)

- Breaking any live course or enrolled student's progress (PPC, MDC, Hypertension, Diabetes are live or about to be).
- A builder that needs the owner to explain it. If a new staff member cannot add a video, notes and a quiz to a session unaided, it failed.
- Silent data loss when switching to the new lesson model.

## Decisions made with the owner

- Order: project 1 (this), then project 2.
- Remove the Text/Video/PDF switch from the builder UI.
- Second video is optional.
- Both manual and file-import must exist (file import is project 2).

## Calls made by the designer (owner has not decided these; please check)

- The stored lesson type column stays, because the student sidebar icons, the public course page icons, the private PDF route and the old webinar seed use it. The builder sets it automatically on save: has a video becomes `video`; otherwise has a lesson PDF becomes `pdf`; otherwise `text`. No data migration of existing lessons is required for correctness because the student page will show parts by what exists, not by type.
- Existing lesson PDFs (the old "Lesson PDF" upload) stay and show as an extra document under the lesson. They are not deleted or converted.
- Second video lives in a new nullable column on lessons (name left to the builder, e.g. `video_url_2`). Module notes live in new nullable columns/table on modules mirroring the lesson `resource_urls` and `documents` shapes. Migrations are hand-pasted by the owner (Supabase MCP is read-only); public/student reads must use narrow column lists so deploying code before the migration does not break live pages.
- Module notes only exist for the "course" type. Workshop, webinar and mentorship use one hidden module and a flat session list, so their notes stay on sessions.
- "Ready" for a session = has at least one video AND at least one quiz question. Notes are optional and never block readiness. Publish stays allowed with unready sessions (today's rule is only "at least one session"); the builder shows a confirm listing what is missing instead of blocking.
- The video-link check is client-side shape checking (YouTube watch/youtu.be/live/embed, Vimeo). It does not call YouTube. Google Drive video links are not supported by the current player; they are flagged as "not supported, use YouTube or Vimeo".
- Question paste layout (fixed, shown as an example inside the paste box): question line, option lines starting `A)` `B)` etc., and a line `Answer: B`. Anything it cannot parse is shown in the preview as an error with the question number; nothing is saved until the owner/staff confirms.
- Copy course makes a new draft with the same modules/sessions/quiz and a new slug (`-copy`, with a number if taken); it does not copy students, enrollments, progress, images or the sheet connection.

More calls by the designer, added after the builder check:

- Readiness by type: "Ready" needs a video, plus a quiz only for the `course` and `workshop` types. Webinars (one session, no quiz by nature) need only a video. Mentorship sessions get no readiness badge.
- Pasting many questions only APPENDS to the session's quiz. It never edits or deletes existing questions, so students' past attempts are never disturbed. Fixing a question is done in the normal editor.
- Copy module / copy course duplicate the database rows and the links, but do NOT duplicate uploaded PDF files. The copy lists "these N files need to be uploaded again" instead, so deleting the original can never break the copy.
- Copy course carries: title with " (copy)" added, type, description, price and other catalog text fields, module and session structure, videos, links, quiz. It does NOT carry: students, enrollments, progress, images, instructor photo, landing pages, sheet connection, slug (new unique slug), published state (always draft).
- Student side of module notes: shown in the existing side panel of every session in that module, under a "Module notes" heading, below the session's own notes. Opening notes never counts toward completion.
- Completion and unlocking do not depend on lesson type today (the page offers "Mark complete" whenever a session has no quiz, and the quiz gates the rest), so rendering by parts does not change who is unlocked or completed.
- The stored type is backfilled once inside the migration: lessons of type `text` that have a video link and no written text become `video`. The owner pastes this with the migration. After that the sidebar and public icons are right too.
- "Preview as student" is the existing "Preview Lesson" link in the builder. Keep it, no new bypass; if the admin cannot open it today, the builder should say so plainly rather than fail silently.

## Constraints and hazards for the builder

- `database.types.ts` must not be regenerated; hand-add new columns.
- Supabase writes are pasted by the owner; Supabase MCP is read-only. New migration number follows the latest in supabase/migrations (0084 at time of writing).
- Quiz answer keys must never reach students (`correct_index` is server-only; keep using the existing RPCs). The paste/copy features are admin-only.
- Student reads of lessons go through existing SQL functions and data helpers (`getLessonForStudent`, `getCurriculum`); adding fields there must keep students who have not run the migration working (deploy-order safe).
- Reordering, deleting and the "delete affects student records" confirm flow must keep working.
- PostgREST 1000-row cap applies to any new bulk read.
- Source files are often CRLF; edit with the Edit tool.
- Known 5 failing tests are not ours (see repo notes); tsc baseline is 0.

## Left to the builder

Exact layout of the screen (the owner has seen a rough mockup: outline on the left with a status dot per session and module notes; one session on the right showing video, second video, notes, quiz with "paste many", optional written text, "Preview as student"). Component structure, API routes, column names, tests, mobile behaviour, how copy is implemented (SQL function vs several inserts), and the exact wording of warnings. Wording must be plain, non-technical.

## Success looks like

A new staff member builds a 3-day course (one video, notes, 10 questions per day) in well under 15 minutes without help; the Hypertension course shows its videos to students; no existing course or student progress changes.
