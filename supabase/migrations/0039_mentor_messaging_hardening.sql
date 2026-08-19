-- ============================================================
-- Migration 0039: Close mentor_notes RLS exposure + subsystem D hardening
-- Run AFTER 0038. SQL Editor → New query → Run
-- ============================================================
-- Final whole-branch review caught a real gap: sessions.mentor_notes
-- (activated by this branch -- migration 0038 onward writes real content
-- to it for the first time) is exposed by the pre-existing "sessions:
-- student own or mentor own or admin" SELECT policy from 0002 -- RLS is
-- row-level, not column-level, so a student can read their own session
-- row including mentor_notes directly via PostgREST, contradicting the
-- UI's explicit "only you can see this" promise. Closed by revoking
-- column-level SELECT on mentor_notes from anon/authenticated --
-- service-role reads (listUpcomingSessionsForMentor) are unaffected, and
-- no browser-side code queries public.sessions at all (confirmed:
-- createBrowserSupabase only appears in auth components, Topbar, and
-- MessageThread).
--
-- Also folds in three review-flagged hardening items on the two new
-- messaging tables, all no-op for the app's own read/write paths:
-- qualify the ambiguous column reference inside the mentor_messages RLS
-- subqueries, wrap auth.uid() in a subselect so Postgres evaluates it
-- once per statement instead of once per row (Supabase's own performance
-- advisor flags the unwrapped form), and drop the redundant mentor_id-only
-- index on mentor_conversations (already covered by the leading column of
-- the unique (mentor_id, student_id) index) in favor of an index on
-- mentor_messages.sender_id, which had none.

revoke select (mentor_notes) on public.sessions from anon, authenticated;

drop index public.mentor_conversations_mentor_id_idx;
create index mentor_messages_sender_id_idx on public.mentor_messages (sender_id);

drop policy "participants can read their conversation" on public.mentor_conversations;
create policy "participants can read their conversation"
  on public.mentor_conversations for select
  using ((select auth.uid()) = mentor_id or (select auth.uid()) = student_id);

drop policy "participants can update their own read-marker" on public.mentor_conversations;
create policy "participants can update their own read-marker"
  on public.mentor_conversations for update
  using ((select auth.uid()) = mentor_id or (select auth.uid()) = student_id);

drop policy "participants can read their messages" on public.mentor_messages;
create policy "participants can read their messages"
  on public.mentor_messages for select
  using (
    exists (
      select 1 from public.mentor_conversations c
      where c.id = mentor_messages.conversation_id
        and ((select auth.uid()) = c.mentor_id or (select auth.uid()) = c.student_id)
    )
  );

drop policy "participants can send messages" on public.mentor_messages;
create policy "participants can send messages"
  on public.mentor_messages for insert
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.mentor_conversations c
      where c.id = mentor_messages.conversation_id
        and ((select auth.uid()) = c.mentor_id or (select auth.uid()) = c.student_id)
    )
  );
