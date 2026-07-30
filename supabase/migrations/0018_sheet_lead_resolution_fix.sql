-- ============================================================
-- Migration 0018: Fix duplicate/resubmitted sheet_leads data loss
-- Run AFTER 0017. SQL Editor → New query → Run
-- ============================================================
-- 0017 silently dropped payment data for duplicate/resubmitted sheet_leads
-- rows: when two unresolved leads shared the same (student_id, course_id)
-- pair, the second insert hit the `on conflict do nothing` path, returned
-- zero rows, left v_lead.resolved_enrollment_id NULL, and the unconditional
-- `update sheet_leads set resolved_at = now(), resolved_enrollment_id = ...`
-- then marked that row "resolved" with a NULL enrollment link and no trace
-- of its payment data. There was also no ordering on the loop, so which
-- duplicate row won the insert was non-deterministic.
--
-- Fix:
--   1. `order by created_at desc` so the most recent submission for a given
--      email wins the insert when a real conflict occurs.
--   2. Only mark a lead resolved when it actually produced/matched a real
--      enrollment row — wrap the `update public.sheet_leads` in
--      `if v_lead.resolved_enrollment_id is not null then ... end if;` so a
--      genuinely-conflicted duplicate lead is left with resolved_at still
--      null (visible as "not yet resolved") instead of being silently
--      discarded.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead sheet_leads%rowtype;
  v_status enrollment_status;
begin
  insert into public.profiles (id, role, full_name, phone, profession, city)
  values (
    new.id,
    'student',
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'profession',
    new.raw_user_meta_data->>'city'
  );

  for v_lead in
    select * from public.sheet_leads
    where lower(row_email) = lower(new.email) and resolved_at is null
    order by created_at desc
  loop
    v_status := case v_lead.payment_confirmation
      when 'Paid' then 'active'
      when 'Reserved' then 'reserved'
      else 'pending'
    end;

    insert into public.enrollments (student_id, course_id, status, payment_amount_pkr, payment_shortfall_pkr, verified_at)
    values (
      new.id,
      v_lead.course_id,
      v_status,
      case when v_lead.payment_confirmation <> 'Underpaid' then v_lead.payment_amount_pkr else null end,
      case when v_lead.payment_confirmation = 'Underpaid' then v_lead.payment_amount_pkr else null end,
      case when v_status <> 'pending' then now() else null end
    )
    on conflict (student_id, course_id) do nothing
    returning id into v_lead.resolved_enrollment_id;

    if v_lead.resolved_enrollment_id is not null then
      update public.sheet_leads
      set resolved_at = now(), resolved_enrollment_id = v_lead.resolved_enrollment_id
      where id = v_lead.id;
    end if;
  end loop;

  return new;
end;
$$;
