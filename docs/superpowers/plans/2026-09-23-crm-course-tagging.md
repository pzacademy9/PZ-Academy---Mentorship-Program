# CRM Course Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the CRM course-tagging gap — give the import wizard a real course picker that writes `contact_purchases.course_id`, and backfill the 5 already-imported batches so every existing row is tagged too.

**Architecture:** The DB and RPC side (`crm_import_commit`, `contact_purchases.course_id`, `import_batches.course_id`, `importCommitSchema.courseId`) already exist and are already wired end to end — investigation confirmed the only gap is (1) `ImportWizard.tsx` never collects or sends `courseId`, and (2) the 5 historical batches have `course_id = null` everywhere. This plan adds a course-picker step to the wizard and backfills the historical rows via a one-time data migration. No schema changes.

**Tech Stack:** Next.js App Router (route handlers), Supabase (Postgres + RPC), Zod, React (client component).

**Spec:** None — this is a scoped gap-closure agreed live with the user (see conversation: user resolved 3 batch→course mappings, decided 2 new course rows are needed: "Medication Error Prevention Course" (workshop) and "Adverse Drug Reaction Reporting" by Dr Shaistah Zahrah (webinar), both created as unpublished/draft rows since they exist only to tag historical CRM data, not to appear in the public catalog).

## Global Constraints

- Never regenerate `database.types.ts` wholesale (see memory: reintroduces ~20 unrelated tsc errors) — this plan doesn't need new columns, so no regen is expected; if a new type entry is needed, hand-add it.
- `npm run <script>` is broken in this workspace path — call binaries directly (`node_modules/.bin/tsc`, `node_modules/.bin/vitest`, `node_modules/.bin/next`).
- Never run `next build` while the dev server is live.
- Commit locally only (no remote on this repo); never push.

## Review Focus

