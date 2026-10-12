# Stitch generation prompts — Landing Page Builder

Written 2026-10-12. Design spec: `docs/superpowers/specs/2026-10-12-landing-page-builder-design.md`.
Phase 1 plan: `docs/superpowers/plans/2026-10-12-landing-page-builder-phase-1.md`.
No screen for any of this exists in the known Stitch projects, so per the project's
Stitch-first rule these prompts must be run (by you; `generate_screen_from_text` times out on
this account) and the resulting screens extracted before any UI code is written.

## Which prompts block which work

- **Prompts 1–2** (public landing page, laptop + phone) and **3–5** (admin list, editor): needed
  for **Phase 1**. Tasks 7, 9, 10, 11 of the Phase 1 plan stop until these exist.
- **Prompts 6–8** (registration flow): needed for **Phase 2**. Generate them in the same Stitch
  project as 1–2 so the page and the form share one look.
- **Prompts 9–11** (Registrations screen, promo codes and agent links, Meta settings): **Phase 3**.

## Two palettes (read before generating)

- **Prompts 1, 2, 6, 7, 8 are the PUBLIC landing page** and must use the existing landing-page
  brand, not the app's admin palette: primary green `#04704D`, deep green `#023122`, mint
  `#80D8AD`, near-black `#0D1B13`, light surface `#F8F9FA`, body text `#191C1D`; Montserrat
  headings, Inter body, Material Symbols icons; **light theme only**. Generate these in the
  "PZ Academy website" project (`11811490301995978699`) or a new project named
  "PZ Academy Landing Pages", and tell Stitch to keep the palette exactly.
- **Prompts 3, 4, 5, 9, 10, 11 are ADMIN screens** and must use the app's admin Material-3 `pz-*`
  palette, with light AND dark variants (the admin area supports dark mode). Generate these in
  project `11811490301995978699` ("PZ Academy website", has the admin scaffolding) so they
  inherit the right tokens, the same way `docs/stitch-prompts-feedback-phase-2.md` describes.

Tip: run each prompt once for laptop (1440 wide) and, where noted, once for phone (390 wide).

---

## Prompt 1 — Public landing page, laptop (1440 px)

> Design a long-scroll marketing landing page for a pharmacy education course, workshop or
> webinar, for desktop (1440 px). Brand: deep green `#023122` and primary green `#04704D`,
> mint accent `#80D8AD`, near-black `#0D1B13`, light grey-white page `#F8F9FA`, body text
> `#191C1D`. Headings Montserrat bold, body Inter, Material Symbols outlined icons. Light
> theme only. Professional, trustworthy, calm, not flashy. Generous whitespace, 8 px rounded
> corners, soft shadows.
>
> Top: a thin green countdown banner ("Early Bird ends in 3d 4h 12m"). Below it a sticky
> top navigation: logo "PZ Academy" at left; centred anchor links Benefits, Curriculum,
> Instructor, Pricing, FAQ; at right a solid green "Register now" button.
>
> Sections, in order, each one clearly separated by background tone:
> 1. **Hero**: left column has a small uppercase eyebrow ("LIVE WORKSHOP · 4–7 SEPTEMBER"),
>    a large two-line headline, a 2-sentence description, a date and time line with a calendar
>    icon, two buttons (solid green "Register now", outlined "Watch preview"), and a row of
>    three small check-mark highlights. Right column: a large rounded instructor/course image
>    with a floating mint badge ("Limited seats").
> 2. **Numbers bar**: dark green full-width strip with four big numbers and labels
>    (500+ Pharmacists trained, 4.9 Average rating, 12 Hours of content, 3 Days live).
> 3. **Text block** ("Why this matters"): heading, three short paragraphs and a bullet list on
>    the left, an image on the right.
> 4. **Benefit cards**: heading, subheading, a 3-column grid of 6 cards, each with an icon, a
>    bold title and 2 lines of text.
> 5. **Curriculum**: heading and 4 accordion rows ("Day 1 — Basics" with a small subtitle),
>    the first row open showing 5 bullet topics.
> 6. **Instructors**: heading and two cards side by side, each with a round photo, name,
>    credentials line and short bio.
> 7. **Prices**: heading, a note ("Early Bird ends 15 October"), three plan cards; the middle
>    card is highlighted with a "Best value" badge, shows a crossed-out old price, the price,
>    a feature list with ticks and a full-width "Register now" button.
> 8. **Schedule**: a clean timeline list (date and time at left, session title and detail at right).
> 9. **Video reviews**: a row of 3 vertical (9:16) YouTube-Shorts-style thumbnails with a play
>    button, each with a one-line caption.
> 10. **Testimonials**: a 3-column grid of quote cards with a round photo, name and role.
> 11. **FAQ**: 6 accordion questions in a two-column layout.
> 12. **Closing call to action**: deep green band, large headline, short text, a mint
>     "Register now" button.
> 13. **Footer**: logo, short about line, links, social icons, WhatsApp support number, copyright.
>
> Also show a round green WhatsApp floating button at bottom right. Keep the whole design
> consistent, readable and fast-feeling.

