-- ============================================================
-- Migration 0050: CRM import date capture + case-folded suppression
-- Run AFTER 0049. SQL Editor → New query → Run
-- ============================================================
-- Two objects, both create-or-replace:
--
-- (a) crm_import_commit — three hardening changes over 0048:
--     * set local statement_timeout = '55s' so an ~800-row sheet does not
--       inherit authenticator's 8s cap and roll back mid-import.
--     * capture purchased_at from the parsed row so segment date filters and
--       first/last purchase columns are real instead of import-time.
--     * carry purchased_at through the on-conflict upsert.
--
-- (b) crm_contact_segment_source — case-fold the Brevo suppression join.
--     contacts.email is normalized lowercase; Brevo's echoed address is not,
--     so `m.user_email = c.email` silently misses case-variant addresses.

-- ─── (a) import commit ───────────────────────────────────────
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
  -- The function runs as authenticator, which carries an 8s statement_timeout.
  -- A single-transaction import of an ~800-row cohort sheet exceeds that and
  -- rolls the whole thing back. Raise it for this transaction only.
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

    -- jsonb ->> yields SQL NULL for a JSON null, which is what the identity
    -- lookups below rely on: a null email must not match another null email.
    v_email := nullif(v_contact ->> 'email', '');
    v_phone := nullif(v_contact ->> 'phoneE164', '');

    v_contact_id := null;

    -- Identity resolution. Email is checked first because it is the more
    -- reliable key in these sheets; phone is the fallback for rows where the
    -- email was missing or malformed.
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
      -- Existing contact: fill gaps only. An earlier import's non-null value
      -- is never overwritten by a later sheet, so the oldest known good
      -- value wins and a blank cell in a newer sheet cannot erase data.
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

    -- Idempotent on (source_sheet_id, source_row_ref): re-importing a sheet
    -- after correcting a column mapping updates rows in place instead of
    -- duplicating them.
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
      course_id       = excluded.course_id,
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

-- Service role only. The anon and authenticated roles must never be able to
-- write contacts, and nothing in the browser calls this.
revoke all on function public.crm_import_commit(text, text, text, jsonb, uuid, uuid, jsonb) from public, anon, authenticated;

-- ─── (b) segment source — case-folded suppression ────────────
create or replace view public.crm_contact_segment_source
with (security_invoker = true)
as
select
  c.id,
  c.full_name,
  c.email,
  c.phone_e164,
  c.country,
  c.profession,
  c.discovery_source,
  c.consent_basis,
  c.unsubscribe_token,
  c.created_at,
  c.profile_id is not null                          as has_platform_account,
  coalesce(p.purchase_count, 0)                     as purchase_count,
  p.first_purchase_at,
  p.last_purchase_at,
  coalesce(p.product_labels, array[]::text[])       as product_labels,
  coalesce(p.product_labels_text, '')               as product_labels_text,
  coalesce(p.row_types, array[]::text[])            as row_types,
  coalesce(p.course_ids, array[]::uuid[])           as course_ids,
  coalesce(p.import_batch_ids, array[]::uuid[])     as import_batch_ids,
  coalesce(p.promo_codes, array[]::text[])          as promo_codes,
  coalesce(p.total_pkr, 0)                          as total_pkr,
  (
    c.email is not null
    and c.email_unsubscribed_at is null
    -- Every slice-1 contact is 'purchase'. Slice 2's capture surfaces will
    -- introduce 'enquiry' contacts, and the spec requires those never
    -- receive a campaign BY DEFAULT. Guarding here rather than later means
    -- the safe behaviour is the one already in place when those rows first
    -- appear; slice 2 relaxes it deliberately or not at all.
    and c.consent_basis = 'purchase'
    and not exists (
      select 1 from public.email_metrics m
      where lower(m.user_email) = c.email
        -- Brevo's raw event strings, stored verbatim by
        -- supabase/functions/brevo-webhook-handler. Verify these against
        -- `select distinct event_type from email_metrics` on first run —
        -- a value mismatch here silently disables suppression.
        and m.event_type in ('hard_bounce', 'blocked', 'spam', 'invalid_email', 'unsubscribed')
    )
  ) as is_sendable
from public.contacts c
left join lateral (
  select
    count(*)                                              as purchase_count,
    min(cp.purchased_at)                                  as first_purchase_at,
    max(coalesce(cp.purchased_at, cp.created_at))         as last_purchase_at,
    array_agg(distinct cp.product_label)
      filter (where cp.product_label <> '')               as product_labels,
    string_agg(distinct cp.product_label, ' | ')
      filter (where cp.product_label <> '')               as product_labels_text,
    array_agg(distinct cp.row_type::text)                 as row_types,
    array_agg(distinct cp.course_id)
      filter (where cp.course_id is not null)             as course_ids,
    array_agg(distinct cp.import_batch_id)
      filter (where cp.import_batch_id is not null)       as import_batch_ids,
    array_agg(distinct cp.promo_code)
      filter (where cp.promo_code is not null)            as promo_codes,
    -- Lifetime value in PKR only. AED and SAR rows are deliberately excluded
    -- rather than converted at a hardcoded rate that would silently rot.
    sum(cp.amount) filter (where cp.currency = 'PKR')     as total_pkr
  from public.contact_purchases cp
  where cp.contact_id = c.id
) p on true;

revoke all on public.crm_contact_segment_source from anon, authenticated;
