-- 0064_crm_segment_source_do_not_contact.sql
--
-- Sales workspace: contacts.do_not_contact_at (0063) must be honoured by the
-- existing admin send paths too. Recreate crm_contact_segment_source with
-- do_not_contact_at appended LAST (CREATE OR REPLACE VIEW only allows
-- appending at the end of the column list) and folded into is_sendable.
-- Every pre-existing column keeps its name and position (see 0054).
--
-- security_invoker is restated in the same statement (0055 lesson: options
-- not restated are reset), and the revoke is re-run because grants must not
-- be assumed to survive a view replacement.
create or replace view public.crm_contact_segment_source
with (security_invoker = true) as
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
  c.profile_id is not null as has_platform_account,
  coalesce(p.purchase_count, 0::bigint) as purchase_count,
  p.first_purchase_at,
  p.last_purchase_at,
  coalesce(p.product_labels, array[]::text[]) as product_labels,
  coalesce(p.product_labels_text, ''::text) as product_labels_text,
  coalesce(p.row_types, array[]::text[]) as row_types,
  coalesce(p.course_ids, array[]::uuid[]) as course_ids,
  coalesce(p.import_batch_ids, array[]::uuid[]) as import_batch_ids,
  coalesce(p.promo_codes, array[]::text[]) as promo_codes,
  coalesce(p.total_pkr, 0::numeric) as total_pkr,
  c.email is not null
    and c.email_unsubscribed_at is null
    and c.do_not_contact_at is null
    and c.consent_basis = 'purchase'::crm_consent_basis
    and not (exists (
      select 1 from email_metrics m
      where lower(m.user_email) = c.email
        and m.event_type = any (array['hard_bounce', 'blocked', 'spam', 'invalid_email', 'unsubscribed'])
    )) as is_sendable,
  c.whatsapp_unsubscribed_at,
  c.do_not_contact_at
from contacts c
left join lateral (
  select
    count(*) as purchase_count,
    min(cp.purchased_at) as first_purchase_at,
    max(coalesce(cp.purchased_at, cp.created_at)) as last_purchase_at,
    array_agg(distinct cp.product_label) filter (where cp.product_label <> '') as product_labels,
    string_agg(distinct cp.product_label, ' | ') filter (where cp.product_label <> '') as product_labels_text,
    array_agg(distinct cp.row_type::text) as row_types,
    array_agg(distinct cp.course_id) filter (where cp.course_id is not null) as course_ids,
    array_agg(distinct cp.import_batch_id) filter (where cp.import_batch_id is not null) as import_batch_ids,
    array_agg(distinct cp.promo_code) filter (where cp.promo_code is not null) as promo_codes,
    sum(cp.amount) filter (where cp.currency = 'PKR') as total_pkr
  from contact_purchases cp
  where cp.contact_id = c.id
) p on true;

revoke all on public.crm_contact_segment_source from anon, authenticated;