## Prompt 2 — Public landing page, phone (390 px)

> Design the mobile (390 px) version of the same pharmacy education landing page: same brand
> (deep green `#023122`, primary green `#04704D`, mint `#80D8AD`, light grey-white `#F8F9FA`,
> Montserrat headings, Inter body, light theme only). One column, 16 px side margins, large
> thumb-friendly buttons (min 48 px high), body text at least 16 px.
>
> Top: slim countdown strip. Below it a compact header with the logo and a hamburger menu
> (show the open menu as a second frame with the anchor links and a Register button).
> Then the sections stacked: hero (eyebrow, headline, description, date line, full-width
> "Register now" button, hero image below the text), numbers shown as a 2×2 grid, text block,
> benefit cards as a single column, curriculum accordion, instructor cards stacked, price
> cards as a horizontally snap-scrolling carousel with the best-value plan first and peeking
> the next card, schedule list, video reviews as a horizontal carousel of 9:16 thumbnails,
> testimonials as a carousel, FAQ accordion, closing call to action, footer.
>
> Most important: a **sticky bottom bar** that stays on screen while scrolling, containing the
> starting price on the left ("From PKR 4,800 · Early Bird") and a solid green "Register now"
> button on the right, with safe-area padding. The WhatsApp floating button sits just above it.
> Show it as one long frame plus a close-up of the sticky bar.

## Prompt 3 — Admin: Landing Pages list and "New page" dialog (laptop + phone)

