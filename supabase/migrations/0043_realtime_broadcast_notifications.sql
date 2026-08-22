-- ============================================================
-- Migration 0043: Realtime Broadcast for notifications
-- Run AFTER 0042. SQL Editor -> New query -> Run
-- ============================================================
-- Second consumer of the useBroadcastChannel pattern introduced in 0042 --
-- the bell/history never had live delivery at all before this (only a
-- refresh on navigation). Topic is per-recipient, not per-conversation.
--
-- Wrapper function, not a direct `execute function realtime.broadcast_changes(...)`
-- call: CREATE TRIGGER's EXECUTE FUNCTION clause only accepts literal
-- arguments, not expressions like `new.user_id` concatenation (confirmed by
-- migration 0042 hitting `ERROR: 42601: syntax error at or near "||"` on
-- exactly this pattern) -- this wrapper is also Supabase's own documented
-- shape for "Broadcast from Database". security definer is required here:
-- realtime.broadcast_changes() needs elevated privilege to write into
-- realtime.messages regardless of which role performed the original insert.
-- No explicit anon/authenticated revoke needed (unlike a normal callable
-- SECURITY DEFINER function) -- a `returns trigger` function cannot be
-- invoked directly via PostgREST RPC or a plain SELECT; Postgres rejects
-- that with "trigger functions can only be called as triggers".

create or replace function public.broadcast_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.broadcast_changes(
    'notifications:' || new.user_id,
    'INSERT',
    'INSERT',
    'notifications',
    'public',
    new,
    null
  );
  return new;
end;
$$;

create trigger broadcast_notifications
  after insert on public.notifications
  for each row execute function public.broadcast_notifications();

create policy "notifications broadcast: own only"
  on realtime.messages for select
  to authenticated
  using (
    realtime.topic() = 'notifications:' || (select auth.uid())::text
  );
