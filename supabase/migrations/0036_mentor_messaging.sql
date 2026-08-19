-- ============================================================
-- Migration 0036: Mentor-mentee messaging (subsystem D)
-- Run AFTER 0035. SQL Editor → New query → Run
-- ============================================================
-- See docs/superpowers/specs/2026-08-19-mentor-messaging-notes-design.md.
-- Two new tables, both with real RLS (this repo already uses RLS
-- consistently -- see 0002/0025/0033 -- but this is the first table whose
-- policies also have to authorize a live client-side Realtime
-- subscription, not just an occasional REST read). Conversations are
-- created lazily by the app on first send, never directly by a client --
-- no INSERT policy on mentor_conversations for that reason.

create table public.mentor_conversations (
  id                    uuid primary key default gen_random_uuid(),
  mentor_id             uuid not null references public.profiles(id) on delete cascade,
  student_id            uuid not null references public.profiles(id) on delete cascade,
  created_at            timestamptz not null default now(),
  last_message_at       timestamptz,
  mentor_last_read_at   timestamptz,
  student_last_read_at  timestamptz,
  unique (mentor_id, student_id)
);

create index mentor_conversations_mentor_id_idx on public.mentor_conversations (mentor_id);
create index mentor_conversations_student_id_idx on public.mentor_conversations (student_id);

create table public.mentor_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.mentor_conversations(id) on delete cascade,
  sender_id        uuid not null references public.profiles(id) on delete cascade,
  body             text not null,
  created_at       timestamptz not null default now()
);

create index mentor_messages_conversation_id_created_at_idx
  on public.mentor_messages (conversation_id, created_at);

alter table public.mentor_conversations enable row level security;
alter table public.mentor_messages enable row level security;

create policy "participants can read their conversation"
  on public.mentor_conversations for select
  using (auth.uid() = mentor_id or auth.uid() = student_id);

create policy "participants can update their own read-marker"
  on public.mentor_conversations for update
  using (auth.uid() = mentor_id or auth.uid() = student_id);

create policy "participants can read their messages"
  on public.mentor_messages for select
  using (
    exists (
      select 1 from public.mentor_conversations c
      where c.id = conversation_id
        and (auth.uid() = c.mentor_id or auth.uid() = c.student_id)
    )
  );

create policy "participants can send messages"
  on public.mentor_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.mentor_conversations c
      where c.id = conversation_id
        and (auth.uid() = c.mentor_id or auth.uid() = c.student_id)
    )
  );

-- postgres_changes only fires for tables in this publication -- independent
-- of RLS, and easy to forget silently (everything else about the feature
-- would still work except live delivery).
alter publication supabase_realtime add table public.mentor_messages;
