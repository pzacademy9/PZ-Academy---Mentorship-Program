-- ============================================================
-- Migration 0046: Mentor review summary aggregation function
-- Run AFTER 0045. SQL Editor → New query → Run
-- ============================================================
-- getMentorReviewSummary(ies) in src/lib/data/mentor-reviews.ts used to fetch
-- every public, commented feedback_responses row (plus nested
-- feedback_answers) for a mentor into JS and reduce them there via
-- summarizeStarValues(). PostgREST caps result sets (commonly db-max-rows =
-- 1000) — past that cap the star average and distribution shown on mentor
-- cards/profiles were silently wrong with no error. This is the exact bug
-- 0034 fixed for feedback session stats; mentor_tier_inputs (0045) was built
-- immune to it from the start but this older read path was not.
--
-- Inclusion rule matches summarizeStarValues() exactly (is_public = true AND
-- a non-empty comment — the same rule listMentorReviews uses to decide what
-- to render), NOT mentor_tier_inputs's rule (which drops the comment
-- requirement and requires >=1 star answer). These two rollups answer
-- different questions on purpose: this one mirrors "what review text can a
-- visitor see", tiering mirrors "what has this mentor actually earned".
--
-- Per-response average first, then average of those, matching
-- summarizeStarValues — a response answering 3 star questions does not
-- outweigh one answering 1. A response with zero star answers still counts
-- toward response_count (it's a real public review) but contributes nothing
-- to avg_star or the distribution buckets.
--
-- No SECURITY DEFINER: called only through createAdminSupabase()
-- (service_role), which already bypasses RLS — same rule as 0034/0045.
create or replace function public.mentor_review_stats(p_mentor_ids uuid[])
returns table (
  mentor_id      uuid,
  response_count bigint,
  avg_star       numeric,
  star_1         bigint,
  star_2         bigint,
  star_3         bigint,
  star_4         bigint,
  star_5         bigint
)
language sql
stable
as $$
  with commented as (
    select r.id, fs.mentor_id
    from public.feedback_responses r
    join public.feedback_sessions fs on fs.id = r.feedback_session_id
    where fs.mentor_id = any(p_mentor_ids)
      and r.is_public
      and coalesce(trim(r.comments), '') <> ''
  ),
  response_avgs as (
    select c.id, c.mentor_id, avg(a.star_value) as response_avg
    from commented c
    left join public.feedback_answers a
      on a.response_id = c.id
     and a.star_value is not null
    group by c.id, c.mentor_id
  ),
  bucketed as (
    select
      mentor_id,
      response_avg,
      case when response_avg is null then null
           else least(5, greatest(1, round(response_avg)::int))
      end as bucket
    from response_avgs
  )
  select
    mentor_id,
    count(*)::bigint as response_count,
    round(avg(response_avg), 1) as avg_star,
    count(*) filter (where bucket = 1)::bigint as star_1,
    count(*) filter (where bucket = 2)::bigint as star_2,
    count(*) filter (where bucket = 3)::bigint as star_3,
    count(*) filter (where bucket = 4)::bigint as star_4,
    count(*) filter (where bucket = 5)::bigint as star_5
  from bucketed
  group by mentor_id;
$$;

grant execute on function public.mentor_review_stats(uuid[]) to service_role;
