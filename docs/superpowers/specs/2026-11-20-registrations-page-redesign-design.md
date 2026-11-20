# Batch registrations page redesign (design)

Date: 2026-11-20. Page: `/dashboard/admin/enrollments/registrations/campaign/<pageId>`.
Status: owner picked approach A in conversation; this doc awaits approval.

## Intent and why
The owner opens a batch mostly to (1) change a person's payment status and (2) find people.
Today the phone view stacks four rows of buttons, six status pills, a search box and three
dropdowns before the first person, and the PC view has the same pile. It looks scattered and
unprofessional. Goal: the first screen shows search, status and people, nothing else.

## Goals
- Phone (390px) and PC (1440px) both: title and count, search box, one "Filters" button,
  one row of status tabs, a "Batch tools" menu, then the list.
- Status tabs keep their counts (All, Pending, Reserved, Underpaid, Paid, Free). On phone the
  row slides sideways.
- "Filters" opens a panel holding: Country, What they bought, Live or recorded, and the quick
  buttons (Live full course, Live + Module 1, All live and the module-number box). A small badge
  on the button shows how many filters are on. "Reset" lives in the panel.
- "Batch tools" is one menu with: Sheet sync, Classes, Student IDs, Progress reports, Portal access.
- Download IDs (PDF) and Copy public ID page link leave this page and move to the Student IDs page
  of the same batch (that page today has per-row Copy and Copy all only).
- Changing status keeps working exactly as now (tap the status on a row, pop-up). Selecting people
  and the message bar keep working.
- Filters stay in the web address, so the Back button fix (returns to the same filtered list) keeps working.

## Non-goals
- No change to the All registrations page, the person page, or the sales agent pages.
- No new bulk "change status for many" action (not asked; can be a later job).
- No change to the database or to what the filters mean.

## Anti-goals
- Do not hide the status tabs or the search behind anything.
- Do not lose any current feature: every filter, button and link stays reachable.

## Constraints
- Project rule: no Stitch screen exists for this page, so the owner runs two Stitch prompts
  (phone 390px, PC 1440px) and we build from the result. Nothing is built before that.
- Port the screen's layout and copy exactly once it exists. Admin pages are light/dark themed with the
  existing `pz-*` tokens; phone targets are at least 44px tall.
- Plain words in the UI. No exclamation marks.

## Approaches considered
- A (chosen): search and status first, everything else behind "Filters" and "Batch tools".
- B: same, but the quick buttons stay visible as chips. Faster to reach, busier on phone. Not chosen.

## Left to the builder
- Exact panel type (bottom sheet on phone, dropdown panel on PC), taken from the Stitch screen.
- Whether the shared `RegistrationFilters` component is reused or a campaign-only one is added
  (the All registrations page still uses the old one).
- Tests: filter-count badge, tools menu links, moved IDs buttons on the Student IDs page.
