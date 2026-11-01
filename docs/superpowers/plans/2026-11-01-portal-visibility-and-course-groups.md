# Portal visibility switch + group by course

> **For agentic workers:** use superpowers:subagent-driven-development. Follows `2026-11-01-public-progress-portal.md` (same branch `public-portal`).

**Goal:** (a) Draft batches that already have students (PPC Batch 3) show on the public portal; (b) an admin switch "Show on public portal" per batch hides it; (c) the portal home groups batches under their course.

**Why now:** the live `/progress` showed only "Diabetes Management & Pharmacotherapy - Batch 1": the portal only listed `published`/`closed` batches, and PPC Batch 3 is still `draft`.

## Rules (all places must use the SAME rule)

A batch is visible on the portal when: `landing_pages.show_in_portal = true` AND `kind in (course, workshop, webinar)` AND (`status in ('published','closed')` OR it has at least one paid/free non-test registration). Empty drafts (Test, Test2) stay hidden. Places: `src/lib/data/portal.ts` (list + one batch, so a hidden slug 404s), `src/lib/data/progress.ts` (student's own progress), SQL `find_enrolled_ids_by_name`.

## Global constraints

Same as the portal plan: first name + PZ ID only; no student data in tests ("Sample"/"Name-0000"); direct commands (`node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/vitest/vitest.mjs run <files>`, `node node_modules/eslint/bin/eslint.js <paths>`); never regenerate `database.types.ts` (hand-add the column to the landing_pages Row/Insert/Update); no `eslint-disable` for `@typescript-eslint`; Edit tool on CRLF files; stage by path only; trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. The owner pastes all SQL by hand: it must be safe to run twice, with a check query.

## Task A: migration + visibility rule

- Create `supabase/migrations/0095_portal_visibility.sql`: `alter table public.landing_pages add column if not exists show_in_portal boolean not null default true;` and `create or replace function public.find_enrolled_ids_by_name(p_query text)` identical to 0094's but with the new visibility rule in its WHERE (join `lp.show_in_portal`; allow `lp.status in ('published','closed') or` the registration being enrolled, which it already is, so effectively: drop the status filter and add `lp.show_in_portal`; keep the kind filter), same grants/revokes. Header comment says it needs 0094 live first. End with a check query.
- Implement one shared helper (pure, tested) `isPortalVisible({ status, showInPortal, kind, enrolled }): boolean` in `src/lib/progress/visibility.ts`; use it in `portal.ts` (read `show_in_portal`, and enrolled count from the registrations it already reads) and `progress.ts`.
- Tests: helper truth table; `portal-data` (hidden by switch, draft with students shown, empty draft hidden, hidden slug -> null from `getPortalBatch`); `progress-data` (draft batch with the student now appears; switched-off batch does not).

## Task B: admin switch

- Add `setPortalVisibility(pageId: string, show: boolean): Promise<SimpleResult>` next to `setPageCourse` in `src/lib/data/landing-pages.ts` plus its server action, following how `setPageCourse` / `CourseMainPicker` are wired (find the action and the admin page that renders it). Add a labelled switch/checkbox "Show on public progress portal" with helper text "Students and visitors can see this batch's attendance and results at /progress. Turn off to hide it." near the course picker in the batch settings UI, 44px tap target, saves immediately with a success/failure message, admin/super_admin only (reuse the same permission check as the neighbours).
- Tests: data function, action rejects non-admin, UI toggles and shows result.

## Task C: group by course on the home

- `PortalBatchCard` gains `courseId: string | null` and `courseTitle: string | null` (from `landing_pages.course_id` -> the courses table title; read the titles in one query). Home (`PortalHome.tsx`): inside each kind tab, group cards under a course heading (course title; a batch with no course forms its own group headed by the batch title); groups ordered by most recent class, batches inside a group live first, then completed, newest last-class first. The batch search keeps filtering across groups and hides empty groups. Keep the approved card design; only add the heading. A group with one batch still shows its heading.
- Tests: grouping, no-course fallback, ordering, search hides empty groups, counts on the kind tabs still count batches.

## Review focus

A switched-off batch must 404 on `/progress/<slug>` (not just vanish from the list); a hidden batch must also vanish from Find my ID and My Progress; the new SQL must not widen what Find my ID returns beyond first name + ID + batch title; deploy order: 0095 must be pasted BEFORE this code runs (the code reads the new column), so say so in the owner steps doc.
