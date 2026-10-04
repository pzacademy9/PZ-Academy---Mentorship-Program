import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

const API = join(process.cwd(), "src", "app", "api");
const rel = (f: string) => relative(API, f).replace(/[\\]/g, "/");

describe("API role gates", () => {
  it("every /api/admin route calls requireAdmin, except the pinned uploads/image route that calls requireMentor", () => {
    const files = routeFiles(join(API, "admin"));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      if (rel(f) === "admin/uploads/image/route.ts") return !src.includes("requireMentor(");
      return !src.includes("requireAdmin(");
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it("no /api/admin route admits sales agents", () => {
    for (const f of routeFiles(join(API, "admin"))) {
      expect(readFileSync(f, "utf8")).not.toContain("requireSalesAgent");
    }
  });

  it("every /api/sales route (if any exist yet) calls requireSalesAgent", () => {
    let files: string[] = [];
    try {
      files = routeFiles(join(API, "sales"));
    } catch {
      files = [];
    }
    const offenders = files.filter((f) => !readFileSync(f, "utf8").includes("requireSalesAgent("));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("requireMentor does not admit sales agents", () => {
    const src = readFileSync(join(process.cwd(), "src", "lib", "auth", "require-mentor.ts"), "utf8");
    expect(src).toContain('const MENTOR_ROLES: readonly Role[] = ["mentor", "admin", "super_admin"];');
  });
});
