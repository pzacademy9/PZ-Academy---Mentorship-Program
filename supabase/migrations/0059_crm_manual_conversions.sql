-- 0059_crm_manual_conversions.sql
--
-- Lets an admin record that a contact converted for a program independent
-- of any batch/campaign and the automatic purchase-matching window in
-- src/lib/crm/conversion.ts. Exactly one of course_id/program_label is set
-- per row (enforced in application code, mirroring how ConversionTag's
-- course-vs-label duality is validated elsewhere — see toConversionTag /
-- fromConversionTag in admin-crm-conversions.ts) — never counted into any
-- batch/campaign's computed conversion percentage.

create table if not exists public.manual_conversions (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  course_id     uuid references public.courses(id) on delete set null,
  program_label text,
  converted_at  date not null default current_date,
  note          text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists manual_conversions_contact_idx on public.manual_conversions (contact_id);

alter table public.manual_conversions enable row level security;
