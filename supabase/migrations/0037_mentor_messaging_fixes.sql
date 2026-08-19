-- ============================================================
-- Migration 0037: Fix mentor_conversations identity-column immutability (subsystem D)
-- Run AFTER 0036. SQL Editor → New query → Run
-- ============================================================
-- Task 1's task review caught a real RLS gap: the "participants can update
-- their own read-marker" UPDATE policy on mentor_conversations has no
-- WITH CHECK pinning mentor_id/student_id to their prior values (RLS WITH
-- CHECK only inspects the new row, it cannot diff against the old one) --
-- so either participant could UPDATE the row to repoint mentor_id or
-- student_id to an arbitrary third party's uuid and thereby expose the
-- entire prior message history to them. Fixed with a trigger, since RLS
-- policies alone cannot express "these columns may not change."

create or replace function public.prevent_mentor_conversation_identity_change()
returns trigger
language plpgsql
as $$
begin
  if new.mentor_id <> old.mentor_id or new.student_id <> old.student_id then
    raise exception 'mentor_id and student_id are immutable on mentor_conversations';
  end if;
  return new;
end;
$$;

create trigger mentor_conversations_identity_immutable
  before update on public.mentor_conversations
  for each row
  execute function public.prevent_mentor_conversation_identity_change();
