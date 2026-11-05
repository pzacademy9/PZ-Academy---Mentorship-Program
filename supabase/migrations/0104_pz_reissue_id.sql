-- 0104: let an admin give a student a new PZ ID (for example after fixing a misspelt name).
-- The new ID is built from the person's current display name, exactly like pz_ensure_person
-- does (first name + '-' + next number). The old ID stays as an alias, so old quiz results,
-- attendance and anything a student already typed still match. Nothing is deleted.
-- Safe to run more than once.

create or replace function public.pz_reissue_id(p_person uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old  text;
  v_name text;
  v_new  text;
begin
  if p_person is null then
    raise exception 'pz_reissue_id: person id is required';
  end if;

  select pz_id, display_name into v_old, v_name
    from public.pz_people
   where id = p_person
     for update;
  if not found then
    raise exception 'pz_reissue_id: person not found';
  end if;

  -- Skip any number whose ID is already taken as an ID or an alias (old IDs can collide).
  loop
    v_new := public.pz_first_name(v_name) || '-' || nextval('public.pz_id_seq');
    exit when not exists (select 1 from public.pz_id_aliases where alias_norm = lower(btrim(v_new)))
          and not exists (select 1 from public.pz_people where lower(pz_id) = lower(v_new));
  end loop;

  -- The old ID keeps pointing at this person.
  insert into public.pz_id_aliases (alias_norm, person_id, source)
  values (lower(btrim(v_old)), p_person, 'own')
  on conflict (alias_norm) do nothing;

  insert into public.pz_id_aliases (alias_norm, person_id, source)
  values (lower(btrim(v_new)), p_person, 'own');

  update public.pz_people set pz_id = v_new where id = p_person;

  return v_new;
end;
$$;

revoke all on function public.pz_reissue_id(uuid) from public, anon, authenticated;
grant execute on function public.pz_reissue_id(uuid) to service_role;
