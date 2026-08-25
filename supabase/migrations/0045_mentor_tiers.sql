-- ============================================================
-- Migration 0045: Mentor tier ladder (computed score + admin pin)
-- Run AFTER 0044. SQL Editor → New query → Run
-- ============================================================
-- Adds a 4-rung tier ladder to public.mentors (standard/premium/platinum/
-- elite), computed from public reviews and completed sessions, with an
-- admin pin that overrides the computed value.
--
-- Public mentor reads go through the ANON client (getPublishedMentors), but
-- every tier input lives behind the feedback tables, which carry RLS
-- enabled with zero policies since 0033 — service-role only. A tier
-- therefore CANNOT be computed at public read time; it is materialized onto
-- public.mentors, which the existing "mentors: public read published"
-- policy (0028) already exposes to anon.
--
-- Scoring math deliberately does NOT live in SQL. It lives in
-- src/lib/mentor-tier.ts as a pure, vitest-covered function; this migration
-- only supplies (a) the storage, (b) a truncation-proof input rollup, and
-- (c) safe defaults so the app works the instant this applies.

-- ─── 1. Tier enum ────────────────────────────────────────────
-- Declaration order IS the sort order: Postgres orders enums by the order
-- values were declared, so `order by tier desc` yields elite → platinum →
-- premium → standard with no CASE expression and no ordinal column.
-- 'standard' is first (the floor) precisely so DESC puts it last.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'mentor_tier') then
    create type public.mentor_tier as enum ('standard', 'premium', 'platinum', 'elite');
  end if;
end $$;

-- ─── 2. Storage: computed vs pinned vs effective ─────────────
-- Three columns, not one. tier_computed is machine-owned and is overwritten
-- wholesale on every recompute. tier_override is human-owned and NULL means
-- "not pinned". tier is a STORED GENERATED column so the effective value
-- can never drift from the pair, can be indexed and sorted by PostgREST,
-- and is rejected on write by PostgREST — nothing in app code can
-- accidentally set it.
--
-- NOT reviving mentors.total_sessions (0001): it is an untouched integer
-- with a `not null default 0` and no writer anywhere, so every existing row
-- reads a truthful-looking 0 that is actually "never measured". Reusing it
-- would make "0 sessions" and "unmeasured" indistinguishable, and its name
-- promises ALL sessions where this subsystem needs only status='completed'.
-- A fresh, precisely-named column with a sibling tier_computed_at timestamp
-- makes "we have never scored this mentor" observable. Leave total_sessions
-- alone; a later migration can drop it once someone owns that cleanup.
alter table public.mentors
  add column if not exists tier_computed      public.mentor_tier not null default 'standard',
  add column if not exists tier_override      public.mentor_tier,
  add column if not exists tier_score         numeric(5,1) not null default 0,
  add column if not exists tier_rating_avg    numeric(3,2),
  add column if not exists tier_review_count  integer not null default 0,
  add column if not exists tier_session_count integer not null default 0,
  add column if not exists tier_computed_at   timestamptz;

alter table public.mentors
  add column if not exists tier public.mentor_tier
  generated always as (coalesce(tier_override, tier_computed)) stored;

comment on column public.mentors.tier_computed is
  'Machine-derived tier from computeMentorTier() in src/lib/mentor-tier.ts. '
  'Overwritten wholesale by recomputeMentorTiers(); never edited by hand.';
comment on column public.mentors.tier_override is
  'Admin pin. NULL = follow tier_computed. Wins unconditionally when set — '
  'the admin form shows both values side by side so the pin is never silent.';
comment on column public.mentors.tier is
  'Effective tier = coalesce(tier_override, tier_computed). GENERATED STORED, '
  'so PostgREST exposes it read-only and it cannot drift. This is the only '
  'tier column MENTOR_SELECT reads and the only one the public path sorts on.';
comment on column public.mentors.tier_score is
  '0-100 composite from computeMentorTier(). Stored for the admin readout and '
  'for debugging a surprising tier — never used as a sort key (tier is).';
comment on column public.mentors.tier_session_count is
  'COMPLETED public.sessions rows for this mentor, reached via '
  'mentors.profile_id -> sessions.mentor_id (sessions.mentor_id references '
  'profiles, NOT mentors). Always 0 for account-less mentors (profile_id '
  'NULL) — that is a real measurement, and the admin pin is the escape hatch.';

