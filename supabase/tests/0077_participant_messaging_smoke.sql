-- 0077_participant_messaging_smoke.sql
-- Owner runs this in the Supabase SQL editor AFTER migration 0077. The result shows as one
-- red error box listing every check; that error is expected and undoes all test data.

create temp table smoke_out(msg text) on commit drop;

do $$
declare
  v_page  uuid;
  v_reg   uuid;
  v_reg2  uuid;
  v_send  uuid;
  v_ok    boolean;
begin
  insert into public.landing_pages (slug, kind, title, draft)
  values ('smoke-participants-0077', 'workshop', 'Smoke participants', '{}'::jsonb)
  returning id into v_page;

  insert into public.landing_registrations (page_id, row_type, name, email, region, currency, ref_id)
  values (v_page, 'individual', 'Smoke One', 'smoke1@example.invalid', 'PK', 'PKR', 'SMK-0077-1')
  returning id into v_reg;
  insert into public.landing_registrations (page_id, row_type, name, email, region, currency, ref_id)
  values (v_page, 'individual', 'Smoke Two', 'smoke2@example.invalid', 'PK', 'PKR', 'SMK-0077-2')
  returning id into v_reg2;

  insert into public.participant_sends (page_id, channel, subject, body, recipient_count)
  values (v_page, 'email', 'Hello', 'Body', 2) returning id into v_send;

  insert into public.participant_send_recipients (send_id, registration_id, name, email, status_at_send)
  values (v_send, v_reg, 'Smoke One', 'smoke1@example.invalid', 'paid'),
         (v_send, v_reg2, 'Smoke Two', 'smoke2@example.invalid', 'pending');
  insert into smoke_out(msg) values (format('[%s] two recipients insert with default state pending',
    case when (select count(*) from public.participant_send_recipients where send_id = v_send and state = 'pending') = 2
         then 'PASS' else 'FAIL' end));

  -- unique (send_id, registration_id)
  v_ok := false;
  begin
    insert into public.participant_send_recipients (send_id, registration_id, name, status_at_send)
    values (v_send, v_reg, 'Smoke One again', 'paid');
  exception when unique_violation then
    v_ok := true;
  end;
  insert into smoke_out(msg) values (format('[%s] duplicate (send, registration) is rejected (rejected=%s)',
    case when v_ok then 'PASS' else 'FAIL' end, v_ok));

  -- state check
  v_ok := false;
  begin
    update public.participant_send_recipients set state = 'bogus' where send_id = v_send and registration_id = v_reg;
  exception when check_violation then
    v_ok := true;
  end;
  insert into smoke_out(msg) values (format('[%s] state bogus is rejected (rejected=%s)',
    case when v_ok then 'PASS' else 'FAIL' end, v_ok));

  -- channel check
  v_ok := false;
  begin
    insert into public.participant_sends (page_id, channel, body, recipient_count) values (v_page, 'sms', 'x', 1);
  exception when check_violation then
    v_ok := true;
  end;
  insert into smoke_out(msg) values (format('[%s] channel sms is rejected (rejected=%s)',
    case when v_ok then 'PASS' else 'FAIL' end, v_ok));

  -- email prefs lowercase check + token default
  v_ok := false;
  begin
    insert into public.participant_email_prefs (email) values ('A@B.com');
  exception when check_violation then
    v_ok := true;
  end;
  insert into smoke_out(msg) values (format('[%s] email prefs A@B.com is rejected (rejected=%s)',
    case when v_ok then 'PASS' else 'FAIL' end, v_ok));

  insert into public.participant_email_prefs (email) values ('a@b.com');
  insert into smoke_out(msg) values (format('[%s] email prefs a@b.com inserts with a generated token',
    case when (select token is not null and unsubscribed_at is null from public.participant_email_prefs where email = 'a@b.com')
         then 'PASS' else 'FAIL' end));

  -- cascade: deleting the send removes its recipients
  delete from public.participant_sends where id = v_send;
  insert into smoke_out(msg) values (format('[%s] deleting a send cascades to its recipients',
    case when not exists (select 1 from public.participant_send_recipients where send_id = v_send)
         then 'PASS' else 'FAIL' end));
end $$;

do $$
begin
  raise exception E'RESULTS (this error is expected, it undoes the test data):
%', (select string_agg(msg, E'
') from smoke_out);
end $$;
