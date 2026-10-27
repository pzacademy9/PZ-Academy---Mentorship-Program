import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0088_pz_people.sql"), "utf8");
const types = readFileSync(join(process.cwd(), "src", "lib", "supabase", "database.types.ts"), "utf8");

const TABLES = ["pz_people", "pz_person_emails", "pz_id_aliases"];

it("creates every table idempotently with RLS on and zero policies", () => {
  for (const t of TABLES) {
    expect(sql).toMatch(new RegExp(`create table if not exists public\\.${t} \\(`, "i"));
    expect(sql).toMatch(new RegExp(`alter table public\\.${t} enable row level security`, "i"));
  }
  expect(sql).not.toMatch(/create policy/i);
});

it("never destroys data", () => {
  expect(sql).not.toMatch(/drop table/i);
  expect(sql).not.toMatch(/delete from public\.landing_registrations/i);
});

it("constrains emails, aliases and the id sequence", () => {
  expect(sql).toMatch(/email\s+text primary key check \(email = lower\(email\)\)/i);
  expect(sql).toContain("check (source in ('own','legacy','review'))");
  expect(sql).toContain("create sequence if not exists public.pz_id_seq start 1000");
});

it("defines the three functions service-role only", () => {
  for (const f of ["pz_first_name", "pz_ensure_person", "pz_merge_people"]) {
    expect(sql).toContain(`create or replace function public.${f}`);
    expect(sql).toMatch(new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon, authenticated`, "i"));
  }
});

it("adds person_id, the trigger and the ordered backfill", () => {
  expect(sql).toMatch(/add column if not exists person_id uuid references public\.pz_people/i);
  expect(sql).toContain("create trigger landing_registrations_person");
  expect(sql).toMatch(/update public\.landing_registrations/i);
  expect(sql).toMatch(/order by created_at/i);
});

it("hand-adds the tables and person_id to the generated types", () => {
  for (const t of TABLES) expect(types).toContain(`      ${t}: {`);
  expect(types).toContain("person_id");
});

it("never overwrites an existing person_id with null in the trigger", () => {
  const fn = sql.slice(sql.indexOf("function public.landing_registrations_set_person"));
  expect(fn).toMatch(/v_person\s+uuid/i);
  expect(fn).toMatch(/if v_person is not null then/i);
  expect(fn).not.toMatch(/new\.person_id := public\.pz_ensure_person/i);
});

it("keeps the same person when an email is edited on an already linked row", () => {
  const fn = sql.slice(sql.indexOf("function public.landing_registrations_set_person"));
  expect(fn).toMatch(/old\.person_id/i);
  expect(fn).toMatch(/tg_op = 'UPDATE'/i);
  expect(fn).toMatch(/insert into public\.pz_person_emails \(email, person_id\)\s+values \(lower\(btrim\(new\.email\)\), old\.person_id\)\s+on conflict \(email\) do nothing/i);
  expect(fn).toMatch(/new\.person_id := old\.person_id/i);
});

it("locks both people rows in a stable order at the start of a merge", () => {
  const fn = sql.slice(sql.indexOf("function public.pz_merge_people"), sql.indexOf("revoke all on function public.pz_first_name"));
  expect(fn).toMatch(/order by id\s+for update/i);
  expect(fn.indexOf("for update")).toBeLessThan(fn.indexOf("update public.pz_person_emails"));
});

it("trims whitespace including tabs and newlines in pz_first_name", () => {
  const fn = sql.slice(sql.indexOf("function public.pz_first_name"), sql.indexOf("function public.pz_ensure_person"));
  expect(fn).toContain("regexp_replace(coalesce(p_name, ''), '^\\s+|\\s+$', '', 'g')");
  expect(fn).not.toMatch(/btrim/i);
});

it("fires the trigger when status, email, name or is_test change", () => {
  expect(sql).toMatch(/before insert or update of status, email, name, is_test on public\.landing_registrations/i);
});

it("pins search_path with pg_temp on every security definer function", () => {
  expect(sql).not.toMatch(/set search_path = public\s*$/im);
  const count = (sql.match(/set search_path = public, pg_temp/g) ?? []).length;
  expect(count).toBe(4);
});

it("marks pz_first_name stable, not immutable", () => {
  expect(sql).not.toMatch(/\bimmutable\b/i);
  const fn = sql.slice(sql.indexOf("function public.pz_first_name"), sql.indexOf("function public.pz_ensure_person"));
  expect(fn).toMatch(/\bstable\b/i);
});

it("types person_id as nullable on the landing_registrations Row", () => {
  const start = types.indexOf("      landing_registrations: {");
  const row = types.slice(start, types.indexOf("Insert:", start));
  expect(row).toMatch(/person_id: string \| null/);
  expect(row).not.toMatch(/person_id\?/);
});
