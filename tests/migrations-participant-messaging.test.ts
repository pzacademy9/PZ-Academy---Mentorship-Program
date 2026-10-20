import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0077_participant_messaging.sql"), "utf8");
const types = readFileSync(join(process.cwd(), "src", "lib", "supabase", "database.types.ts"), "utf8");

const TABLES = ["participant_templates", "participant_sends", "participant_send_recipients", "participant_email_prefs"];

it("creates every table idempotently with RLS on and zero policies", () => {
  for (const t of TABLES) {
    expect(sql).toMatch(new RegExp(`create table if not exists public\\.${t} \\(`, "i"));
    expect(sql).toMatch(new RegExp(`alter table public\\.${t} enable row level security`, "i"));
  }
  expect(sql).not.toMatch(/create policy/i);
  expect(sql).not.toMatch(/drop table/i);
});

it("constrains recipients and indexes the lookups", () => {
  expect(sql).toContain("check (state in ('pending','claimed','sent','failed','skipped'))");
  expect(sql).toMatch(/unique \(send_id, registration_id\)/i);
  expect(sql).toContain("create index if not exists participant_send_recipients_send_state_idx");
  expect(sql).toContain("create index if not exists participant_send_recipients_registration_idx");
  expect(sql).toMatch(/check \(channel in \('email','whatsapp'\)\)/i);
});

it("keeps unsubscribe emails lowercase", () => {
  expect(sql).toMatch(/email\s+text primary key check \(email = lower\(email\)\)/i);
  expect(sql).toMatch(/token\s+uuid not null unique default gen_random_uuid\(\)/i);
});

it("hand-adds all four tables to the generated types", () => {
  for (const t of TABLES) expect(types).toContain(`      ${t}: {`);
});
