# Stitch generation prompts: Payment accounts, My links, Agent leaderboard

Written 2026-10-22. Design spec: `docs/superpowers/specs/2026-10-22-payment-accounts-and-my-links-design.md`.
No screen for these three topics exists in the Stitch project (searched 2026-10-22), so per the
project's Stitch-first rule the screens must be generated (by you; `generate_screen_from_text`
times out on this account) before any screen code is written. Build Tasks 6 and 7 wait until you
confirm the screens exist.

## What to do

1. Open the Stitch project "PZ Academy website" (`11811490301995978699`). It already has the
   admin and sales scaffolding, so the new screens inherit the right look.
2. Paste each prompt below and generate it. Where a prompt says "laptop and phone", run it twice:
   once at 1440 px wide and once at 390 px wide. Admin screens need a light and a dark variant.
3. Tell the builder when the screens are ready.

## Which prompt feeds which work

- **Prompt 1** (Payment accounts, admin): Task 6.
- **Prompt 2** (My links, Sales workspace): Task 7.
- **Prompt 3** (Agent leaderboard, admin): Task 7.

## The look to keep (all three prompts)

These are not new designs. They sit inside the screens that already exist:

- **Admin screens** (1 and 3): the app's Material-3 admin look with the `pz-*` colours, the same
  as the Promo Codes and Landing Pages admin pages. Left sidebar, page title in Montserrat bold
  with a short muted subtitle underneath, a green primary button at the top right, content in
  rounded white cards (light) or dark surface cards (dark) with a thin border, tables with a
  muted header row, small rounded chips for status, and Inter for body text. Light and dark.
- **Sales screen** (2): the Sales workspace look, the same as "My Registrations": the sales
  sidebar (Today, My Contacts, Registrations, Campaigns, Add a Lead, Help & Safety), the same page
  header with title and muted subtitle, and the same card style. Light and dark.
- Icons: outlined, rounded (Lucide-style in the app, Material Symbols outlined is fine in Stitch).
- Primary green: `#04704D`. Deep green: `#023122`. Mint: `#80D8AD`. Keep the existing palette.
- Plain, friendly words. The owner and the sales agents are not technical.

---

## Prompt 1: Admin "Payment accounts" (laptop + phone)

> Design an admin screen called "Payment accounts" for the PZ Academy admin dashboard, using the
> app's existing Material-3 admin look: left sidebar (show "Payment Accounts" highlighted in the
> Landing group, near Promo Codes), top header, `pz-*` surface colours, primary green `#04704D`,
> Montserrat headings, Inter body, outlined icons. Show light and dark variants. Laptop (1440 px)
> first, then phone (390 px).
>
> **Page header**: title "Payment accounts", muted subtitle "Where students send their money, by
> country. Change an account here once and every page and email shows it." On the right, an
> outlined "+ Add country" button and a solid green "+ Add account" button.
>
> **Body**: one section per country, stacked vertically. Each section has a country heading row:
> the country name in bold ("Pakistan") with a small muted region code chip ("PK"), a count
> ("2 accounts"), and a small "Edit country" text button at the right. Countries to show, in this
> order: Pakistan, UAE, Saudi Arabia, Philippines, India, International.
>
> Under each heading, a list of **account cards**, in the order students see them. Each card
> shows, left to right:
> - up and down arrow buttons stacked at the far left (move up, move down; the first card's "up"
>   and the last card's "down" are disabled);
> - the account name in bold ("Faysal Bank"), with a small coloured type chip next to it: Bank
>   (blue), Wallet (purple) or PayPal (amber);
> - two or three detail rows in muted label and normal value pairs ("Account title: Pharmacozyme",
>   "IBAN: PK00 FAYS 0000 0000 0000 0000", "Branch: Gulshan, Karachi");
> - on the right, a "Shown to students" toggle switch (on = visible, off = hidden) and a
>   pencil "Edit" button.
>
> Pakistan section: two cards (Faysal Bank, EasyPaisa). UAE: one (Mashreq Bank). Saudi Arabia:
> one (ANB). Philippines: two (PNB, GCash). India: one (PNB India). International: one (PayPal).
> Show one card in the **hidden** state: the toggle off, the whole card dimmed, and a small grey
> "Hidden from students" badge.
>
> Add an **empty country** section (for example "Sri Lanka") with a dashed outline box, an amber
> warning icon and the text "No accounts yet: pages use their own list" and a small "+ Add
> account" button inside it.
>
> **Phone version**: country headings stay; each account card becomes a full-width card with the
> name and chip on top, detail rows below, and a bottom row holding the toggle on the left and
> "Move up", "Move down", "Edit" icon buttons on the right (each at least 44 px high). The two
> header buttons collapse into one green "+ Add" button that opens a small menu ("Add account",
> "Add country").
>
> **Second frame, "Edit account" dialog** (a centred dialog on laptop, a full-screen sheet on
> phone): title "Edit account" (or "Add account" in the add variant). Fields, each with a label
> above, small muted help text and a placeholder example:
> - "Account name" (example: Faysal Bank);
> - "Type" select: Bank, Wallet, PayPal;
> - "Details students will see": a repeating list of rows, each with a "Label" field (example:
>   IBAN) and a "Value" field, with a remove (x) button, and a "+ Add detail" text button;
> - "Short note for students (optional)" textarea (example: Please send the exact amount and
>   keep your receipt);
> - "Show this account under": a checklist of the countries, with the current ones ticked, and
>   help text "PayPal can be shown under more than one country.";
> - a "Shown to students" switch;
> - buttons "Cancel" and a green "Save account".
> Show one inline error state under the Account name field ("Please give this account a name.")
> and a saving state on the button.
>
> **Third frame, "Add country" dialog** (and the same dialog in edit mode): title "Add a
> country". Fields: "Country name" (example: Sri Lanka) and "Short code" (example: LK, help text
> "A short code with letters only. Pages use it to find this country."). A line of muted text: "You
> add the accounts after the country is created." Buttons "Cancel" and "Add country". Show an
> error state ("This short code is already used.").
>
> **Fourth frame**: a small toast at the bottom ("Saved. Every page now shows this account.")
> and a confirmation popover when hiding an account that is the only one in its country ("This is
> the only account in Pakistan. Pages will use their own list instead. Hide it anyway?" with
> "Keep showing" and "Hide it").

