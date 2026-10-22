-- 0083_agent_stats.sql
-- Numbers for the sales "My links" screen and the admin agent leaderboard.
-- Counting happens in SQL because the Supabase client returns at most 1000 rows per request.
-- Service role only. The owner pastes this in the Supabase SQL editor. Safe to run twice.
--
-- Counting rules (the same rules are written in TypeScript in src/lib/landing/agent-stats-rules.ts):
--   * One sale = a lead row or an individual row (row_type in ('individual','lead')), is_test = false.
--     Member rows are never counted.
--   * registered = sales carrying the agent's id, by created_at.
--   * paid = sales whose status is 'paid' RIGHT NOW. In a time window, the date of a paid sale is the
--     earliest landing_status_events.at with to_status = 'paid' (Paid, Pending, Paid keeps the first date);
--     a paid sale with no such event falls back to created_at.
--   * revenue = amount_received if set, else expected_amount, for paid sales, summed per currency
--     (never converted, never one total).
--   * views = distinct session_id of 'view' funnel events carrying the agent's id, per page.

-- ------------------------------------------------------------ per-agent numbers, one row per page
create or replace function public.landing_agent_link_stats(p_agent_id uuid)
returns table (page_id uuid, views integer, registered integer, paid integer)
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select f.page_id as pid, count(distinct f.session_id)::integer as n
      from public.landing_funnel_events f
     where f.agent_id = p_agent_id and f.type = 'view'
     group by f.page_id
  ),
  s as (
    select r.page_id as pid,
           count(*)::integer as registered,
           (count(*) filter (where r.status = 'paid'))::integer as paid
      from public.landing_registrations r
     where r.agent_id = p_agent_id
       and r.row_type in ('individual', 'lead')
       and r.is_test = false
     group by r.page_id
  )
  select coalesce(v.pid, s.pid) as page_id,
         coalesce(v.n, 0) as views,
         coalesce(s.registered, 0) as registered,
         coalesce(s.paid, 0) as paid
    from v
    full outer join s on s.pid = v.pid;
$$;

revoke all on function public.landing_agent_link_stats(uuid) from public, anon, authenticated;
grant execute on function public.landing_agent_link_stats(uuid) to service_role;

-- ------------------------------------------------------------ leaderboard, one row per sales agent
-- p_from = start of the window (null = all time).
create or replace function public.landing_leaderboard(p_from timestamptz default null)
returns table (agent_id uuid, name text, registered integer, paid integer, revenue jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with sales as (
    select r.agent_id as aid,
           r.created_at as created_at,
           r.status as status,
           r.currency as currency,
           coalesce(r.amount_received, r.expected_amount) as amount,
           (select min(e.at)
              from public.landing_status_events e
             where e.registration_id = r.id and e.to_status = 'paid') as first_paid_at
      from public.landing_registrations r
     where r.agent_id is not null
       and r.row_type in ('individual', 'lead')
       and r.is_test = false
  ),
  reg as (
    select s.aid, count(*)::integer as n
      from sales s
     where p_from is null or s.created_at >= p_from
     group by s.aid
  ),
  paid_sales as (
    select s.aid, s.currency, s.amount
      from sales s
     where s.status = 'paid'
       and (p_from is null or coalesce(s.first_paid_at, s.created_at) >= p_from)
  ),
  paid_n as (
    select ps.aid, count(*)::integer as n
      from paid_sales ps
     group by ps.aid
  ),
  per_currency as (
    select ps.aid, ps.currency, sum(ps.amount) as total
      from paid_sales ps
     group by ps.aid, ps.currency
  ),
  rev as (
    select pc.aid,
           jsonb_agg(jsonb_build_object('currency', pc.currency, 'amount', pc.total) order by pc.currency) as items
      from per_currency pc
     group by pc.aid
  )
  select p.id as agent_id,
         coalesce(p.full_name, '') as name,
         coalesce(reg.n, 0) as registered,
         coalesce(paid_n.n, 0) as paid,
         coalesce(rev.items, '[]'::jsonb) as revenue
    from public.profiles p
    left join reg on reg.aid = p.id
    left join paid_n on paid_n.aid = p.id
    left join rev on rev.aid = p.id
   where p.role = 'sales_agent'
   order by coalesce(paid_n.n, 0) desc, coalesce(reg.n, 0) desc, p.full_name asc;
$$;

revoke all on function public.landing_leaderboard(timestamptz) from public, anon, authenticated;
grant execute on function public.landing_leaderboard(timestamptz) to service_role;
