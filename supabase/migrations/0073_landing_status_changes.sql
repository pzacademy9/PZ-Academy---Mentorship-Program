-- 0073_landing_status_changes.sql
-- NOTE: the owner pastes this SQL into the Supabase SQL editor (it is not applied by tooling).
-- Safe to run more than once.
--
-- Manual payment-status changes from the Registrations screen:
--   1. landing_status_events.changed_by records who made an app change.
--   2. landing_jobs.type also allows 'sheet_status' (the sheet gets the new status).
--   3. landing_apply_status() changes a lead and its group members in ONE transaction.

alter table public.landing_status_events
  add column if not exists changed_by uuid references public.profiles(id) on delete set null;

-- The inline check from 0069 has Postgres' default name landing_jobs_type_check.
alter table public.landing_jobs drop constraint if exists landing_jobs_type_check;
alter table public.landing_jobs
  add constraint landing_jobs_type_check check (type in ('sheet_append', 'email_received', 'email_members', 'email_admin', 'sheet_status'));

create or replace function public.landing_apply_status(
  p_registration_id uuid,
  p_to_status       text,
  p_expected_from   text,
  p_amount          numeric,
  p_actor           uuid,
  p_source          text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_type text;
  v_from     text;
  v_changed  integer := 0;
  r          record;
begin
  if p_to_status not in ('pending', 'reserved', 'underpaid', 'paid') then
    raise exception 'invalid_status';
  end if;
  if p_source not in ('app', 'sheet') then
    raise exception 'invalid_source';
  end if;

  -- Lock the lead (or individual) row first so two people changing it serialise.
  select row_type, status into v_row_type, v_from
    from public.landing_registrations
   where id = p_registration_id
   for update;

  if not found or v_row_type = 'member' then
    return jsonb_build_object('ok', false, 'reason', 'not-found');
  end if;
  if v_from is distinct from p_expected_from then
    return jsonb_build_object('ok', false, 'reason', 'stale');
  end if;

  if v_from = 'free' then
    return jsonb_build_object('ok', false, 'reason', 'free-row');
  end if;
  if v_from = p_to_status then
    return jsonb_build_object('ok', false, 'reason', 'already-in-status');
  end if;

  for r in
    select id, status
      from public.landing_registrations
     where id = p_registration_id or lead_registration_id = p_registration_id
     order by created_at
       for update
  loop
    if r.status <> p_to_status then
      insert into public.landing_status_events (registration_id, from_status, to_status, source, changed_by)
      values (r.id, r.status, p_to_status, p_source, p_actor);
      v_changed := v_changed + 1;
    end if;

    update public.landing_registrations
       set status            = p_to_status,
           status_source     = p_source,
           status_changed_at = now(),
           updated_at        = now(),
           amount_received   = case
                                 when r.id = p_registration_id and p_amount is not null then p_amount
                                 else amount_received
                               end
     where id = r.id
       and status <> p_to_status;
  end loop;

  return jsonb_build_object('ok', true, 'from', v_from, 'changed', v_changed);
end;
$$;

revoke all on function public.landing_apply_status(uuid, text, text, numeric, uuid, text) from public, anon, authenticated;
grant execute on function public.landing_apply_status(uuid, text, text, numeric, uuid, text) to service_role;
