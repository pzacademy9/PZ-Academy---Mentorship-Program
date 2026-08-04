-- ============================================================
-- Migration 0009: Quiz system + lesson resources (Kahoot-style)
-- Run AFTER 0007. SQL Editor → New query → Run
-- ============================================================
-- Ports the real quiz + PDF-notes features from the legacy PPC/MDC
-- portals into the DB. Quiz gates lesson completion (replaces bare
-- Mark Complete for lessons that have questions). Scoring happens
-- server-side — correct_index is never sent to the client, unlike
-- the legacy portals which graded in public client-side JS.

-- ─── lessons: downloadable resources (PDF notes etc.) ──────────

alter table public.lessons
  add column if not exists resource_urls jsonb not null default '[]';

-- ─── QUIZ QUESTIONS ─────────────────────────────────────────────

create table public.quiz_questions (
  id            uuid primary key default gen_random_uuid(),
  lesson_id     uuid not null references public.lessons(id) on delete cascade,
  question      text not null,
  options       jsonb not null,
  correct_index integer not null,
  order_index   integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.quiz_questions enable row level security;

-- No select policy for authenticated/anon: all student access goes
-- through get_quiz() below, which never returns correct_index.
create policy "quiz_questions: admin read"
  on public.quiz_questions for select
  using (get_my_role() in ('admin', 'super_admin'));

-- ─── QUIZ ATTEMPTS ──────────────────────────────────────────────

create table public.quiz_attempts (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.profiles(id) on delete cascade,
  lesson_id       uuid not null references public.lessons(id) on delete cascade,
  score           integer not null,
  total           integer not null,
  passed          boolean not null,
  attempt_number  integer not null,
  created_at      timestamptz not null default now()
);

alter table public.quiz_attempts enable row level security;

create policy "quiz_attempts: student read own or admin"
  on public.quiz_attempts for select
  using (student_id = auth.uid() or get_my_role() in ('admin', 'super_admin'));

-- No insert policy: submit_quiz_attempt() is security definer and
-- inserts directly, bypassing RLS. Direct student inserts are denied.

-- ─── RPC: get_quiz — questions WITHOUT the answer key ──────────
-- Same unlock gate as the `lessons` content policy (0007): caller
-- must have an unlocked/completed lesson_progress row, or be admin.

create or replace function public.get_quiz(p_lesson_id uuid)
returns table (
  question_id  uuid,
  question     text,
  options      jsonb,
  order_index  integer
)
language sql
stable
security definer
set search_path = public
as $$
  select q.id, q.question, q.options, q.order_index
  from public.quiz_questions q
  where q.lesson_id = p_lesson_id
    and (
      get_my_role() in ('admin', 'super_admin')
      or exists (
        select 1 from public.lesson_progress lp
        where lp.lesson_id = p_lesson_id
          and lp.student_id = auth.uid()
          and lp.status in ('unlocked', 'completed')
      )
    )
  order by q.order_index asc;
$$;

grant execute on function public.get_quiz(uuid) to authenticated;

-- ─── RPC: submit_quiz_attempt — server-side scoring ────────────
-- p_answers: integer[] of selected option indices (0-based option
-- index, -1 for "timed out / no answer"), ordered to match
-- quiz_questions.order_index (client submits in that order).
-- Enforces the 3-attempt cap and the same unlock gate as
-- complete_lesson(). On a pass (>=50%), calls complete_lesson()
-- internally to reuse the existing drip-unlock logic verbatim.

create or replace function public.submit_quiz_attempt(p_lesson_id uuid, p_answers integer[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id      uuid;
  v_status         public.progress_status;
  v_attempt_count  integer;
  v_total          integer;
  v_score          integer := 0;
  v_passed         boolean;
  v_course_pct     integer;
  v_correct        integer;
  v_idx            integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select c.id into v_course_id
  from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id
  where l.id = p_lesson_id;

  if v_course_id is null then
    raise exception 'lesson not found';
  end if;

  if not exists (
    select 1 from public.enrollments e
    where e.course_id = v_course_id
      and e.student_id = auth.uid()
      and e.status = 'active'
  ) then
    raise exception 'not enrolled';
  end if;

  select status into v_status
  from public.lesson_progress
  where student_id = auth.uid() and lesson_id = p_lesson_id;

  if v_status is null or v_status = 'locked' then
    raise exception 'lesson is locked';
  end if;

  select count(*) into v_attempt_count
  from public.quiz_attempts
  where student_id = auth.uid() and lesson_id = p_lesson_id;

  if v_attempt_count >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'no_attempts_left');
  end if;

  select count(*) into v_total from public.quiz_questions where lesson_id = p_lesson_id;
  if v_total = 0 then
    raise exception 'lesson has no quiz';
  end if;

  -- Score: p_answers[i] (1-indexed, Postgres array convention) corresponds
  -- to the i-th question by order_index, matching the order get_quiz()
  -- returned them in.
  for v_correct, v_idx in
    select q.correct_index, row_number() over (order by q.order_index asc)
    from public.quiz_questions q
    where q.lesson_id = p_lesson_id
  loop
    if p_answers[v_idx] is not null and p_answers[v_idx] = v_correct then
      v_score := v_score + 1;
    end if;
  end loop;

  v_passed := (v_score::numeric / v_total::numeric) >= 0.5;

  insert into public.quiz_attempts (student_id, lesson_id, score, total, passed, attempt_number)
  values (auth.uid(), p_lesson_id, v_score, v_total, v_passed, v_attempt_count + 1);

  if v_passed then
    select public.complete_lesson(p_lesson_id) into v_course_pct;
  end if;

  return jsonb_build_object(
    'ok', true,
    'score', v_score,
    'total', v_total,
    'passed', v_passed,
    'attempt_number', v_attempt_count + 1,
    'attempts_left', 3 - (v_attempt_count + 1),
    'course_pct', v_course_pct
  );
end;
$$;

grant execute on function public.submit_quiz_attempt(uuid, integer[]) to authenticated;

-- ─── RPC: course_curriculum — add has_quiz flag ────────────────
-- Postgres won't let CREATE OR REPLACE change a RETURNS TABLE
-- signature, so the 0007 version is dropped and recreated here
-- with the added has_quiz column (unlock-status logic unchanged).

drop function if exists public.course_curriculum(uuid);

create function public.course_curriculum(p_course_id uuid)
returns table (
  module_id     uuid,
  module_title  text,
  module_order  integer,
  lesson_id     uuid,
  lesson_title  text,
  lesson_order  integer,
  content_type  public.lesson_content_type,
  status        public.progress_status,
  has_quiz      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.title,
    m.order_index,
    l.id,
    l.title,
    l.order_index,
    l.content_type,
    coalesce(lp.status, 'locked')::public.progress_status,
    exists (select 1 from public.quiz_questions qq where qq.lesson_id = l.id)
  from public.modules m
  join public.lessons l on l.module_id = m.id
  left join public.lesson_progress lp
    on lp.lesson_id = l.id
   and lp.student_id = auth.uid()
  where m.course_id = p_course_id
  order by m.order_index asc, l.order_index asc;
$$;

grant execute on function public.course_curriculum(uuid) to authenticated, anon;
