-- 0111_leaderboard_revenue_price.sql
-- Fix: the agent leaderboard revenue mixed currencies. amount_received has no currency of its own and
-- can hold a different one (a PKR amount on a SAR row showed as 12,500 SAR). Revenue now sums
-- expected_amount, the price in the row's own currency, per currency, never converted.
-- Replaces landing_leaderboard from 0083 only. Service role only. The owner pastes this in the
-- Supabase SQL editor. Safe to run twice.

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
           r.expected_amount as amount,
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
