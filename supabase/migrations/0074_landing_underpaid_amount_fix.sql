-- 0074_landing_underpaid_amount_fix.sql
-- NOTE: the owner pastes this SQL into the Supabase SQL editor (it is not applied by tooling).
-- Safe to run more than once.
--
-- Fixes 0073: correcting the amount of an already-underpaid registration was refused
-- ('already-in-status') and never wrote amount_received. Now Underpaid -> Underpaid with a
-- new amount updates the lead's amount_received (no status event, the status did not change).
-- Everything else, including the free-row rejection and member guards, is unchanged.

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
  v_fix      boolean;
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

  -- Correcting the amount of an underpaid registration keeps the status; any other same-status request is refused.
  v_fix := (v_from = p_to_status and p_to_status = 'underpaid' and p_amount is not null);
  if v_from = p_to_status and not v_fix then
    return jsonb_build_object('ok', false, 'reason', 'already-in-status');
  end if;

  if v_fix then
    -- Only the lead's amount changes. No status event: the status did not move.
    update public.landing_registrations
       set amount_received   = p_amount,
           status_source     = p_source,
           status_changed_at = now(),
           updated_at        = now()
     where id = p_registration_id;
    return jsonb_build_object('ok', true, 'from', v_from, 'changed', 0);
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
