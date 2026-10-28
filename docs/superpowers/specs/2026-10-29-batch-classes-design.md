# Batch classes: one place for sessions, attendance, quiz results and feedback

Date: 2026-10-29. Owner: PZ Academy admin (non-technical). Builds on the approved
`2026-10-27-attendance-results-design.md` (plans 1-3 are live).

## Why

Today an admin works in three separate places for one batch: the Sessions and attendance page
(`/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions`), the per-session quiz
screen, and Admin > Feedback (a separate system, not tied to batches). Sessions are added one at
a time. The owner finds this too complicated. The old Google Apps Script systems (feedback
"programs", attendance "events") already had a one-time setup that made every session and its
links together; the new app lost that.

Goal: one screen to set up all classes of a batch at once, and one screen to run each class day.
Attendance link and feedback link are made automatically for every class.

## Who and what

Admin staff, non-technical, often on a phone. A **batch** is a landing page (`landing_pages`)
with its registrations. A **course** or **workshop** has several classes. A **webinar** is the
same thing with exactly one class (it also has its own landing page and sign-ups). So the unit is
always a batch with 1 or more classes; "class" is the word shown to admins (the tables call them
`batch_sessions`).

## Approved screens (Stitch project "PZ Academy Platform 2", design system "PZ Academy")

Owner approved these as the layout guide. Use them for layout, not for content: Stitch invented
some text (see "Replace in the build").

- Setup, desktop: "Set up classes - PZ Academy Admin (Polished)" `f3067a275811474ba6cc1c45ab926b32`
  (first version `da6a85ff5ede41b589cd07700abf8a10`).
- Setup, mobile: "Set up classes - PZ Academy Admin (Mobile Polished)" `3048e870f3a747c0bfa4fe097c6735fc`.
- Classes overview + Today, desktop: "Batch Classes Overview - PZ Academy Admin" `bb3ce8099b654854ab7dc3a1658ee969`.
- Classes overview + Today, mobile: "Batch Classes Overview - PZ Academy Admin (Mobile Polished)" `1767fca384b34ee39a522da38c1e3386`.

Mobile must be fully usable one-handed: buttons and calendar days at least 48px, body text at
least 16px, one column, no sideways scrolling, full-width bottom action.

**Replace in the build:** invented people (e.g. a "Cohort Lead" card), "Cohort: Autumn 2024",
version numbers, the fake "Need help" footer, "Zoom Pro", "Staff Admin", "Live Command Center"
and "Auto-sync active" (plain words instead), "Passing target 70%" (not a real setting here),
the duplicated Kahoot button text, the clipped third step on mobile, and top menus that are not
the app's real menus. The page lives inside the existing admin layout.

## What gets built

### 1. Set up classes (one flow, one "Create all classes" button)

- Type toggle: Course / Workshop / Webinar. Webinar allows exactly one day. Course/workshop allow
  many.
- Calendar: tap days to add or remove class days.
- Defaults for all classes: start time, end time, Zoom link. Times are Pakistan time.
- Day list, one row per chosen day: date, time, Zoom link, optional topic title, optional
  speaker, "Change just this day" (own time/link), remove. Rows that use the default are shown
  greyed as "same as default". A row with its own time or link is highlighted.
- Feedback questions: chosen once from the existing question bank (3 to 5, star or video type,
  same limits as the existing feedback system), shared by all classes.
- "Create all classes" creates every class, and for each class its attendance link and its
  feedback link, in one step. Nothing needs pasting or generating by hand afterwards.

### 2. Classes overview and Today (one screen per batch)

- Day list: Done / Today / Upcoming. Opens on today's class, or the next one if none today.
- A "Today" panel for the selected class with a banner naming the single next step, then three
  cards in order:
  1. **Attendance**: the class's attendance link (Copy, Email to students), live count
     "38 of 52 present", open the attendance list. Reuses the live attendance grid, manual
     marking and window controls that already exist.
  2. **Quiz results**: Upload Kahoot file, then the existing review screen. Reuses the live quiz
     feature (plan 3) as is: parser, review problems, save, ranking, "took the quiz, no
     check-in". The quiz screen itself is not redesigned here, only reached from this card and
     summarised on it ("54 players, 3 need checking").
  3. **Feedback**: the class's feedback link (Copy, Email to students), response count and
     average, "See responses" (opens the existing feedback results for that class).
- "Edit this class" (date, time, Zoom link, topic, speaker, reminder email on/off) and
  "Add a class" at any time. Edits never change an existing attendance or feedback link.
- Existing controls that stay available inside the screen (not removed): attendance minimum
  percentage, shared check-in link, email reminder settings, "mark everyone present",
  "email updated time".

### 3. Feedback ties to classes

- Each class gets one feedback session in the existing feedback system, so it uses the existing
  public form `/feedback/<slug>` and the existing results/audit tooling. For course/workshop the
  batch also gets one feedback program (type course or workshop) grouping them, as the old
  system did. A webinar gets a single feedback session and no program. The class remembers its
  feedback session (new nullable link column on `batch_sessions`).
- Slugs are made from batch name + class number and must be unique; they never change after
  creation, even if the class is edited.

### 3a. One cover image, picked from the media library (owner request)

- Setup has one "Cover image" field, picked from the existing media library (the same picker the
  course, mentor and banner upload fields already use). That one image is the cover of the
  batch's attendance pages and feedback pages (every class, and the feedback program), so the
  attendance link and the feedback link look like one family.
