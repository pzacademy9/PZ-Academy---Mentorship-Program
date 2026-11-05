import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0103_manager_policies.sql"), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

const EXPECTED: [string, string][] = [
  ["enrollments", "enrollments: admin update"],
  ["enrollments", "enrollments: student own"],
  ["profiles", "profiles: own row read"],
  ["courses", "courses: public read published"],
  ["mentors", "mentors: public read published"],
  ["sessions", "sessions: mentor or admin update"],
  ["sessions", "sessions: student own or mentor own or admin"],
  ["lessons", "lessons: read if unlocked or admin"],
  ["module_notes", "module_notes: read if enrolled or admin"],
];

describe("0103 manager policies", () => {
  it("changes exactly the nine rules a manager's pages need, by name", () => {
    const stmts = code.split(";").map((s) => s.trim()).filter(Boolean);
    expect(stmts).toHaveLength(EXPECTED.length);
    EXPECTED.forEach(([table, name], i) => {
      expect(stmts[i]).toMatch(new RegExp(`^alter policy "${name}" on public\\.${table}\\b`, "i"));
    });
  });
  it("keeps every existing condition and only adds the manager role", () => {
    for (const stmt of code.split(";").map((s) => s.trim()).filter(Boolean)) {
      expect(stmt).toContain("'admin'::user_role, 'super_admin'::user_role, 'manager'::user_role");
    }
  });
  it("only alters rules: nothing is dropped, created or truncated", () => {
    const bare = code.replace(/"[^"]*"|'[^']*'/g, "");
    expect(bare).not.toMatch(/\b(drop|create|truncate|delete|insert|update)\b/i);
  });
  it("gives managers no write on mentors, no insert on profiles, and touches nothing in the settings areas", () => {
    expect(code).not.toMatch(/mentors: admin write|profiles: admin insert/);
    expect(code).not.toMatch(/payment|sheet|terms|banners|featured|team_access|gas_sync|auth_email/i);
  });
  it("says which migrations it needs first", () => {
    expect(sql).toMatch(/0099/);
    expect(sql).toMatch(/0100/);
  });
});
