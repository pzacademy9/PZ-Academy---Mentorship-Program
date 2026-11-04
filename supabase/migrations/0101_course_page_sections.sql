-- Migration 0101: the admin arranges the public course page.
-- page_sections: ordered list of {key, visible, title?} for the course page's
--   left column (about, learn, curriculum, teacher, certificate, faq).
--   Empty = the normal order with every section shown.
-- certificate_image_url: a picture of the real certificate; when set it
--   replaces the sample certificate on the course page.
-- Adds two columns only. Nothing existing changes. Safe to run twice.

alter table public.courses
  add column if not exists page_sections jsonb not null default '[]'::jsonb,
  add column if not exists certificate_image_url text;
