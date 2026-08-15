-- ============================================================
-- Migration 0033: Native feedback system
-- Run AFTER 0032. SQL Editor → New query → Run
-- ============================================================
-- Sessions, programs, question bank, responses, answers, audit log.
-- Service-role-only tables: RLS enabled, no policies (see plan's Global
-- Constraints) — every read/write goes through an admin-client route handler.

create type public.feedback_session_status as enum ('active', 'closed');
create type public.feedback_question_type as enum ('stars', 'video');
create type public.feedback_program_type as enum ('workshop', 'course');

create table public.feedback_programs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  type         public.feedback_program_type not null,
  cover_url    text,
  share_token  text unique,
  created_at   timestamptz not null default now()
);

create table public.feedback_sessions (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  speaker_name           text not null,
  session_date           text,
  status                 public.feedback_session_status not null default 'active',
  slug                   text not null unique,
  program_id             uuid references public.feedback_programs(id) on delete set null,
  program_order          integer,
  cover_url              text,
  share_token            text unique,
  mentorship_session_id  uuid references public.sessions(id) on delete set null,
  mentor_id              uuid references public.mentors(id) on delete set null,
  created_at             timestamptz not null default now()
);
create index feedback_sessions_program_id_idx on public.feedback_sessions(program_id);
create index feedback_sessions_mentorship_session_id_idx on public.feedback_sessions(mentorship_session_id);
create index feedback_sessions_mentor_id_idx on public.feedback_sessions(mentor_id);

create table public.feedback_questions (
  id                 uuid primary key default gen_random_uuid(),
  feedback_session_id uuid not null references public.feedback_sessions(id) on delete cascade,
  text               text not null,
  type               public.feedback_question_type not null default 'stars',
  question_order     integer not null
);
create index feedback_questions_session_id_idx on public.feedback_questions(feedback_session_id);

create table public.feedback_question_bank (
  id             uuid primary key default gen_random_uuid(),
  text           text not null,
  type           public.feedback_question_type not null default 'stars',
  default_order  integer not null,
  is_mentorship_default boolean not null default false
);

create table public.feedback_responses (
  id                     uuid primary key default gen_random_uuid(),
  feedback_session_id    uuid not null references public.feedback_sessions(id) on delete cascade,
  participant_name       text not null default '',
  participant_email      text,
  participant_profile_id uuid references public.profiles(id) on delete set null,
  comments               text not null default '',
  submitted_at           timestamptz not null default now()
);
create index feedback_responses_session_id_idx on public.feedback_responses(feedback_session_id);
create index feedback_responses_session_email_idx on public.feedback_responses(feedback_session_id, participant_email);

create table public.feedback_answers (
  id           uuid primary key default gen_random_uuid(),
  response_id  uuid not null references public.feedback_responses(id) on delete cascade,
  question_id  uuid not null references public.feedback_questions(id) on delete cascade,
  star_value   integer check (star_value >= 1 and star_value <= 5),
  video_url    text,
  constraint feedback_answers_one_value check (
    (star_value is not null and video_url is null) or
    (star_value is null and video_url is not null) or
    (star_value is null and video_url is null)
  )
);
create index feedback_answers_response_id_idx on public.feedback_answers(response_id);

create table public.feedback_audit_log (
  id               uuid primary key default gen_random_uuid(),
  action           text not null,
  detail           text not null default '',
  actor_profile_id uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

alter table public.feedback_programs      enable row level security;
alter table public.feedback_sessions      enable row level security;
alter table public.feedback_questions     enable row level security;
alter table public.feedback_question_bank enable row level security;
alter table public.feedback_responses     enable row level security;
alter table public.feedback_answers       enable row level security;
alter table public.feedback_audit_log     enable row level security;

-- Seed the default question bank (ports Config.gs's DEFAULT_QUESTIONS).
insert into public.feedback_question_bank (text, type, default_order, is_mentorship_default) values
  ('How would you rate this session overall?', 'stars', 1, true),
  ('How would you rate the speaker?', 'stars', 2, true),
  ('How relevant was the content to your work/studies?', 'stars', 3, true),
  ('How was the session organization/logistics (timing, platform, audio/video)?', 'stars', 4, false),
  ('Anything you''d like us to improve or add next time?', 'stars', 5, false);
