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
