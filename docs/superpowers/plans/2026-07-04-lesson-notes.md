# Lesson Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `localStorage`-backed Quick Notes prototype in `LessonSidePanel` with real per-student, per-lesson notes stored in Supabase, written with a Tiptap rich text editor, browsable from a dedicated "My Notes" hub, and exportable to PDF/DOC.

**Architecture:** A new `lesson_notes` table (owner-scoped RLS, no RPC needed) backs a small data-access module (`src/lib/data/notes.ts`) and one server action (`saveNote`). `LessonSidePanel` swaps its `<textarea>` for a Tiptap editor and debounce-saves through the server action instead of `localStorage.setItem`. A new `/dashboard/notes` page lists every note across a student's lessons. Export runs entirely client-side.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), Tiptap (`@tiptap/react` + `@tiptap/starter-kit`), `html2canvas` + `jspdf` (PDF), `html-docx-js` (DOC), Vitest.

## Global Constraints

- Project: `pz-academy-platform/`, Supabase project ref `whqdasotjlhvrjmgiffk`.
- One note per student per lesson (`unique (student_id, lesson_id)` — upsert, never multiple notes per lesson).
- No migration of existing `localStorage` notes — that data is superseded, not carried forward.
- No real-time collaboration, no tables/images/font-color in the editor — StarterKit scope only (bold/italic/strike, H2/H3, bullet/numbered lists, blockquote).
- Export runs client-side only — no new API route, no server-rendered PDF pipeline.
- DOC export uses `html-docx-js` (produces an HTML-based `.doc` file that opens with full formatting in Word) rather than `html-to-docx` — the latter depends on Node's `Buffer`/`fs` internals and does not reliably bundle in a Next.js client component. This is a deliberate substitution from the spec's originally-named library; the spec's actual requirement (a downloadable, correctly-formatted Word-openable file, generated client-side) is preserved.
- Follow existing conventions: `"server-only"` + `createServerSupabase()` in data-layer files (see `src/lib/data/lms.ts`), `"use server"` in `src/app/portal/actions.ts`, `pz-*` Tailwind tokens + `font-headline`/`font-body`/`font-label` classes for all new UI (see `src/components/lms/CourseSidebar.tsx` for the established pattern), Vitest for pure-function unit tests (see `tests/roles.test.ts`).

---

### Task 1: Database migration — `lesson_notes` table

**Files:**
- Create: `supabase/migrations/0011_lesson_notes.sql`

**Interfaces:**
- Produces: table `public.lesson_notes` with columns `id, student_id, lesson_id, course_id, content_html, content_text, updated_at`, RLS policy restricting all access to `student_id = auth.uid()`, trigger auto-updating `updated_at` using the existing `public.set_updated_at()` function (defined in `supabase/migrations/0003_triggers.sql:35-42` — reuse it, do not redefine it).

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Migration 0011: Lesson notes (student-authored, per lesson)
-- Run AFTER 0007. SQL Editor → New query → Run
-- ============================================================
-- Replaces the client-only localStorage notes prototype with real,
-- per-student, per-lesson notes. Owner-scoped RLS is sufficient here
-- (no drip/locking concern like lesson content), so no RPC is needed.

create table public.lesson_notes (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles(id) on delete cascade,
  lesson_id    uuid not null references public.lessons(id) on delete cascade,
  course_id    uuid not null references public.courses(id) on delete cascade,
  content_html text not null default '',
  content_text text not null default '',
  updated_at   timestamptz not null default now(),
  unique (student_id, lesson_id)
);

alter table public.lesson_notes enable row level security;

create policy "lesson_notes: student manages own"
  on public.lesson_notes
  for all
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create trigger lesson_notes_updated_at
  before update on public.lesson_notes
  for each row
  execute function public.set_updated_at();

grant select, insert, update, delete on public.lesson_notes to authenticated;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Call `apply_migration` (Supabase MCP tool) with `project_id: whqdasotjlhvrjmgiffk`, `name: lesson_notes`, and the SQL above as `query`. Confirm it returns success with no errors.

- [ ] **Step 3: Regenerate TypeScript types**

Call `generate_typescript_types` (Supabase MCP tool) with `project_id: whqdasotjlhvrjmgiffk`. Overwrite `src/lib/supabase/database.types.ts` with the returned content.