## Prompt 2: Sales workspace "My links" (laptop + phone)

> Design a Sales workspace screen called "My links" for the PZ Academy sales agent area, using
> the same look as the existing "My Registrations" page: the sales sidebar (Today, My Contacts,
> Registrations, Campaigns, Add a Lead, Help & Safety) with "My Links" added and highlighted
> (link icon), top header, page title in Montserrat bold with a muted subtitle, rounded cards,
> Inter body text, primary green `#04704D`. Show light and dark variants. Laptop (1440 px) first,
> then phone (390 px).
>
> **Page header**: title "My links", muted subtitle "Share your own link for each course. We
> count everyone who comes through it, so you can see how you are doing."
>
> **Body**: one card per live page, stacked, three or four visible. Each card shows:
> - the page name in bold ("PPC Batch 3") with a small green "Live" chip and a muted line with
>   the type and date ("Workshop · starts 4 September");
> - the **full link** in a soft grey read-only box with a monospace font and a link icon
>   (example: `pzacademy.com/e/ppc-batch-3?ref=ayesha-k`), and a solid green **"Copy link"**
>   button next to it; show one card in the copied state (the button turns to a tick and
>   "Copied");
> - three number blocks in a row, each with a big number and a small muted label: **Views**
>   (example 128), **Registered** (example 14), **Paid** (example 9), each with a tiny icon (eye,
>   person with plus, check circle). A muted line under the numbers: "Counts are only for
>   people who came through your link."
> Do not show any money amounts anywhere on this screen.
>
> **Empty state** (second frame): a centred illustration (a link and a megaphone), the heading
> "No pages are open for registration yet", the text "When a course or workshop opens, your
> personal link will appear here." No button.
>
> **Loading and error variants** (third frame): skeleton cards while loading, and a friendly error
> card "We could not load your links. Please try again." with a "Try again" button.
>
> **Phone version**: cards at full width with 16 px side margins; the link box sits on its own
> line, truncating in the middle, with the Copy button full width and at least 48 px high below
> it; the three numbers become three equal columns under the button. The sales bottom navigation
> shows a "Links" tab.

## Prompt 3: Admin "Agent leaderboard" (laptop + phone)

> Design an admin screen called "Agent leaderboard" for the PZ Academy admin dashboard, using the
> app's existing Material-3 admin look (the same as the Promo Codes admin page): left sidebar with
> "Agent Leaderboard" highlighted in the Landing group, top header, `pz-*` surface colours,
> primary green `#04704D`, Montserrat headings, Inter body. Show light and dark variants. Laptop
> (1440 px) first, then phone (390 px).
>
> **Page header**: title "Agent leaderboard", muted subtitle "See which sales agents bring in
> paying students." On the right, a segmented control with three options: "Last 7 days", "Last 30
> days", "All time" (All time selected by default).
>
> **Body**: a table inside a rounded card. Columns: Rank (1, 2, 3 ... the top three with a small
> gold, silver and bronze medal icon), Agent (round initials avatar, name in bold, email muted
> beneath), Registered (a number), Paid (a number, with a muted "of 14" conversion hint such as
> "64% paid"), and Revenue. Revenue shows **one line per currency** because there is no
> conversion, for example "PKR 245,000" and beneath it, smaller, "AED 1,800", or "USD 120". An
> agent with no paid sales shows a muted dash. Show 8 rows, including one agent with two
> currencies and one with no sales.
>
> Above the table, three small summary tiles: "Total registered", "Total paid", and a "Revenue"
> tile that lists each currency on its own line.
>
> A muted note under the table: "A group registration counts as one sale. Revenue uses the
> amount received when it is filled in, otherwise the expected amount."
>
> **Empty state** (second frame): when nobody has registered in the chosen period: a centred
> illustration (a podium), the heading "No sales in this period yet", and the text "Try a longer
> period, or check back after your agents share their links." with a small outlined "Show all
> time" button.
>
> **Loading and error variants** (third frame): skeleton table rows, and an error card "We could
> not load the leaderboard. Please try again." with a "Try again" button.
>
> **Phone version**: the segmented control sits under the title and scrolls sideways if needed;
> the table becomes one card per agent showing the rank badge and name on top, then Registered
> and Paid as two number blocks, then the revenue lines at the bottom. Summary tiles become a
> horizontal scroll row.
