import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const src = readFileSync(join(root, "src", "lib", "data", "sales-assignment.ts"), "utf8");
const routeSrc = readFileSync(join(root, "src", "app", "api", "admin", "sales", "settings", "claim", "route.ts"), "utf8");
const migrationSql = readFileSync(join(root, "supabase", "migrations", "0065_sales_hub_claim_setting.sql"), "utf8");

function fnBody(source: string, name: string): string {
  const m = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`).exec(source);
  if (!m) throw new Error(`function "${name}" not found`);
  const rest = source.slice(m.index + m[0].length);
  const next = rest.search(/\n(?:export\s+)?(?:async\s+)?function\s|\nexport\s+(?:type|const)\s/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("agents_can_claim setting", () => {
  it("reads fail closed", () => {
    const body = fnBody(src, "getAgentsCanClaim");
    expect(body).toContain("return false");
    expect(body).toContain("catch");
    expect(body).toMatch(/if \(error \|\| !data\) return false;/);
    expect(body).toMatch(/catch\s*\{\s*return false;?\s*\}/);
    expect(body).not.toMatch(/return true\s*;\s*}\s*catch/);
  });

  it("the setting route is admin-only and validates a boolean", () => {
    expect(routeSrc).toContain("requireAdmin()");
    expect(routeSrc).toContain("z.boolean()");
  });

  it("the setting defaults to off in the migration", () => {
    expect(migrationSql).toMatch(/default false/i);
  });
});
