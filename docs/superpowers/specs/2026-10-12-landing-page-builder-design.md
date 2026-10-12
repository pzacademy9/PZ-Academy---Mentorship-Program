# Landing Page Builder — design

Date: 2026-10-12. Branch: `landing-page-builder` (off `origin/main`, upstream unset).
Status: written for review; nothing is built.

## Problem

PZ Academy sells courses, workshops and webinars through three hand-written,
single-file HTML landing pages (`Landing pages/Course/PPC-B3-Landing.html`,
`Workshop/MDC-B3-Landing.html`, `Webinar/Webinar20 Landing.html`, 125–310 KB each).
Copy, prices, payment accounts, dates and schedules are hardcoded in each file.
Each event also needs its own hand-pasted Google Apps Script (GAS) and a hand-made
Google Sheet. Making "Batch 4" means copying 300 KB of HTML and editing it by hand,
which a non-technical admin cannot do.

The goal is a builder inside the app where a non-technical admin fills in guided
forms and publishes a fast, laptop- and phone-optimized landing page for any course,
workshop or webinar. Registration must work for logged-in users and for guests, and
every registration must be saved in the app and in a Google Sheet that follows the
existing GAS column pattern.

## What the existing pages do (the behavior to preserve)

- **Section order** (all three): hero, stats/trust bar, curriculum, benefits,
  instructor, pricing, registration, schedule, reviews/video reviews, FAQ, footer,
  plus a floating WhatsApp button and countdown banner.
- **Registration modal**, multi-step: plan/tier, region, details, payment, voucher
  upload, success with a ref ID and a prefilled WhatsApp verify message.
- **Pricing** varies per page:
  - Course (PPC): 6 regions (PK PKR, UAE AED, KSA SAR, PH PHP, IN INR, USD),
    Early Bird until a cutoff date then a higher tier, Full Course vs single modules
    (M1–M4), Live vs Recorded, Individual / Group of 3 (20% off) / Group of 5 (25% off).
  - Workshop (MDC): 4 regions (PK, UAE, KSA, USD), a separate "Recorded Participants" sheet.
  - Webinar (W20): Free vs Pro plan, groups of 3+ get 20% off Pro, regions PK and PH.
- **Payment accounts** (Faysal, Easypaisa, Mashreq, Arab National Bank, PNB, GCash,
  PNB India, PayPal) are shown per region and hardcoded in HTML and again in GAS.
- **Per-event GAS** (`doPost`): uploads the voucher to Drive, writes Lead/Member/
  Individual rows to a 19–20 column sheet (A→S, W20 adds Region at T), generates a ref ID
  (`PZA-PPC-001`) via `doGet`, and sends submission emails (registrant, each member,
  admin alert) through Brevo. An installable `onEdit` trigger on column P
  (Paid/Pending/Underpaid/Reserved) sends the matching status email and cascades it to
  group members. `doGet?email=` is the portal access check. PPC also maps Reg Option to
  WhatsApp group links (Full Course group, or one group per module).
- **Meta Pixel** `2299307960538116` is fired in the browser: PageView, Lead,
  CompleteRegistration and Purchase.

## Defects in the current setup this design fixes

1. **Promo codes are not validated.** Any code ending in `NN%` gives NN% off (cap 30);
   any code starting with `PZ` gives 10%. The browser also sends the final amount.
2. **Meta Purchase fires at upload time**, before payment is verified, so unpaid or fake
   vouchers count as sales.
3. **Ref IDs** come from a read-then-write `doGet`, which can hand the same ID to two
   concurrent registrants.
4. **Secrets in scripts.** Live Brevo API keys are hardcoded in `PPC B3 GAS.gs` and
   `MDC-3-GAS.gs`. They should be rotated; the new system keeps keys in server env only.
5. Pages load Tailwind from a CDN, GSAP and pdf.js at runtime.

## Decisions already made (do not re-ask)

