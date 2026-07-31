-- ============================================================
-- Migration 0019: Unique constraint on courses.sheet_id
-- Run AFTER 0018. SQL Editor → New query → Run
-- ============================================================
-- The self-service "Connect sheet" admin UI (added after 0016) lets any
-- admin paste a raw sheet ID with no server-side check that it isn't already
-- claimed by a different course. A copy-paste mistake would otherwise
-- silently double-connect a sheet — getCourseBySheetId() would route that
-- batch's submissions to whichever course matches first, with no error
-- surfaced to anyone. NULL is unaffected: Postgres unique constraints treat
-- every NULL as distinct, so courses with no sheet_id never conflict.

alter table public.courses
  add constraint courses_sheet_id_unique unique (sheet_id);
