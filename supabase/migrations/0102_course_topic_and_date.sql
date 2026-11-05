-- Migration 0102: real details on the public website.
-- topic: free text the admin picks in the course editor; the Courses and
--   Workshops lists show one button per topic that has a published course.
-- starts_at: date and time of a webinar that has no batch page. The webinar
--   page shows it with Add to calendar, and the webinar counts as recorded a
--   few hours after it starts.
-- Adds two empty columns only. Nothing existing changes. Safe to run twice.

alter table public.courses
  add column if not exists topic text,
  add column if not exists starts_at timestamptz;
