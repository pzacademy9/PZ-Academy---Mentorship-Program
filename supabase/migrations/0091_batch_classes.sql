-- 0091: batch classes. One setup screen creates all classes of a batch.
-- landing_pages: batch-wide class defaults (time, zoom, cover) + the feedback program
-- the generated classes hang their feedback sessions on.
-- batch_sessions: end time, speaker, link to its feedback session, and two flags saying
-- whether the class has its own time / zoom (true) or follows the batch default (false).
-- Existing sessions default to custom = true, so changing a default never touches them.
-- participant_sends.session_kind now also allows 'feedback'. The one-reminder-per-session
-- unique index is left exactly as is.
-- No data is deleted or rewritten. Safe to re-run.

-- ------------------------------------------------------------ batch defaults
alter table public.landing_pages
  add column if not exists class_default_start time;
alter table public.landing_pages
  add column if not exists class_default_end time;
alter table public.landing_pages
  add column if not exists class_default_zoom text not null default '';
alter table public.landing_pages
  add column if not exists class_cover_url text;
alter table public.landing_pages
  add column if not exists feedback_program_id uuid
  references public.feedback_programs (id) on delete set null;

-- ------------------------------------------------------------ per-class columns
alter table public.batch_sessions
  add column if not exists ends_at timestamptz;
alter table public.batch_sessions
  add column if not exists speaker text not null default '';
alter table public.batch_sessions
  add column if not exists feedback_session_id uuid
  references public.feedback_sessions (id) on delete set null;
alter table public.batch_sessions
  add column if not exists custom_time boolean not null default true;
alter table public.batch_sessions
  add column if not exists custom_zoom boolean not null default true;

-- ------------------------------------------------------------ send kinds
-- 0089 declared the kind check inline, so Postgres named it participant_sends_session_kind_check.
alter table public.participant_sends
  drop constraint if exists participant_sends_session_kind_check;
alter table public.participant_sends
  drop constraint if exists participant_sends_session_kind_check_v2;
alter table public.participant_sends
  add constraint participant_sends_session_kind_check_v2
  check (session_kind in ('reminder','update','feedback'));
