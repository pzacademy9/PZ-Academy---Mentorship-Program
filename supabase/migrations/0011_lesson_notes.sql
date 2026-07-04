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
