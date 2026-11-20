# Classes rework (design)

Date: 2026-11-19. Owner request job 1 of 4. Branch: `classes-rework` (from `menu-and-covers`, since the owner will push the two together).

## Intent and why
The owner runs live classes for a batch (for example PPC Batch 3) from the Classes page. Today the page is one long scroll per class. The owner copies the attendance link and the feedback link, checks whether a reminder is set, sends emails, checks who got them, uploads the quiz file, marks missed students present. They lose their place, cannot tell if a reminder is set or when it goes, and have no podium to copy (they open the Progress section and copy the picture there). On PC the page is wider than the screen so they scroll sideways. It looks basic and unorganised.

## Goals
1. The three things used every class are one tap away at the top of each class, always visible: **Copy attendance link**, **Copy feedback link**, **Send emails**.
2. A plain **reminder line** under them: "Reminder will send Fri 20 Nov, 6:30 pm", "Reminder sent Thu 19 Nov, 6:30 pm", "Reminder is switched off", "Choose who gets the reminder". Times in Pakistan time.
3. The class page splits into three tabs so nothing needs a long scroll: **Links and emails** | **Attendance** | **Quiz and podium**.
4. Attendance tab: a **search box** (name, email or ID) above the list, and a quick present / not present tap on each name. Mark-everyone-present stays.
5. Quiz and podium tab: after the quiz file is saved, show the podium (top three) with the **Share podium** control the Progress section already has (square picture, story picture), so the owner copies or saves it from here.
6. PC layout fits the screen: no sideways scroll at 1440px or at 1280px.
7. It looks designed and calm (see Look below).

## Non-goals
- No change to how emails, reminders, check-in windows or marks work. No change to who gets which email.
- No database change. No new routes except what is listed under Decisions.
- No drag and drop (owner confirmed there is none to restore).
- The Setup screen, Edit class dialog, Progress reports and Student IDs pages are not redesigned here.

## Anti-goals
- A class action that used to work and now cannot be found (every current button has a home).
- A reminder line that says "will send" when it will not (switch off, no audience, class already started).
- The top row hiding on phone, or a tab bar that needs sideways scroll.

## Constraints
- Stitch is the design source of truth: no Classes screen exists, so the owner gets a phone (390px) and a PC (1440px) prompt first; the build follows the screens they approve.
- Owner is non-technical: short plain words, calm wording, no exclamation marks, no sales words. Tap targets at least 48px (the existing Classes styles already use `min-h-12`).
- Colours: backgrounds and borders use pz-solid-* or landing-* tokens or the pz-primary / pz-surface-container-* family; pz-deep, pz-mid, pz-danger are text only.
- Reuse, do not rebuild: `AttendanceCard`, `AudiencePicker`, `ClassEmailHistory`, `FeedbackCard`, `QuizCard`, `AttendanceGrid`, `SharePodium` (accepts `imageUrl`, `fileBase`).
- Reminder time rule (from `listDueReminderSessionIds`): it sends at `starts_at - email_lead_minutes` when `email_enabled` is true and `audience` is set and the class has not started and no reminder has been sent. The line must follow exactly this rule.

## Approaches
A. **Rework the current page (chosen by owner):** keep `SessionsPanel`, `ClassList`, `ClassCalendar`, the cards and data loaders; add a top action row, a reminder line, tabs inside the selected class, an attendance search and a podium block; fix the grid width. Safest: live PPC Batch 3 data and emails stay on the same code paths.
B. Rebuild as a new page: cleaner but two screens to keep in sync and a higher chance of breaking emails and check-in. Rejected.
C. Only fix width and add search: fastest but leaves the page unorganised. Rejected.

## Decisions (the owner's, as decided)
- Option A.
- UI must not look generic: it must look good. (Owner words: "not like AI slop".)

