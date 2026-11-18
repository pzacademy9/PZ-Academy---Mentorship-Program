# Meta Audiences: filters, saved audiences, bring-in from landing pages (design)

Date: 2026-11-17. Status: written for owner approval. Builds on `2026-10-24-meta-audiences-design.md`.

## Intent and why
The owner runs Meta ads and today can only download whole cohorts (one imported sheet, or one saved landing batch) as a hashed or plain CSV. They need audiences made by a question, for example: "people who registered for recorded courses", "people from UAE or Saudi Arabia who registered for any or some courses", "buyers of one course". Data from landing pages (Pharmacovigilance, OPD and others) lives on the Registrations screen and reaches the CRM only through "Save batch to CRM" on a finished batch, so it cannot be used as an audience when the owner wants it.

## Goals
- A new **Audiences** page in Sales Hub (Audience group). Pick filters, see how many people match, download the hashed or plain Meta file. Save an audience under a name and reuse it.
- Filters: **Course** (one or several), **Recorded / Live / Either**, **Country** (one or several), **Who**: paid only / registered but not paid / both, **Registered between** two dates.
- A **Bring in from landing pages** button on the Audiences page: pick one or several landing pages, copy in the people (same rules as today's Save batch to CRM), at any time, safe to press again. It must also carry **recorded/live, the chosen course options and the price region** with each person so the filters work, and re-running on an already brought-in page fills these in for people copied earlier.
- **Import** and **Merge review** move into the Cohorts section: a tab strip (Cohorts | Import a sheet | Merge review) on those three pages; the two sidebar entries are removed; Import/Merge keep their current addresses so nothing breaks; the sidebar highlights Cohorts on them.
- Phone-first: every new screen is usable at 390px and at 1440px.

## Non-goals
- Automatic daily upload of audiences to Meta (Marketing API). Separate later project; it will reuse the saved audiences from this one.
- Any change to the Purchase-on-Paid Conversions API (already live), the `value` column, lookalike setup, or copying every new registration into the CRM automatically.
- Course tagging of old imported sheets beyond what the existing derived course name gives.

## Anti-goals (a failure even if it works)
- Never include a person who is marked do-not-contact, and keep every existing rule: unsubscribed or suppressed emails are blanked, unsubscribed WhatsApp numbers are blanked, rows with neither email nor phone are dropped and counted, plain file is private.
- Never include someone who is neither a buyer nor consented to be contacted (same rule as Save batch to CRM; test rows never copied).
- Never show or log a person's email or phone in the page counts, errors or URLs. The count preview shows numbers only.
- No hidden email-only restriction: the Audience guard must NOT use the email-sendable guard, because Meta also takes phone-only and consented-not-paid people (existing export already does).

## Constraints
- Meta count must tell the owner honestly: total matching, how many will actually go in the file, how many are left out and why (no email or phone, do-not-contact).
- Country in the CRM comes from the phone number and is only PK, AE or SA today; others are empty. The Country filter must show the real coverage ("Not known: N") rather than hide it.
- The old imported sheets carry only a registration text (`product_label`); they have no live/recorded value. Filtering by Recorded or Live applies only to people who came through landing pages; when the owner picks Recorded or Live, imported-sheet people are not included, and the page says so in one plain line.
- New database change needed (next free migration is 0116): store recorded/live, option keys and region on what the CRM keeps per purchase and per interested person, extend the `landing_close_batch` function to write them (keeping its current behaviour), and add a table for saved audiences (name, filter definition, created by, times). The owner pastes SQL by hand; the app must degrade clearly (not crash) if the migration is not applied yet.
- Vercel free plan: no new cron, no heavy per-page work; counts and downloads run on request only.
- Admin access: same as the Cohorts Meta download (`sales_hub` or `crm`).
- Stitch is the design source of truth. No Audiences screen exists; see "Open decision".

## Approaches (the owner chose 1)
1. **New Audiences page beside Cohorts (chosen).** Filters, count, saved audiences, plus Bring-in. Cohorts stay the plain source lists.
2. Filters inside the Cohorts page. Rejected: mixes a fixed list with a question; breaks down with several courses.
3. Audiences page plus auto-copy of every registration to the CRM. Rejected for now: bigger, touches consent rules.

## Decisions made with the owner
- New section, not the Cohorts page (chosen 2026-11-17).
- Import and Merge review move under Cohorts (owner request).
- Auto-upload to Meta is a separate project (owner, 2026-11-17).
- Purchase-on-Paid Conversions API already exists and is out of scope.

## Left to the builder
- Exact storage of recorded/live, option keys and region (columns on purchases and on interested-person rows are expected), and the course name shown in the Course filter: for landing people use the page's course or title; for imported sheets use the existing derived course name. Verify what product label `landing_close_batch` writes today (unconfirmed) and keep one consistent course name for both sources.
- How Audience filters are run (a new function beside the segment machinery that returns contact ids and a count without the email-sendable guard, paging at 1000 and a safe upper limit with a clear message above it), and reusing `buildMetaRows` / `buildPlainRows` / `toMetaCsv` / `toPlainCsv`; extract the suppression read out of `loadCohortAudience` into a shared helper.
- Whether a download link carries the saved audience id or the filters.
- Test plan; owner steps file for pasting 0116.

## Decision on design source (owner, 2026-11-17)
Stitch produced no Audiences screen after two sends and 30+ minutes. The owner agreed to build from existing parts (Cohorts panel, chips and segmented controls from the Contacts/Segment builder, as done for the promo page). The Stitch prompts are kept in `2026-11-17-meta-audiences-stitch-prompts.md` as the copy and layout guide.

## Calls made after the builder check (the owner can change any of these)
1. Recorded/Live, course options and region belong to each registration, so they are stored per purchase and per interested-person row. One person can match through different registrations (live course A, recorded course B).
2. Inside one filter, several choices mean ANY of them (UAE or Saudi; course A or course B). Between filters it means ALL (recorded AND UAE).
3. A person is included when one single registration of theirs satisfies every filter together (course, recorded/live, who, dates). "Registered but not paid" means the person has no paid registration at all, the same rule the existing interested cohort uses.
4. "Registered between" uses the registration time (purchase date for paid people, the registration's created time for interested people). People with no date are left out only when a date filter is used.
5. A person appears once, even if they are in several cohorts (contacts are unique by email and phone). The Course filter lists one name per course; landing-page and imported-sheet names are made to match as far as the existing derived name allows. Anything left over is shown as separate entries, not hidden.
6. Saved audiences are shared by every admin with Sales Hub or CRM access and store the filters, not a frozen list: the people are worked out again at download time. If a course or page in a saved audience no longer exists, the page shows a warning and ignores that choice.
7. The plain file has the same access rule as the Cohorts download.
8. Upper limit 50,000 people per audience, with a plain message above it.
