import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { areaForPath } from "@/lib/team/areas";

const APP = join(process.cwd(), "src", "app");
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const urlOf = (file: string) => "/" + relative(APP, dirname(file)).split(sep).join("/");
const rel = (f: string) => relative(process.cwd(), f).split(sep).join("/");

const adminFiles = [...walk(join(APP, "dashboard", "admin")), ...walk(join(APP, "api", "admin"))].filter((f) => /\.(ts|tsx)$/.test(f));
const entry = (f: string) => /(^|[\\/])(page\.tsx|route\.ts)$/.test(f);
const entries = adminFiles.filter(entry);

const GUARDED = /await (requireAdmin|requireAdminPage|requireAdminHomePage|requireSuperAdmin|requireSuperAdminPage|requireImageUploader)\(/;
// Pages that only redirect somewhere else and show nothing themselves.
const REDIRECT_ONLY = new Set(["src/app/dashboard/admin/people/page.tsx", "src/app/dashboard/admin/crm/page.tsx"]);

describe("every admin page and API belongs to an area", () => {
  it("has an area for every page.tsx and route.ts (the admin home is the one exception)", () => {
    const unmapped = entries.filter((f) => urlOf(f) !== "/dashboard/admin").filter((f) => areaForPath(urlOf(f)) === null).map(rel);
    expect(unmapped).toEqual([]);
  });
  it("checks access in every page.tsx and route.ts, unless it only redirects", () => {
    const open = entries.filter((f) => !REDIRECT_ONLY.has(rel(f))).filter((f) => !GUARDED.test(readFileSync(f, "utf8"))).map(rel);
    expect(open).toEqual([]);
  });
});

describe("every guard call names the right area", () => {
  const calls = /await (requireAdmin|requireAdminPage)\(([^)]*)\)/g;
  it("never calls requireAdmin or requireAdminPage with no area", () => {
    const bare = adminFiles.filter((f) => { const s = readFileSync(f, "utf8"); return /await (requireAdmin|requireAdminPage)\(\s*\)/.test(s); }).map(rel);
    expect(bare).toEqual([]);
  });
  it("uses exactly the areas the path map gives that route", () => {
    const wrong: string[] = [];
    for (const f of adminFiles) {
      const src = readFileSync(f, "utf8");
      for (const m of Array.from(src.matchAll(calls))) {
        const want = areaForPath(urlOf(f));
        const got = Array.from(m[2].matchAll(/"([a-z_]+)"/g)).map((x) => x[1]);
        if (!want || got.length === 0 || [...got].sort().join() !== [...want].sort().join()) wrong.push(`${rel(f)}: ${m[0]}`);
      }
    }
    expect(wrong).toEqual([]);
  });
  it("lets only the admin home page use requireAdminHomePage", () => {
    const users = adminFiles.filter((f) => readFileSync(f, "utf8").includes("await requireAdminHomePage(")).map(rel);
    expect(users).toEqual(["src/app/dashboard/admin/page.tsx"]);
  });
});

describe("server actions", () => {
  // An exported action is guarded if its own body checks access, or it calls a local helper that does.
  it("every exported action in an admin actions file checks access, directly or through a local helper", () => {
    const missing: string[] = [];
    const GUARD = /await (requireAdmin|requireAdminPage)\(/;
    for (const f of adminFiles) {
      const src = readFileSync(f, "utf8");
      if (!/^\s*["']use server["']/m.test(src)) continue;
      const blocks = src.split(/\r?\n(?=(?:export )?(?:async )?function )/);
      const guardedHelpers = new Set<string>();
      for (const b of blocks) {
        const name = /^(?:export )?(?:async )?function (\w+)/.exec(b)?.[1];
        if (name && GUARD.test(b)) guardedHelpers.add(name);
      }
      for (const b of blocks) {
        const m = /^export async function (\w+)/.exec(b);
        if (!m) continue;
        const viaHelper = Array.from(guardedHelpers).some((h) => h !== m[1] && b.includes(`${h}(`));
        if (!GUARD.test(b) && !viaHelper) missing.push(`${rel(f)}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
