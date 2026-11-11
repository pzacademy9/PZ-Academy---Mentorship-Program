-- 0112_affiliate_leaderboard.sql
-- Leaderboards for affiliates. Adds (1) one function that gives the numbers behind the board and (2) a table that
-- holds the one secret token of the public board link.
-- Service role only (RLS on, no policies; the function is granted to service_role alone). The owner pastes this in
-- the Supabase SQL editor. Safe to run twice (the token is made once and kept).
--
-- Board rules (the ordering and the team rules are written in TypeScript in src/lib/affiliates/leaderboard.ts):
--   * only affiliates with status 'accepted' are listed; every one of them gets a row, even with zero sales.
--   * paid       = live (not cancelled) rows in affiliate_commissions, inside the window. All time (p_from is null)
--                  also adds opening_secured, the sales imported from before the app. A window never counts them.
--   * registered = real sales (lead or individual rows, not test) credited to the affiliate, by created_at, inside
--                  the window. Opening sales are not registered.
--   * p_from = start of the window (for "this month", the 1st at 00:00 Pakistan time, worked out by the app).

-- ------------------------------------------------------------ the public link token (one row only)
-- Made from two random ids with the dashes taken out: 48 letters and digits, so it fits ^[A-Za-z0-9_-]{20,64}$.
create table if not exists public.affiliate_board_link (
  id         boolean primary key default true check (id),
  token      text not null check (token ~ '^[A-Za-z0-9_-]{20,64}$'),
  rotated_at timestamptz not null default now()
);
alter table public.affiliate_board_link enable row level security;

insert into public.affiliate_board_link (id, token)
values (true, left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 48))
on conflict (id) do nothing;

-- ------------------------------------------------------------ the numbers behind the board, one row per affiliate
create or replace function public.affiliate_leaderboard(p_from timestamptz default null)
returns table (affiliate_id uuid, name text, team text, registered integer, paid integer)
language sql
stable
security definer
set search_path = public
as $$
  select a.id as affiliate_id,
         a.name,
         a.team,
         coalesce(r.n, 0)::integer as registered,
         ((case when p_from is null then a.opening_secured else 0 end) + coalesce(c.n, 0))::integer as paid
    from public.affiliates a
    left join (
      select x.affiliate_id as aid, count(*) as n
        from public.landing_registrations x
       where x.affiliate_id is not null
         and x.row_type in ('individual', 'lead')
         and x.is_test = false
         and (p_from is null or x.created_at >= p_from)
       group by x.affiliate_id
    ) r on r.aid = a.id
    left join (
      select k.affiliate_id as aid, count(*) as n
        from public.affiliate_commissions k
       where k.voided_at is null
         and (p_from is null or k.created_at >= p_from)
       group by k.affiliate_id
    ) c on c.aid = a.id
   where a.status = 'accepted';
$$;

revoke all on function public.affiliate_leaderboard(timestamptz) from public, anon, authenticated;
grant execute on function public.affiliate_leaderboard(timestamptz) to service_role;
