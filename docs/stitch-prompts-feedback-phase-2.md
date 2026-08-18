# Stitch generation prompts — Feedback System Phase 2

Run these in Stitch project `8093496535280885471` ("PZ Academy Feedback System"). Written
2026-08-17 during planning for the feedback-viewing / mentor-reviews / covers / share-card
follow-up to the native feedback system.

## Extraction note (read before porting any of these to code)

The app's `tailwind.config.ts` ports Stitch class names 1:1 by adding a `pz-` prefix
(`bg-primary-container` → `bg-pz-primary-container`), and the config supplies **light** values
for the same Material-3 token names Stitch renders dark — so a dark Stitch mockup becomes a
correctly-themed light admin screen automatically, with no manual recoloring.

This only works if the generated screen uses **semantic Material-3 token classes**
(`bg-primary-container`, `text-on-surface-variant`, `border-outline-variant`, etc.). It breaks
if the screen uses the Stitch project's *other* palette layer — the hardcoded "forest" classes
(`bg-brand-forest-0/1/2`, `bg-level-*`, `text-trigger`, raw hex like `#0F3D22`/`#194B32`) seen on
some existing screens in this project (Admin Session List, New Session Modal, Viewer Session
List). Those have no `pz-` equivalent and will not port — every prompt below explicitly forbids
them.

---

## Prompt A — `Admin | New Session Modal v2`

> Redesign the "New Session" modal for a feedback admin dashboard, dark theme, Montserrat display
> + Plus Jakarta Sans body, Material Symbols Outlined icons, cards `rounded-xl`, spacing scale
> 4/8/12/24/48. Use ONLY Material-3 semantic colour classes (`bg-surface-container`,
> `bg-primary-container`, `text-on-primary-container`, `text-on-surface-variant`,
> `border-outline-variant`, `bg-error-container`) — do not invent custom brand classes or use raw
> hex values. Modal is `max-w-2xl`, scrollable body, over a `bg-black/60 backdrop-blur-sm` scrim.
> Contents in order: (1) **Cover image uploader at the very top** — a 16:9 dashed-border drop zone
> the full width of the modal, centred `add_photo_alternate` icon, "Drag a 16:9 cover image or
> click to upload", a small "Recommended 1920×1080 · JPG or PNG · max 5 MB" hint, and a filled
> state showing the image `object-cover` in the same 16:9 frame with a small floating `close`
> button top-right to remove it; (2) Session Name text input; (3) a two-column row of Speaker Name
> text input and a Date input; (4) **a "Link to mentor" combobox** below them — a searchable
> select showing mentor rows as a circular monogram avatar + name + a muted specialty line, with a
> clearable selected state and an "Optional — links this session's reviews to a public mentor
> profile" helper line; (5) a "Make this a program" toggle switch in a bordered box; (6) the
> Questions block: a counter "3 of 5 selected · min 3", five checkbox rows each with an editable
> question label and a small segmented star/video type toggle on the right, then a "+ Add custom
> question" text button. Footer: `Cancel` ghost button and a filled pill `Create Session` button
> with an `arrow_forward` icon.

## Prompt B — `Admin | Session Detail v2`

> Design a feedback session detail page for an admin dashboard, dark theme, same type system and
> Material-3 semantic colour classes as the rest of this project (no custom brand classes, no raw
> hex). Layout top to bottom: (1) a back link, then a **full-width 16:9 cover hero**
> `rounded-xl overflow-hidden` with the image `object-cover` and a bottom gradient scrim, holding
> the session title as an overlaid `display-lg` heading, a status pill, and a "Change cover" /
> "Remove" pair of small glass buttons top-right; (2) an attribution row directly beneath —
> circular mentor monogram avatar, mentor name as a link with a small `open_in_new` icon, a middot,
> the date; (3) an action toolbar: `Close Session`, `Export CSV`, and a prominent filled
> `Share` button; (4) a row of four stat cards (`Total Responses`, `Avg Rating` shown as `4.8 / 5.0`,
> `Video Responses`, `Public Reviews`) each with an icon chip and a subtle
> `bg-gradient-to-br from-primary/5` hover wash; (5) an "Avg Rating per Question" card with
> horizontal bars — label left, score right-aligned, `h-3 rounded-full` track with a `bg-primary`
> fill; (6) a **Responses list of expandable cards** (not a table): each collapsed row shows a
> monogram avatar, participant name, a gold star row with their personal average, a one-line
> truncated quote, a timestamp, and on the right **an eye / eye-off icon button that toggles
> whether that review is publicly visible**, plus a delete icon and a chevron. Show one row in the
> hidden state — dimmed to `opacity-60` with a small `Hidden` pill — so both states are visible.
> Expanded state reveals per-question gold star rows and a 16:9 video embed placeholder.

## Prompt C — `Admin | Share Review Page Modal`

> Design a "Share Review Page" modal for a feedback admin dashboard, dark theme, Material-3
> semantic colour classes only, `max-w-xl rounded-xl`. It presents **two tiers stacked as two
> bordered cards**. Card one, "Public link": a `public` icon, the heading, the muted explainer
> "Viewers see reviews only — no filter, search, or share controls", a read-only URL input with a
> `content_copy` copy button, and a ghost `Open` button. Card two, "Members link", visually
> emphasised with a `border-primary/40` border and a small `Recommended` pill: a `workspace_premium`
> icon, the explainer "Includes filter, search, sort, and social share-card download", the same
> read-only URL + copy + open controls. Beneath both cards, a bordered "Social share card" section
> showing a **square 1:1 preview thumbnail** of a generated share image on the left and, on the
> right, its title, a "1080 × 1080 · PNG" caption and a filled `Download image` button with a
> `download` icon. Bottom-left of the modal, a small **QR code block** — a 180×180 QR placeholder
> on a light rounded tile with a `Download QR` text button beneath it.

## Prompt D — `Mentor Profile | Reviews Section`

> Design a **reviews section for a public expert/mentor profile page**, dark theme, Montserrat +
> Plus Jakarta Sans, Material Symbols Outlined, Material-3 semantic colour classes only (no custom
> brand classes, no raw hex), `rounded-xl` cards, generous 48px section spacing. It is one section
> of a longer page, so start with a section heading "What Mentees Say" and a muted subtitle
> "Verified feedback from completed sessions". Then a **rating summary band**: on the left a very
> large `display-lg` average number `4.8` with a gold five-star row beneath it and a muted
> "based on 24 reviews" line; on the right a **rating distribution histogram** — five rows labelled
> 5★ to 1★, each a thin `h-2 rounded-full` track with a gold fill and a right-aligned count. Beneath
> that, a **responsive grid of review cards**, `md:grid-cols-2 gap-gutter`: each card has a circular
> monogram avatar, reviewer name, a muted relative date, a gold star row, a quotation-mark icon, the
> review body text clamped to four lines, and a muted footer line naming the session it came from.
> Include one card in a "Featured" variant with a `border-primary/40` border and a small gold
> `Featured` pill. End the section with a centred ghost `Show all 24 reviews` button. Also render an
> **empty state variant** below the main design: a centred muted `reviews` icon, "No reviews yet",
> and a one-line explainer.

---

## After generating

Come back and tell me the screens exist — I'll fetch their HTML via `mcp__stitch__get_screen`
and extract them into the codebase (Tasks 2–5 of the phase-2 plan), matching the app's existing
`pz-*` Tailwind tokens per the extraction note above.
