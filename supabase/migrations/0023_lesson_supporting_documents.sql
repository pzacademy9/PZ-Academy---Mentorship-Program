-- ============================================================
-- Migration 0023: Lesson supporting documents
-- Run AFTER 0022. SQL Editor → New query → Run
-- ============================================================
-- The real "Admin: LMS Course Builder" Stitch screen has a "Supporting
-- Documents" dropzone, distinct from the "External Resources" link list
-- (which already lives in lessons.resource_urls as {label, url} pairs).
-- Supporting Documents are uploaded PDF files stored PRIVATELY in Drive
-- (same access-control model as pdf_file_id from migration 0020) and
-- streamed through /api/lessons/[id]/documents/[fileId].

alter table public.lessons
  add column if not exists documents jsonb not null default '[]'::jsonb;

comment on column public.lessons.documents is
  'Array of {name: string, fileId: string} — PRIVATE Drive files uploaded via '
  'the Supporting Documents dropzone, streamed through '
  '/api/lessons/[id]/documents/[fileId]. Distinct from resource_urls, which '
  'holds arbitrary public External Resources links.';
