-- 0070_landing_variants.sql
-- Landing page variants (region / module overrides on top of a main page).
-- A variant belongs to one landing page and is keyed by a region (e.g. 'UK'),
-- a module (e.g. 'pharmacy-tech'), or both. Its draft/published jsonb holds the
-- VariantOverrides shape ({ "sections": {} } by default): only the sections that
-- differ from the main page. Like the main page, draft is what the admin edits,
-- published is what visitors see, and publish snapshots into landing_variant_versions.
-- Both tables are service-role only (RLS on, zero policies), as in 0067.
--
-- landing_publish_variant copies draft -> published, snapshots it as the next
-- version and returns that version number. It refuses (landing_main_not_published)
-- when the parent page has never been published, because a variant only overrides
-- a live main page. p_revision (optional) is the revision the app checked; if the
-- draft changed since then it raises landing_revision_conflict and writes nothing.
-- The draft and its revision are not touched, so the editor's next autosave still matches.
--
-- landing_rollback_variant copies a saved version into BOTH draft and published,
-- bumps revision (so any open editor's stale autosave is refused as a conflict),
-- snapshots it as a new version and returns that version number.
--
-- Both hold the variant row lock (select ... for update) so concurrent calls queue
-- instead of colliding on the unique (variant_id, version) check, same as 0068.
-- Errors use fixed messages: landing_variant_not_found, landing_version_not_found,
-- landing_revision_conflict, landing_main_not_published.
-- Service role only, like 0068: nothing in the browser calls these.
--
-- landing_registrations.variant_key records which variant (if any) a visitor
-- registered through; '' means the main page.

create table if not exists public.landing_page_variants (
  id           uuid primary key default gen_random_uuid(),
  page_id      uuid not null references public.landing_pages(id) on delete cascade,
  region_key   text check (region_key ~ '^[A-Z]{2,6}$'),
  module_key   text check (module_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  enabled      boolean not null default false,
  draft        jsonb not null default '{"sections":{}}'::jsonb,
  published    jsonb,
  revision     integer not null default 1,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (region_key is not null or module_key is not null)
);

create unique index if not exists landing_page_variants_key_uidx
  on public.landing_page_variants (page_id, coalesce(region_key, ''), coalesce(module_key, ''));

create table if not exists public.landing_variant_versions (
  id          uuid primary key default gen_random_uuid(),
  variant_id  uuid not null references public.landing_page_variants(id) on delete cascade,
  version     integer not null,
  content     jsonb not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (variant_id, version)
);

create index if not exists landing_variant_versions_variant_idx
  on public.landing_variant_versions (variant_id, version desc);

alter table public.landing_page_variants enable row level security;
alter table public.landing_variant_versions enable row level security;

alter table public.landing_registrations
  add column if not exists variant_key text not null default '';

create or replace function public.landing_publish_variant(
  p_variant_id uuid,
  p_user       uuid,
  p_revision   integer default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_variant public.landing_page_variants%rowtype;
  v_version integer;
begin
  select * into v_variant
    from public.landing_page_variants
   where id = p_variant_id
     for update;
  if not found then
    raise exception 'landing_variant_not_found';
  end if;

  if not exists (
    select 1 from public.landing_pages
     where id = v_variant.page_id
       and published is not null
  ) then
    raise exception 'landing_main_not_published';
  end if;

  if p_revision is not null and v_variant.revision <> p_revision then
    raise exception 'landing_revision_conflict';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
    from public.landing_variant_versions
   where variant_id = p_variant_id;

  insert into public.landing_variant_versions (variant_id, version, content, created_by)
  values (p_variant_id, v_version, v_variant.draft, p_user);

  update public.landing_page_variants
     set published    = v_variant.draft,
         published_at = now(),
         updated_at   = now()
   where id = p_variant_id;

  return v_version;
end;
$$;

create or replace function public.landing_rollback_variant(
  p_variant_id uuid,
  p_version    integer,
  p_user       uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_variant public.landing_page_variants%rowtype;
  v_content jsonb;
  v_version integer;
begin
  select * into v_variant
    from public.landing_page_variants
   where id = p_variant_id
     for update;
  if not found then
    raise exception 'landing_variant_not_found';
  end if;

  select content into v_content
    from public.landing_variant_versions
   where variant_id = p_variant_id
     and version = p_version;
  if not found then
    raise exception 'landing_version_not_found';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
    from public.landing_variant_versions
   where variant_id = p_variant_id;

  insert into public.landing_variant_versions (variant_id, version, content, created_by)
  values (p_variant_id, v_version, v_content, p_user);

  update public.landing_page_variants
     set draft        = v_content,
         published    = v_content,
         revision     = v_variant.revision + 1,
         published_at = now(),
         updated_at   = now()
   where id = p_variant_id;

  return v_version;
end;
$$;

revoke all on function public.landing_publish_variant(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.landing_publish_variant(uuid, uuid, integer) to service_role;
revoke all on function public.landing_rollback_variant(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.landing_rollback_variant(uuid, integer, uuid) to service_role;

-- landing_create_registration redefined from 0069 with ONE change: variant_key is now in the insert
-- column list and values, read from each row like the other fields ('' when absent = main page).
-- Without this the column added above would silently stay '' for every registration.
-- Signature, security definer, search_path and grants are exactly 0069's.
create or replace function public.landing_create_registration(
  p_page_id  uuid,
  p_rows     jsonb,
  p_promo_id uuid    default null,
  p_is_test  boolean default false,
  p_capacity integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_people  integer;
  v_taken   integer;
  v_prefix  text;
  v_n       integer;
  v_ref     text;
  v_lead_id uuid;
  v_id      uuid;
  v_ids     uuid[] := '{}';
  v_row     jsonb;
  v_idx     integer := 0;
  v_ord     bigint;
  v_type    text;
  v_test    boolean := coalesce(p_is_test, false);
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'invalid_rows';
  end if;
  v_people := jsonb_array_length(p_rows);

  select coalesce(
           nullif(lp.ref_prefix, ''),
           case when lp.published #>> '{registration,refPrefix}' ~ '^[A-Z0-9]{2,6}$'
                then lp.published #>> '{registration,refPrefix}' end,
           'REG')
    into v_prefix
    from public.landing_pages lp
   where lp.id = p_page_id;
  if not found then
    raise exception 'page_not_found';
  end if;

  -- One registration at a time per page: makes the capacity check and the counter race-free.
  perform pg_advisory_xact_lock(hashtextextended(p_page_id::text, 0));

  if not v_test and coalesce(p_capacity, 0) > 0 then
    select count(*) into v_taken
      from public.landing_registrations r
     where r.page_id = p_page_id
       and not r.is_test;
    if v_taken + v_people > p_capacity then
      raise exception 'capacity_full';
    end if;
  end if;

  if p_promo_id is not null and not v_test then
    update public.landing_promo_codes pc
       set used_count = pc.used_count + 1,
           updated_at = now()
     where pc.id = p_promo_id
       and (pc.max_uses is null or pc.used_count < pc.max_uses)
       and pc.active
       and (pc.starts_at is null or pc.starts_at <= now())
       and (pc.ends_at is null or pc.ends_at > now());
    if not found then
      raise exception 'promo_exhausted';
    end if;
  end if;

  if v_test then
    loop
      v_ref := 'TEST-' || lpad(floor(random() * 100000)::int::text, 5, '0');
      exit when not exists (select 1 from public.landing_registrations r where r.ref_id = v_ref);
    end loop;
  else
    insert into public.landing_ref_counters as c (prefix, last_number, updated_at)
    values (v_prefix, 1, now())
    on conflict (prefix) do update set last_number = c.last_number + 1, updated_at = now()
    returning last_number into v_n;
    v_ref := 'PZA-' || v_prefix || '-' || case when v_n < 1000 then lpad(v_n::text, 3, '0') else v_n::text end;
  end if;

  for v_row, v_ord in
    select e.value, e.ord from jsonb_array_elements(p_rows) with ordinality as e(value, ord) order by e.ord
  loop
    v_type := coalesce(v_row->>'row_type', '');
    if v_idx = 0 and v_type not in ('individual', 'lead') then
      raise exception 'invalid_rows';
    end if;
    if v_idx = 0 and v_type = 'individual' and v_people > 1 then
      raise exception 'invalid_rows';
    end if;
    if v_idx > 0 and v_type <> 'member' then
      raise exception 'invalid_rows';
    end if;

    insert into public.landing_registrations (
      page_id, row_type, lead_registration_id, name, email, whatsapp, profession, city, region,
      discovery, consent, option_label, option_keys, mode, tier_key, group_size, promo_code_id,
      promo_code_text, expected_amount, currency, payment_method, voucher_url, status,
      status_changed_at, status_source, student_id, ref_id, agent_id, referral_code, utm, fbp,
      fbc, event_id, session_id, is_test, variant_key
    ) values (
      p_page_id,
      v_type,
      case when v_idx = 0 then null else v_lead_id end,
      coalesce(v_row->>'name', ''),
      lower(trim(coalesce(v_row->>'email', ''))),
      coalesce(v_row->>'whatsapp', ''),
      coalesce(v_row->>'profession', ''),
      coalesce(v_row->>'city', ''),
      coalesce(v_row->>'region', ''),
      coalesce(v_row->>'discovery', ''),
      coalesce((v_row->>'consent')::boolean, false),
      coalesce(v_row->>'option_label', ''),
      array(select jsonb_array_elements_text(coalesce(nullif(v_row->'option_keys', 'null'::jsonb), '[]'::jsonb))),
      coalesce(v_row->>'mode', 'live'),
      coalesce(v_row->>'tier_key', 'individual'),
      coalesce((v_row->>'group_size')::integer, 1),
      case when v_idx = 0 and not v_test then p_promo_id else null end,
      coalesce(v_row->>'promo_code_text', ''),
      coalesce((v_row->>'expected_amount')::numeric, 0),
      coalesce(v_row->>'currency', ''),
      coalesce(v_row->>'payment_method', ''),
      coalesce(v_row->>'voucher_url', ''),
      coalesce(v_row->>'status', 'pending'),
      now(),
      'app',
      nullif(v_row->>'student_id', '')::uuid,
      case when v_idx = 0 then v_ref else null end,
      nullif(v_row->>'agent_id', '')::uuid,
      coalesce(v_row->>'referral_code', ''),
      coalesce(nullif(v_row->'utm', 'null'::jsonb), '{}'::jsonb),
      coalesce(v_row->>'fbp', ''),
      coalesce(v_row->>'fbc', ''),
      coalesce(v_row->>'event_id', ''),
      coalesce(v_row->>'session_id', ''),
      v_test,
      coalesce(v_row->>'variant_key', '')
    )
    returning id into v_id;

    if v_idx = 0 then
      v_lead_id := v_id;
    end if;
    v_ids := v_ids || v_id;
    v_idx := v_idx + 1;
  end loop;

  return jsonb_build_object('ref_id', v_ref, 'registration_ids', to_jsonb(v_ids));
end;
$$;

revoke all on function public.landing_create_registration(uuid, jsonb, uuid, boolean, integer) from public, anon, authenticated;
grant execute on function public.landing_create_registration(uuid, jsonb, uuid, boolean, integer) to service_role;
