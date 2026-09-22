-- 0052_crm_import_commit_preserve_course_id.sql
--
-- Fixes a critical bug found in final review of migration 0051: re-importing
-- a sheet without picking a course in the wizard (courseId omitted, so
-- p_course_id = null) silently wiped course_id on every existing purchase
-- row for that sheet, because the on-conflict upsert unconditionally set
-- course_id = excluded.course_id. A null in the new commit must never erase
-- a course_id a prior commit already set; only a non-null value should win.

create or replace function public.crm_import_commit(
  p_sheet_id        text,
  p_sheet_name      text,
  p_tab_name        text,
  p_column_mapping  jsonb,
  p_course_id       uuid,
  p_created_by      uuid,
  p_rows            jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id          uuid;
  v_row               jsonb;
  v_contact           jsonb;
  v_purchase          jsonb;
  v_email             text;
  v_phone             text;
  v_contact_id        uuid;
  v_rows_total        integer := 0;
  v_rows_imported     integer := 0;
  v_contacts_created  integer := 0;
  v_contacts_merged   integer := 0;
begin
  set local statement_timeout = '55s';

  v_rows_total := coalesce(jsonb_array_length(p_rows), 0);

  insert into public.import_batches (
    sheet_id, sheet_name, tab_name, column_mapping, course_id, status, rows_total, created_by
  )
  values (
    p_sheet_id, coalesce(p_sheet_name, ''), p_tab_name, coalesce(p_column_mapping, '{}'::jsonb),
    p_course_id, 'committed', v_rows_total, p_created_by
  )
  returning id into v_batch_id;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_contact  := v_row -> 'contact';
    v_purchase := v_row -> 'purchase';

    v_email := nullif(v_contact ->> 'email', '');
    v_phone := nullif(v_contact ->> 'phoneE164', '');

    v_contact_id := null;

    if v_email is not null then
      select id into v_contact_id from public.contacts where email = v_email limit 1;
    end if;

    if v_contact_id is null and v_phone is not null then
      select id into v_contact_id from public.contacts where phone_e164 = v_phone limit 1;
    end if;

    if v_contact_id is null then
      insert into public.contacts (
        email, phone_e164, phone_raw, full_name, profession, country,
        discovery_source, consent_basis
      )
      values (
        v_email,
        v_phone,
        nullif(v_contact ->> 'phoneRaw', ''),
        coalesce(v_contact ->> 'fullName', ''),
        nullif(v_contact ->> 'profession', ''),
        nullif(v_contact ->> 'country', ''),
        coalesce((v_contact ->> 'discoverySource')::public.crm_discovery_source, 'unknown'),
        'purchase'
      )
      returning id into v_contact_id;

      v_contacts_created := v_contacts_created + 1;
    else
      update public.contacts
      set
        email            = coalesce(email, v_email),
        phone_e164       = coalesce(phone_e164, v_phone),
        phone_raw        = coalesce(phone_raw, nullif(v_contact ->> 'phoneRaw', '')),
        full_name        = case when full_name = '' then coalesce(v_contact ->> 'fullName', '') else full_name end,
        profession       = coalesce(profession, nullif(v_contact ->> 'profession', '')),
        country          = coalesce(country, nullif(v_contact ->> 'country', '')),
        discovery_source = case
                             when discovery_source = 'unknown'
                             then coalesce((v_contact ->> 'discoverySource')::public.crm_discovery_source, 'unknown')
                             else discovery_source
                           end
      where id = v_contact_id;

      v_contacts_merged := v_contacts_merged + 1;
    end if;

    insert into public.contact_purchases (
      contact_id, import_batch_id, source_sheet_id, source_row_ref,
      product_label, course_id, amount, currency, is_early_bird, row_type, promo_code, purchased_at
    )
    values (
      v_contact_id, v_batch_id, p_sheet_id, v_row ->> 'rowRef',
      coalesce(v_purchase ->> 'productLabel', ''),
      p_course_id,
      (nullif(v_purchase ->> 'amount', ''))::numeric,
      nullif(v_purchase ->> 'currency', ''),
      coalesce((v_purchase ->> 'isEarlyBird')::boolean, false),
      coalesce((v_purchase ->> 'rowType')::public.crm_row_type, 'individual'),
      nullif(v_purchase ->> 'promoCode', ''),
      (nullif(v_purchase ->> 'purchasedAt', ''))::timestamptz
    )
    on conflict (source_sheet_id, source_row_ref) do update
    set
      contact_id      = excluded.contact_id,
      import_batch_id = excluded.import_batch_id,
      product_label   = excluded.product_label,
      course_id       = coalesce(excluded.course_id, public.contact_purchases.course_id),
      amount          = excluded.amount,
      currency        = excluded.currency,
      is_early_bird   = excluded.is_early_bird,
      row_type        = excluded.row_type,
      promo_code      = excluded.promo_code,
      purchased_at    = excluded.purchased_at;

    v_rows_imported := v_rows_imported + 1;
  end loop;

  update public.import_batches
  set rows_imported    = v_rows_imported,
      contacts_created = v_contacts_created,
      contacts_merged  = v_contacts_merged,
      rows_skipped     = v_rows_total - v_rows_imported
  where id = v_batch_id;

  return jsonb_build_object(
    'batch_id',         v_batch_id,
    'rows_total',       v_rows_total,
    'rows_imported',    v_rows_imported,
    'contacts_created', v_contacts_created,
    'contacts_merged',  v_contacts_merged
  );
end;
$$;

revoke all on function public.crm_import_commit(text, text, text, jsonb, uuid, uuid, jsonb) from public, anon, authenticated;
