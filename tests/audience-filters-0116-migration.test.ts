import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "0116_audience_filters.sql"),
  "utf8",
);

it("adds the new columns with the recorded/live check", () => {
  expect(sql).toMatch(/alter table public\.contact_purchases[\s\S]*?add column if not exists reg_mode text/i);
  expect(sql).toMatch(/alter table public\.import_batch_contacts[\s\S]*?add column if not exists reg_mode text/i);
  expect(sql.match(/check \(reg_mode in \('live', 'recorded'\)\)/gi)).toHaveLength(2);
  expect(sql.match(/add column if not exists option_keys text\[\] not null default '\{\}'/gi)).toHaveLength(2);
  expect(sql.match(/add column if not exists region text/gi)).toHaveLength(2);
  expect(sql).toMatch(/add column if not exists registered_at timestamptz/i);
});

it("creates the saved audiences table, service role only", () => {
  expect(sql).toMatch(/create table if not exists public\.crm_saved_audiences/i);
  expect(sql).toMatch(/length\(btrim\(name\)\) between 1 and 80/i);
  expect(sql).toMatch(/alter table public\.crm_saved_audiences enable row level security/i);
  expect(sql).not.toMatch(/create policy/i);
  expect(sql).toMatch(/create unique index[\s\S]*?on public\.crm_saved_audiences \(lower\(btrim\(name\)\)\)/i);
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

it("writes mode, option keys and region in the purchase upsert and its do update", () => {
  expect(sql).toContain("v_purchase ->> 'mode'");
  expect(sql).toContain("v_row -> 'optionKeys'");
  expect(sql).toContain("v_row ->> 'region'");
  const upd = sql.slice(sql.indexOf("on conflict (source_sheet_id, source_row_ref) do update"));
  expect(upd).toMatch(/reg_mode\s+=\s+coalesce\(excluded\.reg_mode, public\.contact_purchases\.reg_mode\)/);
  expect(upd).toMatch(/option_keys\s+=/);
  expect(upd).toMatch(/region\s+=\s+coalesce\(excluded\.region, public\.contact_purchases\.region\)/);
});

it("fills the interested cohort one row per contact, earliest registration first", () => {
  expect(sql).toContain("v_row ->> 'registeredAt'");
  expect(sql).toMatch(/distinct on \(contact_id\)/i);
  expect(sql).toMatch(/order by contact_id, registered_at asc nulls last/i);
  expect(sql).toMatch(/not exists \(\s*select 1 from public\.contact_purchases/i);
});
