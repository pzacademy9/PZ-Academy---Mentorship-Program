# Stitch screens: Sales Workspace (saved 2026-10-04)

Source: Stitch project "PZ Academy Platform 2", id `4651274386787527431`. Read-only export (list_screens only; no generate/edit/delete calls). get_screen was skipped because list_screens already returned identical htmlCode and screenshot download URLs.

Notes
- PNG files are the default Stitch thumbnails (about 500px on the long edge), NOT full resolution. For pixel detail, re-fetch the screenshot URL with a size suffix (e.g. `=w2560`) or rely on the HTML.
- HTML is the Tailwind-CDN export; classes use Stitch token names (`bg-primary-container`), which map to `pz-` prefixed tokens in the repo (e.g. `bg-pz-primary-container`).
- Nothing committed. No download failures.

## Saved screens (19)

Sizes in bytes (html / png).

| slug | Stitch title | screen id | device | size | shows |
|---|---|---|---|---|---|
| today-queue-desktop | Today Queue - PZ Academy CRM | a14d3a7880d449108aa9749ee27a91b4 | DESKTOP | 43529 / 77431 | Today Queue with Sales Workspace sidebar, enrolment target milestone 18/25, cohort-closing banner |
| my-contacts-timeline-desktop | My Contacts with Timeline Pane - PZ Academy | 60253c0954d3482199d70cba7f79a372 | DESKTOP | 38084 / 94516 | Contacts list with right-hand timeline pane; rep role workspace sidebar |
| outreach-sales-desk-desktop | CRM Daily Workspace - Outreach & Sales Desk | c03de61c09df4e5eba357ef538d4573a | DESKTOP | 37321 / 89765 | Early OFF-BRAND variant (teal #005147, Inter/Plus Jakarta Sans); outreach queue + pipeline nav. Reference only, do not port styling |
| outreach-desk-mobile | CRM Daily Workspace - Outreach Desk (Mobile) | b3259c3f1569479cad6939493e459511 | MOBILE | 28201 / 42813 | Mobile outreach desk (daily workspace), on-brand tokens |
| campaign-wizard-step-1-choose-who-desktop | Campaign Wizard - Step 1: Choose Who (Desktop) | 9695f42bdaa94bb6bd34b592367e2294 | DESKTOP | 35974 / 91902 | Wizard step 1 recipient selection; WhatsApp Connected status and cohort progress in header |
| campaign-wizard-step-1-choose-who-mobile | Campaign Wizard - Step 1: Choose Who (Mobile) | f3a0e9d35a1547838da36dcdafab8c9f | MOBILE | 21684 / 49771 | Step 1 mobile: 85 selected, 46 send today / 39 tomorrow, Pacing Protection badge |
| campaign-wizard-step-2-write-message-desktop | Campaign Wizard - Step 2: Write Message (Desktop) | 0fb9d2db7a5c4cffa2a640cfae675171 | DESKTOP | 31816 / 80707 | Step 2 message editor with WhatsApp-style preview (WhatsApp colours) |
| campaign-wizard-step-2-write-message-mobile | Campaign Wizard - Step 2: Write Message (Mobile) | 692079938c414efcbe6dc0b3cbc022af | MOBILE | 17710 / 48011 | Step 2 mobile: template picker (Smart Draft, Cohort Promotion), message body |
| campaign-creation-wizard-step-2-craft-message-desktop | Campaign Creation Wizard - Step 2: Craft Message | 37a35ac583b547e2aff1c1bc809b9477 | DESKTOP | 35115 / 84398 | Earlier/alternate step 2 (Outreach Campaign Studio, breadcrumb nav, Support & SOPs); likely superseded by the Write Message variant, kept for comparison |
| campaign-wizard-step-3-check-and-send-desktop | Campaign Wizard - Step 3: Check and Send (Desktop) | 63268ec509f2433cbeedf5385824051d | DESKTOP | 30915 / 93307 | Step 3 review summary and send confirmation |
| campaign-wizard-step-3-check-and-send-mobile | Campaign Wizard - Step 3: Check and Send (Mobile) | 8172eb108bf94eeb8a6538a19b9af27d | MOBILE | 14452 / 42448 | Step 3 mobile: Review & Blast, recipient volume and pacing check |
| campaign-sending-session-live-dispatch-desktop | Campaign Sending Session - Live Dispatch (Desktop) | 01cf97d668b3471aa01d8ac71bfcc65c | DESKTOP | 28575 / 92352 | Live sending session, progress and dispatch controls |
| campaign-sending-session-live-dispatch-mobile | Campaign Sending Session - Live Dispatch (Mobile) | 592039a0543f444fada45a2360e3851c | MOBILE | 16615 / 41891 | Sending 7 of 46, Pause, next-message countdown 01:45, automated pacing note |
| add-a-lead-desktop | Add a Lead - PZ Academy CRM | 6015b8b5eae2404b8332eac05a526bea | DESKTOP | 42438 / 110235 | Add Lead form with Admissions Desk nav |
| welcome-tour-desktop | Welcome Tour - PZ Academy CRM | bc10e34d0f824feba356fd2e87904653 | DESKTOP | 39599 / 75621 | First-run welcome tour on the workspace |
| help-and-safety-faq-desktop | Help & Safety FAQ - PZ Academy CRM | ec377720c43b46edbdaa8c1510df8e31 | DESKTOP | 31219 / 99450 | Help and Safety FAQ page |
| whatsapp-safety-and-limits-admin-desktop | WhatsApp Safety & Limits - PZ Academy Admin | e3f00dbc9bd94c9995dd68a0d95c5c72 | DESKTOP | 41953 / 59101 | Admin governance page: WhatsApp safety limits and pacing |
| whatsapp-safety-and-limits-admin-mobile | WhatsApp Safety & Limits - Admin (Mobile) | 219a3f8a67b945cdb105641e1a349150 | MOBILE | 31822 / 25745 | Safety Admin mobile: Algorithmic Shielding live guard, Fleet SIM risk 99% safe |

## Missing (never generated in the project)

- Today Queue (mobile)
- My Contacts with Timeline Pane (mobile)
- Add a Lead (mobile)
- Welcome Tour (mobile)
- Help & Safety FAQ (mobile)

## Not saved (irrelevant to Sales Workspace)

Tier & Ranking (Admin Edit Page, Mobile Admin); Mentor Tier Comparison (desktop + mobile); Top Mentors Featured Band (desktop + mobile); Messages Inbox (desktop, "(Mobile)" and "Messages Inbox - Mobile"); Message Thread (desktop + mobile); Student Conversation (6 variants: Alex Johnson, Alex Johnson v2, Alex Johnson Mobile, PZ Academy, PZ Academy Mobile, Mobile); Course Manager (Grouped List, Mobile Dashboard); Admissions Sales Pipeline - Kanban Board (desktop + mobile; adjacent to sales but not in the requested list, fetch on request); two image-only entries without HTML ("Professional headshot ..." e80b1b6e..., "PZ Academy CRM Logo" 69db7643...).

## Design tokens seen

Tailwind config is embedded in every on-brand screen (18 of 19) and is identical across them. Exception: `outreach-sales-desk-desktop` uses a different teal palette (primary #005147, Inter + Plus Jakarta Sans, plus #FAF8FF, #131B2E, #DAE2FD, #83D5C6, #F2F3FF); ignore it.

### Colors (Material-3 style names, light mode, `darkMode: "class"`)
primary #246d00; on-primary #fff; primary-container #7ed957; on-primary-container #1d5d00; primary-fixed #9cf973; primary-fixed-dim #81dc5a; on-primary-fixed #062100; on-primary-fixed-variant #195200; secondary #7a5900; on-secondary #fff; secondary-container #ffc644; on-secondary-container #715300; secondary-fixed #ffdea1; secondary-fixed-dim #f6be3b; on-secondary-fixed #261900; on-secondary-fixed-variant #5c4300; tertiary #3b6849; on-tertiary #fff; tertiary-container #9fcfa9; on-tertiary-container #2d593c; tertiary-fixed #bdeec7; tertiary-fixed-dim #a2d2ac; on-tertiary-fixed #00210e; on-tertiary-fixed-variant #234f33; background #f9f9f9; on-background #1a1c1c; surface #f9f9f9; on-surface #1a1c1c; surface-variant #e2e2e2; on-surface-variant #404a3a; surface-dim #dadada; surface-bright #f9f9f9; surface-tint #246d00; surface-container-lowest #fff, -low #f3f3f4, (base) #eeeeee, -high #e8e8e8, -highest #e2e2e2; outline #707a68; outline-variant #bfcab5; inverse-surface #2f3131; inverse-on-surface #f0f1f1; inverse-primary #81dc5a; error #ba1a1a; on-error #fff; error-container #ffdad6; on-error-container #93000a.

### Fonts
headline and display = Montserrat; body = Fredoka (300-700); label = Handlee. Icons: Material Symbols Outlined.

### Radii
DEFAULT 0.25rem; lg 0.5rem; xl 0.75rem; full 9999px. Spacing and fontSize are not extended. Shadows are inline arbitrary values, e.g. sidebar `0 1px 16px rgba(15,30,20,0.06)`, active nav `0 2px 8px rgba(36,109,0,0.12)`.

### Mapping to repo tokens (tailwind.config.ts, `colors.pz`)
The repo already carries every Stitch color above verbatim under `pz-` with the same name (config comment: "bg-primary-container -> bg-pz-primary-container"). Exact matches: all primary*, secondary*, tertiary*, on-*, surface* (incl. surface-container-*), outline, outline-variant, inverse-*, surface-tint. Renamed to avoid shadcn clashes:
- Stitch `background` -> `pz-academy-background` (#f9f9f9)
- Stitch `error` -> `pz-academy-error` (#ba1a1a)
- `on-error`, `error-container`, `on-error-container`, `on-background` keep their names under `pz-`.
Bare `bg-primary`/`bg-secondary`/`bg-background` in a port would hit the shadcn HSL tokens (primary = deep green hsl(150 47% 20%)), so always use the `pz-` prefix.

Fonts: repo aliases `font-headline`, `font-display` (Montserrat), `font-body` (Fredoka), `font-label` (Handlee) match Stitch class names 1:1. globals.css body default is `font-poppins`, so ported pages need explicit `font-body`.

Radii: repo overrides `xl` to 16px (Stitch xl = 12px) and `lg` = var(--radius) = 0.75rem (Stitch lg = 0.5rem), so `rounded-lg`/`rounded-xl` render LARGER than the design. Use arbitrary values (`rounded-[0.5rem]`, `rounded-[0.75rem]`) where fidelity matters. DEFAULT 0.25rem and `full` match.

### Stitch hex values with NO pz-* match
- #006B5F: appears only inside the logo image alt-text prompt (not applied as a style); ignore.
- WhatsApp preview colours in step 2 desktop (both variants): #075E54 (header), #DCF8C6 (outgoing bubble), #EFEAE2 (chat background), #34B7F1 (read ticks), #EA4335. Third-party brand colours; keep as local constants in the preview component.
- Off-brand teal set in outreach-sales-desk-desktop only (listed above).
- Shadows are arbitrary values; repo `shadow-card` (rgba(25,75,50,.10)) is close but not equal.
