-- 0088: one permanent PZ ID per enrolled person.
-- ID format FirstName-1234 (letters-only first name + number from ONE global sequence
-- starting at 1000). Email is identity (stored lowercase, one email = one person).
-- Only paid or free, non-test registrations create a person. Service-role only: RLS on,
-- zero policies (same convention as 0067 / 0077). Safe to re-run.

-- ------------------------------------------------------------ tables
create table if not exists public.pz_people (
  id           uuid primary key default gen_random_uuid(),
  pz_id        text not null unique,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create table if not exists public.pz_person_emails (
  email     text primary key check (email = lower(email)),
  person_id uuid not null references public.pz_people (id) on delete cascade
);
create index if not exists pz_person_emails_person_idx
  on public.pz_person_emails (person_id);

create table if not exists public.pz_id_aliases (
  alias_norm text primary key,
  person_id  uuid not null references public.pz_people (id) on delete cascade,
  source     text not null check (source in ('own','legacy','review')),
  created_at timestamptz not null default now()
);
create index if not exists pz_id_aliases_person_idx
  on public.pz_id_aliases (person_id);

alter table public.pz_people enable row level security;
alter table public.pz_person_emails enable row level security;
alter table public.pz_id_aliases enable row level security;

create sequence if not exists public.pz_id_seq start 1000;

alter table public.landing_registrations
  add column if not exists person_id uuid references public.pz_people (id) on delete set null;
create index if not exists landing_registrations_person_idx
  on public.landing_registrations (person_id);

-- ------------------------------------------------------------ functions
-- Letters-only, capitalised first name (max 12 chars), titles stripped; 'Student' if empty.
create or replace function public.pz_first_name(p_name text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_rest text;
  v_word text;
begin
  v_rest := btrim(coalesce(p_name, ''));
  v_rest := regexp_replace(v_rest, '^((dr|mr|mrs|ms|miss|prof|engr)(\.\s*|\s+))+', '', 'i');
  v_word := (regexp_split_to_array(btrim(v_rest), '\s+'))[1];
  v_word := regexp_replace(coalesce(v_word, ''), '[^a-zA-Z]', '', 'g');
  v_word := left(initcap(v_word), 12);
  if v_word = '' then
    return 'Student';
  end if;
  return v_word;
end;
$$;

-- Returns the person for this email, creating one (with its own-ID alias) if new.
create or replace function public.pz_ensure_person(p_email text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_person uuid;
  v_pz_id  text;
begin
  if v_email = '' then
    return null;
  end if;

  -- serialise concurrent calls for the same email
  perform pg_advisory_xact_lock(hashtext('pz_ensure_person:' || v_email));

  select e.person_id into v_person
    from public.pz_person_emails e
   where e.email = v_email;
  if found then
    return v_person;
  end if;

  v_pz_id := public.pz_first_name(p_name) || '-' || nextval('public.pz_id_seq');

  insert into public.pz_people (pz_id, display_name)
  values (v_pz_id, btrim(coalesce(p_name, '')))
  returning id into v_person;

  insert into public.pz_person_emails (email, person_id)
  values (v_email, v_person);

  insert into public.pz_id_aliases (alias_norm, person_id, source)
  values (lower(btrim(v_pz_id)), v_person, 'own');

  return v_person;
end;
$$;

-- Folds person p_drop into p_keep. The dropped PZ ID stays valid as an alias.
create or replace function public.pz_merge_people(p_keep uuid, p_drop uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_keep is null or p_drop is null then
    raise exception 'pz_merge_people: both ids are required';
  end if;
  if p_keep = p_drop then
    raise exception 'pz_merge_people: cannot merge a person into itself';
  end if;
  if not exists (select 1 from public.pz_people where id = p_keep)
     or not exists (select 1 from public.pz_people where id = p_drop) then
    raise exception 'pz_merge_people: person not found';
  end if;

  update public.pz_person_emails set person_id = p_keep where person_id = p_drop;
  update public.pz_id_aliases set person_id = p_keep where person_id = p_drop;
  update public.landing_registrations set person_id = p_keep where person_id = p_drop;
  delete from public.pz_people where id = p_drop;
end;
$$;

revoke all on function public.pz_first_name(text) from public, anon, authenticated;
revoke all on function public.pz_ensure_person(text, text) from public, anon, authenticated;
revoke all on function public.pz_merge_people(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pz_first_name(text) to service_role;
grant execute on function public.pz_ensure_person(text, text) to service_role;
grant execute on function public.pz_merge_people(uuid, uuid) to service_role;

-- ------------------------------------------------------------ trigger
create or replace function public.landing_registrations_set_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('paid','free') and not new.is_test then
    new.person_id := public.pz_ensure_person(new.email, new.name);
  end if;
  return new;
end;
$$;

revoke all on function public.landing_registrations_set_person() from public, anon, authenticated;

drop trigger if exists landing_registrations_person on public.landing_registrations;
create trigger landing_registrations_person
  before insert or update of status, email, name on public.landing_registrations
  for each row execute function public.landing_registrations_set_person();

-- ------------------------------------------------------------ backfill
-- Oldest registrations first so earlier students get lower numbers.
do $$
declare
  r record;
begin
  for r in
    select id, email, name
      from public.landing_registrations
     where status in ('paid','free') and not is_test and person_id is null
     order by created_at, id
  loop
    update public.landing_registrations
       set person_id = public.pz_ensure_person(r.email, r.name)
     where id = r.id;
  end loop;
end;
$$;