> Design an admin screen "Landing Pages" for the PZ Academy admin dashboard, using the app's
> existing Material-3 admin look (left sidebar, top header, `pz-*` surface tokens). Show light
> and dark variants. Page header: title "Landing Pages", subtitle "Build and publish pages for
> your courses, workshops and webinars", and a green "+ New page" button at right.
>
> Below, a list. On laptop use a table with columns: Page (name and the link `/e/ppc-batch-3`
> beneath it in muted text), Type (a small coloured chip: Course, Workshop or Webinar),
> Status (a badge: Draft grey, Live green, Closed amber, plus a tiny blue "Unpublished
> changes" chip when relevant), Last edited, and an actions column with "Edit", "View live"
> (only for Live and Closed), "Duplicate" and a three-dot menu containing "Close
> registration" / "Reopen registration". On phone, turn each row into a card with the same
> information and the actions in a bottom row. Include an empty state (illustration, "No pages
> yet", "Create your first page" button).
>
> Second frame: the "New page" dialog. Title "Create a new page". Step content: three large
> selectable cards "Course", "Workshop", "Webinar" with an icon and one-line description; a
> text field "Page name" with helper text; a "Start from" select ("Blank course page", "PPC
> Batch 3 (copy)") ; a line "Your page link: /e/ppc-batch-4" with a small "Change" text
> button; buttons "Cancel" and "Create page". Show a validation error state under the field
> ("A page with that link already exists. Please choose a different link.").
>
> Third frame: the "Duplicate page" dialog (name prefilled "PPC Batch 3 (copy)", link line,
> buttons).

## Prompt 4 — Admin: Landing page editor, laptop (three panes)

> Design the editor for a landing page builder, for a non-technical admin, on laptop (1440 px).
> Use the app's Material-3 admin look; show light and dark variants.
>
> **Top bar**: back arrow to "Landing Pages", the page name (editable), a save-status text
> ("Saved", "Saving…", "Unsaved changes"), a "Preview" button with an external-link icon, a
> "Versions" button, and a prominent green "Publish" button. Show Publish disabled with a
> tooltip when the page is not ready.
>
> **Left pane (280 px) "Sections"**: a vertical list of the page's sections, each row with a
> toggle switch (show/hide), the section name ("Hero", "Numbers bar", "Curriculum",
> "Instructors", "Prices", "FAQ"…), and small up and down arrow buttons; the selected row is
> highlighted. Hidden sections look dimmed. At the top a pinned row "Page settings". At the
> bottom a dashed "+ Add section" button; show the open menu listing section types with an icon,
> name and one-line description. Under the list a collapsible "Ready to publish?" checklist
> card: show it with 3 problems in plain words ("Fill in 'Headline' in 'Hero'." with a small
> "Fix" button, "Add a short description for Google and WhatsApp previews.") and a green state
> variant "Everything is filled in".
>
> **Middle pane (400 px) "form"**: for the selected section (Curriculum) show a friendly form:
> field label above each field, small muted help text and an example as placeholder, a
> "Required to publish" marker on required fields, a text field "Heading", then a repeating
> list "Modules" where each item is a card with fields "Title", "Small line (optional)",
> "Topics" (textarea with the tip "Put **two stars** around words to make them bold, start a
> line with - for a bullet"), and per-item controls (move up, move down, remove); an "+ Add
> module" button. Also show an image-upload field variant (drop zone with preview, "Upload
> picture" and a "paste a link instead" text link) and a YouTube-link field with an inline
> error ("Paste a YouTube or YouTube Shorts link.").
>
> **Right pane (rest)**: a live preview of the landing page inside a device frame, with a
> segmented switch at the top "Laptop | Phone", and the frame scaled to fit. Show the phone
> variant as a second frame.
>
> Second frame: the "Page settings" form (Register button link and text, WhatsApp number with
> country-code helper, Countdown end date-time and label, "How the page appears on Google and
> WhatsApp" with title, description, share image and a small preview card).
>
> Third frame: the "Versions" side sheet: list "Version 5 · today 4:12 PM" … each with a
> "Restore this version" button and the current live version marked.

## Prompt 5 — Admin: Landing page editor, tablet (820 px) and phone notice

> Design the same landing page editor for a tablet (820 px wide): two panes only. The section
> list is a collapsible drawer from the left (hamburger button "Sections"); the main area
> alternates between "Edit" and "Preview" via a segmented control at the top. Keep the top bar
> with name, save status and Publish. Show one frame in Edit mode and one in Preview mode.
>
> Also design the phone (390 px) fallback: a friendly full-screen message "The page editor works
> best on a laptop or tablet", an illustration, and a "Back to Landing Pages" button.

---

## Prompt 6 — Public: Registration modal, laptop (Phase 2)

> Design the registration flow for the PZ Academy landing page, as a two-column modal on
> desktop (960 px wide, centred over a dimmed page). Same brand as the landing page: deep green
> `#023122`, primary green `#04704D`, mint `#80D8AD`, Montserrat and Inter, light theme.
>
> Left column is the form with a 4-step progress indicator on top ("1 Choose", "2 Details",
> "3 Pay", "4 Upload"); right column is a sticky "Your order" summary card (selected option,
> group size, subtotal, group discount, promo discount, Early Bird note, a bold total in the
> chosen currency, and a small "Secure and verified manually" note).
>
> Show these frames: **Step 1 Choose**: a country selector chip row (Pakistan, UAE, Saudi
> Arabia, Philippines, India, International) with the detected one preselected; two big option
> cards ("Full Course", "Individual modules" with 4 module checkboxes); a Live / Recorded
> segmented toggle; Individual / Group of 3 (-20%) / Group of 5 (-25%) segmented control with
> the per-person price. **Step 2 Details**: Name, Email, WhatsApp (with country code), City,
> Profession select, "How did you hear about us?" select; and a variant for a logged-in user
> where the fields are collapsed into one "Registering as Ayesha Khan · ayesha@mail.com ·
> change" row. For groups, show a "Members" block with repeating Name, Email, WhatsApp rows.
> **Step 3 Pay**: payment-account cards for the chosen country (bank name, account number or
> IBAN with a "Copy" button, account title), a promo-code field with "Apply" and success ("✓
> 15% off applied") and error ("This code has expired") states, and clear instruction text.
> **Step 4 Upload**: a drag-and-drop upload zone for the payment screenshot (accepts photos and
> PDF, shows the filename and a tick after upload), a consent checkbox, and a large green
> "Complete Registration" button with a loading state.

## Prompt 7 — Public: Registration, phone (Phase 2)

> Design the mobile (390 px) registration flow of the same landing page as a full-screen sheet
> sliding up, with a sticky top bar (back arrow, "Register", step dots 1–4, close X) and a
> sticky bottom bar containing the live total on the left and a large green "Continue" button on
> the right. One question group per screen; large touch targets; correct keyboard types
> (email, phone). Show the four steps as four frames, plus the collapsed "logged-in" variant of
> step 2 and a group-member entry screen. In Step 3 the account number cards have a big "Copy"
> button and the promo field is a single row with "Apply". In Step 4 the upload zone offers
> "Take photo" and "Choose file".

## Prompt 8 — Public: Success screen, laptop and phone (Phase 2)

> Design the post-registration success screen for the same flow (laptop modal and phone
> full-screen). A big green check animation, "You're registered!", the reference ID in a
> highlighted pill with a "Copy" button (example `PZA-PPC-042`), a short "What happens next" list
> (1 We verify your payment, 2 You get a confirmation email, 3 Join your WhatsApp group below),
> then one or more prominent "Join <Course name> WhatsApp group" buttons (WhatsApp green), a
> note "The group admin approves your request after your payment is verified", a secondary
> "Message us on WhatsApp to verify" button with the prefilled message, and (for guests) a soft
> card "Create a free account with this email to see your registration anytime" with a button.
> Also show the "payment still pending" status page variant ("Pending", "Paid" and "Needs
> attention" states) opened from the email.

## Prompt 9 — Admin: Registrations screen (Phase 3)

> Design an admin "Registrations" screen for the PZ Academy admin dashboard (Material-3 admin
> look, light and dark). Header with a page selector ("PPC Batch 3"), search, filters (status
> chips: Pending, Paid, Underpaid, Reserved, Free; region; agent; date), and a "Sheet sync: 2
> waiting · Retry" indicator plus an overflow menu "Rebuild sheet from app". Laptop: a table with
> Name and email, WhatsApp, Option, Expected amount and currency, Region, Agent, Promo, Status
> dropdown, Submitted. Group registrations show as an expandable parent (lead) row with member
> rows beneath it. Clicking a row opens a right-hand detail panel: voucher image preview (zoom)
> beside the details, an "Amount received" field, status buttons (Paid, Pending, Underpaid,
> Reserved), "Send email", and "Resend group link", plus an activity log (who changed the status
> and when, from app or from sheet). Phone: cards with a swipe or tap to open a full-screen detail
> with the voucher at the top and large status buttons at the bottom.

## Prompt 10 — Admin: Promo codes and agent links (Phase 3)

> Design two admin screens (Material-3 admin look, light and dark). **Promo codes**: a table of
> codes (code in monospace, type percent or fixed, value, pages it applies to, used / max
> uses as a small progress bar, valid from–to, owner agent, on/off switch) with a "+ New code"
> button and a create dialog (code, percent or fixed amount per currency, which pages, max uses,
> one use per email, start and end dates, owner agent select). **Agent performance**: a
> leaderboard of sales agents (rank, name, link views, registrations, paid, revenue by
> currency), a date filter, and per-agent expandable rows showing their links per page with a
> copy button. Also show the sales agent's own "My links" panel for the Sales workspace: one
> card per live page with the short link, a Copy button, and four small stats (views,
> registrations, paid, revenue).

## Prompt 11 — Admin: Meta tracking settings and ad link maker (Phase 3)

> Design an admin "Meta Ads" settings screen (Material-3 admin look, light and dark): a
> connection card with a green/red status dot, "Pixel ID" field, "Conversions API access token"
> password field with show/hide and the note "Stored securely on the server", a "Send test
> event" button with a result toast, and an "Optimization event" select (Purchase when paid /
> Registration submitted). Below it a "Recent events" table (time, event, page, status sent /
> failed, value). Second frame: the "Ad link maker" panel on a landing page: select platform
> (Facebook, Instagram, WhatsApp), campaign name field, ad name field, the generated URL in a
> read-only box with a Copy button and a small preview of the UTM tags, and the agent selector
> for personal links.
