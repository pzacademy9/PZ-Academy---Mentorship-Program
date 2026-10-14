-- 0069_landing_registration.sql
-- Landing page builder, Phase 2: the registration engine.
-- New tables are service-role only (RLS on, zero policies), the convention from
-- 0033/0047/0058/0066/0067: every read and write goes through createAdminSupabase()
-- behind requireAdmin() or a public API route that validates its input.
-- landing_create_registration() inserts a whole registration (lead + members) in one
-- transaction: capacity check, promo use, ref-id allocation and the rows. It replaces
-- the legacy read-then-write doGet ref generator that could hand out the same ref twice.

-- ------------------------------------------------------------ landing_pages additions
alter table public.landing_pages
  add column if not exists course_id       uuid references public.courses(id) on delete set null,
  add column if not exists sheet_id        text,
  add column if not exists drive_folder_id text,
  add column if not exists ref_prefix      text check (ref_prefix is null or ref_prefix ~ '^[A-Z0-9]{2,6}$');

-- ------------------------------------------------------------ payment accounts library
create table if not exists public.payment_accounts (
  key          text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  label        text not null check (char_length(label) between 1 and 80),
  kind         text not null check (kind in ('bank', 'wallet', 'paypal')),
  rows         jsonb not null default '[]'::jsonb,
  display_text text not null default '',
  sort         integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- The accounts shown on the three legacy pages, one entry per real account
-- (MDC's "ksa_local" is the same ANB account; W20's "pnb" is pnb_ph; MDC adds the
-- Mashreq account number, kept here).
insert into public.payment_accounts (key, label, kind, rows, display_text, sort) values
  ('faysal', 'Faysal Bank', 'bank',
   '[{"label":"Account No.","value":"3573499000006913"},{"label":"Account Title","value":"PHARMACOZYME (PRIVATE) LIMITED"}]'::jsonb,
   'Bank Transfer · Recommended', 10),
  ('easypaisa', 'EasyPaisa', 'wallet',
   '[{"label":"Mobile No.","value":"03401940624"},{"label":"Account Title","value":"Aftab Alam"}]'::jsonb,
   'Mobile Wallet', 20),
  ('mashreq', 'Mashreq Bank', 'bank',
   '[{"label":"IBAN","value":"AE800330000019101064212"},{"label":"Account No.","value":"019101064212"},{"label":"Account Holder","value":"Asma Kanwal Ghulam Hussain"}]'::jsonb,
   'Bank Transfer · AED', 30),
  ('anb', 'Arab National Bank', 'bank',
   '[{"label":"IBAN","value":"SA55301009740171345304360"},{"label":"Account Holder","value":"Imad Mohammad Khan Mohammad Hussain Khan"}]'::jsonb,
   'Bank Transfer · SAR', 40),
  ('pnb_ph', 'Philippine National Bank', 'bank',
   '[{"label":"Savings Account No.","value":"3137-1020-0139"},{"label":"Account Name","value":"Christine Agnes Astrid G. Veloso-Navarro"}]'::jsonb,
   'Bank Transfer · PHP', 50),
  ('gcash', 'GCash', 'wallet',
   '[{"label":"GCash No.","value":"09457717033"}]'::jsonb,
   'Mobile Wallet · PHP', 60),
  ('pnb_in', 'Punjab National Bank', 'bank',
   '[{"label":"Account No.","value":"0884001500003043"},{"label":"IFSC Code","value":"PUNB0088400"}]'::jsonb,
   'Bank Transfer · INR', 70),
  ('paypal', 'PayPal', 'paypal',
   '[{"label":"PayPal Link","value":"https://paypal.me/PharmacozymeOfficial"},{"label":"Email","value":"pharmacozymeofficial@gmail.com"}]'::jsonb,
   'International · Friends & Family', 80)
on conflict (key) do nothing;

-- ------------------------------------------------------------ promo codes
create table if not exists public.landing_promo_codes (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique check (code ~ '^[A-Z0-9_-]{2,40}$'),
  type                 text not null check (type in ('percent', 'fixed')),
  value                numeric(12,2) not null default 0 check (value >= 0),
  fixed_amounts        jsonb not null default '{}'::jsonb,
  max_discount_percent numeric(5,2) not null default 0 check (max_discount_percent between 0 and 100),
  page_ids             uuid[] not null default '{}',
  option_keys          text[] not null default '{}',
  max_uses             integer check (max_uses is null or max_uses > 0),
  used_count           integer not null default 0 check (used_count >= 0),
  one_per_email        boolean not null default false,
  starts_at            timestamptz,
  ends_at              timestamptz,
  active               boolean not null default true,
  owner_agent_id       uuid references public.profiles(id) on delete set null,
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

-- ------------------------------------------------------------ registrations (one row per person)
create table if not exists public.landing_registrations (
  id                   uuid primary key default gen_random_uuid(),
  page_id              uuid not null references public.landing_pages(id),
  row_type             text not null check (row_type in ('individual', 'lead', 'member')),
  lead_registration_id uuid references public.landing_registrations(id) on delete cascade,
  name                 text not null check (char_length(name) between 1 and 200),
  email                text not null check (email = lower(email) and position('@' in email) > 1),
  whatsapp             text not null default '',
  profession           text not null default '',
  city                 text not null default '',
  region               text not null,
  discovery            text not null default '',
  consent              boolean not null default false,
  option_label         text not null default '',
  option_keys          text[] not null default '{}',
  mode                 text not null default 'live' check (mode in ('live', 'recorded')),
  tier_key             text not null default 'individual',
  group_size           integer not null default 1 check (group_size between 1 and 50),
  promo_code_id        uuid references public.landing_promo_codes(id) on delete set null,
  promo_code_text      text not null default '',
  expected_amount      numeric(12,2) not null default 0 check (expected_amount >= 0),
  currency             text not null,
  payment_method       text not null default '',
  voucher_url          text not null default '',
  status text not null default 'pending' check (status in ('pending', 'paid', 'underpaid', 'reserved', 'free')),
  amount_received      numeric(12,2),
  email_status         text not null default '',
  status_changed_at    timestamptz,
  status_source        text not null default 'app' check (status_source in ('app', 'sheet')),
  student_id           uuid references public.profiles(id) on delete set null,
  ref_id               text,
  agent_id             uuid references public.profiles(id) on delete set null,
  referral_code        text not null default '',
  utm                  jsonb not null default '{}'::jsonb,
  fbp                  text not null default '',
  fbc                  text not null default '',
  event_id             text not null default '',
  session_id           text not null default '',
  is_test              boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check ((row_type = 'member') = (lead_registration_id is not null)),
  check (row_type = 'member' or ref_id is not null)
);

-- Members carry ref_id = null (their Sheet row shows the lead's ref), so the
-- uniqueness only covers leads and individuals.
create unique index if not exists landing_registrations_ref_id_key
  on public.landing_registrations (ref_id) where ref_id is not null;
create index if not exists landing_registrations_page_email_idx
  on public.landing_registrations (page_id, email);
create index if not exists landing_registrations_email_idx
  on public.landing_registrations (email);
create index if not exists landing_registrations_student_idx
  on public.landing_registrations (student_id);
create index if not exists landing_registrations_lead_idx
  on public.landing_registrations (lead_registration_id);

-- ------------------------------------------------------------ status history (idempotency + tracing)
create table if not exists public.landing_status_events (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.landing_registrations(id) on delete cascade,
  from_status     text,
  to_status       text not null,
  source          text not null check (source in ('app', 'sheet')),
  at              timestamptz not null default now()
);
create index if not exists landing_status_events_registration_idx
  on public.landing_status_events (registration_id, to_status);

-- ------------------------------------------------------------ funnel events (lightweight)
create table if not exists public.landing_funnel_events (
  id         bigint generated always as identity primary key,
  page_id    uuid not null references public.landing_pages(id) on delete cascade,
  session_id text not null check (char_length(session_id) between 1 and 100),
  type       text not null check (type in ('view', 'start', 'step', 'submit')),
  utm        jsonb not null default '{}'::jsonb,
  agent_id   uuid references public.profiles(id) on delete set null,
  at         timestamptz not null default now()
);
create index if not exists landing_funnel_events_page_idx
  on public.landing_funnel_events (page_id, at desc);
create index if not exists landing_funnel_events_session_idx
  on public.landing_funnel_events (page_id, session_id, type);

-- ------------------------------------------------------------ agent links (one code per sales agent)
create table if not exists public.landing_agent_links (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid not null unique references public.profiles(id) on delete cascade,
  code       text not null unique check (code ~ '^[a-z0-9-]{3,40}$'),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------ per-page ref counters
create table if not exists public.landing_ref_counters (
  page_id     uuid primary key references public.landing_pages(id) on delete cascade,
  last_number integer not null default 0 check (last_number >= 0),
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------ background jobs (outbox)
create table if not exists public.landing_jobs (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.landing_registrations(id) on delete cascade,
  type            text not null check (type in ('sheet_append', 'email_received', 'email_members', 'email_admin')),
  status          text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts        integer not null default 0 check (attempts >= 0),
  next_run_at     timestamptz not null default now(),
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (registration_id, type)
);
create index if not exists landing_jobs_due_idx
  on public.landing_jobs (status, next_run_at);

-- ------------------------------------------------------------ RLS (zero policies = service role only)
alter table public.payment_accounts enable row level security;
alter table public.landing_promo_codes enable row level security;
alter table public.landing_registrations enable row level security;
alter table public.landing_status_events enable row level security;
alter table public.landing_funnel_events enable row level security;
alter table public.landing_agent_links enable row level security;
alter table public.landing_ref_counters enable row level security;
alter table public.landing_jobs enable row level security;

-- ------------------------------------------------------------ atomic registration insert
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
  v_type    text;
  v_test    boolean := coalesce(p_is_test, false);
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'invalid_rows';
  end if;
  v_people := jsonb_array_length(p_rows);

  select coalesce(nullif(lp.ref_prefix, ''), nullif(lp.published #>> '{registration,refPrefix}', ''), 'REG')
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
       and (pc.max_uses is null or pc.used_count < pc.max_uses);
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
    insert into public.landing_ref_counters as c (page_id, last_number, updated_at)
    values (p_page_id, 1, now())
    on conflict (page_id) do update set last_number = c.last_number + 1, updated_at = now()
    returning last_number into v_n;
    v_ref := 'PZA-' || v_prefix || '-' || case when v_n < 1000 then lpad(v_n::text, 3, '0') else v_n::text end;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
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
      fbc, event_id, session_id, is_test
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
      array(select jsonb_array_elements_text(coalesce(v_row->'option_keys', '[]'::jsonb))),
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
      coalesce(v_row->'utm', '{}'::jsonb),
      coalesce(v_row->>'fbp', ''),
      coalesce(v_row->>'fbc', ''),
      coalesce(v_row->>'event_id', ''),
      coalesce(v_row->>'session_id', ''),
      v_test
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
