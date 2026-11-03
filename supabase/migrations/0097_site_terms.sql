-- The general Terms and Conditions shown on landing pages that have no Terms of their own.
-- One row, key 'general'. Service-role only (RLS on, no policies), like the other landing tables:
-- every read and write goes through createAdminSupabase() behind requireAdmin() or a server page.

create table if not exists public.site_terms (
  key        text primary key check (key = 'general'),
  body       text not null default '' check (char_length(body) <= 20000),
  updated_at timestamptz not null default now()
);

alter table public.site_terms enable row level security;

insert into public.site_terms (key, body) values ('general', '')
on conflict (key) do nothing;
