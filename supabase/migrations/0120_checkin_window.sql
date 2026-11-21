-- 0120: editable check-in window. Page default (minutes before/after class start/end)
-- plus optional per-class override (null = use the page default).

alter table public.landing_pages
  add column if not exists checkin_open_minutes int not null default 15
    constraint landing_pages_checkin_open_minutes_check check (checkin_open_minutes between 0 and 180),
  add column if not exists checkin_close_minutes int not null default 15
    constraint landing_pages_checkin_close_minutes_check check (checkin_close_minutes between 0 and 180);

alter table public.batch_sessions
  add column if not exists checkin_open_minutes int null
    constraint batch_sessions_checkin_open_minutes_check check (checkin_open_minutes is null or checkin_open_minutes between 0 and 180),
  add column if not exists checkin_close_minutes int null
    constraint batch_sessions_checkin_close_minutes_check check (checkin_close_minutes is null or checkin_close_minutes between 0 and 180);
