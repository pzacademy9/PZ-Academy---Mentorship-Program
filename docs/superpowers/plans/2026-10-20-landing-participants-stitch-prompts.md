# Stitch prompts for Plan 3 (campaign participants and messaging)

Project: "PZ Academy Platform 2" (4651274386787527431). Reuse the existing Registrations screens (admin list "Registrations", detail "Registration Detail - Dr. Farooq Tariq (DIA-0042)") for style: same sidebar, header, chips, light and dark. Plain words only. Make each screen once in light and once in dark if the project does that for others. Tell me the screen names or ids when done.

## P1. Campaign list (front of Registrations)

Admin screen inside the existing Enrollments > Page registrations area. Title "Registrations". A row of cards or a clean list, one per campaign: campaign name (e.g. "TMC Batch 1"), a small chip for page state (Live, Draft, Closed), total registrations, and small chips for Pending, Reserved, Underpaid, Paid counts. Clicking a campaign opens it. A clear link "All registrations" at the top right opens today's flat list. Include an empty state "No registrations yet".

## P2. Campaign page (the main one)

Same screen as today's admin Registrations list, but for one campaign. Heading is the campaign name with a back link "All campaigns". Under the heading a short line of status counts. Filters row: search, status tabs (All, Pending, Reserved, Underpaid, Paid, Free), plus selects for Live or Recorded, Country, What they bought, Agent. Table gets a checkbox column and a header checkbox. When the header checkbox is ticked and more rows exist than are shown, a banner appears: "All 25 on this page are selected. Select all 57 in this filter". When something is selected, a sticky bar appears at the bottom with "12 selected" and two buttons: "Send email" and "Send WhatsApp", plus "Clear". Below the table, a section "Messages sent" (see P5). Show the state with some rows ticked and the banner visible.

## P3. Email builder (opens from Send email)

A page or large panel titled "Email to 12 people - TMC Batch 1". Left: template picker (dropdown of saved templates, "Save as template" button), Subject field, Message box (plain text), small chips to insert tags: First name, Full name, Reference number, Portal link. A line under the box: "Links you paste become clickable. An unsubscribe link is added at the bottom automatically." Buttons: "Send test to me", "Review and send". Second state (summary step, as a modal or next step): "You are about to email 12 people", breakdown chips (Paid 9, Pending 2, Underpaid 1), and when anyone is not Paid a strong amber warning box: "3 people have not paid (Pending 2, Underpaid 1). They will get this message too." with a tick box "I understand" that must be ticked before the "Confirm and send" button turns on. Third state (sending): progress "Sent 8 of 12" then result "Sent 11, failed 1, skipped 2 (unsubscribed)". Show the warning state.

## P4. WhatsApp list (opens from Send WhatsApp)

Same builder layout but one message box with the same tag chips and the same summary and warning steps. After confirming, a list of people: name, phone, a green "Open WhatsApp" button, a "Mark sent" button, and a "Sent 2:14 pm" state. A row with no phone shows "No phone number" and no buttons. Top of list: "Sent 3 of 12", and the Web or App choice used in Sales Hub WhatsApp.

## P5. Messages sent (list and detail)

A section on the campaign page: rows with date and time, a small Email or WhatsApp chip, subject (or first words), who sent it, and counts "Sent 11 - Failed 1 - Skipped 2". Click a row to open a detail with each person, their state (Sent, Failed with a short plain reason such as "Mailbox full", Skipped with reason "Unsubscribed" or "No phone number") and a "Resend failed" button. Also edit the existing Registration Detail screen: in the "Emails sent" card, add rows for builder emails (subject, date) and WhatsApp messages (Sent via WhatsApp, date), under the automatic emails.
