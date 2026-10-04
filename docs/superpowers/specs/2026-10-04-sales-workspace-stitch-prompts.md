# Sales Workspace: Stitch prompts (Phase B screens)

Generate these in the Stitch project **PZ Academy Platform 2** so they sit next to the existing CRM screens. Each prompt covers one screen group. Ask for **both Mobile and Desktop** of each.

## What already exists in Stitch (do not regenerate, use as style reference)

In "PZ Academy Platform 2":
- **CRM Daily Workspace - Outreach & Sales Desk** (desktop only): lead list with filter chips, lead dossier, WhatsApp message box, quick status buttons, note box, touchpoint timeline. Good base for Today and My Contacts.
- **Campaign Creation Wizard - Step 2: Craft Message** (desktop only): stepper, tag chips, live WhatsApp preview. Good base for the campaign wizard. Its "3-7 s intervals" safe-send text is wrong for us (ours is 90-180 s).
- **Admissions Sales Pipeline - Kanban Board** (desktop only): not used in Phase B.

Gaps the prompts below fill: no mobile versions, no daily-budget meter, no spacing countdown or break screen, no quiet-hours state, no panic button, no one-tap outcome buttons (Replied, Interested, Bought, Not interested), no Add Lead or Help screens.

## Shared style block (paste at the top of every prompt)

> Design for PZ Academy, an online pharmacy-education company. Match the existing "PZ Academy Platform 2" CRM screens: deep forest-green primary, soft mint surfaces, white cards, rounded corners, friendly clear sans-serif, generous spacing. Audience: non-technical sales agents who message prospects on WhatsApp all day. Big tap targets (min 44 px), plain words, no jargon, one obvious next action per screen. Must work equally well on phone and desktop. Must have a dark-mode-friendly structure (no hard-coded white text on pale backgrounds). Do not invent a new colour palette.

## 1. Today queue

> [Shared style block]
> Screen: "Today" for a sales agent. Top: a friendly greeting and a **daily send meter** for the WhatsApp number in use: "14 of 60 new chats used today" with a progress bar; below it a smaller hourly line "4 of 20 this hour" that turns amber from 15 and red at 20. A number switcher chip ("Using: DMC campaign number 2").
> Main: a prioritised list of contact cards for today: name, phone, course they asked about, "why today" tag (New lead, Follow-up due, Replied, Gone quiet 3 days), last outcome chip. Each card has one big green **Message on WhatsApp** button and a small "Skip".
> Include three states as separate frames: (a) normal, (b) **spacing wait**: after a send, the next button is disabled with a countdown "Next message in 1:32 — pacing keeps your number safe", (c) **break**: after every 10 sends a calm full-width card "Take a 10-minute break", with a timer, plus (d) **quiet hours** state "Messaging resumes at 9:00 AM" with the follow-up list still readable.
> Mobile: single column, sticky meter at top. Desktop: left list, right contact detail pane.

## 2. My Contacts with timeline pane

> [Shared style block]
> Screen: "My Contacts". Search bar, filter chips (Mine, Unclaimed, All, Follow-ups due, Interested), list of contacts. Unclaimed contacts show a **Claim** button; other agents' contacts are visible but greyed with the owner's name and no action buttons.
> Contact detail (right pane on desktop, full screen on phone): name, phone, course interest, source, a green **Message on WhatsApp** button, then **one-tap outcome buttons** in a row of four large pills: Replied, Interested, Bought, Not interested. Under it: "Remind me to follow up" with quick choices (Tomorrow, In 3 days, Next week, Pick date). Then a note box and a vertical **timeline** of everything that happened (message sent, outcome tapped, note, reassigned by admin) with time and agent name.
> No chat inbox: replies happen in WhatsApp, the CRM only records the outcome.

## 3. Campaign wizard (3 steps)

> [Shared style block]
> Screen set: 3-step campaign wizard, "Message my contacts". Stepper: 1 Choose who, 2 Write message, 3 Check and send.
> Step 1: pick from my contacts only, with filters and a count ("85 selected"); show how many of them are over today's remaining budget ("You can send 46 more today; the rest are scheduled for tomorrow").
> Step 2: write own wording, tag chips (First name, Course), live WhatsApp preview, template picker. A small calm note: "Messages go out one at a time from your own WhatsApp, with pauses." No promises like "guaranteed safe".
> Step 3: summary (who, how many today, how many tomorrow, number used, estimated time), a warm-up notice if the number is new ("This number is warming up: 10 a day"), and a primary button **Start sending**. Then a **sending-session** screen: current contact card, big **Open WhatsApp** button, progress "7 of 46", countdown to the next one, a **Pause** button and a red **Something is wrong, stop** panic button that explains "This freezes this number for 48 hours."
> Mobile and desktop for every step.

## 4. Add lead

> [Shared style block]
> Screen: "Add a lead" inside the sales workspace. Two paths as big tabs: **Paste a WhatsApp chat** (large text area, "Paste the chat here", a Read it button) and **Type it in** (name, phone, course, note). After pasting, show a review card with the detected name, phone, course and a summary of what they asked, all editable, and a **Save lead** button. Success state: "Saved. It's in your contacts" with buttons Message now and Add another.

## 5. Help and tour

> [Shared style block]
> Screens: (a) a first-login **welcome tour** of 4 short cards (Today list, send a message, tap what happened, remind me later) with Skip and Next; (b) a **Help** page with short plain answers: "Why do I have to wait between messages?", "What is the daily limit?", "What does the break mean?", "What if WhatsApp warns me?", "Who do I ask?", each as an expandable row with a friendly icon, and an honest line: "WhatsApp does not publish its limits, so we stay well under what we think is safe."

## 6. Admin settings page (desktop and tablet are enough)

> [Shared style block]
> Screen: admin "WhatsApp safety settings". Numbers table (label, owner/shared, status Active/Warming up/Frozen, today's sends, assigned agents) with Freeze and Unfreeze. Settings form with the defaults: new chats per day 60, per hour 20, warning from 15, spacing 90-180 seconds, break length 10 minutes after every 10 sends, quiet hours 21:00-09:00, warm-up start 10 per day and rise by 10 per day, panic freeze 48 hours. Each field has a one-line plain explanation. A banner: "These are cautious estimates, not guarantees from WhatsApp."
