-- ============================================================
-- Migration 0017: Auto-resolve sheet_leads on signup
-- Run AFTER 0016. SQL Editor → New query → Run
-- ============================================================
-- Extends handle_new_user (0003) so a lead staged by the sheets-sync webhook
-- (no matching account at submission time) becomes a real enrollment the
-- instant that email creates an account — no manual admin step.

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

    update public.sheet_leads
    set resolved_at = now(), resolved_enrollment_id = v_lead.resolved_enrollment_id
    where id = v_lead.id;
  end loop;

  return new;
end;
$$;
