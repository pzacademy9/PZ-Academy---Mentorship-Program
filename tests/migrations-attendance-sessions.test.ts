import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0089_attendance_sessions.sql"), "utf8");
const types = readFileSync(join(process.cwd(), "src", "lib", "supabase", "database.types.ts"), "utf8");

const TABLES = ["batch_sessions", "batch_session_marks"];

it("creates both tables idempotently with RLS on and zero policies", () => {
  for (const t of TABLES) {
    expect(sql).toMatch(new RegExp(`create table if not exists public\\.${t} \\(`, "i"));
    expect(sql).toMatch(new RegExp(`alter table public\\.${t} enable row level security`, "i"));
  }
  expect(sql).not.toMatch(/create policy/i);
});

it("never touches the legacy attendance tables and never destroys data", () => {
  expect(sql).not.toMatch(/drop table/i);
  expect(sql).not.toMatch(/delete from public\.landing_registrations/i);
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  expect(code).not.toMatch(/attendance_sessions|attendance_events/i);
});

it("constrains window override, mark source and session kind", () => {
  expect(sql).toContain("check (window_override in ('auto','open','closed'))");
  expect(sql).toContain("check (source in ('personal','shared','admin'))");
  expect(sql).toContain("check (session_kind in ('reminder','update'))");
});

it("enforces uniqueness and indexes", () => {
  expect(sql).toContain("unique (page_id, number)");
  expect(sql).toContain("unique (session_id, person_id)");
  expect(sql).toMatch(/public_code\s+text not null unique/i);
  expect(sql).toMatch(/on public\.batch_sessions \(page_id, starts_at\)/i);
  expect(sql).toMatch(/on public\.batch_session_marks \(person_id\)/i);
});

it("adds attendance_min_pct and the participant_sends columns", () => {
  expect(sql).toContain("add column if not exists attendance_min_pct");
  expect(sql).toContain("add column if not exists session_id");
  expect(sql).toContain("add column if not exists session_kind");
  expect(sql).toMatch(/session_id uuid references public\.batch_sessions \(id\) on delete set null/i);
  expect(sql).toContain("check (session_id is null or session_kind is not null)");
  expect(sql).not.toContain("(session_id is null) = (session_kind is null)");
  expect(sql).toMatch(/create unique index if not exists participant_sends_reminder_key\s+on public\.participant_sends \(session_id\) where session_kind = 'reminder'/i);
});

it("re-creates pz_merge_people moving marks, service-role only", () => {
  expect(sql).toContain("create or replace function public.pz_merge_people");
  const fn = sql.slice(sql.indexOf("function public.pz_merge_people"));
  expect(fn).toMatch(/insert into public\.batch_session_marks[\s\S]*on conflict do nothing/i);
  expect(fn).toMatch(/delete from public\.batch_session_marks where person_id = p_drop/i);
  expect(fn).toMatch(/order by id\s+for update/i);
  expect(fn.indexOf("for update")).toBeLessThan(fn.indexOf("update public.pz_person_emails"));
  expect(fn.indexOf("batch_session_marks")).toBeLessThan(fn.indexOf("delete from public.pz_people"));
  expect(sql).toMatch(/revoke all on function public\.pz_merge_people\(uuid, uuid\) from public, anon, authenticated/i);
  expect(sql).toMatch(/grant execute on function public\.pz_merge_people\(uuid, uuid\) to service_role/i);
  expect(sql).toContain("set search_path = public, pg_temp");
});

it("hand-adds the tables and columns to the generated types", () => {
  for (const t of TABLES) expect(types).toContain(`      ${t}: {`);
  const pages = types.slice(types.indexOf("      landing_pages: {"), types.indexOf("      landing_promo_codes: {"));
  expect(pages.match(/attendance_min_pct/g)?.length).toBe(3);
  const sends = types.slice(types.indexOf("      participant_sends: {"), types.indexOf("      participant_templates: {"));
  expect(sends.match(/session_id/g)?.length).toBeGreaterThanOrEqual(3);
  expect(sends.match(/session_kind/g)?.length).toBe(3);
});
