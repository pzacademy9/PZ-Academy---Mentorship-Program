-- ============================================================
-- Migration 0038: Pin search_path on mentor_conversations trigger
-- Run AFTER 0037. SQL Editor → New query → Run
-- ============================================================
-- The prevent_mentor_conversation_identity_change trigger function (created
-- in 0037) was missing the `set search_path = public` declaration. Supabase
-- security advisors flagged this as "Function Search Path Mutable". This
-- migration adds the search_path pinning to match all other trigger and RPC
-- functions in the codebase. No logic change to the function itself.

create or replace function public.prevent_mentor_conversation_identity_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.mentor_id <> old.mentor_id or new.student_id <> old.student_id then
    raise exception 'mentor_id and student_id are immutable on mentor_conversations';
  end if;
  return new;
end;
$$;
