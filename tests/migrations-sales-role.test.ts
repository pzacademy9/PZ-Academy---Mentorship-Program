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
