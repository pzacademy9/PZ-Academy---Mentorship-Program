alter table public.courses
  add column if not exists duration_text text,
  add column if not exists timings text;

comment on column public.courses.duration_text is
  'Free-text duration label shown on the Configuration form and public pages, '
  'e.g. "8 Weeks", "4 Days", "Single Session" — replaces duration_weeks as the '
  'admin-editable field per the real "Admin: Course Management Detail" Stitch '
  'screen (a plain text input, not a week count). duration_weeks is kept '
  'read-only for legacy rows that have not been re-saved yet.';

comment on column public.courses.timings is
  'Free-text session schedule, e.g. "Every Sat & Sun, 6-8 PM". Admin-only for now.';

-- Backfill so the two live programs show something sensible immediately.
update public.courses
set duration_text = duration_weeks || ' Weeks'
where duration_text is null and duration_weeks is not null;
