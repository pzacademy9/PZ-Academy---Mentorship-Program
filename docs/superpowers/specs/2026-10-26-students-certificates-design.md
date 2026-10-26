# Students and Certificates pages: design

Date: 2026-10-26. Status: draft for owner approval.

## Why

The admin menu has "Students", and the student menu has "Certificates". Both links currently 404. Admin staff have no single place to answer "how is this student doing, and where is their certificate?": they open Enrollments (payments), mentor pages (sessions), feedback pages and then the separate certificate app (cert.pharmacozyme.com). Students have no page to see their own certificates.

Certificates are issued and stored in a separate app (cert.pharmacozyme.com: Next.js + Firebase Firestore). It stays the only place certificates are made. This project only reads from it.

## Goals

1. Admin "Students" list: search and filter every student.
2. Admin "Student record": one page per student with a summary strip and tabs (Overview, Courses and payments, Progress, Attendance, Feedback, Certificates, Mentorship). Owner chose this layout (summary + tabs) over one long page of cards.
3. Admin "Certificates": list of every certificate in the cert app, searchable, each with a "View certificate" link.
4. Student "Certificates": a student sees only their own certificates, plus a calm "Pending" card for a finished course with no certificate yet.
5. Certificates shown on the Student record come from the cert app automatically. No double entry.

## Non-goals

- Issuing, revoking, editing or deleting certificates. Read-only. Never write to the cert app.
- Rebuilding or changing the cert app.
- Charts or dashboards.
- Actions Stitch drew that are not asked for: Export CSV, Sync Status, "Cryptographic Proof Ledger", "Message on WhatsApp", "Edit student", "Enroll in course", "Export Ledger", "Generate Final Statement", "Send reminder", "Open Enrollment" shortcuts that perform actions. Owner's call (mine, to confirm): leave these buttons out of v1. A plain link "Open enrollment" to the existing Enrollment detail page is kept.
- Using the old plan's tick-box + pasted link for certificates. The existing local `certificates` table and `enrollments.cert_issued` / `cert_url` columns stay untouched and unused by these pages.

## Anti-goals

- A page that shows so much nobody reads it. Overview must stay short.
- A certificate failure taking the whole page down. If the cert app cannot be reached, only the certificate parts show an error; everything else still loads.
- Exposing the cert database key to the browser or reusing the full-power admin key.

## Design source

Stitch project "PZ Academy Platform 2" (id 4651274386787527431), screens created 2026-10-26:
Students Directory (desktop + mobile), Student Detail (desktop + mobile), Certificates admin (desktop + mobile), Certificates Student Portal (mobile and light/dark laptop/phone). Prompts: `docs/stitch-prompts-students-certificates.md`. Match the screens; where a screen shows an out-of-scope action (see Non-goals), omit it.

## Pages

