-- Migration 0100: custom access per team member, and the first super admin.
-- Run AFTER 0099 has been run on its own.

create table if not exists public.team_access (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  extra_areas   text[] not null default '{}',
  removed_areas text[] not null default '{}',
  active        boolean not null default true,
  previous_role public.user_role null,
  updated_at    timestamptz not null default now()
);

-- Service-role only: RLS on, zero policies. Read and written by the app behind the super admin check.
alter table public.team_access enable row level security;

-- Promote the owner. Runs only when there is exactly one admin and no super admin yet,
-- so it can never promote the wrong person once a team exists.
update public.profiles
   set role = 'super_admin'
 where role = 'admin'
   and (select count(*) from public.profiles where role = 'admin') = 1
   and not exists (select 1 from public.profiles where role = 'super_admin');
