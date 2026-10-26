# Stitch prompts for the Students and Certificates pages (project "PZ Academy Platform 2", id 4651274386787527431)

Searched the project (104 screens): no admin Students list, student record, or Certificates screen exists. Make each in light and dark, laptop width, same look as "Admin Registrations - PZ Academy (Phase 3)". Then a phone version of S1 and S2. Plain words only. No technical words.

## S1. Students list (admin)

Admin page "Students". Top: a search box ("Search by name, email or phone"), and filter chips: All, Active, Payment pending, Finished course, No login for 30 days. Below, a table: avatar with initials, name, email, courses (up to two small course chips, then "+1"), progress (a thin bar and a percent), sessions attended ("5 of 6"), certificate (chip: Issued, Pending, or None), joined date. Each row opens that student. Page count line "126 students". Empty state: "No students match your search."

## S2. Student record (admin), summary with tabs

Header: back link "Back to Students", student name, email, phone, joined date, small chips for status. Under it, one strip of five stat tiles: Courses (2), Progress (64%), Sessions attended (5 of 6), Average feedback (4.5), Certificate (Pending). Under the strip, tabs: Overview, Courses and payments, Progress, Attendance, Feedback, Certificates, Mentorship. Show the "Overview" tab open: a card "Recent activity" (short list with dates: Paid DIT Batch 3, Attended Session 5, Left feedback), a card "Needs attention" (for example "Missed the last session", "Payment pending for PMH Batch 1"). Also show a second state for the "Courses and payments" tab: one row per course with course name, batch, a status chip (Paid, Pending, Rejected), amount, date, and a link "Open enrollment".

## S3. Certificates (admin)

Admin page "Certificates". Top note in a soft strip: "Certificates are made in the Certificates app. This page shows them here." with a button "Open Certificates app". Search box ("Search by name, email or certificate number"). Filter chips: All, Sent, Generated, Revoked. Table: name, email, course (as written in the Certificates app), certificate number (like PZ-2026-A1B2C3D4), issue date, status chip, and a link "View certificate". Revoked rows are muted with a red-ish chip. Empty state: "No certificates found." Error state: "We could not reach the Certificates app. Try again in a minute." with a Try again button.

## S4. My certificates (student)

Student page "Certificates", in the same family as "My Courses". A card per certificate: course name, issue date, certificate number, a green chip "Issued", and a button "View certificate". For a course that is finished but has no certificate yet, a calm card with an amber chip "Pending" and the line "Your certificate is being prepared. We will tell you here when it is ready." Empty state: "You do not have any certificates yet. Finish a course to earn one." Light and dark, laptop and phone.

## Revision after studying the Certificates app (replace S3, add S5 and S6)

## S3 (revised). Certificates (admin), organised like the Certificates app

Same page as before, same top strip ("Certificates are made in the Certificates app. This page shows them here." and the button "Open Certificates app"). Under it, two large tabs: "General" and "Official", each with a count. Under the tabs, small chips for the groups inside the open tab, each with a count. For General: "All", "Courses", "Workshops", "Webinars", "MED-Q". For Official: "All", "Central Team", "Sub Team", "Ambassadors", "Affiliates", "Mentors". Under the chips, a row of batch cards you can scroll sideways: each card shows the batch name (for example "DIT Batch 3"), its topic, "86 certificates", and a small "Open" state when picked; the first card is "All batches". Under that, a search box ("Search by name, email or certificate number") and status chips: All, Sent, Generated, Pending, Revoked. Then the table: name, email, group (small chip, for example "Courses"), batch, topic, certificate number, issue date, status chip, link "View certificate". Revoked rows are muted. Keep empty state ("No certificates found.") and error state ("We could not reach the Certificates app. Try again in a minute." with Try again). Show the General tab with Courses open, light and dark, laptop and phone.

## S5. Certificates tab on the Student record (admin)

The "Certificates" tab open on the student screen. Headings "General" and "Official". Under General, a small group label per kind ("Courses", "Workshops", "Webinars", "MED-Q") with a row per certificate: topic, batch name, certificate number, issue date, status chip, link "View certificate". Under Official, the same by role ("Mentors", "Ambassadors" and so on). Empty state: "No certificates found for this email." Show a student who has two course certificates, one workshop certificate and one Mentors certificate. Light and dark, laptop and phone.

## S6. My certificates (student), grouped

Same page as S4 but grouped: heading "General" with small labels "Courses", "Workshops", "Webinars", "MED-Q", each with certificate cards (topic, batch name, issue date, certificate number, green chip "Issued", button "View certificate"). Heading "Official" appears only when the student has one, with the role as the label (for example "Mentors"). Keep the amber "Pending" card ("2 certificates are being prepared. We will tell you here when they are ready.") and the empty state. Light and dark, laptop and phone.
