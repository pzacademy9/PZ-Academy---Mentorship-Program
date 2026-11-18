import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) =>
  readFileSync(join(process.cwd(), "supabase", "migrations", f), "utf8");
const sql = read("0118_interested_per_page.sql");
const prev = read("0117_audience_status.sql");

const fnBody = (s: string) =>
  s.slice(s.indexOf("create or replace function public.landing_close_batch"));
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

it("excludes only people who bought through THIS page's paid batch", () => {
  expect(norm(sql)).toContain(
    "where not exists ( select 1 from public.contact_purchases cp where cp.contact_id = c.contact_id and cp.import_batch_id = v_paid_batch_id )",
  );
  expect(sql).toContain("excluding anyone who bought on THIS page.");
});

it("no longer has the any-purchase exclusion or the old comment", () => {
  expect(norm(sql)).not.toMatch(
    /cp\.contact_id = c\.contact_id \)/,
  );
  expect(sql).not.toContain("excluding anyone who has bought.");
});

it("the paid batch is always set before the exclusion runs (never null)", () => {
  const body = fnBody(sql);
  const create = body.indexOf("if v_paid_batch_id is null then");
  const insertReturning = body.indexOf("returning id into v_paid_batch_id");
  const exclusion = body.indexOf("cp.import_batch_id = v_paid_batch_id");
  expect(create).toBeGreaterThan(-1);
  expect(insertReturning).toBeGreaterThan(create);
  expect(exclusion).toBeGreaterThan(insertReturning);
});

it("keeps the 0117 invariants", () => {
  expect(sql).toMatch(/coalesce\(c\.reg_status, v_old_status ->> c\.contact_id::text\)/);
  expect(sql).toMatch(
    /if v_bucket = 'paid' then\s+begin\s+update public\.contacts\s+set[\s\S]*?exception when unique_violation then[\s\S]*?end;\s+end if;/i,
  );
  expect(sql.match(/update public\.contacts/gi)).toHaveLength(1);
  expect(sql).toMatch(/distinct on \(contact_id\)/i);
  expect(sql).toMatch(/order by (c.)?contact_id, (c.)?registered_at asc nulls last/i);
  expect(sql).toMatch(/security definer/i);
  expect(sql).toMatch(/pg_advisory_xact_lock/);
  expect(sql).toMatch(/statement_timeout = '55s'/);
  expect(sql).toMatch(
    /revoke all on function public\.landing_close_batch\(uuid, text, uuid, uuid, jsonb\) from public, anon, authenticated/i,
  );
  expect(sql).not.toMatch(/drop function/i);
});

it("the function body equals 0117 except the exclusion and its comment", () => {
  const rewritten = norm(fnBody(prev))
    .replace(
      "excluding anyone who has bought.",
      "excluding anyone who bought on THIS page.",
    )
    .replace(
      "select 1 from public.contact_purchases cp where cp.contact_id = c.contact_id )",
      "select 1 from public.contact_purchases cp where cp.contact_id = c.contact_id and cp.import_batch_id = v_paid_batch_id )",
    );
  expect(norm(fnBody(sql))).toBe(rewritten);
});
