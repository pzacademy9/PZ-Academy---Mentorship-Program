# Student ID fixes: owner steps

Branch `student-id-fixes`. One SQL paste (migration 0104).

## 1. Paste the SQL (once)

Open Supabase, SQL editor, new query, paste everything below, press Run.
It adds one helper that gives a student a new ID. It deletes nothing.

```sql
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

  loop
    v_new := public.pz_first_name(v_name) || '-' || nextval('public.pz_id_seq');
    exit when not exists (select 1 from public.pz_id_aliases where alias_norm = lower(btrim(v_new)))
          and not exists (select 1 from public.pz_people where lower(pz_id) = lower(v_new));
  end loop;

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
```

It should say "Success. No rows returned". Until you paste it, everything else works; only
the "Give a new ID" button says it needs the SQL first.

## 2. Try it on the Vercel preview

Admin, Students, Student IDs. Search a test student, press **Fix or view**.

- The top shows batches, quiz results, classes attended and emails: a quick health check.
- **Full name:** fix the spelling, press Save name. The website lists and the ID PDF use it.
- **Give a new ID:** fix the name first, then press it and confirm. You see the new ID and the
  old one. The old ID keeps working, so old results still match. Tell the student the new ID.
- **Emails:** add a missing email. If it already belongs to another student, the screen names
  them; use Merge instead. Remove only an email that is wrong (one email always stays).
- **Send ID email:** sends "Your PZ ID" to the email you pick. It uses the participant email
  account, the same one as your bulk messages.