| Topic | Decision |
|---|---|
| Guest registration | **Registration record only.** No account is created. The registration is linked to a user by email when they later sign up or log in. |
| Where payments are verified | **Both the app and the Sheet, kept in sync two ways.** |
| Editing model | **Template plus section blocks** (toggle, reorder, guided forms), live laptop/phone preview. Not drag-and-drop freeform. |
| Hosting | **In the app** at `/e/<slug>`; custom domain or WordPress redirect can come later. |
| Sheets | **One spreadsheet per event**, created by the app. |
| Architecture | **Pages are structured data in the database, rendered by Next.js**, with one shared registration engine. |
| Agent links | **Track only.** Discounts come only from promo codes. |
| WhatsApp group links | Shown on the **success screen, the received email and the Paid email.** The gate is the admin approving the join request in WhatsApp after verifying payment. |
| Delivery | Three phases, each with its own plan. |

## Architecture overview

- `landing_pages` rows hold an ordered list of section blocks plus registration settings.
  A server-rendered route `/e/[slug]` renders the published copy, cached at the edge and
  revalidated when the admin presses Publish.
- The admin builder lives under the admin dashboard as **Landing Pages**.
- The registration widget is one lazy-loaded React component shared by every page.
- Registration posts to an app API route (not directly to GAS). The database is the
  source of truth; the Sheet row, emails and Meta events are background jobs with retries.
- The existing `gas/sheets-sync/Code.gs` project gains new actions; no new GAS project.

## Data model (new tables, hand-written migration, `database.types.ts` hand-edited)

All tables have RLS enabled. Public registration writes go through the service-role
client behind the register route; admins read through the app.

**`landing_pages`**
- `id`, `slug` (unique), `kind` (`course` | `workshop` | `webinar`), `title`,
  `status` (`draft` | `published` | `closed`).
- `draft` jsonb and `published` jsonb: `{ sections: [{type, enabled, data}], registration: {...}, emails: {...}, seo: {...}, meta: {...} }`.
  Edits go to `draft`; Publish copies to `published` and stores a snapshot in
  `landing_page_versions` for rollback.
- `course_id` (nullable FK `courses`) — Paid registrations create an active enrollment.
- `sheet_id`, `drive_folder_id` (set when the sheet is created), `ref_prefix` (e.g. `PPC`).

**`landing_page_versions`** — `page_id`, `version`, `published jsonb`, `created_by`, `created_at`.

**`payment_accounts`** — global library edited once in Settings:
`key`, `label`, `kind` (bank / wallet / paypal), `rows jsonb` (label/value pairs), `display_text`.
Pages reference account keys per region; numbers are never retyped per page.

**`landing_registrations`** — one row per person, mirroring Sheet columns A→T:
- Identity: `name`, `email` (lowercased), `whatsapp`, `profession`, `city`, `region`,
  `discovery`, `consent`.
- Registration: `page_id`, `row_type` (`individual` | `lead` | `member`), `lead_registration_id`
  (members → lead), `option_label`, `option_keys`, `promo_code_id`, `promo_code_text`,
  `expected_amount`, `currency`, `payment_method`, `voucher_url`.
- Status: `status` (`pending` | `paid` | `underpaid` | `reserved` | `free`), `amount_received`,
  `email_status`, `status_changed_at`, `status_source` (`app` | `sheet`).
- Link: `student_id` (nullable; set when the same email logs in or signs up), `ref_id`
  (`PZA-<prefix>-NNN` from a per-page database counter, unique).
- Attribution: `agent_id`, `referral_code`, `utm jsonb`, `fbp`, `fbc`, `event_id`.
- Test: `is_test` boolean (test-mode rows are excluded from every report).

**`landing_promo_codes`** — `code` (unique, uppercase), `type` (`percent` | `fixed`),
`value` (percent, or per-currency amounts jsonb for fixed), `max_discount_percent`,
`page_ids` (empty = all pages), `option_keys` (optional), `max_uses`, `used_count`,
`one_per_email`, `starts_at`, `ends_at`, `active`, `owner_agent_id` (optional).

**`landing_status_events`** — registration status transitions: `registration_id`, `from`,
`to`, `source`, `at`. Used for idempotency (one email and one Meta Purchase per
registration and status) and for tracing sync conflicts.