Verify: open `src/lib/supabase/database.types.ts` and confirm it now contains a `lesson_notes: { Row: {...}, Insert: {...}, Update: {...} }` entry under `public.Tables`.

- [ ] **Step 4: Commit**

```bash
cd "pz-academy-platform"
git add supabase/migrations/0011_lesson_notes.sql src/lib/supabase/database.types.ts
git commit -m "Add lesson_notes table for server-backed student notes"
```

---

### Task 2: Data layer — `src/lib/data/notes.ts`

**Files:**
- Create: `src/lib/data/notes.ts`
- Test: `tests/notes.test.ts`

**Interfaces:**
- Consumes: `createServerSupabase()` from `@/lib/supabase/server` (see `src/lib/data/lms.ts:2` for the exact import and usage pattern).
- Produces:
  - `interface LessonNote { id: string; lessonId: string; courseId: string; contentHtml: string; contentText: string; updatedAt: string }`
  - `interface NoteSummary { id: string; lessonId: string; courseSlug: string; courseTitle: string; lessonTitle: string; preview: string; updatedAt: string }`
  - `async function getLessonNote(lessonId: string, studentId: string): Promise<LessonNote | null>`
  - `async function saveLessonNote(input: { studentId: string; lessonId: string; courseId: string; html: string; text: string }): Promise<void>`
  - `async function getAllNotes(studentId: string): Promise<NoteSummary[]>`
  - `function truncatePreview(text: string, maxLen?: number): string` — pure, exported for the unit test below.

- [ ] **Step 1: Write the failing test for the pure helper**

Create `tests/notes.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { truncatePreview } from "@/lib/data/notes";

describe("truncatePreview", () => {
  it("returns short text unchanged", () => {
    expect(truncatePreview("First-pass effect reduces bioavailability.")).toBe(
      "First-pass effect reduces bioavailability.",
    );
  });

  it("collapses whitespace and newlines into single spaces", () => {
    expect(truncatePreview("Line one\n\n  Line   two")).toBe("Line one Line two");
  });

  it("truncates text longer than maxLen and appends an ellipsis", () => {
    const long = "a".repeat(200);
    const result = truncatePreview(long, 150);
    expect(result).toHaveLength(151); // 150 chars + "…"
    expect(result.endsWith("…")).toBe(true);
  });

  it("does not truncate text exactly at maxLen", () => {
    const exact = "a".repeat(150);
    expect(truncatePreview(exact, 150)).toBe(exact);
  });

  it("returns an empty string unchanged", () => {
    expect(truncatePreview("")).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/notes.test.ts`
