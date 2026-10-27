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
