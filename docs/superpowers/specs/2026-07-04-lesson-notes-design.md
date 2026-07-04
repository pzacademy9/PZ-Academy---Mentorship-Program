# Lesson Notes: DB-backed rich text notes with PDF/DOCX export

## Context

`LessonSidePanel` (built earlier this session) currently persists student "Quick Notes" to
`localStorage`, keyed per lesson, per browser. This works but doesn't sync across devices, has
no formatting, no way to browse notes outside the lesson they were written on, and no export.

This spec replaces that with real per-student, per-lesson notes stored in Supabase, written with
a lightweight rich text editor, browsable from a dedicated "My Notes" page, and exportable to
PDF or DOCX.

## Goals

- Notes persist server-side and follow the student across devices.
- Clean rich text editing (bold/italic/underline, headings, lists) — not a plain textarea, not a
  full word processor.
- A "My Notes" hub in the dashboard listing every note across all lessons/courses, searchable.
- One-click export to PDF and to DOCX, per note.

## Non-goals

- Real-time collaborative editing (single student, single device at a time).
- Migrating existing `localStorage` notes into the database — that data was a stopgap from this
  session's earlier iteration, not real accumulated user data; it's simply superseded.
- Tables, images, font/color choices, or other full-word-processor features.
- A server-rendered/server-generated PDF pipeline — export runs client-side.

## Data model

New migration `supabase/migrations/0011_lesson_notes.sql`:

```sql
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
```

`course_id` is denormalized onto the row (rather than joined through `lessons`) so the My Notes
hub query is a single flat `select` with no joins needed for the common case. Direct
RLS-scoped CRUD is sufficient here — unlike lesson content, there's no drip/locking concern, so
no `security definer` RPC is needed (contrast with `complete_lesson()` in migration 0007).

A trigger to auto-update `updated_at` on write follows the same pattern as existing tables (check
0001/0003 for the existing `set_updated_at()` trigger function and reuse it if present, otherwise
add one).

## Data layer & server actions

`src/lib/data/notes.ts` (new):

- `getLessonNote(lessonId: string, studentId: string): Promise<LessonNote | null>`
- `getAllNotes(studentId: string): Promise<NoteSummary[]>` — selects `lesson_notes` joined to
  `lessons.title` and `courses.title, courses.slug` for the hub view, ordered by `updated_at desc`
- `saveLessonNote(input: { lessonId, courseId, studentId, html, text }): Promise<void>` — upsert
  on the `(student_id, lesson_id)` unique constraint

`src/app/portal/actions.ts` gains:

- `saveNote(lessonId: string, courseId: string, html: string, text: string)` — `"use server"`,
  resolves the current user server-side (never trusts a client-supplied student id), calls
  `saveLessonNote`. No `revalidatePath` — the panel manages its own optimistic local state and
  doesn't need a full RSC re-render per keystroke-debounce.

`src/app/portal/[slug]/lessons/[lessonId]/page.tsx` fetches the existing note server-side via
`getLessonNote` and passes it into `LessonSidePanel` as an initial value prop (replacing the
current `useEffect` + `localStorage.getItem` read on mount).

## Editor

`LessonSidePanel`'s Quick Notes tab replaces its `<textarea>` with a Tiptap editor:

- Dependencies: `@tiptap/react`, `@tiptap/starter-kit`.
- `StarterKit` covers bold/italic/strike, H2/H3, bullet & numbered lists, blockquote — matches
  the agreed "clean rich text" scope without hand-picking individual extensions.
- A small toolbar row above the editor: Bold, Italic, Underline, H2, H3, Bullet list, Numbered
  list. Icon buttons (lucide-react) styled with the existing `pz-*` tokens — active state uses
  `bg-pz-primary-container text-pz-on-primary-container`, matching the active-state treatment
  already used in `CourseSidebar`.
