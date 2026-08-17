-- Migration 0035: per-response and per-mentor review visibility controls.
-- New responses default public (admin decision: populate profiles with zero
-- setup, hide individual bad ones after the fact — see plan decision log).

alter table public.feedback_responses
  add column is_public boolean not null default true,
  add column is_featured boolean not null default false;

alter table public.mentors
  add column show_reviews boolean not null default true;

create index feedback_responses_public_idx
  on public.feedback_responses (feedback_session_id) where is_public;