### Students list (`/dashboard/admin/students`)
Search (name, email, phone). Filter chips: All, Active, Payment pending, Finished course, No login for 30 days. Table: avatar initials, name, email, up to two course chips (+N), progress bar, sessions attended ("5 of 6"), certificate chip (Issued / Pending / None), joined date. Row opens the record. Count line, empty state "No students match your search." Paged server-side (25 per page).
The "No login for 30 days" chip needs a last-sign-in source; if there is no cheap source, drop that chip (builder's call).

### Student record (`/dashboard/admin/students/[id]`)
Header: back link, name, email, phone, joined date, status chips. Strip of five tiles: Courses, Progress, Sessions attended, Average feedback, Certificate. Tabs: Overview (recent activity, needs attention), Courses and payments (per course: batch, status chip, amount, date, link to the existing enrollment page), Progress, Attendance, Feedback, Certificates, Mentorship. Only admin and super admin.

### Certificates, admin (`/dashboard/admin/certificates`)
Strip: "Certificates are made in the Certificates app. This page shows them here." + button to open cert.pharmacozyme.com. Search (see below). Chips: All, Sent, Generated, Revoked. Table: name, email, course (as written in the cert app), certificate number, issue date, status chip, "View certificate" link (the cert app's own verify/certificate URL). Revoked rows are muted. Empty state and "could not reach the Certificates app, try again" state with a Try again button. Paged.

### Certificates, student (`/dashboard/certificates`)
One card per certificate for the signed-in student, matched by their sign-in email: course, issue date, certificate number, "Issued" chip, "View certificate" button. Finished course with no certificate: amber "Pending" card. Empty state "You do not have any certificates yet. Finish a course to earn one." Revoked certificates are not shown to the student.

## Mirror the cert app's own organisation (owner asked for this)

The cert app organises everything in one hierarchy, and these pages must use the same words and order (source: `lib/category.ts`, `lib/types.ts` in the cert repo):

- **Category** (2): General, Official.
- **Sub-category**: General has Courses, Workshops, Webinars, MED-Q. Official has Central Team, Sub Team, Ambassadors, Affiliates, Mentors.
- **Topic**: free text on the database (e.g. a course subject).
- **Database** = one batch or cohort (name, topic, category, sub-category, participant and certificate counts, live flag, created date). Each certificate belongs to exactly one database through `databaseId`, and also carries `category`, `subCategory`, `topic` itself.
- **Certificate**: as listed below.

Consequences for the design:

1. **Admin Certificates page** browses like the cert app: two tabs General / Official, then sub-category chips for that tab (with counts), then a batch picker (the databases under that sub-category, each with name, topic and certificate count), then the table. Search and the status chips apply inside the current view. A top "All" view is allowed. Database names come from reading the `databases` collection (small) alongside certificates, joined by `databaseId`; fall back to the certificate's own `topic` if a database is missing. Table gains Category/Sub-category and Batch columns (batch name replaces the loose "course" column).
2. **Student record, Certificates tab** and the **student Certificates page** group certificates the same way: heading General / Official, then sub-category (Courses, Workshops, Webinars, MED-Q, or the team roles), each card showing topic, batch name, certificate number, issue date, status.
3. **Official certificates belong to team members** (ambassadors, mentors, affiliates), not course students. A person can match both: a student who is also a mentor sees both groups. Students see their Official certificates too, labelled by role.
4. **Batch name versus our courses:** the cert app's batch/topic names do not map to our course list by any key, so still no per-course matching. Show the cert app's batch and topic names as the label.
5. The pending count on the student page applies to General certificates only (Official ones are not tied to course completion).

## How certificates are read (decided with the owner)

- It also reads the cert app's `databases` collection (batch names, category, sub-category, topic, counts) to label and group certificates.
- The cert app's `certificates` collection (Firestore) holds one doc per certificate: `uniqueCertId` (like `PZ-2026-A1B2C3D4`), `recipientName`, `recipientEmail`, `category`, `subCategory`, `topic`, `certType`, `issueDate`, `status` (`pending|generated|sent|revoked`), `verificationUrl`, `pdfUrl`, `driveLink`, `createdAt`.
- Our server reads it directly with the Firebase Admin SDK using a new read-only service account (Cloud Datastore Viewer role). The owner creates it. The full-power key in the owner's "Firebase Service key" folder is not reused. The key is passed as a server-only environment variable (name to be chosen by the builder, e.g. `CERT_FIREBASE_SERVICE_ACCOUNT_JSON`, base64), never exposed to the browser.
- Matching a certificate to a student: by email, case-insensitive. A student whose cert email differs from their account email will not match (known limitation, accepted).
- Course names come from the cert app in its own words. We do not try to tie them to our course list.
- Size (owner): almost 1,000 certificates, slow growth. So the server fetches the whole collection, keeps it in a short in-memory cache (about 60 seconds), and does search ("contains" on name, email, certificate number), status filter, sort by issue date and paging in memory. No Firestore indexes needed. Revisit if it passes roughly 10,000.
- Student's own certificates and the Student record read by email directly (an equality query on the email, lowercase and as stored), not from the full cache.
- "View certificate" link: the cert doc's `verificationUrl`; if missing, `https://cert.pharmacozyme.com/verify?certId=<uniqueCertId>` (my call).

## Settled calls (mine, owner may override)

- Who is a student: `profiles.role = 'student'` or at least one enrollment. The record page accepts either; other profiles 404.
- Student sees "Issued" for cert statuses `generated` and `sent`. `pending` and `revoked` are hidden from students. Admin list has chips All, Sent, Generated, Pending, Revoked.
- Every course (including webinars and workshops) gives a certificate (owner). So a finished course with no matching certificate is genuinely "Pending". Because cert course names do not map to ours, the student Pending card is a count, not per course: if the student's finished courses exceed their issued certificates, show one calm card "N certificate(s) being prepared" (my call; builder may refine).
- Certificates with no email match to any student appear only on the admin Certificates list.
- The public verify page of the cert app is not used for lookup (it only looks up by certificate ID and is rate-limited).

## Data on the Student record

All from the existing database (server-side, admin only): profiles, enrollments, lesson progress, attendance, feedback responses, mentorship bookings, quiz attempts. Builder maps each tab to the right tables and defines "Progress", "Finished course", "Average feedback" and "Needs attention" rules; keep them simple and show the rule in a tooltip or hint where it is not obvious.

## Constraints

- Follow existing admin page conventions: `requireAdminPage`, server components, `createAdminSupabase`, design tokens only (no new colours; `tests/pz-tokens.test.ts` must not list the new files; it already fails on SalesTeamPanel.tsx).
- Plain words in all visible text. Mobile layout required (Stitch has phone screens).
- Never regenerate `database.types.ts`; hand-add if needed. No new migration is expected.
- Tests first. New small branch from main, new commits only, no push or merge without owner's yes.

## Left to the builder

Component structure, query shapes, paging approach, exact definitions of the derived numbers, empty/loading states, how the cert reader is isolated (a single server-only module so it is mockable in tests).

## Owner-owed before it works live

Create the read-only Firebase service account for the cert project and add the environment variable in Vercel and locally.