**`landing_funnel_events`** — lightweight: `page_id`, `session_id`, `type`
(`view`, `start`, `step`, `submit`), `utm jsonb`, `agent_id`, `at`. Powers funnel reports.

**`landing_agent_links`** — `agent_id` (a `sales_agent` profile), `code` (short, unique,
e.g. `ayesha-7k2`). A `?ref=<code>` visit stores the agent for 30 days.

## Page builder (admin UI)

Route: `/dashboard/admin/landing-pages` (list, editor). Built to the Stitch screens
generated from the prompts delivered with this spec (no Stitch screen exists for it yet).

- **List:** status badge (Draft / Live / Closed); Edit, View, **Duplicate**, Close registration.
- **New page:** choose Course / Workshop / Webinar or Duplicate an old page. Only the name
  and dates are asked; the slug is generated.
- **Editor, three panes:** left, section list with on/off switch and up/down arrows;
  middle, a plain form for the selected section (labelled fields with a short example under
  each); right, a live preview with a Laptop / Phone toggle. Autosave to draft.
- **Section library:** hero, trust/stats bar, problem/hook, curriculum/outcomes, benefits,
  instructor(s), pricing, schedule/agenda, video preview, video reviews, testimonials,
  quiz/Kahoot demo, workbook/ebook preview, how to register, payment methods, FAQ,
  final CTA, more programs, footer, countdown banner, WhatsApp float button.
  Templates preselect the right sections per kind.
- **Registration setup stepper:** (1) what can people buy; (2) group discounts; (3) prices by
  country as a spreadsheet-like table with "copy this row"; (4) Early Bird end date;
  (5) payment accounts per country; (6) promo codes link.
- **WhatsApp groups:** each option has an optional group link, validated as
  `chat.whatsapp.com/...`, with a **Test link** button. Several modules chosen means each
  module's group; all modules or the Full Course means only the Full Course group (the
  existing PPC rule). The checklist warns when an option has no link and reminds the admin to
  set each group to "approve new members".
- **Emails tab:** editable templates with merge fields (name, amount, class time, payment
  accounts, WhatsApp group buttons), live preview, "send me a test".
- **"Ready to publish?" checklist** in plain words; Publish is locked until required items
  are done.
- **Test mode:** "Register as a customer" runs the full flow, writes nothing real (rows
  tagged `is_test`).
- **Safety:** snapshot per Publish with one-click rollback; **Close registration** shows a
  closed banner instantly.
- **Media:** images uploaded through the existing Drive upload route, compressed and sized
  for laptop and phone; YouTube and Shorts added by pasting a link; text fields allow bold,
  bullets and links only (existing `sanitize-html`).
- The editor is designed for laptop and tablet; the Registrations screen is designed for
  phones too.

## Registration engine

- **Steps** (same on laptop and phone): (1) choose option, live/recorded, individual/group,
  with live price; (2) details; (3) pay — only accounts for the visitor's region, with copy
  buttons and a promo box; (4) voucher upload (compressed in the browser first), consent,
  submit.
- **Region** is guessed from the visitor's location (Vercel geo header) and changeable in one
  tap; it drives currency, class time and payment accounts.
- **Logged-in users:** name, email, WhatsApp, profession prefilled from the profile (email
  locked); step 2 collapses to "Confirm your details". An existing pending registration for
  the page shows its status instead of a duplicate. Guests: the same flow with empty fields;
  the success screen offers an optional "Create a free account with this email".
- **Groups:** the lead enters members; each member gets their own email; all rows share the
  lead's payment status.
- **Free webinar plan:** skips pay and upload; row status `free`; joining details emailed.
- **Server-side submit** (`POST /api/landing/[slug]/register`): validate (zod), rate-limit and
  honeypot, check the page is open and not over capacity, recompute the price from page
  settings + group tier + Early Bird + promo (browser totals ignored), upload the voucher
  (jpg/png/webp/pdf, 10 MB), insert registration rows in a transaction, return the ref ID.
  The Sheet row, confirmation emails and Meta events run as background jobs with retries.
