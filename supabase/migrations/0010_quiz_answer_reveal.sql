-- ============================================================
-- Migration 0010: Per-question answer reveal (Kahoot-style UX)
-- Run AFTER 0009. SQL Editor → New query → Run
-- ============================================================
-- submit_quiz_attempt (0009) grades the whole quiz at once and is
-- the only thing that writes an attempt row / unlocks the next
-- lesson. This RPC is purely cosmetic: it lets the client reveal
-- the correct tile immediately after the student answers ONE
-- question, matching Kahoot's real behavior (reveal-after-answer,
-- one question at a time — not the whole answer key upfront, which
-- is what the legacy portal insecurely did).

create or replace function public.check_quiz_answer(p_question_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select q.correct_index
  from public.quiz_questions q
  where q.id = p_question_id
    and (
      get_my_role() in ('admin', 'super_admin')
      or exists (
        select 1 from public.lesson_progress lp
        where lp.lesson_id = q.lesson_id
          and lp.student_id = auth.uid()
          and lp.status in ('unlocked', 'completed')
      )
    );
$$;

grant execute on function public.check_quiz_answer(uuid) to authenticated;
