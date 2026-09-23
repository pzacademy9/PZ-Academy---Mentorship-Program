-- 0054_whatsapp_batches.sql
--
-- WhatsApp click-to-chat outreach. See
-- docs/superpowers/specs/2026-09-23-whatsapp-click-to-chat-design.md.
--
-- Recipient lists are snapshotted at batch creation (full_name, phone_e164
-- copied in), not live-joined against contacts — a resumable batch worked
-- over several sittings should not reshuffle if a contact's phone is
-- corrected mid-batch. contact_id is ON DELETE SET NULL rather than CASCADE
-- for the same reason: the snapshot already carries what's needed to act on
-- the row, so a later contact deletion shouldn't make a historical send
-- record disappear.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'whatsapp_send_status') then
    create type public.whatsapp_send_status as enum ('pending', 'sent');
  end if;
end $$;

create table if not exists public.whatsapp_batches (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  message_template  text not null,
  segment           jsonb not null default '[]'::jsonb,
  recipient_count   integer not null default 0,
  sent_count        integer not null default 0,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

create table if not exists public.whatsapp_batch_recipients (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.whatsapp_batches(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete set null,
  full_name     text not null,
  phone_e164    text not null,
  status        public.whatsapp_send_status not null default 'pending',
  sent_at       timestamptz,
  sent_by       uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (batch_id, contact_id)
);

create index if not exists whatsapp_batch_recipients_batch_idx
  on public.whatsapp_batch_recipients (batch_id);

alter table public.whatsapp_batches           enable row level security;
alter table public.whatsapp_batch_recipients  enable row level security;
-- Zero policies: service-role only, same convention as every other CRM
-- table (0047). All reads/writes go through createAdminSupabase() behind
-- requireAdmin().

-- crm_contact_segment_source did not expose whatsapp_unsubscribed_at (it
-- was built for the email-only CRM slice 1). Adding it here so the WhatsApp
-- reachability guard (phone_e164 is not null AND whatsapp_unsubscribed_at is
-- null) has a column to read. Every consumer of this view selects columns
-- by name, never `select *`, so appending a column cannot break anything
-- that already reads it — but CREATE OR REPLACE VIEW only allows appending
-- at the very end of the column list (Postgres tracks view columns
-- positionally), so it goes last, not next to phone_e164 where it would
-- read better; inserting it mid-list errors with "cannot change name of
-- view column" because it shifts every column after it.
create or replace view public.crm_contact_segment_source as
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
    and c.consent_basis = 'purchase'::crm_consent_basis
    and not (exists (
      select 1 from email_metrics m
      where lower(m.user_email) = c.email
        and m.event_type = any (array['hard_bounce', 'blocked', 'spam', 'invalid_email', 'unsubscribed'])
    )) as is_sendable,
  c.whatsapp_unsubscribed_at
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
