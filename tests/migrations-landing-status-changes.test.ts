import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0073_landing_status_changes.sql"), "utf8");
const types = readFileSync(join(process.cwd(), "src", "lib", "supabase", "database.types.ts"), "utf8");

it("says the owner pastes it", () => {
  expect(sql.split("\n").slice(0, 6).join("\n")).toMatch(/paste/i);
});

it("adds changed_by to landing_status_events", () => {
  expect(sql).toMatch(/alter table public\.landing_status_events\s+add column if not exists changed_by uuid references public\.profiles\(id\) on delete set null/i);
});

it("drops and re-adds the landing_jobs type check with sheet_status", () => {
  expect(sql).toMatch(/alter table public\.landing_jobs drop constraint if exists landing_jobs_type_check/i);
  expect(sql).toMatch(/add constraint landing_jobs_type_check check \(type in \('sheet_append', 'email_received', 'email_members', 'email_admin', 'sheet_status'\)\)/i);
});

it("creates landing_apply_status as security definer, service_role only", () => {
  expect(sql).toMatch(/create or replace function public\.landing_apply_status\(/i);
  expect(sql).toMatch(/security definer/i);
  expect(sql).toMatch(/set search_path = public/i);
  expect(sql).toMatch(/for update/i);
  expect(sql).toMatch(/revoke all on function public\.landing_apply_status\(uuid, text, text, numeric, uuid, text\) from public, anon, authenticated/i);
  expect(sql).toMatch(/grant execute on function public\.landing_apply_status\(uuid, text, text, numeric, uuid, text\) to service_role/i);
  expect(sql).not.toMatch(/create policy/i);
});

it("returns the documented results and writes one event per changed row", () => {
  expect(sql).toContain("'not-found'");
  expect(sql).toContain("'stale'");
  expect(sql).toMatch(/insert into public\.landing_status_events/i);
});

it("types carry changed_by and the function", () => {
  const ev = types.slice(types.indexOf("      landing_status_events: {"), types.indexOf("      landing_media: {"));
  expect((ev.match(/changed_by\??: string/g) ?? []).length).toBe(3);
  expect(types).toContain("landing_apply_status: {");
});
