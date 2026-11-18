# Audiences: guided three-step page with preview before download

Date: 2026-11-18. Branch: audiences-guided. Approved by the owner 2026-11-18 ("ok improve, if anything, in the UI Stitch generated").

## Intent and why
The owner finds the Audiences page complicated. Staff are non-technical. They need a guided page that shows what they are about to download before they download it.

## Goals
- One step at a time: 1 Who, 2 Check, 3 Download, with Back and Next, and a progress strip.
- A plain sentence always says what is chosen, with the people count.
- Step 2 shows a preview: first 10 people, email partly hidden, plus who cannot go to Meta and why.
- Step 3 shows exactly what the file holds before download: file name, number of people, columns, who is left out. Then the two download buttons.
- Phone (390px) and PC (1440px) both work.

## Non-goals
- No change to the filter rules, counts, saved audiences, Bring in, or the file contents.
- No change to the Contacts or Cohorts pages (separate projects).
- No new migration.

## Anti-goals
- Never show a full email or phone on screen. The preview is masked; only the downloaded file holds full values.
- Do not copy made-up content from the Stitch mock: names like "Dr. Clara Vance", "HIPAA & SECP Audited", "3,482 verified learners", "Stripe", "Lookalike tips", the made-up sidebar. The real app shell stays.

## Constraints
- Stitch is the design source of truth: project 13117286791417011091, screens "Audiences - Sales Hub (Desktop 1440px)" and "(Mobile 390px)". Stitch drew step 1 only. Steps 2 and 3 are designed here from its pattern (cards, green primary button, plain sentence card). This is a call, shown to the owner for a look.
- Colours: backgrounds and borders use pz-solid-* or landing-* tokens; pz-deep, pz-mid, pz-danger are text only.
- Preview endpoint is read-only, admin only (same guard as count and export), same filter parsing as count.
- Calm wording, no exclamation marks, no jargon.
- Dialogs and menus: Escape closes, focus returns.
- Keep CRLF line endings. Never regenerate database.types.ts.

## Approaches
1. Rebuild the page as a step wizard inside AudiencesPanel, reusing the existing count, filters, saved and export code; add one preview route. Chosen: smallest change, keeps tested logic.
2. New wizard page beside the old one, switch later. Rejected: two pages to keep in step.
3. Keep one page and only add a preview card. Rejected: does not make the page guided.

## Decisions
- Preview route: `GET/POST /api/admin/crm/audiences/preview` returns up to 10 people from the same people list the file uses: first name, masked email (first letter + `***` + domain), country, status label. Also returns the file facts: columns (email, phone, fn, ln, country), `inFile`, `leftOut`. File name comes from the existing name helper.
- Wizard state is local (step number); Next on step 1 is allowed once a count is done. Changing a choice on step 2 or 3 is done by Back.
- Saved audiences link stays top right; loading one jumps to step 2.
- The mobile result card keeps a sticky number bar.

## Left to the builder
Component split, exact copy within the calm-words rule, test layout, and loading and error states.
