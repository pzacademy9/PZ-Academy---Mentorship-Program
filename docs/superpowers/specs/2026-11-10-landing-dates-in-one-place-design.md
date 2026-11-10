# Landing pages: dates in one place (design)

Date: 2026-11-10. Owner: PZ Academy owner (non-technical). Status: approved by the owner 2026-11-10 (including goal 8, the Countdown switch).

## Why

Today the dates on a landing page are typed text in many places: the hero date line, each Schedule row, and sometimes the curriculum. When a course or module is postponed, the owner edits each place on the main page, then edits the hero again on every country link and module link. A date typed on a link never updates again, so links go stale. The AI import file never asked for module dates, so a 3-day module link showed the full course dates (27 Nov to 27 Dec) and the curriculum showed "Day 7, 8, 9".

Goal: the owner types each module's dates once, in Page settings. Every place that shows a date follows. The AI-made import file already carries those dates, so nothing is typed by hand on a new page.

## Goals

1. A **Dates** box in Page settings (step 5, next to Countdown and Batch starts). One row per module: a start date and an end date, picked from a calendar. Pages with no modules (workshop, webinar) get one row for the event.
2. Hero date line, Schedule "When" column and any date in the curriculum or other text follow those rows.
3. Module links show only that module's dates. Main page and country links show the whole range.
4. Weekdays ("Fri, Sat & Sun") are worked out from the dates, never typed.
5. Modules of any length work (more than 4 days), up to the existing 60-day limit.
6. The AI import file carries the dates (and numbers each module's days from Day 1), so a new page needs no manual dates.
7. Changing a date means changing one row. Preview and published pages follow after Publish, as today.
8. **One Early Bird date.** Today there are two unlinked dates: "Early Bird ends" (Registration setup, controls prices) and "Countdown ends" (Page settings step 5, controls only the strip at the top). Add a switch under Countdown: "Count down to the Early Bird end". New pages: ON. While ON, the Countdown ends box is replaced by a line "Follows the Early Bird end: <date>", so the strip and the prices always use the same moment. Turn it OFF to type a separate countdown date (for example to count down to the class start).

## Non-goals (not now)

- Class days with gaps inside a module (for example Fri, Sat, Sun, then next Fri, Sat, Sun). The owner said "maybe later". A module is one start date to one end date, all days in between count.
- The Classes (sessions) page, reminder emails and attendance. They keep their own dates.
- Batch starts and the Early Bird end itself. They stay their own fields, not derived from the Dates box. (My call: to limit scope.) The Countdown now follows Early Bird by switch (goal 8).
- Rewriting dates already typed on existing pages. Typed text keeps working exactly as it does now.

## Anti-goals (would make this a failure)

- Any existing published page changing its text without the owner touching it.
- A date shifting by a day because of time zones. Dates are plain calendar dates, no clock time.
- A page publishing with an unfilled date marker visible to students.

## How it works

### Where dates are stored

- Each module gets two new optional fields, start date and end date (YYYY-MM-DD, empty = not set), beside the existing module key, title, format and days.
- Pages with no modules get two matching optional fields in page settings: event start date and event end date.
- Content is stored as JSON, so no database change is expected. The builder confirms this.

### How text follows the dates

Text boxes may contain markers that are replaced with the dates when the page is shown. The replacement happens in the pure step that already builds each link's content (resolve-variant), so the editor preview, the live page and every country or module link all use one path.

| Marker | Becomes (example) |
|---|---|
| `{dates}` | The dates of this page or link: whole range on the main page and country links, that module's range on a module link. "27 Nov – 27 Dec 2026" |
| `{dates:module-2}` | The dates of one named module. "4 – 6 Dec 2026" |
| `{weekdays}` | The class weekdays. "Fri, Sat & Sun" |

- Formats: same month "27 – 29 Nov 2026"; across months "30 Nov – 2 Dec 2026"; across years "30 Dec 2026 – 2 Jan 2027"; one day "27 Nov 2026".
- Weekdays for the whole course are the union of the weekdays inside each module's range. If every weekday appears, the weekday text is left out. (My call.)
- Markers work in any section text box, so curriculum, FAQ and custom hero text can use them too.
- If a marker has no dates behind it, the page check (Check this page) shows a clear message naming the box, and publishing is blocked. Students never see a raw marker. (My call: block, like other required fixes.)

### Hero, Schedule, curriculum

- **Hero date line:** new pages get `{dates} ({weekdays})` automatically. Existing pages keep their typed text. A small "Use automatic dates" button on the hero date box switches an old page over (it writes the marker text). On a link that has its own typed hero date, show the same button.
- **Schedule:** a row linked to a module whose "When" is empty shows that module's dates. "When" stops being required for rows that have a module. Rows the owner types by hand stay as typed. (My call.)
- **Curriculum:** the import writes day titles as "Day 1, Day 2, Day 3" inside each module (not the course-wide day number). It writes no typed dates in the outline; it uses markers when a date is wanted.

### Page settings Dates box

- Rows show module title, start date, end date, and the day count worked out (for example "3 days"). If it disagrees with the module's days number, Check this page shows a warning, not a block. (My call.)
- Dates are chosen with a calendar (as on phone: the native date picker). End date cannot be before start.
- A short line says "Hero, Schedule and links follow these dates."
- Phone-friendly: tap targets and layout as the rest of Page settings.

### Import file (AI-made landing file)

- The module lines in the file's front matter get `starts` and `ends` (for example `starts: 2026-11-27`, `ends: 2026-11-29`). A no-module page gets `event_starts` and `event_ends`.
- The AI prompt now asks for each module's real dates (the prompt already lists "event dates for every module"; it did not carry them into fields). It must write the hero date line as `{dates} ({weekdays})` and leave the schedule "When" empty for module rows, so the dates come from the fields.
- If a date is missing in the source document, the import lists it under "Please check" and leaves the field empty.
- Existing import files without these fields still import as today.

## Constraints

- Windows/CRLF repo, tests with vitest run directly (npm run is broken in this path), tsc must stay at 0 errors, no eslint-disable for @typescript-eslint.
- Do not regenerate database.types.ts.
- Colours: backgrounds and borders use pz-solid-* or landing-* tokens.
- The Page settings screen already exists, so no new design is needed. If the Dates box needs a new look beyond a copy of the existing step cards, ask the owner for both a phone (390px) and a PC (1440px) Stitch prompt.

## What is left to the builder

- Exact names of the new fields.
- Where the marker replacement is called so it covers the preview, the live page and the registration page text.
- The weekday and range formatting helper and its tests (month and year boundaries, a single day, a 10-day module, a module crossing a year).
- Whether registration-page text also uses the markers.
- Test plan: unit tests for formatting and replacement, an import test with and without the new fields, a check-page test for an unfilled marker, a browser check on PC and phone.

### Countdown switch details

- New setting "countdown follows Early Bird", default ON for new pages and new imports. The import file does not need a countdown date.
- While ON the strip counts to the page's Early Bird end. No Early Bird date means no strip, and Check this page says so. After the moment passes the strip hides, as the countdown does today.
- Existing pages: nothing changes by itself. Every existing page keeps the switch OFF until the owner turns it ON, so no live page grows a new strip on its own. (My call, because of the anti-goal about existing pages. Updated from an earlier draft that set ON for pages with no countdown.)
- Country and module links follow the main page's setting.

## Calls I made (owner can overrule)

0. Every existing page keeps the countdown switch OFF until the owner turns it ON.
1. Batch starts and the Early Bird end are not derived from the Dates box.
2. Markers are the mechanism, so one idea covers hero, schedule, curriculum and any text.
3. Weekday text is left out when all 7 weekdays appear.
4. An unfilled marker blocks publishing.
5. Existing typed text is never changed automatically; an opt-in button switches a box over.
6. Day count disagreement is a warning, not a block.
7. No-module pages use one event date row in page settings.
8. Each module's days are numbered from Day 1 by the import.
