-- ============================================================
-- Migration 0020: Private lesson documents
-- Run AFTER 0019. SQL Editor → New query → Run
-- ============================================================
-- Phase 3 (Admin LMS Builder) uploads lesson PDFs to a PRIVATE Google Drive
-- file instead of a public ANYONE_WITH_LINK one, and streams the bytes through
-- an authenticated route that reuses the existing
-- "lessons: read if unlocked or admin" RLS policy (0007) as its gate.
--
-- pdf_url is deliberately NOT dropped: rows published before this migration
-- still hold a working public URL, and LessonContent keeps rendering those.
-- New uploads only ever write pdf_file_id, and the renderer prefers it.

alter table public.lessons
  add column if not exists pdf_file_id text;

comment on column public.lessons.pdf_file_id is
  'Google Drive file ID of a PRIVATE lesson PDF, streamed via /api/lessons/[id]/pdf. '
  'Distinct from pdf_url, which held a public ANYONE_WITH_LINK Drive URL and is '
  'retained read-only for pre-existing rows.';
