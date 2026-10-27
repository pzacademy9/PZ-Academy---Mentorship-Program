-- 0090: quiz results per session + remembered review decisions.
-- batch_quiz_results: one row per (session, person) with the Kahoot score. Live and
-- recorded students are both stored; leaderboards filter to live in the app.
-- batch_quiz_decisions: duplicate / alias / skip choices made on the review screen,
-- remembered so a re-upload pre-applies them.
-- batch_quiz_save(): replaces a whole session's results in ONE transaction, so a failed
-- save never leaves a half-saved session.
-- Service-role only: RLS on, zero policies (same convention as 0077 / 0088 / 0089).
-- pz_merge_people now moves quiz results too (higher score wins per session).
-- Safe to re-run.

-- ------------------------------------------------------------ session columns
alter table public.batch_sessions
  add column if not exists quiz_max_score int
  check (quiz_max_score is null or quiz_max_score > 0);
alter table public.batch_sessions
  add column if not exists quiz_file_name text;
alter table public.batch_sessions
  add column if not exists quiz_saved_at timestamptz;

-- ------------------------------------------------------------ tables
create table if not exists public.batch_quiz_results (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.batch_sessions (id) on delete cascade,
  person_id  uuid not null references public.pz_people (id) on delete cascade,
  score      int not null check (score >= 0),
  correct    int not null default 0 check (correct >= 0),
  incorrect  int not null default 0 check (incorrect >= 0),
  player     text not null default '',
  imported   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_id, person_id)
);
create index if not exists batch_quiz_results_person_idx
  on public.batch_quiz_results (person_id);

create table if not exists public.batch_quiz_decisions (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.batch_sessions (id) on delete cascade,
  kind       text not null check (kind in ('duplicate','alias','skip')),
  key        text not null,
  choice     text not null default '',
  person_id  uuid references public.pz_people (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, kind, key)
);

alter table public.batch_quiz_results enable row level security;
alter table public.batch_quiz_decisions enable row level security;

-- ------------------------------------------------------------ save
-- p_rows: [{ "person_id": uuid, "score": int, "correct": int, "incorrect": int, "player": text }]
-- Returns the number of rows saved. Runs as one transaction (a function body is atomic).
create or replace function public.batch_quiz_save(
  p_session uuid,
  p_max     int,
  p_file    text,
  p_rows    jsonb
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  if p_session is null or not exists (select 1 from public.batch_sessions where id = p_session) then
    raise exception 'batch_quiz_save: session not found';
  end if;
  if p_max is null or p_max <= 0 then
    raise exception 'batch_quiz_save: maximum score must be positive';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'batch_quiz_save: rows must be an array';
  end if;

  delete from public.batch_quiz_results where session_id = p_session;

  insert into public.batch_quiz_results (session_id, person_id, score, correct, incorrect, player)
  select p_session, r.person_id, r.score, coalesce(r.correct, 0), coalesce(r.incorrect, 0), coalesce(r.player, '')
    from jsonb_to_recordset(p_rows)
      as r(person_id uuid, score int, correct int, incorrect int, player text);
  get diagnostics v_count = row_count;

  update public.batch_sessions
     set quiz_max_score = p_max,
         quiz_file_name = nullif(p_file, ''),
         quiz_saved_at  = now()
   where id = p_session;

  return v_count;
end;
$$;

revoke all on function public.batch_quiz_save(uuid, int, text, jsonb) from public, anon, authenticated;
grant execute on function public.batch_quiz_save(uuid, int, text, jsonb) to service_role;

-- ------------------------------------------------------------ merge
-- Folds person p_drop into p_keep. The dropped PZ ID stays valid as an alias.
-- Attendance marks and quiz results move too. Marks: the kept person's mark wins.
-- Quiz results: for a session both have, the higher score wins.
create or replace function public.pz_merge_people(p_keep uuid, p_drop uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_keep is null or p_drop is null then
    raise exception 'pz_merge_people: both ids are required';
  end if;
  if p_keep = p_drop then
    raise exception 'pz_merge_people: cannot merge a person into itself';
  end if;
  -- lock both rows, lower uuid first, so concurrent merges cannot deadlock
  perform 1
    from public.pz_people
   where id in (p_keep, p_drop)
   order by id
     for update;
  if not exists (select 1 from public.pz_people where id = p_keep)
     or not exists (select 1 from public.pz_people where id = p_drop) then
    raise exception 'pz_merge_people: person not found';
  end if;

  update public.pz_person_emails set person_id = p_keep where person_id = p_drop;
  update public.pz_id_aliases set person_id = p_keep where person_id = p_drop;
  update public.landing_registrations set person_id = p_keep where person_id = p_drop;

  insert into public.batch_session_marks (session_id, person_id, source, marked_at, marked_by)
  select session_id, p_keep, source, marked_at, marked_by
    from public.batch_session_marks
   where person_id = p_drop
  on conflict do nothing;
  delete from public.batch_session_marks where person_id = p_drop;

  insert into public.batch_quiz_results (session_id, person_id, score, correct, incorrect, player, imported)
  select session_id, p_keep, score, correct, incorrect, player, imported
    from public.batch_quiz_results
   where person_id = p_drop
  on conflict (session_id, person_id) do update
    set score     = excluded.score,
        correct   = excluded.correct,
        incorrect = excluded.incorrect,
        player    = excluded.player,
        imported  = excluded.imported
    where excluded.score > public.batch_quiz_results.score;
  delete from public.batch_quiz_results where person_id = p_drop;

  delete from public.pz_people where id = p_drop;
end;
$$;

revoke all on function public.pz_merge_people(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pz_merge_people(uuid, uuid) to service_role;
