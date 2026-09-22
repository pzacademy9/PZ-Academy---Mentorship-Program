-- 0051_crm_course_backfill.sql
--
-- Backfills contact_purchases.course_id / import_batches.course_id for the
-- 5 CRM import batches that predate the import wizard's course picker.
-- Two of the batches belong to courses that don't exist in `courses` yet;
-- both are inserted as unpublished/draft since they exist only to tag
-- historical CRM data, not to appear in the public course catalog.

insert into public.courses (id, slug, title, type, price_pkr, status, is_published)
values
  ('a1000000-0000-4000-8000-000000000001', 'mep-workshop', 'Medication Error Prevention Course', 'workshop', 0, 'draft', false),
  ('a1000000-0000-4000-8000-000000000002', 'dr-shaistah-adr-reporting', 'Adverse Drug Reaction Reporting', 'webinar', 0, 'draft', false)
on conflict (slug) do nothing;

-- MEP Batch 1-Master Sheet was imported 3 times (same sheet re-run); match
-- by sheet_name so all 3 historical batch rows get tagged, not just the
-- latest one.
update public.import_batches
set course_id = 'a1000000-0000-4000-8000-000000000001'
where sheet_name = 'MEP Batch 1-Master Sheet'
  and course_id is null;

update public.import_batches
set course_id = '22222222-2222-4222-8222-222222222222' -- Mastering Dose Calculations (MDC) Workshop
where sheet_name = 'MDC 2 - Master Sheet'
  and course_id is null;

update public.import_batches
set course_id = 'a1000000-0000-4000-8000-000000000002'
where sheet_name = 'W19 Mastersheet'
  and course_id is null;

-- Propagate from batch to purchase. Guarded on cp.course_id is null so a
-- re-run (or a future import that already set course_id correctly) is a
-- no-op rather than an overwrite.
update public.contact_purchases cp
set course_id = ib.course_id
from public.import_batches ib
where cp.import_batch_id = ib.id
  and cp.course_id is null
  and ib.course_id is not null;
