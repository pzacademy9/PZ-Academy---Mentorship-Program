import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (name: string) =>
  readFileSync(join(process.cwd(), "supabase", "migrations", name), "utf8");

describe("0060 block profile role self-change", () => {
  const sql = read("0060_block_profile_role_self_change.sql");

  it("defines a trigger function that raises for authenticated and anon role changes", () => {
    expect(sql).toMatch(/create or replace function public\.prevent_role_self_change\(\)/i);
    expect(sql).toMatch(/new\.role is distinct from old\.role/i);
    expect(sql).toMatch(/current_user in \('authenticated', 'anon'\)/i);
    expect(sql).toMatch(/raise exception/i);
  });

  it("attaches it as a BEFORE UPDATE OF role trigger on profiles", () => {
    expect(sql).toMatch(/create trigger profiles_prevent_role_change/i);
    expect(sql).toMatch(/before update of role on public\.profiles/i);
    expect(sql).toMatch(/for each row/i);
  });
});

describe("0061 sales_agent enum value", () => {
  const sql = read("0061_sales_agent_role.sql");

  it("only adds the enum value (a new value cannot be used in the same transaction)", () => {
    expect(sql).toMatch(/alter type public\.user_role add value if not exists 'sales_agent'/i);
    expect(sql).not.toMatch(/\bupdate\b|\binsert\b|create policy/i);
  });
});

describe("0062 contact ownership", () => {
  const sql = read("0062_contact_ownership.sql");

  it("adds owner_id referencing profiles with set null, and claimed_at", () => {
    expect(sql).toMatch(/add column if not exists owner_id uuid references public\.profiles\(id\) on delete set null/i);
    expect(sql).toMatch(/add column if not exists claimed_at timestamptz/i);
  });

  it("indexes owner_id", () => {
    expect(sql).toMatch(/create index if not exists contacts_owner_id_idx on public\.contacts \(owner_id\)/i);
  });
});

describe("database.types.ts hand edits", () => {
  const types = readFileSync(join(process.cwd(), "src", "lib", "supabase", "database.types.ts"), "utf8");

  it("lists sales_agent in the user_role union and the constants array", () => {
    expect(types).toContain('user_role: "student" | "mentor" | "admin" | "super_admin" | "sales_agent"');
    expect(types).toContain('user_role: ["student", "mentor", "admin", "super_admin", "sales_agent"]');
  });

  it("adds owner_id and claimed_at to contacts Row, Insert and Update", () => {
    const contacts = types.slice(types.indexOf("      contacts: {"), types.indexOf("      courses: {"));
    expect(contacts.match(/owner_id\??: string \| null/g)?.length).toBe(3);
    expect(contacts.match(/claimed_at\??: string \| null/g)?.length).toBe(3);
    expect(contacts).toContain('foreignKeyName: "contacts_owner_id_fkey"');
  });
});
