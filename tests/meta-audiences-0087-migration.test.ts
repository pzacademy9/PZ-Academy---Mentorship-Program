import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "0087_close_batch_interested_no_identity_merge.sql"),
  "utf8",
);

it("recreates landing_close_batch with the identical signature and security settings", () => {
  expect(sql).toMatch(
    /create or replace function public\.landing_close_batch\(\s*p_page_id\s+uuid,\s*p_page_title\s+text,\s*p_course_id\s+uuid,\s*p_created_by\s+uuid,\s*p_rows\s+jsonb\s*\)\s*returns jsonb/i,
  );
  expect(sql).toMatch(/security definer/i);
  expect(sql).toContain("set search_path = public");
  expect(sql).toMatch(
    /revoke all on function public\.landing_close_batch\(uuid, text, uuid, uuid, jsonb\) from public, anon, authenticated/i,
  );
});

it("does not change the function signature (no drop, no new overload)", () => {
  expect(sql).not.toMatch(/drop function/i);
  expect(sql.match(/create or replace function/gi)).toHaveLength(1);
});

it("keeps the advisory lock, paid-first order and identity-less skip", () => {
  expect(sql).toContain("perform pg_advisory_xact_lock(hashtext('landing:' || p_page_id::text))");
  expect(sql).toMatch(/order by \(value ->> 'bucket'\) = 'paid' desc/i);
  expect(sql).toMatch(/if v_email is null and v_phone is null then\s+continue;/i);
});

it("keeps the paid consent_basis upgrade and the unique_violation guard", () => {
  expect(sql).toContain(
    "consent_basis = case when v_bucket = 'paid' then 'purchase'::public.crm_consent_basis else consent_basis end",
  );
  expect(sql).toContain("exception when unique_violation");
});

it("only runs the identity-filling UPDATE for the paid bucket", () => {
  expect(sql).toMatch(
    /if v_bucket = 'paid' then\s+begin\s+update public\.contacts\s+set[\s\S]*?exception when unique_violation then[\s\S]*?end;\s+end if;/i,
  );
  // The only update of contacts sits inside that guard.
  expect(sql.match(/update public\.contacts/gi)).toHaveLength(1);
});

it("still counts interested matches as merged and links them to the cohort", () => {
  expect(sql).toContain("v_int_merged := v_int_merged + 1");
  expect(sql).toContain("v_interested_ids := array_append(v_interested_ids, v_contact_id)");
});
