-- ============================================================
-- Migration 0030: Fix mentor account RPC grant defaults (0029 fix)
-- ============================================================
-- Migration 0029 created find_user_id_by_email (service_role only)
-- and update_own_mentor_profile (authenticated only) with explicit
-- GRANT statements. However, Supabase's default-privileges footgun
-- auto-grants EXECUTE on all new functions in the public schema to
-- anon, authenticated, and public roles by default — the explicit
-- grants were added but the defaults were never revoked, leaving
-- both functions callable by any authenticated or anonymous client
-- via PostgREST /rest/v1/rpc/*.
--
-- This fix revokes those default grants, restoring the intended
-- scope: find_user_id_by_email to service_role only (admin backend);
-- update_own_mentor_profile to authenticated only (signed-in mentors).
-- ============================================================

revoke execute on function public.find_user_id_by_email(text) from public, anon, authenticated;

revoke execute on function public.update_own_mentor_profile(
  text, text[], text, text, text, text, jsonb, text[], jsonb, text, text
) from public, anon;