## Decisions (my calls, to check)
- **Width bug cause and fix:** the main grid is `lg:grid-cols-[20rem_1fr]`; `1fr` has no minimum width so wide content (the link box, the attendance table) pushes the right column past the screen by about 95px at 1440px. Fix: `lg:grid-cols-[20rem_minmax(0,1fr)]` and `min-w-0` on the right column; wide tables scroll inside their own box.
- **Layout:** keep the left class list on PC (a row of chips on phone, as today). The selected class shows: header (Day, title, date and time, speaker, Zoom link, Edit this class), the top action row and reminder line, then the tabs. The per-class "Today" panel and batch summary (feedback bars, average attendance) stay above, collapsible, so the class itself starts higher on the screen.
- **Tab state:** the chosen tab is kept in the address (`?tab=attendance`) so a refresh or a shared link returns to it, and per class stays on the same tab when the owner picks another class. Default tab: Links and emails.
- **Where current things go:** Links and emails tab: attendance link box, feedback link box, "Who gets this email" (AudiencePicker), "Who got the emails" history, Email only those who haven't got it, Send me a test, new Zoom link / time change emails, feedback responses link and count. Attendance tab: present count and bar, search, list, Mark everyone present, check-in Automatic / Force open / Force closed. Quiz and podium tab: QuizCard (upload / open results) and, when results are saved, the podium and Share podium.
- **Send emails button:** opens the same confirm dialog as today's "Email Zoom link now" (again vs first time text unchanged). It does not send directly.
- **Podium source:** the existing public podium image route used by the Progress section, with the class chosen by the saved session id; hidden until the class has saved quiz results (otherwise a short plain line: "The podium appears after you save the quiz results.").
- **Attendance search:** client-side filter over the rows already loaded (name, email, PZ ID); no new query. The quick tap toggles the same mark as the existing grid.
- **Reminder line** is a pure function of (session, sends, now) with tests for every case in Goals 2.

## Look (for the Stitch prompts)
Calm, spacious, plain. Pakistan green as the one accent. Big readable type, clear grouping, a sticky tab bar, status shown as small coloured pills (reminder set / not set / sent). One clear primary button per area. Cards with soft borders, not heavy shadows. Phone: top actions as three large full-width buttons stacked or a 3-up icon row; tabs as a segmented control. PC: left class list, right class panel, tabs under the header.

## Left to the builder
Exact component split, icon choices, spacing, the tab URL key handling, test files and fixtures; how `email_lead_minutes` is exposed to the client for the reminder line (it is on `batch_sessions`; confirm it is in the session row type or add it to the loader's select).

## Size
A project (one page, several components, no database). Plan in 5 to 7 tasks. Two Sonnet review gates per task, one Opus whole-branch review, browser check at 390px and 1440px and 1280px.

## Calls made after the builder check (my calls, to check)
1. **Podium slug:** the public podium picture is made from the batch's public Progress board, which is keyed by the landing page slug. The Classes page loads that slug with the class data. The picture only works when the batch is shown on the Progress page and has ranked students. If it is not, the tab shows a plain line instead of a broken button: "The podium picture is ready once this batch is shown on the Progress page and quiz results are saved." This is the same dependency the owner has today when copying from Progress. No new route.
2. **Podium visibility signal:** show the Share podium control when quiz results are saved for the class. If the picture cannot be made, the existing control already says so plainly.
3. **Reminder line:** sent state comes from the existing send record for the reminder (the same record the old status line reads). Not sent yet: "Reminder will send <start minus lead time>" when switched on with an audience and the class has not started; "Choose who gets the reminder" when switched on with no audience; "Reminder is switched off" when off. Class already started and no reminder went out: "No reminder was sent for this class".
4. **Copy links:** both links are created with the class. If one is ever missing the button is disabled with a short plain note, never hidden.
5. **Send emails button:** opens today's confirm dialog (first time or again). With no audience chosen it takes the owner to the "Who gets this email" box on the Links and emails tab with a short message, instead of sending.
6. **Top panels:** the batch summary starts collapsed, today's panel stays open; no remembered state.
7. **Address keys:** the class and the tab are both in the address (`?class=` and `?tab=`), so a refresh or a shared link returns to the same place.
