# Who gets IDs and class emails, and the public "Track Your Progress" page

Date: 2026-10-30. Status: for the owner's approval. Two projects, built in this order: A, then B.

## Why

Every paid or free student gets a permanent PZ ID the moment they are marked paid. That is right and stays. What is wrong is that the tools treat the whole batch as one group:

- The "Download IDs" button on a batch's registrations screen prints every student. The owner shares that PDF in the live WhatsApp group, so recorded and module-only students must not be in it unless the owner chooses.
- Class emails (reminder, update, feedback) go to every live paid student. A Module 1 class would reach the Module 4 student. There is no way to see the recipient list first.
- Students who are not logged in and have no account have no place on the main website to check their own attendance, quiz results and certificates.

Real case today: PPC Batch 3 (page `a2456801-cac0-4ac8-b4c0-179db02b013d`): 69 students. Live full course 40 (incl. a group of 3), live Module 1 10, live Module 4 1, recorded full 11, recorded Module 1 7. Day 1 (Module 1) must reach live full course + live Module 1 = 50, and nobody else. All 12 classes have automatic emails switched OFF until project A ships.

## Project A: choose who, then download or email (owner ruling: admin can filter AND hand-pick)

The batch registrations screen (`CampaignRegistrations.tsx`) already has filters (mode, option label, status, region, search), row tick-boxes, "select everything in this filter", and message builders that take a selection (`{mode:"ids"}` or `{mode:"filter"}`). Build on that. Do not make a second picker.

Goals:
1. **ID PDF for the selection.** The existing "Download IDs" uses the ticked rows, or the whole current filter if "all in filter" is on, or the whole batch when nothing is ticked and no filter is set (today's behaviour, labelled clearly). Only people who have a PZ ID can be in it. The button says how many it will include ("Download IDs (52)"). The PDF never contains emails.
2. **Email IDs to the selection.** A new "Email their IDs" action in the same selection menu, using the existing message builder and send pipeline (`participant_sends`). Content: first name, their own PZ ID, a one-line "use this ID for attendance and quiz results", and the Track Your Progress link once project B exists. Before sending, the owner sees the full recipient list (name, email, option bought) AND the list of people in the batch who are NOT receiving it, then confirms. Nothing sends without that confirm. Idempotent per person: a second press must not email the same person twice unless the owner explicitly chooses "send again".
3. **Class emails use a stored audience.** Each class gets an audience setting with quick choices ("Live full course + Module 1", "All live", "Everyone with an ID") plus a custom option label list. The 5-minute automatic sender and the manual "Email to students" button both use it. The owner sees the exact recipient list and the excluded list (same two-list preview) on the class card before turning automatic email on. Default for existing classes: the current behaviour is NOT kept as the default; a class with no audience set sends nothing and shows "Choose who gets this".
4. **Quick filters** on the registrations screen: "Live full course", "Live + Module 1 (Day 1)", "All live". They only set the existing filters; they add nothing new to the data.

Rules:
- Only people with a PZ ID (status paid or free, not test) can be selected for IDs or emails. Pending, underpaid, reserved rows are shown greyed out with the reason.
- Group members come in through their lead (existing rule); the preview shows them so the owner sees the group of 3 as 3 people.
- Module filtering uses `option_label` text, because imported rows have an empty `option_keys`. Match on a stable normalised form (mode + course/module), not the raw label string, so "Live — Modules: M1 – Individual" and a future label with different dashes both work. Which module a class belongs to is chosen by the owner when setting the audience; it is not guessed from the class title.
- Never send to unsubscribed people (existing planner rule stays).

Non-goals: changing the public Find-your-ID page (it stays open to the whole batch; limiting it is a later, optional change); WhatsApp sending; per-student module access control inside Zoom.

Anti-goals (failure even if it "works"): an email reaching a recorded or wrong-module student; a send with no preview; a PDF that includes people the owner did not select; emails or phone numbers in the ID PDF or in any public page.

Left to the builder: where the audience setting lives (column on `batch_sessions` vs a small table), the migration, the exact wording of the ID email, and layout (must be phone-friendly: stacked rows, tap targets, no sideways scroll). Migration number is 0092 (next free). The owner pastes all SQL; the builder only prepares it.

## Project B: "Track Your Progress" (public, no account)

Title (owner may change): **Track Your Progress**, subtitle "Check your attendance, quiz results and certificates."

- A public page in the app, with a short link the main website (pharmacozyme.com, WordPress) can button-link to. The website itself needs no big change.
- Three cards: Attendance, Results, Certificates. A visitor types their PZ ID (e.g. `Nimra-1004`) and sees their own totals across batches. "Forgot your ID? Find it by name" links to the existing find-your-ID flow.
- Shows: first name only, per batch: classes attended of total and percentage, quiz scores and rank where a leaderboard exists (live students only count in rankings; recorded still see their own results), certificate status. No email, no phone, no last name.
- Owner ruling (earlier, 2026-10-27): results and attendance are public by ID. IDs run in sequence, so they can be guessed; that is accepted. Mitigations the builder must add: rate limit lookups per IP, and an unknown ID gives the same "not found" for any bad input.
- Public per-course leaderboards stay in the later plan 4 scope of `2026-10-27-attendance-results-design.md`; this project covers only "my totals by ID" and the three cards.
- Phone-first design. Build the screen design in Stitch first (project "PZ Academy Platform 2"), then code.

Non-goals: logging in, editing anything, showing other people's data beside yours.

## Order and size

A first (needed for Day 2 emails), then B. Each is its own branch and PR; the owner merges. A needs migration 0092 (pasted by the owner). Both end with a phone-width browser check before merge.

## Calls made after the builder check (marked as the designer's calls; the owner can overrule)

1. **Audience is a stored rule, checked again at each send, not a snapshot.** A student who pays after the preview and fits the rule is included in later sends. A reminder for one class is still sent at most once per person (the existing one-reminder-per-class rule in `participant_sends` stays). The class card shows the live recipient count, and turning automatic email on shows the current list first.
2. **Matching.** A "full course" student matches every class. A "Module N" student matches only classes whose audience includes Module N. Live Module 4 does not match a Module 1 class. A label that cannot be read (odd import, free, anything unrecognised) is never included automatically: it appears in the "not receiving" list with the reason "unrecognised option" so the owner can see and fix it.
3. **No double sends.** The builder reads the existing dedupe in `participant_sends` / `participant_send_recipients` and reuses it; manual and automatic reminders share the same record. "Send again" for ID emails is an explicit owner choice and is logged as a new send.
4. **"Not receiving" list** = everyone in the batch who is not in the send, each with one plain reason: no PZ ID yet (pending / underpaid / reserved), recorded, wrong module, unsubscribed, unrecognised option, test row.
5. **ID PDF with nothing ticked and no filter:** a plain count in the button ("Download IDs (69, whole batch)"); no extra confirm.
6. **Track Your Progress numbers.** Attendance is "attended X of Y classes held so far" (not all scheduled). A student counts only classes whose audience includes them (so a Module 1 student's total ignores Module 4 classes). Recorded students have no attendance line (shown as "not tracked for recorded students"); they still see results and certificate status. Attendance data and quiz results already exist (plans 2 and 3 are live on main).
7. **Rate limit:** a small Postgres counter keyed by a hash of the IP, about 30 lookups per 10 minutes. It adds one table to migration 0092 or a 0093; the owner pastes it.
8. **Link:** an app route (`/progress`) on the app's own domain; the WordPress site only links to it. Certificate status is text only ("Issued" with the date, or "Not issued yet"); no download from this page, so nothing beyond first name and totals is exposed.
