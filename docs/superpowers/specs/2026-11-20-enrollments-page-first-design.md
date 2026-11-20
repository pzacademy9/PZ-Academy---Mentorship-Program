# Enrollments: Page registrations first (short design)

Date: 2026-11-20. Size: small change. Owner chose approach A.

## Intent
The owner works mostly in Page registrations. The tab strip shows it second, and the
Enrollments menu item opens App sign-ups. Make Page registrations the first tab and the
page that opens first.

## Goals
- Tab order: "Page registrations", then "App sign-ups".
- Clicking Enrollments in the menu opens Page registrations.
- Nothing that links to App sign-ups today breaks.

## Non-goals
- No new look, no new Stitch screen, no database change.
- No change to what either page shows.

## Approaches
- **A (chosen):** App sign-ups moves to `/dashboard/admin/enrollments/app`. The main address
  `/dashboard/admin/enrollments` redirects to Page registrations
  (`/dashboard/admin/enrollments/registrations`). Menu, area map and admin home cards keep
  their address. Trade-off: about six links change address.
- B (not chosen): swap tabs and point the menu straight at Page registrations. Fewer edits,
  but the sidebar stops highlighting Enrollments on student detail pages.

## Design
1. `EnrollmentSourceTabs`: reorder the array (page first); "app" tab href becomes `/enrollments/app`.
2. Move the current App sign-ups page from `enrollments/page.tsx` to `enrollments/app/page.tsx`
   (same content, same `requireAdminPage("enrollments")` guard).
3. New `enrollments/page.tsx`: server redirect. If the address has any query
   (`status`, `courseId`, `courseTitle`), forward the whole query to `/enrollments/app`
   so old saved links still land on App sign-ups with their filter. Otherwise redirect to
   `/enrollments/registrations`.
4. Update links that mean App sign-ups to `/enrollments/app`:
   `EnrollmentFilterTabs.tsx`, `ProgramRosterPanel.tsx` (2 links), `enrollments/[id]/page.tsx`
   (back link), and the two cards in `dashboard/admin/page.tsx` (check each: if a card is
   about page registrations leave it).
5. Leave `nav.ts` and `areas.ts` unchanged: their address now redirects to Page registrations.
   The sidebar highlight must still work on `/enrollments/app` and `/enrollments/[id]`
   (prefix of `/dashboard/admin/enrollments`); verify.
6. Tests: update `landing-registrations-list-ui.test.tsx` (App sign-ups href); add a test for
   tab order and for the redirect rule (no query goes to registrations, query goes to app with query kept).

## Left to the builder
Exact redirect helper shape; whether the admin home cards mean App sign-ups.
