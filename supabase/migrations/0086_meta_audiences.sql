-- 0086_meta_audiences.sql
--
-- Meta audiences: close a landing batch into the CRM as two cohorts
-- (paid / interested) that Meta custom-audience exports read from.
--
--   * import_batches.kind / source_page_id mark cohort rows created by
--     landing_close_batch (kind 'imported' = ordinary sheet imports).
--   * import_batch_contacts is the cohort membership list. The interested
--     cohort is rebuilt on every run; the paid cohort is carried by
--     contact_purchases.import_batch_id as for sheet imports.
--   * landing_close_batch(...) mirrors crm_import_commit (migration 0053):
--     match contact by email then phone, merge with a unique_violation
--     guard, upsert contact_purchases on (source_sheet_id, source_row_ref).
--     It never touches the registrations table.

alter table public.import_batches
  add column if not exists kind text not null default 'imported';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'import_batches_kind_check'
  ) then
    alter table public.import_batches
      add constraint import_batches_kind_check
      check (kind in ('imported','closed_paid','closed_interested'));
  end if;
end $$;

alter table public.import_batches
  add column if not exists source_page_id uuid references public.landing_pages(id) on delete set null;

create unique index if not exists import_batches_closed_cohort_uidx
  on public.import_batches (sheet_id, tab_name)
  where kind <> 'imported';

create table if not exists public.import_batch_contacts (
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  contact_id      uuid not null references public.contacts(id) on delete cascade,
  primary key (import_batch_id, contact_id)
);

create index if not exists import_batch_contacts_contact_idx
  on public.import_batch_contacts (contact_id);

-- Service role only: RLS on, zero policies.
alter table public.import_batch_contacts enable row level security;