- It can be changed later in one place and then updates every class that has not been given its
  own cover. (My guess: a class may have its own cover, but the owner did not ask for that, so
  the first build can skip per-class covers.)
- The public attendance page may need a small addition to show the cover. This is the only
  change allowed to that page. The feedback form already supports `cover_url`.

### 3b. Shared results across a course or workshop (owner request)

- **Feedback:** the batch shows one combined feedback summary across all its classes: overall
  average rating, total responses, and the per-class averages side by side, as the old system's
  program view did. The existing feedback program (and its share view) is the home for this;
  the batch screen links to it and shows the headline numbers. A webinar shows its single
  class's numbers.
- **Attendance:** the batch shows each student's attendance across all classes so far: classes
  attended out of classes held, as a percentage, and whether they meet the batch minimum
  percentage (the existing "attendance minimum percentage" setting, used for certificates). Also
  the batch-wide average attendance. Recorded students and live students are both listed; the
  existing rules about live vs recorded students for competition do not change.

### 4. Existing feedback links must keep working (owner requirement)

Feedback links already sent to real students are not touched. The existing feedback pages,
slugs, responses and Admin > Feedback screen stay. No migration of old feedback sessions into
batches. A batch's existing classes that have no feedback yet get a "Create missing feedback
links" button. Admin > Feedback keeps working for stand-alone sessions (mentorship, one-offs).

## Behaviours to get right

- Default vs custom: changing the batch default time or Zoom link updates every class that has
  not been given its own value; classes with their own value are left alone.
- A class needs an end time (today only the start is stored), because setup and the screens show
  a time range.
- Removing a class that already has attendance marks, quiz results or feedback responses asks for
  a plain confirmation that says what will be lost. (Builder: the existing delete path already
  cascades; keep that.)
- Adding a class later creates its attendance and feedback links the same way.
- Re-running "Create all classes" must not create duplicates (idempotent per class number).

## Goals

- An admin can set up a whole course in one sitting without help, on a phone.
- Every day the admin opens one page and always sees what to do next.

## Non-goals

- No change to the public attendance page (other than showing the cover image), the public
  feedback form, or the leaderboards (plan 4 handles public home-page cards and totals).
- No change to Kahoot parsing or matching rules (plan 3), and no "best student over a period"
  formula.
- No import of old sheet history (plan 5).
- No automatic emailing of feedback links (admin sends manually, my call below).

## Anti-goals (a failure even if it technically works)

- Admin has to visit Admin > Feedback or paste a link to finish a class.
- Any already-sent feedback link breaks.
- Words an admin would not understand ("session code", "window override", "sync").

## Constraints

- Existing stack and conventions; Stitch screens above are the layout source.
- Supabase: the owner pastes all write SQL by hand; next free migration is 0091.
  `database.types.ts` is never regenerated; hand-add entries.
- Free Vercel plan: no new frequent crons; the 5-minute Supabase timer job already exists.
- Plain words, one question at a time, for the owner.

## My calls (owner has not decided these)

1. The batch's default time/Zoom link are stored on the batch, and each class stores whether it
   has its own values. Builder chooses the exact columns.
2. Feedback links are mostly shared by the admin in the WhatsApp group, so "Copy link" is the
   main action and must be the most prominent button on the Feedback card. "Email to students"
   is secondary, for later use when email limits allow (owner said so). The admin presses it;
   nothing is sent automatically. It goes to every enrolled student of the batch and is a short
   email with the feedback link, sent through the same email system and send log as the session
   emails. The same "Copy link first, email second" order applies to the Attendance card.
3. Question edits after creation apply to a class only if it has no feedback responses yet.
4. Topic title is optional (`batch_sessions.title` already exists).
5. "Email to students" under Attendance re-sends the existing session email (the one with the
   Zoom link, attendance link and optional Kahoot link), not a new email type.
6. The old Sessions and attendance route stays as the URL; the screens above replace its
   content. The old per-session controls move into "Edit this class" and the Attendance card.

7. Question limits: reuse the exact rules the existing Admin > Feedback creation already uses
   (share its code, do not copy). Bank questions only at setup; custom questions stay in
   Admin > Feedback.
8. Blank speaker: the feedback session's required speaker field gets "PZ Academy". Feedback
   session name = batch name + " - Day N" (or the topic title when given); date = the class date.
9. Setup on a batch that already has classes: the screen opens pre-filled with the existing
   classes (editing mode), never overwrites silently. Ticking a new day adds a class; unticking
   a day that has data asks for confirmation. Class numbers are assigned in date order when
   created; adding an earlier day later gets the next free number (numbers are never
   renumbered, so links never change) and the list is shown in date order. Slugs therefore use
   a short random code, not the class number.
10. End time: classes already in the database are left without an end time and show only their
    start time until edited; attendance window, reminders and "in progress" keep using the start
    time as today. New classes store an end time and may use it for display only.
11. Type is a setup-time toggle only; nothing stores it except the feedback program's own type.
    A webinar can later get a second class through "Add a class"; it then simply behaves like a
    workshop and no program is created retroactively (my call: keep it simple).
12. Access: same admin-only guard as the current Sessions page; feedback tables are touched only
    from server code with the service role, as in 0033.
13. Feedback program: name = batch name, no cover at creation, share token created as the old
    system did.

## Left to the builder

Table and column design (including end time and custom-value tracking), the feedback-program
creation, how the Today panel gets its numbers cheaply, how the calendar works on touch devices,
and the test plan.
