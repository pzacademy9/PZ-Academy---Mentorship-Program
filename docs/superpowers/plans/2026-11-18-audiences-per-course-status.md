# Audiences: judge Reserved / Pending per course (design + plan)

Date: 2026-11-18. Builds on `2026-11-18-audiences-simple-status.md` (merged, 0117 live).

## Why
Owner: a person who bought course A but only reserved or registered for course B must show as Reserved or Pending for B (and as Paid for A). Today any purchase anywhere hides all their unpaid registrations. Live check: 19 of 24 unpaid landing registrations (17 Pending and 1 Part-paid on PPC Batch 3, 1 Pending on another page) are people who bought something else, so they are invisible.

## Calls (owner can change)
1. Rule becomes per page / per course: an unpaid registration is hidden only when the same person has a purchase for that same landing page (SQL) / the same course (Audiences page).
2. Cohorts "Interested, not paid" for a landing page follows the same per-page rule (list, count and Meta download agree), so people who bought another course can appear in page B's interested cohort. Imported-sheet cohorts keep today's rule.
3. Stored rows only change when a page is closed again: after pasting 0118 the owner presses Bring in with every page ticked.
4. Audiences page: skip an interested row only if that contact has a purchase with the same course key (name key as today). SQL stays the looser filter, the page is the precise one.

## Tasks
### Task 1: migration 0118 + owner steps
Files: `supabase/migrations/0118_interested_per_page.sql`, `docs/superpowers/plans/2026-11-18-audiences-per-course-status-owner-steps.md`, tests (guard like `tests/audience-status-0117-migration.test.ts`; the older guards that match the `not exists (select 1 from public.contact_purchases` text must still pass).
- Re-create `landing_close_batch` from the 0117 body changing ONLY the interested-rebuild exclusion (0117 lines ~299-301) to `cp.contact_id = c.contact_id and cp.import_batch_id = v_paid_batch_id`, and the comment at ~272. Nothing else changes.
### Task 2: audience query per-course rule
Files: `src/lib/data/audience-query.ts`, `tests/audience-query.test.ts` (rewrite the "(b) unpaid excludes anyone with any purchase" test at ~293-306).
- Replace `buyers: Set<contactId>` by a Set of `contactId|courseKey`; skip an interested row only if its own key is in it. Call `named()` before the skip so facets stay consistent. A contact with a purchase in A and an interested row in B counts Paid for A and Pending/Reserved for B; statusCounts are still distinct people per status.
### Task 3: Cohorts download and counts follow the same rule
Files: `src/lib/data/cohort-export.ts` (~126-154), `src/lib/data/admin-crm-import.ts` (comment ~154), tests `tests/cohort-export.test.ts` (~56-69).
- In `loadCohortAudience` for a landing page's interested cohort, drop only people who bought in that same page's paid batch (batches share `source_page_id`; paid batch is `closed_paid`); keep the "also in a selected purchase cohort" rule and keep the any-purchase rule for non-landing (imported sheet) interested cohorts.

## Review focus
- A person with a purchase in the same course never shows as Reserved/Pending for it.
- A person with a purchase in another course does show as Reserved/Pending for this one.
- Cohort download, Cohorts count and Audiences agree.
- Old pages not yet re-closed keep working (rows unchanged until Bring in).
- Do-not-contact, consent and the 50,000 cap are untouched.

## Owner steps after merge
Paste 0118 (whole file, one go), open Audiences, tick every page, press Bring in.
