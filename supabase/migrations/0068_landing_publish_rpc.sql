-- 0068_landing_publish_rpc.sql
-- Atomic publish and restore for landing pages (Phase 1 follow-up).
-- Phase 1 published in several separate requests: read the last version number,
-- insert a snapshot, update the page, and delete the snapshot again on a conflict.
-- Two publishes at the same moment both picked the same next version number and
-- the second failed the unique (page_id, version) check with a 500. These two
-- functions do the whole job in one transaction while holding the page row lock
-- (select ... for update), so concurrent calls queue instead of colliding.
--
-- landing_publish_page copies draft -> published, snapshots it as the next
-- version and returns that version number. Publishing a closed page keeps it
-- closed (registration is reopened only from the Landing Pages list). The draft
-- and its revision are not touched, so the editor's next autosave still matches.
-- p_revision (optional) is the revision the app checked for readiness. If the
-- draft changed since then, it raises landing_revision_conflict and writes nothing.
--
-- landing_rollback_page copies a saved version into BOTH draft and published,
-- bumps revision (so any open editor's stale autosave is refused as a conflict),
-- snapshots it as a new version and returns that version number.
--
-- Errors are raised with fixed messages that src/lib/data/landing-pages.ts maps:
-- landing_page_not_found, landing_version_not_found, landing_revision_conflict.
-- Service role only, like crm_import_commit (0048): nothing in the browser calls these.

create or replace function public.landing_publish_page(
  p_page_id  uuid,
  p_user     uuid,
  p_revision integer default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page    public.landing_pages%rowtype;
  v_version integer;
begin
  select * into v_page
    from public.landing_pages
   where id = p_page_id
     for update;
  if not found then
    raise exception 'landing_page_not_found';
  end if;

  if p_revision is not null and v_page.revision <> p_revision then
    raise exception 'landing_revision_conflict';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
    from public.landing_page_versions
   where page_id = p_page_id;

  insert into public.landing_page_versions (page_id, version, content, created_by)
  values (p_page_id, v_version, v_page.draft, p_user);

  update public.landing_pages
     set published    = v_page.draft,
         status       = case when v_page.status = 'closed' then 'closed' else 'published' end,
         published_at = now(),
         updated_at   = now()
   where id = p_page_id;

  return v_version;
end;
$$;

create or replace function public.landing_rollback_page(
  p_page_id uuid,
  p_version integer,
  p_user    uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page    public.landing_pages%rowtype;
  v_content jsonb;
  v_version integer;
begin
  select * into v_page
    from public.landing_pages
   where id = p_page_id
     for update;
  if not found then
    raise exception 'landing_page_not_found';
  end if;

  select content into v_content
    from public.landing_page_versions
   where page_id = p_page_id
     and version = p_version;
  if not found then
    raise exception 'landing_version_not_found';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
    from public.landing_page_versions
   where page_id = p_page_id;

  insert into public.landing_page_versions (page_id, version, content, created_by)
  values (p_page_id, v_version, v_content, p_user);

  update public.landing_pages
     set draft        = v_content,
         published    = v_content,
         revision     = v_page.revision + 1,
         status       = case when v_page.status = 'closed' then 'closed' else 'published' end,
         published_at = now(),
         updated_at   = now()
   where id = p_page_id;

  return v_version;
end;
$$;

revoke all on function public.landing_publish_page(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.landing_publish_page(uuid, uuid, integer) to service_role;
revoke all on function public.landing_rollback_page(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.landing_rollback_page(uuid, integer, uuid) to service_role;
