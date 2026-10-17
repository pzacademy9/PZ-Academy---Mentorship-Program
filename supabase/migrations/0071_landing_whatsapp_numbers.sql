-- 0071_landing_whatsapp_numbers.sql
-- Shared list of WhatsApp numbers the landing page editor can pick for a hero's
-- "Chat on WhatsApp" button. The two official numbers live in code
-- (src/lib/landing/whatsapp.ts) and are never stored here; this table holds only
-- the extra numbers an admin adds. number is digits only with country code
-- (8 to 15 digits) and unique, so the same number cannot be saved twice.
-- Service role only (RLS on, zero policies), as in 0067 and 0070: the app reads
-- and writes it through the admin API routes, nothing in the browser touches it.

create table if not exists public.landing_whatsapp_numbers (
  id         uuid primary key default gen_random_uuid(),
  label      text not null check (char_length(label) between 1 and 60),
  number     text not null unique check (number ~ '^[0-9]{8,15}$'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.landing_whatsapp_numbers enable row level security;
