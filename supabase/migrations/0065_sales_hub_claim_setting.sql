-- 0065_sales_hub_claim_setting.sql
-- Sales Hub: admin on/off switch for agents claiming unassigned contacts.
-- Default off: contacts reach agents through admin assignment. Lives on the
-- existing single-row settings table (id is always true).
alter table public.whatsapp_safety_settings
  add column if not exists agents_can_claim boolean not null default false;