create or replace function public.landing_close_batch(
  p_page_id     uuid,
  p_page_title  text,
  p_course_id   uuid,
  p_created_by  uuid,
  p_rows        jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sheet_id            text := 'landing:' || p_page_id::text;
  v_paid_batch_id       uuid;
  v_interested_batch_id uuid;
  v_row                 jsonb;
  v_contact             jsonb;
  v_purchase            jsonb;
  v_bucket              text;
  v_email               text;
  v_phone               text;
  v_contact_id          uuid;
  v_interested_ids      uuid[] := '{}';
  v_paid_added          integer := 0;
  v_interested_added    integer := 0;
  v_paid_total          integer := 0;
  v_interested_total    integer := 0;
  v_paid_created        integer := 0;
  v_paid_merged         integer := 0;
  v_int_created         integer := 0;
  v_int_merged          integer := 0;
begin
  set local statement_timeout = '55s';

  -- Serialise overlapping closes of the same page.
  perform pg_advisory_xact_lock(hashtext('landing:' || p_page_id::text));

  -- Find or create the two cohort batches.
  select id into v_paid_batch_id
  from public.import_batches
  where sheet_id = v_sheet_id and tab_name = 'paid' and kind <> 'imported'
  limit 1;

  if v_paid_batch_id is null then
    insert into public.import_batches (
      sheet_id, sheet_name, tab_name, course_id, status, kind, source_page_id, created_by
    )
    values (
      v_sheet_id, coalesce(p_page_title, '') || ' (paid)', 'paid', p_course_id,
      'committed', 'closed_paid', p_page_id, p_created_by
    )
    returning id into v_paid_batch_id;
  else
    update public.import_batches
    set sheet_name = coalesce(p_page_title, '') || ' (paid)',
        course_id = p_course_id,
        source_page_id = p_page_id
    where id = v_paid_batch_id;
  end if;

  select id into v_interested_batch_id
  from public.import_batches
  where sheet_id = v_sheet_id and tab_name = 'interested' and kind <> 'imported'
  limit 1;

  if v_interested_batch_id is null then
    insert into public.import_batches (
      sheet_id, sheet_name, tab_name, course_id, status, kind, source_page_id, created_by
    )
    values (
      v_sheet_id, coalesce(p_page_title, '') || ' (interested)', 'interested', p_course_id,
      'committed', 'closed_interested', p_page_id, p_created_by
    )
    returning id into v_interested_batch_id;
  else
    update public.import_batches
    set sheet_name = coalesce(p_page_title, '') || ' (interested)',
        course_id = p_course_id,
        source_page_id = p_page_id
    where id = v_interested_batch_id;
  end if;

  -- Paid rows first: a contact created from an interested row must not win
  -- the consent_basis over the same person's paid row in this run.
  for v_row in
    select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
    order by (value ->> 'bucket') = 'paid' desc
  loop
    v_contact  := v_row -> 'contact';
    v_purchase := v_row -> 'purchase';
    v_bucket   := v_row ->> 'bucket';

    if v_bucket is null or v_bucket not in ('paid', 'interested') then
      continue;
    end if;

    v_email := nullif(v_contact ->> 'email', '');
    v_phone := nullif(v_contact ->> 'phoneE164', '');

    -- No identity at all: nothing to match or create.
    if v_email is null and v_phone is null then
      continue;
    end if;

    if v_bucket = 'paid' then
      v_paid_total := v_paid_total + 1;
    else
      v_interested_total := v_interested_total + 1;
    end if;

    v_contact_id := null;

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
        case when v_bucket = 'paid' then 'purchase'::public.crm_consent_basis
             else 'enquiry'::public.crm_consent_basis end
      )
      returning id into v_contact_id;

      if v_bucket = 'paid' then
        v_paid_created := v_paid_created + 1;
      else
        v_int_created := v_int_created + 1;
      end if;
    else
      begin
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
                             end,
          -- Upgrade only: an enquiry who later pays becomes 'purchase' (so email
          -- broadcasts stay sendable); never downgrade an existing basis.
          consent_basis = case when v_bucket = 'paid' then 'purchase'::public.crm_consent_basis else consent_basis end
        where id = v_contact_id;
      exception when unique_violation then
        -- Split-identity duplicate (see migration 0053): leave the matched
        -- contact untouched and let Merge Review reconcile.
        null;
      end;

      if v_bucket = 'paid' then
        v_paid_merged := v_paid_merged + 1;
      else
        v_int_merged := v_int_merged + 1;
      end if;
    end if;

    if v_bucket = 'paid' then
      insert into public.contact_purchases (
        contact_id, import_batch_id, source_sheet_id, source_row_ref,
        product_label, course_id, amount, currency, is_early_bird, row_type, promo_code, purchased_at
      )
      values (
        v_contact_id, v_paid_batch_id, v_sheet_id, v_row ->> 'rowRef',
        coalesce(p_page_title, ''),
        p_course_id,
        (nullif(v_purchase ->> 'amount', ''))::numeric,
        nullif(v_purchase ->> 'currency', ''),
        false,
        coalesce((v_purchase ->> 'rowType')::public.crm_row_type, 'individual'),
        nullif(v_purchase ->> 'promoCode', ''),
        (nullif(v_purchase ->> 'purchasedAt', ''))::timestamptz
      )
      on conflict (source_sheet_id, source_row_ref) do update
      set
        contact_id      = excluded.contact_id,
        import_batch_id = excluded.import_batch_id,
        product_label   = excluded.product_label,
        course_id       = coalesce(excluded.course_id, public.contact_purchases.course_id),
        amount          = excluded.amount,
        currency        = excluded.currency,
        is_early_bird   = excluded.is_early_bird,
        row_type        = excluded.row_type,
        promo_code      = excluded.promo_code,
        purchased_at    = excluded.purchased_at;

      v_paid_added := v_paid_added + 1;
    else
      v_interested_ids := array_append(v_interested_ids, v_contact_id);
    end if;
  end loop;

  -- Interested cohort is rebuilt every run, excluding anyone who has bought.
  delete from public.import_batch_contacts where import_batch_id = v_interested_batch_id;

  insert into public.import_batch_contacts (import_batch_id, contact_id)
  select v_interested_batch_id, c.id
  from (select distinct unnest(v_interested_ids) as id) c
  where not exists (
    select 1 from public.contact_purchases cp where cp.contact_id = c.id
  );

  select count(*) into v_interested_added
  from public.import_batch_contacts where import_batch_id = v_interested_batch_id;

  update public.import_batches
  set rows_total       = v_paid_total,
      rows_imported    = v_paid_added,
      rows_skipped     = v_paid_total - v_paid_added,
      contacts_created = v_paid_created,
      contacts_merged  = v_paid_merged
  where id = v_paid_batch_id;

  update public.import_batches
  set rows_total       = v_interested_total,
      rows_imported    = v_interested_added,
      rows_skipped     = v_interested_total - v_interested_added,
      contacts_created = v_int_created,
      contacts_merged  = v_int_merged
  where id = v_interested_batch_id;

  return jsonb_build_object(
    'paid_batch_id',       v_paid_batch_id,
    'interested_batch_id', v_interested_batch_id,
    'paid_added',          v_paid_added,
    'interested_added',    v_interested_added,
    'contacts_created',    v_paid_created + v_int_created,
    'contacts_merged',     v_paid_merged + v_int_merged
  );
end;
$$;

revoke all on function public.landing_close_batch(uuid, text, uuid, uuid, jsonb) from public, anon, authenticated;
