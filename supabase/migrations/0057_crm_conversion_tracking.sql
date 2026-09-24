-- 0057_crm_conversion_tracking.sql
--
-- Lets an admin tag a WhatsApp batch or email campaign with the course it
-- was promoting, so conversion (a new matching purchase after sent_at) can
-- be computed at read time. Two mutually exclusive tag forms: an existing
-- courses row, or (since ~78% of contact_purchases.course_id is still null
-- — most product_label strings were never backfilled to a course) a
-- free-text pattern matched against contact_purchases.product_label.
-- Both null means "not tracking conversion" — an explicit admin choice
-- at creation time, never a silent default (see design doc, Decisions).

alter table public.whatsapp_batches
  add column if not exists conversion_course_id uuid references public.courses(id) on delete set null,
  add column if not exists conversion_label_match text;

alter table public.campaigns
  add column if not exists conversion_course_id uuid references public.courses(id) on delete set null,
  add column if not exists conversion_label_match text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'whatsapp_batches_conversion_tag_exclusive'
  ) then
    alter table public.whatsapp_batches
      add constraint whatsapp_batches_conversion_tag_exclusive
      check (conversion_course_id is null or conversion_label_match is null);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'campaigns_conversion_tag_exclusive'
  ) then
    alter table public.campaigns
      add constraint campaigns_conversion_tag_exclusive
      check (conversion_course_id is null or conversion_label_match is null);
  end if;
end $$;
