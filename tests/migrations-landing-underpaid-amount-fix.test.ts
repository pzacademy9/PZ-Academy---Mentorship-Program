import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0074_landing_underpaid_amount_fix.sql"), "utf8");

it("says the owner pastes it", () => {
  expect(sql.split("\n").slice(0, 6).join("\n")).toMatch(/paste/i);
});

it("replaces landing_apply_status with the same signature and grants", () => {
  expect(sql).toMatch(/create or replace function public\.landing_apply_status\(\s*p_registration_id uuid,\s*p_to_status\s+text,\s*p_expected_from\s+text,\s*p_amount\s+numeric,\s*p_actor\s+uuid,\s*p_source\s+text\s*\) returns jsonb/i);
  expect(sql).toMatch(/security definer/i);
  expect(sql).toMatch(/set search_path = public/i);
  expect(sql).toMatch(/revoke all on function public\.landing_apply_status\(uuid, text, text, numeric, uuid, text\) from public, anon, authenticated/i);
  expect(sql).toMatch(/grant execute on function public\.landing_apply_status\(uuid, text, text, numeric, uuid, text\) to service_role/i);
});

it("allows same-status only for underpaid with an amount", () => {
  expect(sql).toMatch(/v_fix := \(v_from = p_to_status and p_to_status = 'underpaid' and p_amount is not null\)/i);
  expect(sql).toMatch(/if v_from = p_to_status and not v_fix then\s+return jsonb_build_object\('ok', false, 'reason', 'already-in-status'\)/i);
});

it("writes the lead's amount_received on a correction, without a status event", () => {
  const fix = sql.slice(sql.indexOf("if v_fix then"), sql.indexOf("for r in"));
  expect(fix).toMatch(/set amount_received\s+= p_amount/i);
  expect(fix).toMatch(/where id = p_registration_id/i);
  expect(fix).not.toMatch(/landing_status_events/i);
});

it("keeps the member guard, free-row rejection, stale check and per-row event writes", () => {
  expect(sql).toContain("'not-found'");
  expect(sql).toContain("'stale'");
  expect(sql).toMatch(/v_row_type = 'member'/);
  expect(sql).toMatch(/v_from = 'free'/);
  expect(sql).toMatch(/insert into public\.landing_status_events/i);
  expect(sql).toMatch(/where id = r\.id\s+and status <> p_to_status/i);
});