- On every debounced save tick (same 500ms pattern as the current `localStorage` version):
  `editor.getHTML()` → `content_html`, `editor.getText()` → `content_text`, both sent through the
  `saveNote` server action. The "Saved on this device" indicator text changes to
  "Saved" (device-specific wording no longer applies once it's server-backed).
- Editor content area styled with hand-rolled heading/list/bold CSS scoped to a
  `.lesson-note-content` class. Confirmed `@tailwindcss/typography` is not currently a project
  dependency, so this hand-rolls the small fixed set of styles needed (H2/H3 sizes, list markers,
  bold weight, paragraph spacing) rather than pulling in a new Tailwind plugin for a handful of
  elements.

This is fully contained inside `LessonSidePanel` — no other component needs to know Tiptap exists.

## "My Notes" hub

New route `src/app/dashboard/notes/page.tsx` (server component):

- Calls `getAllNotes(studentId)`.
- Renders a grid of note cards: lesson title, course title, relative "last edited" timestamp, a
  plain-text preview (first ~150 chars of `content_text`, whitespace-collapsed), linking to
  `/portal/[courseSlug]/lessons/[lessonId]`.
- A client-side search input filters the already-fetched list by substring match against
  `content_text` — no dedicated search API needed at this scale (a student's total note count is
  bounded by their total lesson count across enrolled courses).
- Empty state ("No notes yet — notes you take on lessons will show up here") styled consistently
  with the existing empty states on `/dashboard` (courses, sessions panels).
- New entry in `Sidebar.tsx`'s `NAV_ITEMS`: `{ label: "My Notes", href: "/dashboard/notes", icon: NotebookPen, roles: ["student"] }`,
  inserted right after "My Courses". The student role currently has 5 items (Dashboard, My
  Courses, Sessions, Certificates, Webinars), all shown in the mobile bottom nav's first-5 slice.
  Adding a 6th pushes "Webinars" out of the mobile bottom nav slice — accepted, since it's still
  reachable via the desktop sidebar and the dashboard's own navigation, and My Notes is the
  higher-priority mobile destination of the two.

## Export (PDF + DOCX)

Two buttons in the Quick Notes tab (visible once a note has content): **Export PDF**, **Export DOCX**.

- **PDF**: `html2canvas` renders the `.lesson-note-content` DOM node to a canvas at 2x scale;
  `jsPDF` places that image into a single-page (or multi-page if content overflows) PDF and
  triggers a browser download named `{lesson-title}-notes.pdf`. Rasterized image, not real text —
  accepted tradeoff for zero-dependency-on-a-server, one-click download.
- **DOCX**: `html-to-docx` converts `editor.getHTML()` directly to a `.docx` Blob, downloaded as
  `{lesson-title}-notes.docx`. This is real structured Word content (headings/lists/bold survive
  as actual DOCX formatting), not a screenshot.
- Both run entirely client-side inside `LessonSidePanel` — no new API route, no server-side
  rendering infrastructure.
- New dependencies: `html2canvas`, `jspdf`, `html-to-docx`.

## Testing

- `getLessonNote` / `saveLessonNote` / `getAllNotes`: unit tests following the existing pattern in
  `tests/` (check `tests/roles.test.ts` for the project's Supabase-mocking convention).
- Manual verification via chrome-devtools MCP (as used earlier this session): type a note, confirm
  it round-trips through the server action and survives a hard reload with a different simulated
  session/device (not just `localStorage`), confirm the My Notes hub lists it, confirm both export
  buttons produce a downloadable file with the expected formatting.

## Files touched (summary)

- New: `supabase/migrations/0011_lesson_notes.sql`
- New: `src/lib/data/notes.ts`
- New: `src/app/dashboard/notes/page.tsx`
- Edited: `src/app/portal/actions.ts` (add `saveNote`)
- Edited: `src/app/portal/[slug]/lessons/[lessonId]/page.tsx` (fetch + pass initial note)
- Edited: `src/components/lms/LessonSidePanel.tsx` (Tiptap editor, toolbar, server-action save,
  export buttons)
- Edited: `src/components/dashboard/Sidebar.tsx` (new "My Notes" nav item)
- Package additions: `@tiptap/react`, `@tiptap/starter-kit`, `html2canvas`, `jspdf`, `html-to-docx`
