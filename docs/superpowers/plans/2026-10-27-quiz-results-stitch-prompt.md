# Stitch prompt: admin quiz results screen

Paste this into the Stitch project "PZ Academy website" (admin area, same look as the "Sessions and attendance" screen).

---

Design an admin screen called "Quiz results" for one live session of a batch, in the PZ Academy admin style. Desktop first, works on a phone. Plain, friendly wording for a non-technical owner.

Top: session name and number, a back link to "Sessions and attendance".

Section 1, Upload: a large drop box "Drop the Kahoot report here (.xlsx or .csv)", a button "Choose file", and a small note "Saving again replaces this session's results."

Section 2, Check the file (appears after upload):
- A line of counts: "54 rows in the file. 38 are fine. 16 need your answer." and a bar showing how many are still waiting.
- A button: "Skip all unknown players with 0 points".
- A list of problem cards. Three kinds:
  1. "Same student twice": shows the student name and ID, the rows side by side (what they typed, score, correct, wrong). Two choices: "Add the scores together" or "Keep one" (pick which row). One row can have a highlighted "Suggested: keep this one".
  2. "Unknown player": shows what they typed and their score. Up to 5 suggested students to click (name and ID), a search box to pick any student of the batch, and a "Skip this row" button.
  3. "Not in this batch": a known student who is not in this batch. Two choices: "Include" or "Skip".
- A collapsed list "Fine rows" with a small "Rejoined" tag where the ID had an extra n, and a "Recorded" tag for recorded students.
- A field "Quiz maximum score" with a suggested value and the hint "Usually number of questions x 1,000."
- A "Save results" button. It is off, with the text "3 problems still waiting", until everything is answered.

Section 3, After saving: a summary "Saved 40. Added together 4. Dropped 2. Skipped 8."

Section 4, "Took the quiz, no check-in": a table of students (name, ID) each with a "Mark present" button. Empty state: "Everyone who played also checked in."

Section 5, Saved results of this session: table with rank, name, ID, score, correct, wrong, and a "Recorded" tag for recorded students.

Section 6, "Batch ranking" (live students only): table with rank, name, ID, total score, quizzes taken, average percent, and "Projected total" (small grey label "if they keep this pace"). Never show emails anywhere.

Include empty, loading and error states.
