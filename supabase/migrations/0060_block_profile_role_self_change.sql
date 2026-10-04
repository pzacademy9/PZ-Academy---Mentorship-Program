-- Migration 0060: stop signed-in users from changing profiles.role.
--
-- profiles has the RLS policy "own row update" (id = auth.uid()) and the
-- authenticated role holds UPDATE on every column, so a user could run
--   update profiles set role = 'admin' where id = auth.uid()
-- with the public anon key. All legitimate role changes in this app use the
-- service-role client (current_user is service_role/postgres there), and
-- SECURITY DEFINER functions run as their owner, so only direct client
-- writes are blocked.

create or replace function public.prevent_role_self_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.role is distinct from old.role and current_user in ('authenticated', 'anon') then
    raise exception 'profiles.role can only be changed by an administrator action'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_change on public.profiles;

create trigger profiles_prevent_role_change
  before update of role on public.profiles
  for each row
  execute function public.prevent_role_self_change();
