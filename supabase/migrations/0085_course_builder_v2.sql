-- 0085_course_builder_v2.sql
-- Course Builder v2: second video per lesson + per-module notes/resources.
-- Run in SQL Editor; safe to re-run.

alter table public.lessons add column if not exists video_url_2 text;

create table if not exists public.module_notes (
  module_id     uuid primary key references public.modules(id) on delete cascade,
  resource_urls jsonb not null default '[]'::jsonb,
  documents     jsonb not null default '[]'::jsonb,
  updated_at    timestamptz default now()
);

alter table public.module_notes enable row level security;

drop policy if exists "module_notes: read if enrolled or admin" on public.module_notes;
create policy "module_notes: read if enrolled or admin"
  on public.module_notes for select
  using (
    get_my_role() in ('admin', 'super_admin')
    or exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      join public.enrollments e on e.course_id = c.id
      where m.id = module_notes.module_id
        and e.student_id = auth.uid()
        and e.status = 'active'
    )
  );
-- No write policies: writes go through the service role.

-- Backfill: any text lesson that has a video becomes a video lesson (written text is still shown).
update public.lessons
   set content_type = 'video'
 where content_type = 'text'
   and coalesce(video_url, '') <> '';
