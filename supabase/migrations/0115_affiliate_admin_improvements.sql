-- 0115_affiliate_admin_improvements.sql
-- Affiliates admin improvements: a reason when an affiliate is dropped, saved message templates (WhatsApp and
-- email) for the owner to reuse, and a log of every motivation email send. Service role only (RLS on, no
-- policies). The owner pastes this in the Supabase SQL editor. Safe to run twice.

begin;

-- ------------------------------------------------------------ why an affiliate was dropped
alter table public.affiliates add column if not exists drop_reason text;

-- ------------------------------------------------------------ saved message templates
create table if not exists public.affiliate_message_templates (
  id         uuid primary key default gen_random_uuid(),
  channel    text not null check (channel in ('whatsapp', 'email')),
  name       text not null,
  subject    text,
  body       text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.affiliate_message_templates enable row level security;

create unique index if not exists affiliate_message_templates_channel_name_uidx
  on public.affiliate_message_templates (channel, name);

-- ------------------------------------------------------------ log of motivation email sends
create table if not exists public.affiliate_motivation_sends (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  subject         text not null,
  html            text not null,
  recipient_count int not null default 0,
  failed_count    int not null default 0,
  recipients      jsonb not null default '[]'
);
alter table public.affiliate_motivation_sends enable row level security;

-- ------------------------------------------------------------ starter templates
insert into public.affiliate_message_templates (channel, name, subject, body, sort_order) values
  ('whatsapp', 'Welcome', null,
   E'Hello {name},\nWelcome to the Pharmacozyme affiliate team. Your code is {code}.\nPlease reply here if you have any questions.\nPharmacozyme Affiliate Team', 1),
  ('whatsapp', 'How to share your code', null,
   E'Hello {name},\nYou can share your code {code} with anyone who would like to join a Pharmacozyme course.\nThey enter it at registration and your sale is recorded automatically.\nPharmacozyme Affiliate Team', 2),
  ('whatsapp', 'Payout ready', null,
   E'Hello {name},\nYour affiliate payout can now be requested. Open your page and press Request payout.\nPharmacozyme Affiliate Team', 3),
  ('whatsapp', 'Thank you', null,
   E'Hello {name},\nThank you for representing Pharmacozyme. We appreciate the effort you put in.\nPharmacozyme Affiliate Team', 4),
  ('email', 'Welcome', 'Welcome to the Pharmacozyme affiliate team',
   E'Hello {name},\nWelcome to the Pharmacozyme affiliate team. Your code is {code}.\nReply to this email if you have any questions.\nPharmacozyme Affiliate Team', 1),
  ('email', 'How to share your code', 'How to share your affiliate code',
   E'Hello {name},\nYou can share your code {code} with anyone who would like to join a Pharmacozyme course.\nThey enter it at registration and your sale is recorded automatically.\nPharmacozyme Affiliate Team', 2),
  ('email', 'Payout ready', 'Your affiliate payout is ready',
   E'Hello {name},\nYour affiliate payout can now be requested. Open your page and press Request payout.\nPharmacozyme Affiliate Team', 3),
  ('email', 'Thank you', 'Thank you from Pharmacozyme',
   E'Hello {name},\nThank you for representing Pharmacozyme. We appreciate the effort you put in.\nPharmacozyme Affiliate Team', 4)
on conflict do nothing;

commit;
