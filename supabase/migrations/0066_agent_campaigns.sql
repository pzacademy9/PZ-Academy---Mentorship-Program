-- 0066_agent_campaigns.sql
-- Agent campaigns: a sales agent's own WhatsApp campaign reuses whatsapp_batches.
-- owner_agent_id is null for admin batches (unchanged). Service-role only, no policies.
alter table public.whatsapp_batches
  add column if not exists owner_agent_id uuid references public.profiles(id) on delete set null,
  add column if not exists number_id uuid references public.whatsapp_numbers(id) on delete set null,
  add column if not exists followup_in_hours integer check (followup_in_hours is null or followup_in_hours in (8, 24, 48, 72)),
  add column if not exists status text not null default 'active',
  add column if not exists paused_reason text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.whatsapp_batches
  drop constraint if exists whatsapp_batches_status_check;
alter table public.whatsapp_batches
  add constraint whatsapp_batches_status_check check (status in ('draft', 'active', 'paused', 'done'));

create index if not exists whatsapp_batches_owner_agent_idx
  on public.whatsapp_batches (owner_agent_id, created_at desc);

alter type public.whatsapp_send_status add value if not exists 'skipped';
alter type public.whatsapp_send_status add value if not exists 'blocked';
