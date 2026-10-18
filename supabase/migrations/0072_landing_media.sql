-- 0072_landing_media.sql
-- Shared picture library for the landing page editor. Each row is one image an
-- admin uploaded to Drive; the editor lists them so a picture can be reused on
-- many landing pages instead of being uploaded again. drive_file_id is unique,
-- so the same Drive file cannot be registered twice. width/height/orientation
-- are optional and let the picker flag pictures that suit a wide or tall slot.
-- Service role only (RLS on, zero policies), as in 0067, 0070 and 0071: the app
-- reads and writes it through the admin API routes, nothing in the browser
-- touches it.

create table if not exists public.landing_media (
  id            uuid primary key default gen_random_uuid(),
  drive_file_id text not null unique,
  url           text not null,
  name          text not null check (char_length(name) between 1 and 80),
  folder        text not null default 'misc' check (folder in ('heroes','instructors','misc')),
  width         int,
  height        int,
  orientation   text check (orientation in ('wide','tall','square')),
  size_bytes    int,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists landing_media_folder_created_idx
  on public.landing_media (folder, created_at desc);

alter table public.landing_media enable row level security;
