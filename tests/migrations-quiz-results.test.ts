import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0090_quiz_results.sql"), "utf8");
const types = readFileSync(join(process.cwd(), "src", "lib", "supabase", "database.types.ts"), "utf8");

const TABLES = ["batch_quiz_results", "batch_quiz_decisions"];

it("creates both tables idempotently with RLS on and zero policies", () => {
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

it("constrains decision kind and scores, and enforces uniqueness", () => {
  expect(sql).toContain("check (kind in ('duplicate','alias','skip'))");
  expect(sql).toContain("check (score >= 0)");
  expect(sql).toContain("unique (session_id, person_id)");
  expect(sql).toContain("unique (session_id, kind, key)");
  expect(sql).toMatch(/on public\.batch_quiz_results \(person_id\)/i);
});

it("adds the three session columns", () => {
  expect(sql).toContain("add column if not exists quiz_max_score");
  expect(sql).toContain("add column if not exists quiz_file_name");
  expect(sql).toContain("add column if not exists quiz_saved_at");
});

it("defines the atomic save function for service_role only", () => {
  expect(sql).toContain("create or replace function public.batch_quiz_save");
  expect(sql).toMatch(/revoke all on function public\.batch_quiz_save\(uuid, int, text, jsonb\) from public, anon, authenticated/);
  expect(sql).toMatch(/grant execute on function public\.batch_quiz_save\(uuid, int, text, jsonb\) to service_role/);
  expect(sql).toMatch(/delete from public\.batch_quiz_results where session_id = p_session/);
});

it("merge moves quiz results and keeps the higher score", () => {
  const merge = sql.slice(sql.indexOf("create or replace function public.pz_merge_people"));
  expect(merge).toContain("batch_quiz_results");
  expect(merge).toContain("excluded.score > public.batch_quiz_results.score");
  expect(merge).toContain("batch_session_marks");
  expect(merge).toMatch(/grant execute on function public\.pz_merge_people\(uuid, uuid\) to service_role/);
});

it("hand-added types cover tables, columns and the save function", () => {
  for (const t of TABLES) expect(types).toContain(`${t}: {`);
  expect(types).toContain("quiz_max_score");
  expect(types).toContain("batch_quiz_save: {");
});
