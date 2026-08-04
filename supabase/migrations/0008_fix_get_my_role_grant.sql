-- ============================================================
-- Migration 0008: Restore EXECUTE on get_my_role() (Phase 2 fix)
-- ------------------------------------------------------------
-- A prior "revoke public execute" hardening pass (applied to the
-- live DB) also stripped EXECUTE on public.get_my_role() from the
-- authenticated/anon roles. Because nearly every RLS policy calls
-- get_my_role() in its USING clause, this silently broke RLS for
-- real signed-in users: the only reason the app appeared to work
-- is that the profiles "own row" policy short-circuits the OR
-- (id = auth.uid()) before get_my_role() is ever invoked.
--
-- get_my_role() is SECURITY DEFINER and returns ONLY the caller's
-- own role (select role from profiles where id = auth.uid()), so
-- granting EXECUTE back to authenticated/anon is safe and is
-- required for any policy whose admin branch is evaluated first.
-- ============================================================

grant execute on function public.get_my_role() to authenticated, anon;