-- ─── 3. Sort index ───────────────────────────────────────────
-- mentors_visibility_order_idx (visibility, order_index) from 0028 stays —
-- listMentorsForAdmin still sorts by order_index alone (drag-reorder). The
-- new public sort is `where visibility='published' order by tier desc,
-- order_index asc`, which needs its own composite with matching direction.
create index if not exists mentors_visibility_tier_order_idx
  on public.mentors (visibility, tier desc, order_index asc);

-- ─── 4. Input rollup ─────────────────────────────────────────
-- Same shape and same reason as public.feedback_session_stats (0034): a
-- JS-side fetch-all-then-reduce over feedback_responses/feedback_answers is
-- silently truncated by PostgREST's db-max-rows (~1000) and produces wrong
-- averages with NO error. This returns one row per requested mentor, no
-- matter how many responses sit underneath.
--
-- Inclusion rule: is_public = true AND the response has >= 1 star answer.
-- Deliberately NOT the listMentorReviews rule: show_reviews is a display
-- toggle and must not move a mentor's rank; a non-empty comment is required
-- only because listMentorReviews RENDERS the comment, which scoring does not.
--
-- Per-response average first, then average of those — matching
-- summarizeStarValues() in mentor-reviews.ts, so a response answering 3
-- star questions does not outweigh one answering 1.
--
-- No SECURITY DEFINER: called only through createAdminSupabase()
-- (service_role), which already bypasses RLS. Same rule as 0034; a
-- SECURITY DEFINER function here would need explicit revokes from
-- anon/authenticated/public and buys nothing.
create or replace function public.mentor_tier_inputs(p_mentor_ids uuid[])
returns table (
  mentor_id     uuid,
  review_count  bigint,
  rating_avg    numeric,
  session_count bigint
)
language sql
stable
as $$
  with target as (
    select m.id, m.profile_id
    from public.mentors m
    where m.id = any(p_mentor_ids)
  ),
  response_stars as (
    select fs.mentor_id as m_id, r.id as response_id, avg(a.star_value) as response_avg
    from public.feedback_sessions fs
    join public.feedback_responses r on r.feedback_session_id = fs.id
    join public.feedback_answers   a on a.response_id = r.id
    where fs.mentor_id = any(p_mentor_ids)
      and r.is_public
      and a.star_value is not null
    group by fs.mentor_id, r.id
  ),
  reviews as (
    select m_id, count(*)::bigint as review_count, avg(response_avg) as rating_avg
    from response_stars
    group by m_id
  ),
  sess as (
    select t.id as m_id, count(s.id)::bigint as session_count
    from target t
    left join public.sessions s
      on t.profile_id is not null
     and s.mentor_id = t.profile_id
     and s.status = 'completed'
    group by t.id
  )
  select
    t.id,
    coalesce(rv.review_count, 0)::bigint,
    rv.rating_avg,
    coalesce(sess.session_count, 0)::bigint
  from target t
  left join reviews rv on rv.m_id = t.id
  left join sess    on sess.m_id  = t.id;
$$;

grant execute on function public.mentor_tier_inputs(uuid[]) to service_role;

-- ─── 5. Backfill ─────────────────────────────────────────────
-- Part A is implicit and is the load-bearing half: the NOT NULL DEFAULTs in
-- step 2 give every existing row tier_computed='standard' and therefore a
-- non-null generated `tier` the instant this statement commits. The app is
-- working — sorting, badges, strip partition — before any TS runs.
--
-- Part B backfills the INPUT counters only, so the admin readout shows real
-- numbers immediately instead of a misleading row of zeroes. The scoring
-- formula is deliberately NOT duplicated in SQL — one formula, in
-- src/lib/mentor-tier.ts, unit-tested. tier_computed_at stays NULL, which
-- is exactly what "inputs known, never scored" should look like.
update public.mentors m
set tier_review_count  = i.review_count,
    tier_rating_avg    = round(i.rating_avg, 2),
    tier_session_count = i.session_count
from public.mentor_tier_inputs(array(select id from public.mentors)) i
where i.mentor_id = m.id;

-- Part C: run the real scorer once after deploying the app code —
--   POST /api/admin/mentors/tiers/recompute   (requireAdmin)
-- or the "Recalculate All Tiers" button on /dashboard/admin/mentors.
