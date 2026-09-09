-- ============================================================
-- Migration 0049: CRM segment source + campaign stats
-- Run AFTER 0048. SQL Editor → New query → Run
-- ============================================================
-- Two views. No dynamic SQL: segment filters are applied by PostgREST over
-- crm_contact_segment_source, built by a pure TypeScript function that is
-- unit-tested. A jsonb-driven plpgsql query builder would be injection-prone
-- and effectively untestable, and buys nothing at 3,000 rows.

-- ─── 1. Segment source ───────────────────────────────────────
-- One row per contact, with purchase history flattened into arrays that
-- PostgREST can filter with `overlaps` / `contains`, plus a concatenated
-- product label string for substring matching.
--
-- is_sendable folds the three hard exclusions into one column so a segment
-- query cannot forget any of them: no email, unsubscribed, or a Brevo
-- suppression event on that address.
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
      where m.user_email = c.email
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

-- ─── 2. Campaign stats ───────────────────────────────────────
-- Per-campaign delivery funnel, joined out of tables that already exist.
-- This is the payoff for reusing email_queue instead of writing a second
-- sender: opens and clicks come free.
create or replace view public.crm_campaign_stats
with (security_invoker = true)
as
select
  ca.id                                                          as campaign_id,
  ca.name,
  ca.status,
  ca.created_at,
  ca.completed_at,
  count(distinct cr.id)                                          as recipients,
  count(distinct cr.id) filter (where q.status = 'sent')         as sent,
  count(distinct cr.id) filter (where q.status = 'failed')       as failed,
  count(distinct m.user_email) filter (where m.event_type = 'delivered')                          as delivered,
  count(distinct m.user_email) filter (where m.event_type in ('opened', 'unique_opened'))         as opened,
  count(distinct m.user_email) filter (where m.event_type = 'click')                              as clicked,
  count(distinct m.user_email) filter (where m.event_type in ('hard_bounce', 'soft_bounce'))      as bounced
from public.campaigns ca
left join public.campaign_recipients cr on cr.campaign_id = ca.id
left join public.email_queue q          on q.id = cr.email_queue_id
left join public.email_metrics m        on m.email_queue_id = cr.email_queue_id
group by ca.id, ca.name, ca.status, ca.created_at, ca.completed_at;

-- Views inherit RLS from their base tables under security_invoker, and every
-- CRM base table is service-role only. Revoked explicitly so a future policy
-- change on contacts cannot accidentally expose these.
revoke all on public.crm_contact_segment_source from anon, authenticated;
revoke all on public.crm_campaign_stats          from anon, authenticated;
