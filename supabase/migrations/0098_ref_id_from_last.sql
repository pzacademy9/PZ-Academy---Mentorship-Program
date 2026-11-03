-- 0098: the next reference number (PZA-<prefix>-NNN) follows the last registration that still exists.
-- Before: a counter that only ever went up, so deleting registrations left gaps at the end (delete the two
-- newest, and the next person still got 003). Now: highest number still in use for the prefix + 1.
-- Only landing_create_registration changes (copied from 0070 with the counter step replaced); no table or
-- data changes. Safe to run more than once.

create or replace function public.landing_create_registration(
  p_page_id  uuid,
  p_rows     jsonb,
  p_promo_id uuid    default null,
  p_is_test  boolean default false,
  p_capacity integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_people  integer;
  v_taken   integer;
  v_prefix  text;
  v_n       integer;
  v_max     integer;
  v_ref     text;
  v_lead_id uuid;
  v_id      uuid;
  v_ids     uuid[] := '{}';
  v_row     jsonb;
  v_idx     integer := 0;
  v_ord     bigint;
  v_type    text;
  v_test    boolean := coalesce(p_is_test, false);
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'invalid_rows';
  end if;
  v_people := jsonb_array_length(p_rows);

  select coalesce(
           nullif(lp.ref_prefix, ''),
           case when lp.published #>> '{registration,refPrefix}' ~ '^[A-Z0-9]{2,6}$'
                then lp.published #>> '{registration,refPrefix}' end,
           'REG')
    into v_prefix
    from public.landing_pages lp
   where lp.id = p_page_id;
  if not found then
    raise exception 'page_not_found';
  end if;

  -- One registration at a time per page: makes the capacity check and the counter race-free.
  perform pg_advisory_xact_lock(hashtextextended(p_page_id::text, 0));

  if not v_test and coalesce(p_capacity, 0) > 0 then
    select count(*) into v_taken
      from public.landing_registrations r
     where r.page_id = p_page_id
       and not r.is_test;
    if v_taken + v_people > p_capacity then
      raise exception 'capacity_full';
    end if;
  end if;

  if p_promo_id is not null and not v_test then
    update public.landing_promo_codes pc
       set used_count = pc.used_count + 1,
           updated_at = now()
     where pc.id = p_promo_id
       and (pc.max_uses is null or pc.used_count < pc.max_uses)
       and pc.active
       and (pc.starts_at is null or pc.starts_at <= now())
       and (pc.ends_at is null or pc.ends_at > now());
    if not found then
      raise exception 'promo_exhausted';
    end if;
  end if;

  if v_test then
    loop
      v_ref := 'TEST-' || lpad(floor(random() * 100000)::int::text, 5, '0');
      exit when not exists (select 1 from public.landing_registrations r where r.ref_id = v_ref);
    end loop;
  else
    -- The next number is one more than the highest number still in use for this prefix, so deleting
    -- the newest registration frees its number and the next person gets it. The lock keeps two
    -- registrations (even on different pages that share a prefix) from reading the same highest number.
    perform pg_advisory_xact_lock(hashtextextended('ref-prefix:' || v_prefix, 0));
    select coalesce(max((substring(r.ref_id from '^PZA-' || v_prefix || '-(\d+)$'))::integer), 0)
      into v_max
      from public.landing_registrations r
     where r.ref_id like 'PZA-' || v_prefix || '-%';
    v_n := v_max + 1;
    -- The counter table keeps a record of the last number handed out.
    insert into public.landing_ref_counters as c (prefix, last_number, updated_at)
    values (v_prefix, v_n, now())
    on conflict (prefix) do update set last_number = excluded.last_number, updated_at = now();
    v_ref := 'PZA-' || v_prefix || '-' || case when v_n < 1000 then lpad(v_n::text, 3, '0') else v_n::text end;
  end if;

  for v_row, v_ord in
    select e.value, e.ord from jsonb_array_elements(p_rows) with ordinality as e(value, ord) order by e.ord
  loop
    v_type := coalesce(v_row->>'row_type', '');
    if v_idx = 0 and v_type not in ('individual', 'lead') then
      raise exception 'invalid_rows';
    end if;
    if v_idx = 0 and v_type = 'individual' and v_people > 1 then
      raise exception 'invalid_rows';
    end if;
    if v_idx > 0 and v_type <> 'member' then
      raise exception 'invalid_rows';
    end if;

    insert into public.landing_registrations (
      page_id, row_type, lead_registration_id, name, email, whatsapp, profession, city, region,
      discovery, consent, option_label, option_keys, mode, tier_key, group_size, promo_code_id,
      promo_code_text, expected_amount, currency, payment_method, voucher_url, status,
      status_changed_at, status_source, student_id, ref_id, agent_id, referral_code, utm, fbp,
      fbc, event_id, session_id, is_test, variant_key
    ) values (
      p_page_id,
      v_type,
      case when v_idx = 0 then null else v_lead_id end,
      coalesce(v_row->>'name', ''),
      lower(trim(coalesce(v_row->>'email', ''))),
      coalesce(v_row->>'whatsapp', ''),
      coalesce(v_row->>'profession', ''),
      coalesce(v_row->>'city', ''),
      coalesce(v_row->>'region', ''),
      coalesce(v_row->>'discovery', ''),
      coalesce((v_row->>'consent')::boolean, false),
      coalesce(v_row->>'option_label', ''),
      array(select jsonb_array_elements_text(coalesce(nullif(v_row->'option_keys', 'null'::jsonb), '[]'::jsonb))),
      coalesce(v_row->>'mode', 'live'),
      coalesce(v_row->>'tier_key', 'individual'),
      coalesce((v_row->>'group_size')::integer, 1),
      case when v_idx = 0 and not v_test then p_promo_id else null end,
      coalesce(v_row->>'promo_code_text', ''),
      coalesce((v_row->>'expected_amount')::numeric, 0),
      coalesce(v_row->>'currency', ''),
      coalesce(v_row->>'payment_method', ''),
      coalesce(v_row->>'voucher_url', ''),
      coalesce(v_row->>'status', 'pending'),
      now(),
      'app',
      nullif(v_row->>'student_id', '')::uuid,
      case when v_idx = 0 then v_ref else null end,
      nullif(v_row->>'agent_id', '')::uuid,
      coalesce(v_row->>'referral_code', ''),
      coalesce(nullif(v_row->'utm', 'null'::jsonb), '{}'::jsonb),
      coalesce(v_row->>'fbp', ''),
      coalesce(v_row->>'fbc', ''),
      coalesce(v_row->>'event_id', ''),
      coalesce(v_row->>'session_id', ''),
      v_test,
      coalesce(v_row->>'variant_key', '')
    )
    returning id into v_id;

    if v_idx = 0 then
      v_lead_id := v_id;
    end if;
    v_ids := v_ids || v_id;
    v_idx := v_idx + 1;
  end loop;

  return jsonb_build_object('ref_id', v_ref, 'registration_ids', to_jsonb(v_ids));
end;
$$;

revoke all on function public.landing_create_registration(uuid, jsonb, uuid, boolean, integer) from public, anon, authenticated;
grant execute on function public.landing_create_registration(uuid, jsonb, uuid, boolean, integer) to service_role;
