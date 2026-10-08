import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0066_agent_campaigns.sql"), "utf8");
const types = readFileSync(join(process.cwd(), "src", "lib", "supabase", "database.types.ts"), "utf8");

it("adds the campaign columns idempotently", () => {
  for (const col of ["owner_agent_id", "number_id", "followup_in_hours", "status", "paused_reason", "updated_at"]) {
    expect(sql).toMatch(new RegExp(`add column if not exists ${col}\\b`, "i"));
  }
  expect(sql).toMatch(/status\s+text\s+not null default 'active'/i);
  expect(sql).toMatch(/check \(status in \('draft', 'active', 'paused', 'done'\)\)/i);
  expect(sql).toMatch(/followup_in_hours[^;]*check[^;]*\(\s*8,\s*24,\s*48,\s*72\s*\)/i);
});

it("adds the two recipient states without touching existing ones", () => {
  expect(sql).toMatch(/alter type public\.whatsapp_send_status add value if not exists 'skipped'/i);
  expect(sql).toMatch(/alter type public\.whatsapp_send_status add value if not exists 'blocked'/i);
  expect(sql).not.toMatch(/drop type/i);
});

it("indexes the owner and creates no policies or tables", () => {
  expect(sql).toMatch(/create index if not exists whatsapp_batches_owner_agent_idx/i);
  expect(sql).not.toMatch(/create policy/i);
  expect(sql).not.toMatch(/create table/i);
});

it("database.types.ts knows the columns and enum values", () => {
  const block = types.slice(types.indexOf("whatsapp_batches: {"), types.indexOf("whatsapp_batches: {") + 3500);
  for (const col of ["owner_agent_id", "number_id", "followup_in_hours", "paused_reason", "updated_at"]) {
    expect((block.match(new RegExp(col, "g")) ?? []).length).toBeGreaterThanOrEqual(3);
  }
  expect(types).toMatch(/whatsapp_send_status: "pending" \| "sent" \| "skipped" \| "blocked"/);
});
