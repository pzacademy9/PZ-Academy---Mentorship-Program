import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "0063_sales_workspace_core.sql"),
  "utf8",
);
const types = readFileSync(
  join(process.cwd(), "src", "lib", "supabase", "database.types.ts"),
  "utf8",
);

describe("0063 sales workspace core", () => {
  it("creates the five tables idempotently with RLS enabled", () => {
    for (const t of [
      "whatsapp_numbers",
      "whatsapp_number_agents",
      "whatsapp_safety_settings",
      "whatsapp_blocked_attempts",
      "contact_activities",
    ]) {
      expect(sql).toMatch(new RegExp(`create table if not exists public\\.${t}\\b`, "i"));
      expect(sql).toMatch(new RegExp(`alter table public\\.${t} enable row level security`, "i"));
    }
  });

  it("creates no policies", () => {
    expect(sql).not.toMatch(/create policy/i);
  });

  it("adds the contact columns", () => {
    expect(sql).toMatch(/add column if not exists next_followup_at timestamptz/i);
    expect(sql).toMatch(/add column if not exists last_outcome text/i);
    expect(sql).toMatch(/add column if not exists do_not_contact_at timestamptz/i);
  });

  it("restricts activity kinds", () => {
    for (const k of [
      "sent", "replied", "interested", "bought", "not_interested",
      "note", "claimed", "reassigned", "released",
    ]) {
      expect(sql).toContain(`'${k}'`);
    }
  });

  it("indexes the queue and the limit counters", () => {
    expect(sql).toMatch(/contacts_owner_followup_idx/i);
    expect(sql).toMatch(/contact_activities_number_kind_created_idx/i);
    expect(sql).toMatch(/contact_activities_contact_created_idx/i);
  });

  it("seeds exactly one settings row with the owner defaults", () => {
    expect(sql).toMatch(/insert into public\.whatsapp_safety_settings/i);
    expect(sql).toMatch(/on conflict \(id\) do nothing/i);
    expect(sql).toMatch(/daily_cap\s+integer not null default 60/i);
    expect(sql).toMatch(/hourly_cap\s+integer not null default 20/i);
    expect(sql).toMatch(/'Asia\/Karachi'/);
  });
});

describe("database.types.ts hand edits for 0063", () => {
  it("has the new tables", () => {
    for (const t of [
      "whatsapp_numbers",
      "whatsapp_number_agents",
      "whatsapp_safety_settings",
      "whatsapp_blocked_attempts",
      "contact_activities",
    ]) {
      expect(types).toContain(`      ${t}: {`);
    }
  });

  it("has the new contact columns in Row, Insert and Update", () => {
    const contacts = types.slice(types.indexOf("      contacts: {"), types.indexOf("      courses: {"));
    for (const col of ["next_followup_at", "last_outcome", "do_not_contact_at"]) {
      expect(contacts.match(new RegExp(`${col}\\??: string \\| null`, "g"))?.length).toBe(3);
    }
  });

  it("keeps Row blocks of the new tables free of optional fields", () => {
    for (const t of [
      "whatsapp_numbers",
      "whatsapp_number_agents",
      "whatsapp_safety_settings",
      "whatsapp_blocked_attempts",
      "contact_activities",
    ]) {
      const start = types.indexOf(`      ${t}: {`);
      const row = types.slice(types.indexOf("Row: {", start), types.indexOf("Insert: {", start));
      expect(row.length).toBeGreaterThan(0);
      expect(row).not.toContain("?:");
    }
  });
});
