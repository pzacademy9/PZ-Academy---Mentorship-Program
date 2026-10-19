# Stitch prompts: Registrations screen (Phase 3, Plan 1)

Generate these in the Stitch project **PZ Academy Platform 1** (`11811490301995978699`), next to the existing screen "Admin: Enrollment Review — Clinical Excellence" (`d5483d0f798c46959c35b4e4c871643c`, desktop), so the look matches. Use the same design system. Desktop first; if Stitch offers it, also make a mobile version of screens 1 and 2.

What the existing Enrollment Review screen already covers (reuse as is): page title, four stat cards, status filter pills with counts, the "Manage Applications" table (student, course, submitted, amount, receipt, status, actions), the detail page header with status badge and field grid. The prompts below cover only what is NOT in it. Tell me the screen names when done.

Plain words only on screen: "link", "country", "module". Never "variant", "override", "resolve", "schema".

---

## 1. Page registrations list (admin)

> Design the admin screen "Page Registrations" for PZ Academy, same visual style, header, sidebar and table style as "Admin: Enrollment Review — Clinical Excellence". At the top, below the page title, show a two-tab strip: "App sign-ups" and "Page registrations" (this one active). Under it: status pills with counts (All, Pending, Reserved, Underpaid, Paid), then a filter bar with: a search box "Search name, email or reference", a dropdown "Page", a dropdown "Live or Recorded" (All, Live, Recorded), a dropdown "Agent". Then a table with columns: Name (with email small underneath), Page, Country, Option bought, Live/Recorded chip, Amount (with currency, e.g. "PKR 12,000" or "AED 150"), Status badge (Pending amber, Reserved blue, Underpaid orange, Paid green), Agent, Date. A group lead row shows a small "+4 members" chip next to the name. A "Test" grey chip appears on test rows. Each row opens the detail. Include a pager at the bottom ("Showing 1-25 of 132"), and an empty state: "No registrations match these filters."

## 2. Registration detail with status change (admin)

> Design the admin detail screen for one page registration, in the style of the "Enrollment Review" detail. Header: person's name, reference number (e.g. "DIA-0042"), status badge, page name, and a primary button "Change status". Left column cards: "Details" (email, WhatsApp, profession, city, country, how they found us), "What they bought" (option, Live or Recorded, group size, promo code, price breakdown with expected amount and currency, amount received), "Payment" (payment method, receipt/voucher thumbnail with a button "Open receipt"), "Agent" (agent name or "Direct"). Right column: "Status history" as a vertical timeline, each entry showing "Pending to Paid", who changed it (name), when ("5 Oct, 14:32"), and a small source chip "App" or "Sheet". Below, a card "Group members" listing each member (name, email, WhatsApp, status) shown only for group registrations. Include a small notice line: "Changing the lead changes the whole group."

## 3. Change status dialog

> Design a modal dialog "Change status" for a registration. Shows the person's name and current status badge. A set of four selectable options: Pending, Reserved, Underpaid, Paid, each with one short plain line (Pending: waiting for payment check. Reserved: seat held. Underpaid: paid less than the price. Paid: payment received in full). When Underpaid is chosen, show a required number field "Amount received" with the currency and the expected price shown beside it ("Expected: PKR 12,000"), and an inline error "Enter an amount smaller than the price. For the full price choose Paid." Buttons: "Cancel" and "Save status". Also design the conflict state: a red notice "Someone else changed this just now. Reload to see the latest." with a "Reload" button.

## 4. Agent view: My registrations (sales workspace)

> Design the sales agent screen "Registrations" for PZ Academy's Sales workspace, same style as the other agent pages (Today, My Contacts, Campaigns). It lists only registrations that came through the agent's own link. Status pills with counts (All, Pending, Reserved, Underpaid, Paid), a search box, a dropdown "Page" and "Live or Recorded". No Agent filter and no Test rows. Table columns: Name, Page, Country, Option bought, Live/Recorded chip, Amount with currency, Status badge, Date. On mobile, rows become cards with the name, page, amount and status badge, and a "Change status" button. Empty state: "No registrations yet. Share your link to get your first one."

## 5. Agent registration detail

> Design the agent detail screen for one registration (same as the admin detail but without the Agent card): details, what they bought, receipt, group members, status history, and a "Change status" button. Add a short friendly note under the button: "Your changes are saved with your name."

---

After you generate them, send me the screen names (or tell me they are in the project) and I'll port them. Nothing in Plan 1 Tasks 7 to 9 starts until then; the database and logic tasks run meanwhile.
