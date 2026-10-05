-- Migration 0062: contact ownership for the sales workspace.
-- owner_id is the sales agent who has claimed the contact (null = unclaimed).
-- Existing contacts stay unclaimed; no backfill.
alter table public.contacts
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists claimed_at timestamptz;

create index if not exists contacts_owner_id_idx on public.contacts (owner_id);