- **Ref ID** comes from a per-page database counter (fixes the `doGet` race).
- **Success screen:** ref ID, prefilled WhatsApp verify message, what happens next, and the
  WhatsApp group buttons for the chosen options.
- **Resubmission:** an existing Pending or Underpaid registration for the same email and page
  can attach a new voucher to the same row.

## Promo codes

Managed in the app (list with used/remaining counts). Validated by the server when entered
and again on submit. One code per registration, applied after group and Early Bird
discounts, capped by `max_discount_percent`. `used_count` increments when the registration
is saved. Expired, exhausted or wrong-page codes return a clear message. The legacy
`NN%` / `PZ` pattern is retired; the admin imports the codes actually in use.

## Agent links

Each `sales_agent` gets a short link per page, `/e/<slug>?ref=<code>`. A visit stores the
agent for 30 days; the registration records `agent_id`. Agents get a **My links** panel in the
Sales workspace (copy, views, registrations, paid). Admins get a per-agent leaderboard
(registrations, paid, revenue). No commission payouts are built. In Phase 3 a Paid
registration can write a `contact_purchases` row so existing CRM conversion tracking
reflects agent-driven sales.

## Meta Ads tracking

- **Browser Pixel** (ID in Settings, overridable per page): PageView, ViewContent, Lead (opens
  registration), InitiateCheckout (reaches the pay step), CompleteRegistration (submitted).
  Each event carries an `event_id` for de-duplication.
- **Purchase** fires only when a registration becomes Paid, via the Conversions API from the
  server, with real value and currency, once per registration (guarded by
  `landing_status_events`). Works for Paid set in the app or in the Sheet.
- `fbp`, `fbc` (from `fbclid`) and UTMs are stored at registration; email and phone are
  SHA-256 hashed before sending. Meta accepts events up to 7 days old, so a registration
  verified later does not count. Per page, CompleteRegistration can be chosen as the
  optimization event instead.
- **Settings screen:** Pixel ID, CAPI access token (server-side only), "Send test event",
  connection status. **Ad link maker** on each page builds UTM-tagged URLs.
- **Reports (Phase 3):** per page views → starts → submitted → paid; revenue by UTM
  campaign/ad set/ad; drop-off step. Ad spend and ROAS stay in Meta Ads Manager (the
  Marketing API is out of scope).
- Verification uses Meta's Test Events tool before relying on the behavior.

## Sheets, emails and two-way sync

- **Sheet creation:** a new `createEventSheet` action in `gas/sheets-sync/Code.gs` creates the
  spreadsheet (tab `Form Responses 1`), headers A→S as PPC/MDC, Region at T, then extra
  columns for Agent, Promo code and UTM campaign; the dark-green frozen header, Lead/Member row
  colors, the P-column dropdown (Paid / Pending / Underpaid / Reserved) and the voucher as a
  "View Receipt" link. A vouchers folder is created in Drive. The sheet is registered with the
  sync service. All sheets share identical headers, which matches the existing
  `COL_*` script-property assumption in `sheets-sync`.
- **Emails:** sent by the app through Brevo (key in env only). Ported from the three scripts:
  received, Paid, Pending, Underpaid, Reserved, member versions, admin alert; group cascade
  preserved; times and payment accounts come from the page's region settings.
