# Contacts: guided page for non-technical staff

Date: 2026-11-18. Branch: contacts-guided (from main 17c585fd). Approved by the owner 2026-11-18 ("start on Contacts now", after the design in the Audiences message).

## Intent and why
The Contacts page is a dense 7-column table of about 2,111 people. The owner wants non-technical staff to find people and act on them with no guessing. Also, the page only ever shows the first 50 people and has no way to see the rest: that gap must be fixed.

## Goals
- Three plain steps on one page: 1 Find people, 2 Pick people, 3 What do you want to do.
- Phone (390px): each person is a card. PC (1440px): a roomy list with 4 columns (tick box, Person with email and phone under the name, Registered for as course chips, Country).
- Previous and Next paging, with "Showing 51 to 100 of 2,111 people".
- A "What do you want to do?" area: with nobody ticked it says "Tick people to see what you can do". With people ticked it shows "N people selected", the main button "Send an email", and a "More" menu: Send on WhatsApp, Give to a sales agent, Mark as converted. Phone: sticky bar at the bottom clearing the bottom nav. PC: sticky card on the right.
- Calm empty states: "No one matches. Try a shorter search." and the existing "No contacts yet" import link.

## Non-goals
- No change to who the actions work on, what they do, or any data. Same sessionStorage hand-offs, same manual-conversions call.
- No per-person Paid/Pending chip (status is not stored per contact in this list). Not in this build.
- No Cohorts page work (separate project). No migration. No new API route (the existing GET already takes `offset` and `limit`).

## Anti-goals
- Do not drop an existing action or the ability to open a contact's detail page.
- Do not copy invented Stitch content (made-up names, the fake "Updated just now", fake bottom menu with Applications/Affiliates etc.).
- Never lose the picks when moving between pages or searches (existing deliberate behaviour: selection persists).

## Constraints
- Stitch is the source of truth: project 13117286791417011091, "Contacts - Sales Hub (Desktop 1440px)" and "(Mobile 390px)".
- Colours: backgrounds and borders use pz-solid-*/landing-* or the pz-primary / pz-surface-container-* family already used; pz-deep, pz-mid, pz-danger are text only.
- Calm plain words, no exclamation marks. Menus: Escape closes, focus returns to the opener. 44px tap targets on phone.
- CRLF line endings kept. No eslint-disable for @typescript-eslint. Never regenerate database.types.ts.
- Phone numbers and emails already show to admins on this page today; nothing new is exposed.

## Approaches
1. Rebuild ContactsPanel as steps with paging and an action area, keeping the data call and all handlers. Chosen: smallest change, nothing about the data moves.
2. Replace with a new page. Rejected: loses tested wiring.
3. Only restyle the table. Rejected: does not guide anyone and leaves the 50-person limit.

## Decisions (builder's calls marked)
- Page size 50 (the current size). Paging by `offset`. Changing search or filters goes back to page 1. (Call.)
- Search runs on Enter or the Search button, as today. (Call.)
- "Class group" is the label for the old "All cohorts" dropdown; "Course" stays. (Call.)
- "Send an email" opens the existing campaign hand-off.
- The "Mark as converted" form stays the same fields, shown in a panel opened from More.

## Left to the builder
Component split, exact copy within the calm-words rule, test layout, loading and error states.
