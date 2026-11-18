# Cohorts: guided page for non-technical staff, and the load error

Date: 2026-11-18. Branch: cohorts-guided (from main 17c585fd). Approved by the owner 2026-11-18 ("start on Cohorts now", after the Contacts and Audiences designs).

## Intent and why
A cohort is one imported sheet tab. The Cohorts page is a dense table with six columns, row-by-row download links and a delete word. The owner wants it as simple and guided as Contacts and Audiences. The page also logs React errors #425 and #422 on load.

## Root cause of the load error (found by reading the code)
`CohortsPanel` and `CohortDetailClient` are client components that print dates with `formatDate()`, which uses the machine's own timezone. The server (UTC) and the browser (Pakistan, UTC+5) print a different day for a cohort created between 19:00 and 23:59 UTC. React sees different text on the server and in the browser: error #425, then falls back to full client rendering: error #422. The pinned helper `formatDatePkt` already exists in `src/lib/format.ts`. Fix: use `formatDatePkt` in both components. Not confirmed in a live browser (no runtime logs available); the test pins the behaviour, and the owner confirms the console is clean after the change.

## Goals
- Same three plain steps as Contacts: 1 Find a cohort, 2 Pick cohorts, 3 What do you want to do.
- Phone: each cohort is a card. PC: a roomy list (tick, Cohort with sheet and tab, Course, People with "of N imported", Imported date, row actions).
- Row actions in one calm menu per cohort: Download for Meta, Download plain version, Delete. "Open" is a clear link.
- "What do you want to do?" area: with nothing ticked "Tick cohorts to download them"; with picks "N cohorts selected" and the people total, primary "Download for Meta", secondary "Download plain version (keep private)", the existing upload note and the 20-at-a-time limit. Phone: sticky bottom bar; PC (xl): sticky side card at top-20.
- Course not set shows "Course not set" in calm text (was "untagged").
- Fix the date error (above).

## Non-goals
- No change to what downloads contain, the export route, the delete route or its warning text (purchases lose the cohort tag; contacts stay), the 20-cohort limit logic, the tab strip (Cohorts, Import a sheet, Merge review), the Cohort detail page layout (only its date call changes), or any data. No migration. No new route.
- The people total for selected cohorts is a plain sum of the cohort counts: the same person in two cohorts counts twice in that number. The file itself is not changed. The area labels it "up to N people" for this reason. (Call.)

## Anti-goals
- Do not lose any existing action: open detail, download Meta, download plain, delete with its confirm, search, the Audiences link.
- Do not copy invented Stitch content.

## Constraints
- Stitch: project 13117286791417011091, "Cohorts - Sales Hub (Desktop 1440px)" and "(Mobile 390px)" (sent 2026-11-18; may appear late).
- Colours: backgrounds and borders pz-solid-*/landing-* or the pz-primary / pz-surface-container-* family; pz-deep, pz-mid, pz-danger text only.
- Calm words, no exclamation marks. Menus: Escape closes, focus returns to the opener. 44px tap targets on phone.
- Write files in UTF-8 only; keep CRLF; strict UTF-8 scan before commit. No eslint-disable for @typescript-eslint. Never regenerate database.types.ts.
- Delete still asks first with the same dialog (useConfirm).

## Approaches
1. Rebuild CohortsPanel in the Contacts style (list component + actions component), reusing the same menu pattern. Chosen: consistent, tested pattern already reviewed.
2. Only restyle the table. Rejected: not guided.
3. New page. Rejected: loses wiring.

## Decisions (calls marked)
- Build a small standalone per-row menu in this branch (same keys and behaviour as the Contacts More menu: Escape, arrows, Home, End, outside click, focus return, in flow so it is never clipped). This branch starts from main, which does not have the Contacts files, so nothing is shared and the two branches can merge in any order. (Call.)
- Two-column from xl, bottom bar below xl, as in Contacts. (Call, same ruling.)
- Page size: all cohorts at once (there are few; no paging). (Call.)

## Left to the builder
Component split, exact copy within the calm-words rule, test layout, loading and error states.
