import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "0117_audience_status.sql"),
  "utf8",
);

it("adds a nullable reg_status text column to the interested list", () => {
  expect(sql).toMatch(
    /alter table public\.import_batch_contacts\s+add column if not exists reg_status text;/i,
  );
});

it("recreates landing_close_batch with the same signature and security", () => {
  expect(sql).toMatch(
    /create or replace function public\.landing_close_batch\(\s*p_page_id\s+uuid,\s*p_page_title\s+text,\s*p_course_id\s+uuid,\s*p_created_by\s+uuid,\s*p_rows\s+jsonb\s*\)\s*returns jsonb/i,
  );
  expect(sql).toMatch(/security definer/i);
  expect(sql).toMatch(
    /revoke all on function public\.landing_close_batch\(uuid, text, uuid, uuid, jsonb\) from public, anon, authenticated/i,
  );
  expect(sql).not.toMatch(/drop function/i);
});

it("keeps the 0087 rule: only paid rows run the identity-filling UPDATE", () => {
  expect(sql).toMatch(
    /if v_bucket = 'paid' then\s+begin\s+update public\.contacts\s+set[\s\S]*?exception when unique_violation then[\s\S]*?end;\s+end if;/i,
  );
  expect(sql.match(/update public\.contacts/gi)).toHaveLength(1);
});

it("keeps the 0116 purchase upsert and interested earliest-registration rule", () => {
  expect(sql).toContain("v_purchase ->> 'mode'");
  expect(sql).toMatch(/reg_mode\s+=\s+coalesce\(excluded\.reg_mode, public\.contact_purchases\.reg_mode\)/);
  expect(sql).toMatch(/distinct on \(contact_id\)/i);
  expect(sql).toMatch(/order by (c.)?contact_id, (c.)?registered_at asc nulls last/i);
  expect(sql).toMatch(/not exists \(\s*select 1 from public\.contact_purchases/i);
});

it("reads the row's top-level status and writes it on the interested insert", () => {
  expect(sql).toContain("v_row ->> 'status'");
  expect(sql).toMatch(/'reg_status',\s+v_reg_status/);
  const ins = sql.slice(sql.indexOf("insert into public.import_batch_contacts"));
  expect(ins).toMatch(/import_batch_id, contact_id, reg_mode, option_keys, region, registered_at, reg_status/);
  expect(ins).toMatch(/distinct on \(contact_id\)[\s\S]*?reg_status/i);
});

it("never erases a stored status with a blank one", () => {
  expect(sql).toMatch(/v_old_status/);
  expect(sql).toMatch(/coalesce\(c\.reg_status, v_old_status ->> c\.contact_id::text\)/);
  // the old values are read before the cohort rows are deleted
  expect(sql.indexOf("v_old_status :=")).toBeLessThan(
    sql.indexOf("delete from public.import_batch_contacts"),
  );
});
