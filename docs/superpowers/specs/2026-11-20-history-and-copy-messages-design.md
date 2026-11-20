# History icon + copy-with-message (short design)

Date: 2026-11-20. Size: small-to-medium change, no database change. Second job (editable attendance
window) is a separate design and branch; this one only prepares for it.

## Intent
The owner posts the attendance link, the feedback link and the podium in student WhatsApp groups
every class, by retyping the same notes. They want: (1) "Messages sent" readable from an icon at the
top of the batch registrations page, not buried at the bottom; (2) every attendance and feedback
copy button to offer "Copy link" or "Copy with message"; (3) the Classes Share podium menu to
offer "Copy message" with the top three.

## Goals
- History icon at the top of the batch registrations page opens a panel (right side on PC, full
  screen on a phone) holding the current "Messages sent" list. The list moves out of the page bottom.
- Attendance and feedback copy buttons (Classes screen: `ClassActionRow` and `LinksTab`) open a
  small menu: **Copy link** / **Copy with message**.
- Share podium menu in Classes (Quiz tab only) gets a third choice **Copy message**.
- Message wording is exactly the owner's own (below); only the changing parts are filled in.
- Built in the existing admin style (ds tokens on Classes, pz tokens on the registrations page),
  no Stitch screen (owner ruling 2026-11-20).

## Non-goals
- No change to what "Messages sent" lists or how sends work.
- No change to the student Progress page or its Share podium (students keep the simple picture share).
- No editable message text, no per-batch wording field.
- Not the editable attendance window (job 2); the attendance message takes the window numbers as
  inputs so job 2 can plug in.
- The Webinars page text in the owner's pasted style guide is not part of this.

## Anti-goals
- Students must never get the podium message. A broken or wrong name/points line in a group post is a failure.

## Approaches
- **A (chosen): side panel** for History. Reuses `MessagesSentList` as is, keeps your place on the list.
- B (not chosen): separate History page. Roomier but more work and loses the list position.

## Message wording (owner's own text)
Attendance:
```
📊 {batch title} | _Attendance Portal_

Dear Members, this is the official link for attendance
{attendance link}

*Important Note*
Attendance Open at {open time} and Closes at {close time} PKT.
```
`{open time}` = class start minus the opening minutes, `{close time}` = start plus the closing
minutes, shown like `7:15` and `7:45 pm`. Today both are 15 minutes (the current fixed rule in
`src/lib/attendance/rules.ts`); job 2 will pass the real numbers.

Feedback:
```
Please take a moment to complete the feedback form and share your experience, suggestions, and areas for improvement.

🔗 Day {class number} Feedback Form:
{feedback link}

Your responses will help us make the upcoming sessions even better.

Thank you for being part of {batch title}!

Regards,
Team Pharmacozyme
PZ Academy
```
Podium (Classes only):
```
A huge congratulations to our top three performers on the {Overall | Class N} Leaderboard of {batch title}.

🥇 1st Position – {name}
⭐ {points} Points

🥈 2nd Position – {name}
⭐ {points} Points

🥉 3rd Position – {name}
⭐ {points} Points

Check your rank: {progress page link}

👏 Congratulations to all three achievers for their outstanding performance!

Your dedication and active participation continue to make {batch title} a success.

Keep learning, keep competing, and keep excelling! 🚀

PZ Academy
Educating with Innovation 💚
```
Points use thousands commas (154,372). If fewer than three people have a rank, only the ranks that
exist are listed, with no empty lines.

## My calls (owner can change)
- `{batch title}` is the landing page title ("PPC Batch 3"), so the text reads "PPC Batch 3" where
  the owner's samples said "PPC Course Batch 3" / "Practical Pharmacology Course – Batch 3". Renaming
  the page title changes the message.
- The podium message says "Overall" when the Quiz tab shows the batch board and "Class N" when it
  shows one class (what the picture already shows).
- Progress page link is `https://pz-academy.pharmacozyme.com/progress/{slug}` built from the same
  base as the attendance link (`attendanceBase()`), not hard-coded.

## Left to the builder
Where exactly the History icon sits in the toolbar (next to Filters / Batch tools); pure message
builder functions in `src/lib/classes/` with tests; menu behaviour copied from `SharePodium`
(Escape closes, click outside closes, focus returns).
