-- Per-viewer "delete for me" flags. A message can be hidden independently
-- for each side of the conversation regardless of who sent it.
alter table public.mentor_messages
  add column hidden_for_mentor boolean not null default false,
  add column hidden_for_student boolean not null default false;

-- Extend the broadcast trigger (0042) to also fire on DELETE, so
-- "delete for everyone" and "clear chat" (both hard deletes) update the
-- other party's open thread live. The deleted row is passed as the "new"
-- positional arg to realtime.broadcast_changes() so it lands in
-- payload.record, matching the shape useBroadcastChannel already expects.
create or replace function public.broadcast_mentor_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    perform realtime.broadcast_changes(
      'mentor_messages:' || old.conversation_id,
      'DELETE',
      'DELETE',
      'mentor_messages',
      'public',
      old,
      null
    );
    return old;
  else
    perform realtime.broadcast_changes(
      'mentor_messages:' || new.conversation_id,
      'INSERT',
      'INSERT',
      'mentor_messages',
      'public',
      new,
      null
    );
    return new;
  end if;
end;
$$;

drop trigger broadcast_mentor_messages on public.mentor_messages;

create trigger broadcast_mentor_messages
  after insert or delete on public.mentor_messages
  for each row execute function public.broadcast_mentor_messages();
