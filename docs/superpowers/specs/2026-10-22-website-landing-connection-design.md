# Website and landing page connection: design

Date: 2026-10-22. Status: draft for owner approval.

## Why

PZ Academy sells in two separate ways that do not know about each other:

- The public website (home, /courses, /workshops, /webinars, course detail pages) lists permanent courses. Recorded courses are bought there with a manual flow: `/enroll/[slug]`, payment screenshot upload, admin approval.
- Landing pages (`/e/[slug]`) are built for ad campaigns. Each one sells a live batch, a recorded version, or both, with country prices, promo codes, agents, sheet sync, emails and Meta tracking.

Today a visitor who comes to the website directly never learns that a live batch is open (e.g. PPC Batch 3, live from 30 October). Nothing on the website links to a landing page. The only database link between the two worlds is the optional `landing_pages.course_id`, which nothing in the admin UI sets. On the live database it is empty for every landing page, including the published Diabetes Management & Pharmacotherapy Batch 1 page. The code uses it to create the student's course access after a paid registration, so an empty value means no automatic access.

## Goal

A person who visits the website directly can:
- buy the recorded lectures on the website (unchanged), and
- see and register for the live batch whenever one is open, by being sent to that batch's landing page.

A person who comes from an ad lands on a landing page that can sell live, recorded, or both (a recorded-only ad page must show only recorded options and prices; this should already be possible through the page's mode settings and must be confirmed, not rebuilt).

Whichever door a buyer uses, paid buyers end up with the right course access, and the owner does not update two places by hand.

## Decisions made with the owner

1. Live registration is not rebuilt inside the website. The website sends people to the landing page, which already has the full registration engine.
2. Recorded can be bought in both places. Prices may differ between the two doors, but are mostly the same. No price syncing.
3. A course can have several landing pages at once (for example a Batch 3 page selling live and recorded, plus a recorded-only ad page). The owner picks ONE "main page" per course. Only the main page drives the website. Other pages are ad-only and never shown on the website.
4. Visual layout "C" was chosen: a "Live batch open, starts <date>" banner with a "Register for live" button at the top of the course page, plus a "Live batch open" tag on the course card in the course list, plus the open batch shown on the home page.
5. No batch table. The landing page itself is the batch. A batch history per course is a possible later project, not part of this one.

## What to build

1. Set the course link on a landing page. In the landing page admin, the owner picks which course the page belongs to (writes `landing_pages.course_id`, which today no screen writes). Beside it is a "main page for this course" choice. Only one landing page per course can be the main page; choosing a new one replaces the old one. Needs a small migration.
2. Website reads the main page. For each course, the website finds its main landing page. If that page is published and still accepting registrations, the website shows the live batch banner (course page), the "Live batch open" tag (course card, course list, home page) and a "Register for live" button that goes to `/e/<slug>`.
3. The banner disappears on its own when the main page is closed, a draft, finished (`landing_batch_state`) or full (capacity reached). No second switch to flip.
4. Start date shown. The banner shows the batch start date taken from the landing page's own content. The nearest existing field is `settings.countdownTo`; the builder should confirm what the PPC Batch 3 template stores and, if no clean start date exists, add one optional "Batch start date" field to the landing page settings (builder's call).
5. Source tagging. Links from the website to the landing page carry a marker (for example a `?src=website` parameter, builder's call on name) so registrations that came from the website can be counted separately from ad traffic. The existing agent `?ref=` attribution must keep working and must not be overwritten.
6. Fix the live data gap. Tie the published Diabetes Management & Pharmacotherapy Batch 1 page to its Diabetes course (`Diabetes Management Course – Dr Christine`), after the owner confirms the match. Also review whether the recorded buyers and live buyers from that page already got access some other way before changing anything.
7. Duplicate protection. If the same person (same account or email) already has an active enrollment for the course, a second purchase through the other door must not create a second enrollment or double-charge silently. At minimum the owner is warned in the admin enrollments or registrations view; the exact behavior is the builder's call, kept simple.
8. Recorded-only landing page check. Confirm in the page builder that a landing page can offer recorded only, with its own prices, and that the page shows no live option. Fix only if it does not.

## Calls made after the builder check

- Banner and "Register for live" button show only when the main page offers live in its modes. The main-page picker refuses a page that has no live option (my call).
- Live buyers: existing code (`resolveAccess` and `syncEnrollmentForRegistration` in `src/lib/data/landing-enrollment.ts`) already creates an enrollment with `access_level` live or recorded according to what the buyer chose, and only when the page has a `course_id` and the registration has a `student_id`. Setting `course_id` therefore makes live buyers get live-level access to the course portal, which is the intended behavior. Duplicate protection (item 7) compares enrollments per student and course, whichever door created them.
- Backfill: Diabetes Batch 1 has 3 paid and 1 pending live registrations, none linked to a student account (`student_id` empty), so setting `course_id` alone grants nobody access. Owner decided (2026-10-22): tie Batch 1 to its course so the 3 paid buyers get access the next time they log in with their registration email (`linkRegistrationsToStudentIds` in `src/lib/data/landing-registrations.ts` links guest registrations to the account on sign-in). No email is sent by the system; the owner tells the buyers. The builder must verify that linking an already-paid registration at login really triggers the enrollment sync; if it does not, add that trigger. Buyers need an account; there is no access without one.

## Non-goals

- No live registration form inside the website.
- No batch table, batch history or batch reports.
- No price syncing between `courses.price_pkr` and landing page prices.
- No change to the recorded purchase flow on the website (screenshot, admin approval).
- No moving of recorded sales off the website.
- No redesign of the website or landing pages beyond the banner, tags and button.

## Anti-goals (failure even if it technically works)

- The website shows "Live batch open" for a batch that is closed or full.
- A visitor clicks "Register for live" and lands on the wrong course's page.
- Agent attribution (`?ref=`) or Meta tracking on landing pages breaks.
- Two main pages for one course, or a main page with no course.
- Owner has to edit two places to open or close a batch.

## Constraints

- Landing pages and their data stay service-role only; the website reads the main-page facts through server code, never exposing landing page tables to the browser.
- The public website pages are cached; the banner must update within a reasonable time after the owner publishes or closes a page (builder's call: revalidate on publish/close, or a short cache time).
- Never regenerate `database.types.ts`; hand-add new columns.
- The owner pastes SQL; migrations are written as files, applied by the owner.
- Nothing merged or pushed to main without the owner's yes.

## Left to the builder

- Exact column and constraint design for "main page" (one per course), migration numbering (next after 0083).
- Where the course and main-page pickers sit in the landing page admin.
- Banner and tag styling, using the existing website design tokens. Stitch project "PZ Academy Platform 2" may hold a matching screen; check before designing.
- How "full" is computed (capacity vs paid and reserved registrations).
- Whether the home page shows one open batch or a short list.
- The duplicate-protection details in item 7.

## Open items to verify during build

- Live data: `landing_pages.course_id` is null on all three pages (test, test2, diabetes). Courses exist for PPC, MDC, Diabetes and others, so matching is straightforward.
- The Diabetes course row is `status = draft` yet `is_published = true`; confirm what the owner wants before it shows a live banner.
