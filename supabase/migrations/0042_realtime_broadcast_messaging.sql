-- Helper function to construct the topic and call broadcast_changes
create or replace function public.broadcast_mentor_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
end;
$$;

create trigger broadcast_mentor_messages
  after insert on public.mentor_messages
  for each row execute function public.broadcast_mentor_messages();

-- Private channels only enforce RLS when the caller opts into
-- config.private = true client-side -- this policy is what actually gets
-- checked at subscribe time. Mirrors mentor_messages' own SELECT policy
-- (0036/0039): only the two participants in the conversation may read.
create policy "mentor_messages broadcast: participants only"
  on realtime.messages for select
  to authenticated
  using (
    realtime.topic() like 'mentor_messages:%'
    and exists (
      select 1 from public.mentor_conversations c
      where c.id = (split_part(realtime.topic(), ':', 2))::uuid
        and ((select auth.uid()) = c.mentor_id or (select auth.uid()) = c.student_id)
    )
  );