- **Two-way sync:**
  - App → Sheet: new registrations append a row; status changes update column P and the
    email-confirmation column.
  - Sheet → app: edits to P (status) and O (amount received) reach the app.
  - Rows are matched by Ref ID plus email, never by row number.
  - Conflicts: latest change wins; each change records its source. Emails and the Meta
    Purchase fire only on a real status transition, guarded per registration and status.
  - Non-status columns are app-owned; Sheet edits to them are overwritten (stated in the
    sheet's header note).
  - Failures queue with retries. The admin sees "Sheet sync: N waiting", **Retry** and
    **Rebuild sheet from app**.
- **Sheet → app trigger mechanism (decide in Phase 3 plan):** the existing sheets-sync
  `registerSheet` installs one installable `onEdit` trigger per sheet, instant but capped at
  ~20 triggers per script per user. For one-spreadsheet-per-event that cap would be hit. The
  proposal is a single time-driven trigger that scans all registered event sheets every 1–5
  minutes and posts changes to a new webhook handler keyed by `sheetId`, unlimited events,
  at the cost of up to a few minutes' latency for Sheet-originated edits. The Phase 3 plan
  must confirm this against Apps Script quotas.
- **Course access:** when a registration becomes Paid and its page has a `course_id`, a
  matched student gets an active enrollment. A guest who signs up later with the same email
  is linked and enrolled then.
- **Old pages keep working untouched.** Nothing is cut over until the admin moves a page.

## Performance and responsive

- Published pages are server-rendered and edge-cached, refreshed on Publish. No runtime CDN
  Tailwind, GSAP or pdf.js; self-hosted fonts via `next/font`; images as WebP/AVIF at proper
  sizes (hero priority, rest lazy); YouTube as a thumbnail until tapped; the registration
  code loads on click; the Pixel loads after interactive.
- Targets: LCP < 2.5 s on a mid-range Android phone on 4G, CLS < 0.1, measured with
  Lighthouse each phase.
- **Phone:** mobile-first; a sticky bottom bar (price and Early Bird countdown); registration
  as a full-screen sheet; 16px inputs; large thumb-reach buttons.
- **Laptop:** sticky top nav with section anchors; wide hero; registration as a two-column
  modal (form plus order summary).
- Landing pages are light-theme only. Use the project's `pz-*` tokens, no raw hex.
- Open item for the user: the Vercel function region is Washington (`iad1`) while the database
  is in Tokyo; the register route makes several database calls, so moving to `hnd1` matters
  more here. Not done by this work.

## Security

- All price and discount logic is server-side; the client total is advisory only.
- Register route is rate-limited and has a honeypot; voucher type and size are enforced on
  the server; filenames are sanitized.
- Service-role writes only inside server routes; RLS enabled on every new table.
- Brevo, Meta CAPI and sync secrets live in server env or Script Properties only.
- Another user's registration is never returned; the status page requires ref ID plus email.
- Rotate the Brevo keys currently hardcoded in the existing GAS files.

## Testing

- Unit: the price engine using the real page numbers as fixtures (for example, PKR Early Bird
  Full Course individual 4,800 and group of 3 11,500; per-person AED/SAR/PHP/INR/USD values),
  promo validation, WhatsApp-group selection rules, status-transition idempotency, and the
  registration-to-Sheet column mapping A→T.
- API tests for the register route and RLS tests for each table.
- Browser click-throughs at laptop and 390 px phone width, guest and logged-in.
- Meta Test Events; Lighthouse performance runs.
- An independent review of every phase before it is called done.

## Phases (each gets its own implementation plan)

1. **Builder and renderer:** tables for pages, versions and payment accounts; section
   library and templates for the three kinds; editor with live preview; Duplicate, Publish,
   rollback; the `/e/[slug]` renderer; performance targets met; recreations of the three
   existing pages as starter templates.
2. **Registration engine:** pricing, regions, groups, Early Bird, promo codes, agent links,
   WhatsApp groups, guest and logged-in flows, voucher upload, `landing_registrations`,
   per-event Sheet creation and append, browser Pixel and funnel events, test mode.
3. **Operations:** Registrations screen (phone-friendly), status changes with emails and the
   group cascade, two-way Sheet sync, Meta Conversions API Purchase, Settings for Meta and
   payment accounts, reports, agent leaderboard, CRM purchase link.

## Out of scope (YAGNI)

Freeform drag-and-drop, commission payouts, Meta Marketing API spend import, dark-mode
landing pages, bulk import of old Sheet registrations, automated WhatsApp group adds.

## Process notes

Database changes: the user pastes the SQL; the Supabase MCP only reads. `npm run` is broken
in this workspace path, so tsc and vitest are called directly. Stitch screens are produced
from prompts the user runs, per the project rule, before any builder UI is coded.
