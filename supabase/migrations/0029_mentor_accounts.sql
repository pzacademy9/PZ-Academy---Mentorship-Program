-- ============================================================
-- Migration 0029: Mentor accounts (subsystem B)
-- Run AFTER 0028. SQL Editor → New query → Run
-- ============================================================
-- Two SECURITY DEFINER RPCs backing subsystem B (see
-- docs/superpowers/specs/2026-08-11-mentor-accounts-design.md):
--   1. find_user_id_by_email — admin-only email→uuid lookup. profiles has
--      no email column (email only lives in auth.users), so the invite/
--      link admin flow needs a way to check "does this email already have
--      an account" without reaching into auth.users directly from the
--      service-role client's PostgREST surface.
--   2. update_own_mentor_profile — the self-service RPC 0028 deliberately
--      deferred when it dropped "mentors: mentor update own". A raw RLS
--      policy can't express a column whitelist (a mentor with row-level
--      write access could self-publish or reprice); this RPC hard-codes
--      the whitelist to content/marketing fields only. Admin-only fields
--      (slug, name, title, domain, expertise, visibility,
--      price_per_session_pkr, packages, order_index, testimonials) are not
--      parameters here at all — there is no way to pass them even by
--      mistake.

-- ─── find_user_id_by_email ────────────────────────────────────
-- service_role only: this is an email-existence oracle, so it must never
-- be reachable by authenticated/anon. Called from the admin invite/link
-- server action, which is itself gated by requireAdmin().
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

grant execute on function public.find_user_id_by_email(text) to service_role;

-- ─── update_own_mentor_profile ────────────────────────────────
create or replace function public.update_own_mentor_profile(
  p_short_bio             text,
  p_full_bio              text[],
  p_photo_url             text,
  p_availability_text     text,
  p_intro_video_url       text,
  p_linkedin_url          text,
  p_social_links          jsonb,
  p_skills                text[],
  p_credentials           jsonb,
  p_timezone              text,
  p_session_duration_text text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.mentors
  set
    short_bio              = p_short_bio,
    full_bio                = coalesce(p_full_bio, '{}'),
    photo_url                = p_photo_url,
    availability_text        = p_availability_text,
    intro_video_url           = p_intro_video_url,
    linkedin_url               = p_linkedin_url,
    social_links                = coalesce(p_social_links, '[]'::jsonb),
    skills                        = coalesce(p_skills, '{}'),
    credentials                    = coalesce(p_credentials, '[]'::jsonb),
    timezone                        = p_timezone,
    session_duration_text            = p_session_duration_text
  where profile_id = auth.uid();

  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

grant execute on function public.update_own_mentor_profile(
  text, text[], text, text, text, text, jsonb, text[], jsonb, text, text
) to authenticated;