- An admin runs the wizard without picking a course (e.g. importing a mixed-course sheet where tagging isn't wanted yet) — the commit must still succeed with `course_id = null`, not block on a required field.
- The course dropdown must include unpublished/draft courses (like the two new ones this plan creates) — a query filtered to `is_published = true` would make them permanently unselectable.
- The backfill migration must not overwrite a `course_id` a future import already set correctly — every `UPDATE` is scoped by batch identity and guarded with `course_id is null`.
- Re-running the migration (e.g. after a `db reset` + replay in another environment) must not error or duplicate rows — course inserts use `ON CONFLICT (slug) DO NOTHING`.
- The three duplicate "MEP Batch 1-Master Sheet" batch rows (86 rows each, same sheet re-imported) must all resolve to the same course — the migration matches by `sheet_name`, not by a single batch id, so it covers all three automatically.

---

## Task 1: Backfill migration — new course rows + historical course_id

**Files:**
- Create: `supabase/migrations/0051_crm_course_backfill.sql`

**Interfaces:**
- Consumes: existing `public.courses`, `public.import_batches`, `public.contact_purchases` tables (columns already present — no DDL).
- Produces: two new `public.courses` rows at fixed, deterministic UUIDs (`a1000000-0000-4000-8000-000000000001` for MEP, `a1000000-0000-4000-8000-000000000002` for the ADR webinar) that Task 2/3 can reference if ever needed, and `course_id` populated on the 5 historical `import_batches` rows and their `contact_purchases` rows.

- [ ] **Step 1: Write the migration**

```sql
-- 0051_crm_course_backfill.sql
--
-- Backfills contact_purchases.course_id / import_batches.course_id for the
-- 5 CRM import batches that predate the import wizard's course picker.
-- Two of the batches belong to courses that don't exist in `courses` yet;
-- both are inserted as unpublished/draft since they exist only to tag
-- historical CRM data, not to appear in the public course catalog.

insert into public.courses (id, slug, title, type, price_pkr, status, is_published)
values
  ('a1000000-0000-4000-8000-000000000001', 'mep-workshop', 'Medication Error Prevention Course', 'workshop', 0, 'draft', false),
  ('a1000000-0000-4000-8000-000000000002', 'dr-shaistah-adr-reporting', 'Adverse Drug Reaction Reporting', 'webinar', 0, 'draft', false)
on conflict (slug) do nothing;

-- MEP Batch 1-Master Sheet was imported 3 times (same sheet re-run); match
-- by sheet_name so all 3 historical batch rows get tagged, not just the
-- latest one.
update public.import_batches
set course_id = 'a1000000-0000-4000-8000-000000000001'
where sheet_name = 'MEP Batch 1-Master Sheet'
  and course_id is null;

update public.import_batches
set course_id = '22222222-2222-4222-8222-222222222222' -- Mastering Dose Calculations (MDC) Workshop
where sheet_name = 'MDC 2 - Master Sheet'
  and course_id is null;

update public.import_batches
set course_id = 'a1000000-0000-4000-8000-000000000002'
where sheet_name = 'W19 Mastersheet'
  and course_id is null;

-- Propagate from batch to purchase. Guarded on cp.course_id is null so a
-- re-run (or a future import that already set course_id correctly) is a
-- no-op rather than an overwrite.
update public.contact_purchases cp
set course_id = ib.course_id
from public.import_batches ib
where cp.import_batch_id = ib.id
  and cp.course_id is null
  and ib.course_id is not null;
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool (project `whqdasotjlhvrjmgiffk`, name `crm_course_backfill`, query = the SQL above) rather than `execute_sql`, since this is a tracked schema-adjacent change (new course rows) that should show up in `list_migrations`.

- [ ] **Step 3: Verify live**

Run:

```sql
select b.sheet_name, c.title, count(*) filter (where cp.course_id is not null) as tagged, count(*) as total
from public.import_batches b
join public.contact_purchases cp on cp.import_batch_id = b.id
left join public.courses c on c.id = b.course_id
group by b.sheet_name, c.title
order by b.sheet_name;
```

Expected: every row of every batch (`MEP Batch 1-Master Sheet`, `MDC 2 - Master Sheet`, `W19 Mastersheet`) shows `tagged = total`, with `title` = "Medication Error Prevention Course", "Mastering Dose Calculations (MDC) Workshop", and "Adverse Drug Reaction Reporting" respectively.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0051_crm_course_backfill.sql
git commit -m "data: backfill course_id on historical CRM import batches"
```

---

## Task 2: Data layer + API route for the course picker list

**Files:**
- Modify: `src/lib/data/admin-crm-import.ts`
- Create: `src/app/api/admin/crm/courses/route.ts`

**Interfaces:**
- Consumes: `createAdminSupabase()` from `@/lib/supabase/admin` (already imported in `admin-crm-import.ts`); `requireAdmin()` from `@/lib/auth/require-admin` (same pattern as `commit/route.ts`).
- Produces: `listCoursesForTagging(): Promise<CourseOption[]>` where `CourseOption = { id: string; title: string; type: string }`, exported from `admin-crm-import.ts`. `GET /api/admin/crm/courses` returns `{ courses: CourseOption[] }`.

- [ ] **Step 1: Add `listCoursesForTagging` to the data layer**

In `src/lib/data/admin-crm-import.ts`, add after `listImportBatches` (after line 62):

```ts
export type CourseOption = { id: string; title: string; type: string };

/**
 * Feeds the import wizard's course picker. Deliberately unfiltered by
 * is_published — a course tagged here may be a draft row that exists only
 * to label historical CRM data (see migration 0051), and it must stay
 * pickable even though it will never appear in the public catalog.
 */
export async function listCoursesForTagging(): Promise<CourseOption[]> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("courses").select("id, title, type").order("title");
  return (data ?? []).map((c) => ({ id: c.id, title: c.title, type: c.type }));
}
```

- [ ] **Step 2: Add the route**

Create `src/app/api/admin/crm/courses/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listCoursesForTagging } from "@/lib/data/admin-crm-import";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const courses = await listCoursesForTagging();
  return NextResponse.json({ courses });
}
```

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors from these two files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/admin-crm-import.ts src/app/api/admin/crm/courses/route.ts
git commit -m "feat: add course list endpoint for CRM import tagging"
```

---

## Task 3: Import wizard course picker

**Files:**
- Modify: `src/components/admin/crm/ImportWizard.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/crm/courses` → `{ courses: Array<{ id: string; title: string; type: string }> }` (Task 2).
- Produces: `courseId` included in the `POST /api/admin/crm/import/commit` body, consumed by the already-existing `importCommitSchema.courseId` (optional uuid) and `commitImport` → `crm_import_commit` RPC.

- [ ] **Step 1: Load the course list on mount**

In `ImportWizard.tsx`, add state and a fetch effect. After the existing `useState` block (after line 42, `const [done, setDone] = useState<string | null>(null);`):

```ts
  const [courses, setCourses] = useState<Array<{ id: string; title: string; type: string }>>([]);
  const [courseId, setCourseId] = useState<string>("");

  useEffect(() => {
    fetch("/api/admin/crm/courses")
      .then((res) => res.json())
      .then((json) => setCourses(json.courses ?? []))
      .catch(() => setCourses([]));
  }, []);
```

Add `useEffect` to the React import on line 3: `import { useEffect, useState } from "react";`

- [ ] **Step 2: Send `courseId` on commit**

In the `commit` function (line 98-123), change the fetch body on line 106 from:

```ts
        body: JSON.stringify({ sheetId: sheetInput, tabName: selectedTab, mapping, sheetName }),
```

to:

```ts
        body: JSON.stringify({
          sheetId: sheetInput,
          tabName: selectedTab,
          mapping,
          sheetName,
          ...(courseId ? { courseId } : {}),
        }),
```

The spread keeps `courseId` out of the payload entirely when unset, matching `importCommitSchema.courseId` being `.optional()` rather than sending an empty string that would fail the `.uuid()` check.

- [ ] **Step 3: Add the picker to the UI**

In the "Step 3 — mapping" section (line 167-199), add the picker after the column-mapping grid and before the "Preview import" button (after line 190, the closing `</div>` of the fields grid):

```tsx
          <label className="block font-body text-sm">
            <span className="block text-pz-on-surface-variant mb-1">Course (optional — tags every row in this batch)</span>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full sm:w-1/2 rounded-xl border border-pz-outline-variant px-3 py-2"
            >
              <option value="">— not tagged —</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.type})
                </option>
              ))}
            </select>
          </label>
```

- [ ] **Step 4: Typecheck and lint**

Run: `node_modules/.bin/tsc --noEmit`
Run: `node_modules/.bin/next lint --file src/components/admin/crm/ImportWizard.tsx` (or the project's standard lint invocation if this flag isn't supported — check `package.json` `lint` script for the exact command since `npm run lint` itself is broken in this workspace path)
Expected: no new errors.

- [ ] **Step 5: Manual verification in the browser**

With the dev server running on port 3000: sign in as `pharmacozymeofficial@gmail.com`, open the CRM import wizard, read any sheet, choose a tab, confirm the course dropdown appears in step 3 and lists all 19 courses (17 existing + 2 new from Task 1) including the two draft ones. Do not commit a real import during this check — stop after confirming the dropdown renders and `courseId` updates in React state (inspect via browser devtools if needed).

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/crm/ImportWizard.tsx
git commit -m "feat: add course picker to CRM import wizard"
```
