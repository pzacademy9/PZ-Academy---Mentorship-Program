-- ============================================================
-- Migration 0034: Feedback session stats aggregation function
-- Run AFTER 0033. SQL Editor → New query → Run
-- ============================================================
-- hydrateStats() in src/lib/data/feedback-sessions.ts used to fetch every
-- feedback_responses row and every star-valued feedback_answers row across
-- ALL requested sessions into JS and average them there. PostgREST caps
-- result sets (commonly 1000 rows via db-max-rows) — past that cap the
-- computed response counts/averages were silently wrong with no error, on
-- the hot path for both /dashboard/admin/feedback and
-- /dashboard/mentor/feedback. This pushes the aggregation into Postgres
-- instead, returning one row per session no matter how many responses/
-- answers exist underneath it.
--
-- No SECURITY DEFINER: called only via the service-role admin client
-- (createAdminSupabase()), which already bypasses RLS — matches this
-- system's Global Constraint of not using SECURITY DEFINER anywhere.

create or replace function public.feedback_session_stats(p_session_ids uuid[])
returns table (feedback_session_id uuid, response_count bigint, avg_star numeric)
language sql
stable
as $$
  select
    r.feedback_session_id,
    count(distinct r.id) as response_count,
    round(avg(a.star_value), 1) as avg_star
  from public.feedback_responses r
  left join public.feedback_answers a on a.response_id = r.id
  where r.feedback_session_id = any(p_session_ids)
  group by r.feedback_session_id;
$$;

grant execute on function public.feedback_session_stats(uuid[]) to service_role;