Expected: FAIL — `Cannot find module '@/lib/data/notes'` (module doesn't exist yet).

- [ ] **Step 3: Write the data layer**

Create `src/lib/data/notes.ts`:

```typescript
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export interface LessonNote {
  id: string;
  lessonId: string;
  courseId: string;
  contentHtml: string;
  contentText: string;
  updatedAt: string;
}

export interface NoteSummary {
  id: string;
  lessonId: string;
  courseSlug: string;
  courseTitle: string;
  lessonTitle: string;
  preview: string;
  updatedAt: string;
}

/** Collapses whitespace/newlines and truncates to maxLen chars, appending "…" if cut. */
export function truncatePreview(text: string, maxLen = 150): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLen) return collapsed;
  return `${collapsed.slice(0, maxLen)}…`;
}

/** The caller's note for a lesson, or null if they haven't written one yet. */
export async function getLessonNote(
  lessonId: string,
  studentId: string,
): Promise<LessonNote | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("lesson_notes")
    .select("id, lesson_id, course_id, content_html, content_text, updated_at")
    .eq("lesson_id", lessonId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    lessonId: data.lesson_id,
    courseId: data.course_id,
    contentHtml: data.content_html,
    contentText: data.content_text,
    updatedAt: data.updated_at,
  };
}

/** Upserts the caller's note for a lesson (one row per student per lesson). */
export async function saveLessonNote(input: {
  studentId: string;
  lessonId: string;
  courseId: string;
  html: string;
  text: string;
}): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.from("lesson_notes").upsert(
    {
      student_id: input.studentId,
      lesson_id: input.lessonId,
      course_id: input.courseId,
      content_html: input.html,
      content_text: input.text,
    },
    { onConflict: "student_id,lesson_id" },
  );
}

/** Every note the caller has written, newest first, for the My Notes hub. */
export async function getAllNotes(studentId: string): Promise<NoteSummary[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("lesson_notes")
    .select(
      "id, lesson_id, content_text, updated_at, lessons(title), courses(slug, title)",
    )
    .eq("student_id", studentId)
    .order("updated_at", { ascending: false });

  if (!data) return [];

  return data
    .filter((row) => row.lessons && row.courses)
    .map((row) => ({
      id: row.id,
      lessonId: row.lesson_id,
      courseSlug: row.courses!.slug,
      courseTitle: row.courses!.title,
      lessonTitle: row.lessons!.title,
      preview: truncatePreview(row.content_text),
      updatedAt: row.updated_at,
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/notes.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors. If `lessons(title)` / `courses(slug, title)` produce a type error about the relationship shape, check the generated type at `src/lib/supabase/database.types.ts` for how `getEnrolledCourses` in `src/lib/data/lms.ts:70` types its `courses(...)` join (it accesses `e.courses` as a single object, not an array) and match that shape — Supabase generates singular joins as an object when the FK is `not null` and unique per row, which holds here.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/notes.ts tests/notes.test.ts
git commit -m "Add lesson_notes data layer with server-backed CRUD"
```

---

### Task 3: Server action — `saveNote`

**Files:**
- Modify: `src/app/portal/actions.ts`

**Interfaces:**
- Consumes: `saveLessonNote` from `@/lib/data/notes` (Task 2).
- Produces: `async function saveNote(lessonId: string, courseId: string, html: string, text: string): Promise<{ ok: boolean; error?: string }>`

- [ ] **Step 1: Add the import**

In `src/app/portal/actions.ts`, add to the top imports (after the existing `createServerSupabase` import on line 4):

```typescript
import { saveLessonNote } from "@/lib/data/notes";
```

- [ ] **Step 2: Add the server action**

Append to the end of `src/app/portal/actions.ts`:

```typescript
export interface SaveNoteResult {
  ok: boolean;
  error?: string;
}

/**
 * Upserts the caller's note for a lesson. Resolves the student id from the
 * authenticated session server-side — never trusts a client-supplied id.
 */
export async function saveNote(
  lessonId: string,
  courseId: string,
  html: string,
  text: string,
): Promise<SaveNoteResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  await saveLessonNote({ studentId: user.id, lessonId, courseId, html, text });
  return { ok: true };
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/portal/actions.ts
git commit -m "Add saveNote server action"
```

---

### Task 4: Note editor toolbar component

**Files:**
- Create: `src/components/lms/NoteEditorToolbar.tsx`

**Interfaces:**
- Consumes: a Tiptap `Editor` instance (type `Editor | null` from `@tiptap/react`), passed in as a prop by `LessonSidePanel` (Task 5).
- Produces: `export function NoteEditorToolbar({ editor }: { editor: Editor | null })` — a presentational row of formatting buttons. Renders nothing (`null`) if `editor` is `null` (Tiptap's `useEditor` returns `null` during initial SSR-safe mount).

- [ ] **Step 1: Install Tiptap**

Run: `npm install @tiptap/react @tiptap/starter-kit`
Expected: adds both packages to `package.json` dependencies.

- [ ] **Step 2: Write the toolbar component**

Create `src/components/lms/NoteEditorToolbar.tsx`:

```typescript
"use client";

import type { Editor } from "@tiptap/react";
import { Bold, Italic, Underline, Heading2, Heading3, List, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolbarButtonProps {
  onClick: () => void;
  active: boolean;
  label: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, active, label, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "p-1.5 rounded-md transition-colors",
        active
          ? "bg-pz-primary-container text-pz-on-primary-container"
          : "text-pz-on-surface-variant hover:bg-pz-surface-container-high hover:text-pz-on-surface",
      )}
    >
      {children}
    </button>
  );
}

export function NoteEditorToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  return (
    <div className="flex items-center gap-1 p-2 border-b border-pz-outline-variant/40 flex-wrap">
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Underline className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="w-4 h-4" />
      </ToolbarButton>
    </div>
  );
}
```

Note: Tiptap's StarterKit does not include an `Underline` mark (only `strike`) — the "Underline" icon button above toggles `strike` (StarterKit's actual formatting mark), not real underline, since adding the separate `@tiptap/extension-underline` package is out of scope for this plan's StarterKit-only editor. If real underline is wanted later, that's a one-package addition, not a redesign.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (this component isn't imported anywhere yet, but must still compile standalone).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/lms/NoteEditorToolbar.tsx
git commit -m "Add Tiptap and note editor toolbar component"
```

---

### Task 5: Wire the rich text editor into `LessonSidePanel`

**Files:**
- Modify: `src/components/lms/LessonSidePanel.tsx`
- Modify: `src/app/portal/[slug]/lessons/[lessonId]/page.tsx`

**Interfaces:**
- Consumes: `NoteEditorToolbar` (Task 4), `saveNote` server action (Task 3), `getLessonNote` (Task 2).
- Produces: `LessonSidePanel` now takes `{ lessonId: string; courseId: string; resources: LessonResource[]; initialNoteHtml: string }` (was `{ lessonId, resources }` — `courseId` and `initialNoteHtml` are new required props).

- [ ] **Step 1: Rewrite `LessonSidePanel.tsx`**

Replace the full contents of `src/components/lms/LessonSidePanel.tsx`:

```typescript
"use client";

import { useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { FileText, ExternalLink, FileDown, FileType2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveNote } from "@/app/portal/actions";
import { NoteEditorToolbar } from "./NoteEditorToolbar";
import { exportNotePdf, exportNoteDoc } from "@/lib/notes-export";
import type { LessonResource } from "@/lib/data/lms";

interface LessonSidePanelProps {
  lessonId: string;
  courseId: string;
  resources: LessonResource[];
  initialNoteHtml: string;
}

export function LessonSidePanel({
  lessonId,
  courseId,
  resources,
  initialNoteHtml,
}: LessonSidePanelProps) {
  const [tab, setTab] = useState<"resources" | "notes">("resources");
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const contentRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialNoteHtml,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "lesson-note-content min-h-[200px] p-3 text-sm font-body text-pz-on-surface outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      setSaved(false);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void saveNote(lessonId, courseId, editor.getHTML(), editor.getText()).then(() => {
          setSaved(true);
        });
      }, 500);
    },
  });

  return (
    <aside
      className={cn(
        "flex flex-col bg-pz-surface-container rounded-2xl shadow-sm border border-pz-outline-variant/40 mx-4 sm:mx-8 mb-6",
        "lg:rounded-none lg:shadow-none lg:border-0 lg:border-l lg:mx-0 lg:mb-0",
        "lg:w-80 lg:shrink-0 lg:sticky lg:top-16 lg:self-start lg:max-h-[calc(100vh-4rem)]",
      )}
    >
      <div className="flex border-b border-pz-outline-variant/40">
        <button
          onClick={() => setTab("resources")}
          className={cn(
            "flex-1 py-4 font-label text-sm font-semibold transition-colors",
            tab === "resources"
              ? "text-pz-secondary border-b-2 border-pz-secondary bg-pz-surface-container-high"
              : "text-pz-on-surface-variant hover:text-pz-on-surface",
          )}
        >
          Resources
        </button>
        <button
          onClick={() => setTab("notes")}
          className={cn(
            "flex-1 py-4 font-label text-sm font-semibold transition-colors",
            tab === "notes"
              ? "text-pz-secondary border-b-2 border-pz-secondary bg-pz-surface-container-high"
              : "text-pz-on-surface-variant hover:text-pz-on-surface",
          )}
        >
          Quick Notes
        </button>
      </div>

      {tab === "resources" ? (
        <div className="p-4 flex-1 overflow-y-auto space-y-3">
          {resources.length === 0 ? (
            <p className="text-sm font-body text-pz-on-surface-variant text-center py-8">
              No resources for this lesson yet.
            </p>
          ) : (
            resources.map((r, i) => (
              <a
                key={i}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-4 bg-pz-surface-container-low rounded-xl border border-pz-outline-variant/60 hover:border-pz-primary transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-5 h-5 text-pz-primary shrink-0 group-hover:scale-110 transition-transform" />
                  <span className="font-body text-sm text-pz-on-surface truncate">{r.label}</span>
                </div>
                <ExternalLink className="w-4 h-4 text-pz-outline shrink-0" />
              </a>
            ))
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <NoteEditorToolbar editor={editor} />
          <div ref={contentRef} className="flex-1 overflow-y-auto">
            <EditorContent editor={editor} />
          </div>
          <div className="p-3 border-t border-pz-outline-variant/40 flex items-center justify-between gap-2">
            <p className="text-[11px] font-label text-pz-on-surface-variant/60">
              {saved ? "Saved" : "Saving…"}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Export as PDF"
                onClick={() => contentRef.current && exportNotePdf(contentRef.current, `lesson-notes`)}
                className="p-1.5 rounded-md text-pz-on-surface-variant hover:bg-pz-surface-container-high hover:text-pz-on-surface transition-colors"
              >
                <FileDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                title="Export as Word document"
                onClick={() => editor && exportNoteDoc(editor.getHTML(), `lesson-notes`)}
                className="p-1.5 rounded-md text-pz-on-surface-variant hover:bg-pz-surface-container-high hover:text-pz-on-surface transition-colors"
              >
                <FileType2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Add editor content styles**

Open `src/app/globals.css` and append at the end of the file:

```css
.lesson-note-content h2 {
  font-family: var(--font-montserrat), sans-serif;
  font-size: 1.25rem;
  font-weight: 700;
  margin-top: 0.75rem;
  margin-bottom: 0.5rem;
}
.lesson-note-content h3 {
  font-family: var(--font-montserrat), sans-serif;
  font-size: 1.1rem;
  font-weight: 700;
  margin-top: 0.75rem;
  margin-bottom: 0.5rem;
}
.lesson-note-content ul {
  list-style-type: disc;
  padding-left: 1.25rem;
  margin: 0.5rem 0;
}
.lesson-note-content ol {
  list-style-type: decimal;
  padding-left: 1.25rem;
  margin: 0.5rem 0;
}
.lesson-note-content strong {
  font-weight: 700;
}
.lesson-note-content p {
  margin: 0.5rem 0;
}
.lesson-note-content blockquote {
  border-left: 3px solid var(--pz-outline-variant, #bfcab5);
  padding-left: 0.75rem;
  color: inherit;
  opacity: 0.85;
  margin: 0.5rem 0;
}
```

- [ ] **Step 3: Wire the lesson page to fetch and pass the initial note**

In `src/app/portal/[slug]/lessons/[lessonId]/page.tsx`, add to the imports (after the existing `getQuizAttempts` import block, before `import { CourseSidebar }`):

```typescript
import { getLessonNote } from "@/lib/data/notes";
```

Then find this block (currently around line 55-61):

```typescript
  const [questions, attempts] = locked
    ? [[], []]
    : await Promise.all([
        lesson.hasQuiz ? getQuizQuestions(lesson.id) : Promise.resolve([]),
        lesson.hasQuiz ? getQuizAttempts(lesson.id, user.id) : Promise.resolve([]),
      ]);
```

Replace it with:

```typescript
  const [questions, attempts, note] = locked
    ? [[], [], null]
    : await Promise.all([
        lesson.hasQuiz ? getQuizQuestions(lesson.id) : Promise.resolve([]),
        lesson.hasQuiz ? getQuizAttempts(lesson.id, user.id) : Promise.resolve([]),
        getLessonNote(lesson.id, user.id),
      ]);
```

Then find the existing render call (currently the last line before the closing `</div>` of the outer flex container):

```typescript
      {/* Resources & Quick Notes — sidebar on lg+, stacked card on mobile */}
      {!locked && <LessonSidePanel lessonId={lesson.id} resources={lesson.resources} />}
```

Replace it with:

```typescript
      {/* Resources & Quick Notes — sidebar on lg+, stacked card on mobile */}
      {!locked && (
        <LessonSidePanel
          lessonId={lesson.id}
          courseId={course.id}
          resources={lesson.resources}
          initialNoteHtml={note?.contentHtml ?? ""}
        />
      )}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: FAIL — `Cannot find module '@/lib/notes-export'` (Task 7 creates it). This is expected at this point in the plan; the export buttons reference it but the module doesn't exist until Task 7. Continue to Task 6, then complete Task 7 before doing a final full type-check.

- [ ] **Step 5: Commit**

```bash
git add src/components/lms/LessonSidePanel.tsx src/app/portal/[slug]/lessons/[lessonId]/page.tsx src/app/globals.css
git commit -m "Replace localStorage notes with Tiptap editor + server-backed save"
```

---

### Task 6: "My Notes" hub page

**Files:**
- Create: `src/app/dashboard/notes/page.tsx`
- Modify: `src/components/dashboard/Sidebar.tsx`

**Interfaces:**
- Consumes: `getAllNotes` from `@/lib/data/notes` (Task 2).
- Produces: route `/dashboard/notes`; new `Sidebar.tsx` nav entry `{ label: "My Notes", href: "/dashboard/notes", icon: NotebookPen, roles: ["student"] }`.

- [ ] **Step 1: Write the My Notes page**

Create `src/app/dashboard/notes/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import Link from "next/link";
import { NotebookPen } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAllNotes } from "@/lib/data/notes";

export const metadata = { title: "My Notes — PZ Academy" };

export default async function MyNotesPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const notes = await getAllNotes(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">My Notes</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Everything you&apos;ve written across your lessons, in one place.
        </p>
      </div>

      {notes.length === 0 ? (
        <div className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-10 flex flex-col items-center text-center">
          <NotebookPen className="w-10 h-10 text-pz-outline-variant mb-3" />
          <p className="font-body text-pz-on-surface-variant text-sm">
            No notes yet — notes you take on lessons will show up here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {notes.map((note) => (
            <Link
              key={note.id}
              href={`/portal/${note.courseSlug}/lessons/${note.lessonId}`}
              className="p-5 rounded-xl bg-pz-surface-container border border-pz-outline-variant/40 hover:border-pz-primary transition-colors flex flex-col gap-2"
            >
              <span className="font-label text-[11px] uppercase tracking-widest text-pz-secondary/80">
                {note.courseTitle}
              </span>
              <h3 className="font-headline font-bold text-pz-on-surface text-base leading-tight">
                {note.lessonTitle}
              </h3>
              <p className="font-body text-sm text-pz-on-surface-variant line-clamp-3">
                {note.preview || "No content yet."}
              </p>
              <p className="font-label text-[11px] text-pz-on-surface-variant/60 mt-auto pt-2">
                {new Date(note.updatedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the nav entry**

In `src/components/dashboard/Sidebar.tsx`, update the icon import (line 5-8) to add `NotebookPen`:

```typescript
import {
  LayoutDashboard, BookOpen, Calendar, Award, Users, Settings,
  GraduationCap, BarChart3, CreditCard, Video, NotebookPen,
} from "lucide-react";
```

Then insert a new entry into `NAV_ITEMS` (line 20-31) immediately after the "My Courses" line:

```typescript
  { label: "My Courses", shortLabel: "Courses", href: "/dashboard/courses", icon: BookOpen, roles: ["student"] },
  { label: "My Notes", shortLabel: "Notes", href: "/dashboard/notes", icon: NotebookPen, roles: ["student"] },
```

(This makes the student role's item list: Dashboard, My Courses, My Notes, Sessions, Certificates, Webinars — 6 items. The mobile bottom nav's `mobileItems = items.slice(0, 5)` on line 40 will now show Dashboard/My Courses/My Notes/Sessions/Certificates and drop Webinars from the mobile bottom nav, per the spec's explicit decision — Webinars remains reachable via the desktop sidebar.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: still FAILS on the same `@/lib/notes-export` error from Task 5 Step 4 (expected until Task 7) — confirm no *additional* errors were introduced by this task's files.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/notes/page.tsx src/components/dashboard/Sidebar.tsx
git commit -m "Add My Notes hub page and sidebar nav entry"
```

---

### Task 7: Export to PDF and DOC

**Files:**
- Create: `src/lib/notes-export.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure client-side utility module).
- Produces: `async function exportNotePdf(contentEl: HTMLElement, filenameBase: string): Promise<void>`, `async function exportNoteDoc(html: string, filenameBase: string): Promise<void>` — both referenced already by `LessonSidePanel` (Task 5).

- [ ] **Step 1: Install export dependencies**

Run: `npm install html2canvas jspdf html-docx-js`
Expected: adds all three to `package.json` dependencies.

`html-docx-js` has no bundled TypeScript types. Create `src/types/html-docx-js.d.ts`:

```typescript
declare module "html-docx-js/dist/html-docx" {
  const htmlDocx: {
    asBlob: (html: string, options?: Record<string, unknown>) => Blob;
  };
  export default htmlDocx;
}
```

- [ ] **Step 2: Write the export module**

Create `src/lib/notes-export.ts`:

```typescript
"use client";

/** Renders a DOM node to a PNG and drops it into a downloadable single-page PDF. */
export async function exportNotePdf(contentEl: HTMLElement, filenameBase: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const canvas = await html2canvas(contentEl, { scale: 2, backgroundColor: "#ffffff" });
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "px",
    format: [canvas.width, canvas.height],
  });
  pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
  pdf.save(`${filenameBase}.pdf`);
}

/**
 * Converts note HTML to a downloadable .doc file (HTML-based Word format —
 * opens with full formatting in Word/Google Docs, not true OOXML .docx).
 */
export async function exportNoteDoc(html: string, filenameBase: string): Promise<void> {
  const { default: htmlDocx } = await import("html-docx-js/dist/html-docx");
  const blob = htmlDocx.asBlob(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`);

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filenameBase}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 3: Full project type-check**

Run: `npx tsc --noEmit`
Expected: PASS — no errors anywhere (this resolves the `@/lib/notes-export` error carried since Task 5).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/notes-export.ts src/types/html-docx-js.d.ts
git commit -m "Add client-side PDF and DOC export for lesson notes"
```

- [ ] **Step 5: Manual end-to-end verification (chrome-devtools MCP)**

Start the dev server if not already running: `npm run dev -- -p 3945` (background).

Using the chrome-devtools MCP tools (`new_page`, `take_snapshot`, `fill`, `click`, `evaluate_script`, `resize_page`, `take_screenshot`):

1. Navigate to `http://localhost:3945/login`, sign in as the test account (`Hamzaansari4you@gmail.com` / `@PZ2001009HA`).
2. Navigate to `http://localhost:3945/portal/ppc-batch-2/lessons/11111111-3333-4333-8333-000000000003`.
3. Click the "Quick Notes" tab. Use the toolbar to type a heading, some bold text, and a bullet list item — confirm the toolbar buttons visually toggle active state and the formatting actually applies in the editor.
4. Wait ~1 second for the debounced save, then run `evaluate_script` with a `fetch` to confirm the note round-tripped — or simpler: reload the page (`navigate_page` with `type: reload`) and click "Quick Notes" again; confirm the formatted content is still there (this proves it round-tripped through Postgres, not `localStorage`, since a hard reload re-fetches server-side).
5. Click the PDF export button; confirm a `.pdf` file download is triggered (check via `list_network_requests` or the browser's download behavior — at minimum confirm no console error was thrown, via `list_console_messages`).
6. Click the DOC export button; same confirmation.
7. Navigate to `http://localhost:3945/dashboard/notes`. Confirm the note just written appears in the grid with the correct lesson/course title and a text preview matching what was typed (stripped of formatting).
8. Resize to `390x844` (mobile) and repeat steps 3-4 on the same lesson page, confirming the editor and toolbar render correctly stacked in the mobile card layout (not the desktop sidebar), per the existing responsive pattern already verified for `LessonSidePanel` earlier in this project.

If any step fails, fix the underlying code (not the test) and re-verify from step 1.

---

## Self-Review Notes

- **Spec coverage:** Data model (Task 1) ✓, data layer & server action (Tasks 2-3) ✓, editor (Tasks 4-5) ✓, My Notes hub (Task 6) ✓, export (Task 7) ✓, testing (pure-function unit test in Task 2 + manual verification in Task 7 Step 5, matching the spec's Testing section) ✓.
- **DOC library substitution:** the spec named `html-to-docx`; this plan uses `html-docx-js` instead for browser-bundling reliability. Documented explicitly in Global Constraints and in Task 7, not silently swapped.
- **Type consistency:** `LessonNote.contentHtml` (Task 2) is what `page.tsx` reads as `note?.contentHtml` (Task 5) and passes to `LessonSidePanel`'s `initialNoteHtml` prop (Task 5) — consistent naming throughout. `saveNote(lessonId, courseId, html, text)` (Task 3) matches the call site in `LessonSidePanel`'s `onUpdate` handler (Task 5) argument-for-argument.
