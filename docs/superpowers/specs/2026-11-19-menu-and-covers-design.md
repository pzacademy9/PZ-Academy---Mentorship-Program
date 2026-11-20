# Menu tidy-up, collapsible sidebar and course covers (design, short)

Date: 2026-11-19. Owner request jobs 4 and 3 of a four-job request (Classes rework and Portal access follow as their own designs).

## Intent and why
The admin left menu is one long list. On PC it uses space and hides the work. The owner wants it shorter and collapsible. Course covers are missing on cards, so cards look plain and are hard to tell apart.

## Goals
- Left sidebar collapses to icons only on PC. The choice is remembered per browser. Phone menu unchanged.
- Agent Leaderboard, Sales Hub, Payment Accounts and Terms and Conditions leave the main menu and live in Settings.
- Send Notice moves into Notifications.
- Course cover shows on the Registrations campaign cards and on the Programs course cards.

## Non-goals
- No change to who may see what: every moved page keeps its current area permission and its current address (URL).
- No database change.
- Affiliates, Sheet Sync, Mentors, Feedback and the rest of the menu stay as they are (owner did not ask).

## Anti-goals
- A moved page that no longer opens, or opens for the wrong role.
- A cover that breaks the card when the image is missing or slow.

## Approaches
1. Keep the page addresses, change only the menu and add link cards inside Settings and a tab inside Notifications. Chosen: safest, nothing else breaks.
2. Move the pages to new addresses under Settings. Rejected: breaks saved links and the "active menu item" logic for no gain.
3. Add a second "More" menu. Rejected: owner asked for Settings.

## Decisions
- Settings page becomes two parts: "My profile" (today's form, unchanged) and, for people who have the matching area, a "Admin tools" group of four large link cards (Agent Leaderboard, Sales Hub, Payment Accounts, Terms and Conditions) with one plain line each. Cards a person has no area for are not shown.
- Notifications page gets a "Send a notice" button at the top for people with the notifications area. It opens the existing notice page (address unchanged). The "Send Notice" menu item is removed.
- Sidebar: a small collapse button at the bottom. Collapsed shows icons with a hover/focus label and a tooltip. State kept in localStorage, read in a try/catch, default expanded. Keyboard: button is focusable, Escape not needed.
- Active-item highlight: pages under Settings tools highlight "Settings"; the notice page highlights "Notifications".
- Covers: reuse the existing cover helper and the app's own cover route (Drive images need `/thumbnail?id=` via `/api/cover`). Fixed-height image on top of the card, soft grey block with the course initial when there is no cover.
- Design: new look is checked against Stitch first. If no screen exists the owner gets a phone and a PC prompt before the UI is built.

## Left to the builder
Exact icon choices, card spacing, tooltip implementation, where the cover URL comes from for each card (check how `courses` and `landing_pages` store it).

## Size
Small change. Tests first for: menu list per role, Settings cards per area, collapse state.
