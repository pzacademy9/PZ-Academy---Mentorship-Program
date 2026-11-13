-- 0113_affiliate_emails_progress.sql
-- Progress and motivation emails for affiliates. Adds (1) a "progress emailed" mark and an attempts counter on each
-- commission row, (2) a "motivation emailed" mark on each affiliate, (3) a one-row settings table that holds the
-- owner's motivation message, and (4) two new email kinds ('progress', 'motivation') in the affiliate_emails log.
-- Service role only (RLS on, no policies). The owner pastes this in the Supabase SQL editor. Safe to run twice.
--
-- Old sales are marked as already emailed (the backfill below) so that nobody gets a progress email about a sale
-- that happened before this feature. The guarded backfill runs before the index and the settings table are made.

begin;

-- ------------------------------------------------------------ columns
alter table public.affiliate_commissions add column if not exists progress_attempts integer not null default 0;
alter table public.affiliates add column if not exists motivation_emailed_at timestamptz;

-- ------------------------------------------------------------ progress mark + backfill, first run only
-- Every sale that exists now counts as emailed. This runs only when the column is not there yet, so pasting the
-- migration again later never marks new unsent sales as emailed.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'affiliate_commissions' and column_name = 'progress_emailed_at'
  ) then
    alter table public.affiliate_commissions add column progress_emailed_at timestamptz;
    update public.affiliate_commissions set progress_emailed_at = now() where progress_emailed_at is null;
  end if;
end $$;

-- ------------------------------------------------------------ pending-progress index
create index if not exists affiliate_commissions_progress_pending_idx
  on public.affiliate_commissions (affiliate_id)
  where progress_emailed_at is null and voided_at is null;

-- ------------------------------------------------------------ the owner's motivation message (one row only)
create table if not exists public.affiliate_email_settings (
  id         boolean primary key default true check (id),
  message    text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.affiliate_email_settings enable row level security;

insert into public.affiliate_email_settings (id) values (true) on conflict (id) do nothing;

-- ------------------------------------------------------------ widen the email kinds
alter table public.affiliate_emails drop constraint if exists affiliate_emails_kind_check;
alter table public.affiliate_emails add constraint affiliate_emails_kind_check
  check (kind in ('accepted', 'dropped', 'left', 'progress', 'motivation'));

commit;
