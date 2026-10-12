-- 0067_landing_pages.sql
-- Landing page builder (Phase 1). A page's content is one jsonb document:
-- draft is what the admin edits; published is what visitors see. Publish
-- copies draft -> published and snapshots it in landing_page_versions.
-- Both tables are service-role only (RLS on, zero policies), the convention
-- from 0033/0047/0058/0066: all access goes through createAdminSupabase()
-- behind requireAdmin() / the public render route.

create table if not exists public.landing_pages (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique
               check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  kind         text not null check (kind in ('course', 'workshop', 'webinar')),
  title        text not null check (char_length(title) between 1 and 120),
  status       text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  draft        jsonb not null,
  published    jsonb,
  revision     integer not null default 1,
  published_at timestamptz,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (status = 'draft' or published is not null)
);

create table if not exists public.landing_page_versions (
  id          uuid primary key default gen_random_uuid(),
  page_id     uuid not null references public.landing_pages(id) on delete cascade,
  version     integer not null,
  content     jsonb not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (page_id, version)
);

create index if not exists landing_page_versions_page_idx
  on public.landing_page_versions (page_id, version desc);

alter table public.landing_pages enable row level security;
alter table public.landing_page_versions enable row level security;
