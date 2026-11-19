# Portal access — design (2026-11-19)

## Intent and why
Courses that run in several batches (example: PPC, Batch 1, 2, 3) need a portal per batch. Each batch has mostly the same lectures, with small changes: YouTube links, MCQs, PDF links. Today every PPC batch points at ONE course, so all batches see the same lectures and nobody can change Batch 3 without changing Batch 1.

The owner wants:
1. The "Batch access" button moved inside each registration (campaign) and renamed "Portal access".
2. Portals grouped under a course name (PPC holds Batch 1, 2, 3).
3. A way to copy an older portal and rename it (for example "PPC batch 3 portal").
4. Each portal given ONLY to its own batch's students.

## How it works today (found in the code)
- A portal is a `courses` row with `modules`, `lessons` (video_url, pdf_url, resource_urls, text), and `quiz_questions` (MCQs).
- A registration page (`landing_pages.course_id`) points to one course. Paid students get an `enrollments` row for that course, plus `enrollment_open_modules` (Live students) and optional `enrollment_modules`.
- The "Batch access" page (`/dashboard/admin/enrollments/registrations/access`, `BatchAccessPanel`) is one global page with a registration picker: open modules, email the portal link, save batch to CRM. Buttons live in `CampaignList.tsx` and `registrations/all/page.tsx`.
- Landing pages can be duplicated. Courses cannot.

## Goals
- Duplicate a portal (course) as a new course, then edit only what differs, using the existing Course Builder.
- Group portals under a course name.
- Point each registration page at its own portal. Move that batch's existing students into it with one explicit button.
- Portal access lives inside each campaign. No separate global page.

## Non-goals
- No shared lectures between portals, no per-batch overrides (the owner chose copy-as-new-course).
- No automatic sync of later fixes between copies.
- No carrying of lecture progress or quiz attempts into the new portal (owner ruling).
- No change to how modules open or how emails are sent.

## Anti-goals (a failure even if it "works")
- Editing or copying a portal must never change what an existing batch's students see.
- Students must never be moved without the admin pressing the button and seeing a count first.
- No email may go out as a side effect of copying or moving.

## Constraints
- The owner pastes all write SQL by hand (migration 0119). Never regenerate `database.types.ts`; hand-add the new entries.
- Phone-first (390px) and PC (1440px). Stitch screens come first.
- Owner is non-technical: short plain words, calm wording.

## Approaches considered
- **A. Copy as new course (chosen).** Full copy of modules, lectures and MCQs into a new course. Safe for old batches. Cost: later fixes are made by hand in each copy.
- B. One shared portal with per-batch overrides. Rejected: an override layer on every lecture and MCQ is big and risks changing old batches.
- C. Grouping and labels only, no copy. Rejected: does not solve the copying.

## Design

### Data (migration 0119)
- New table `course_families` (id, name unique, created_at). RLS: admin read and write.
- `courses` gains `family_id uuid null references course_families(id) on delete set null` and `batch_label text null` (for example "Batch 3").
- New SQL function `duplicate_course(p_source uuid, p_title text, p_family uuid, p_batch_label text)`: security definer, admin only. Creates a new course (unpublished, new unique slug from the title), then copies modules, lessons (all content columns including resource_urls) and quiz_questions, keeping order. It copies NO enrollments, progress, attempts or notes. Returns the new course id. Builder to check later migrations for any extra lesson or module columns and copy those too.
- New SQL function `move_batch_students(p_page uuid, p_to_course uuid, p_dry_run boolean)`: security definer, admin only. For enrollments linked to this page's registrations (`landing_registration_id` in the page's registrations): re-point `course_id` to the new course, map `enrollment_open_modules` and `enrollment_modules` from old module to the matching new module (same position in the copy), skip a student who already has an enrollment in the target course. Dry run returns counts only (to move, already there, skipped). Also sets `landing_pages.course_id` to the new course. `lesson_progress` is not carried.
- Backfill: existing PPC course gets a family "PPC". Batch labels are set by the admin, not guessed.

### Screens
- **Campaign page** (`/dashboard/admin/enrollments/registrations/campaign/[pageId]`): new "Portal access" button. It opens `.../campaign/[pageId]/portal`.
- **Portal access screen** (one registration): shows
  1. This batch's portal: name, group, batch label, link to open it in Course Builder.
  2. Change portal: pick another portal in the same group, or "Duplicate a portal" (pick source, type the new name, optional batch label, confirm). After duplicating, the new portal is attached to this registration page.
  3. Move students: shows the count ("48 students will move, 2 already there"), then a "Move students" button with a confirm dialog that says progress in the old portal does not carry over.
  4. The existing actions, scoped to this registration with no picker: open modules, email portal link, save to CRM (the current `BatchAccessPanel` content).
- The "Batch access" buttons in `CampaignList.tsx` and `registrations/all/page.tsx` are removed. The old `/access` route redirects to the Registrations list.
- **Programs list** in the admin (the course list): portals shown grouped under their family name (PPC with its batches). Family can be set or created when duplicating or from the course settings.

### Edge cases
- Student already enrolled in the target portal: skipped, counted.
- Registration page with no portal yet: Portal access shows "No portal yet" and the duplicate or pick actions.
- Duplicating a very large course: runs in one database call; show a calm "Copying" state; on failure nothing partial is left (single transaction).
- Moving twice: second run finds nothing to move.

## Left to the builder
- Exact slug generation, naming of the route files, test layout.
- Whether the family picker is a select or a type-ahead.
- Copy of any lesson or module columns added after migration 0001/0009.

## Calls I made (for the owner to check)
- Families are a small table, not a text label on courses, so renaming a family renames it everywhere.
- Duplicated portals start unpublished, so nothing shows publicly until the owner publishes.
- Moving students also repoints the registration page, so new sign-ups of that batch join the new portal.
- Module mapping by position: assumes the copy still has the same module order. If the admin reorders or deletes modules in the copy BEFORE moving, those students' open modules map by what still matches; unmatched ones stay closed and are counted in the preview.
