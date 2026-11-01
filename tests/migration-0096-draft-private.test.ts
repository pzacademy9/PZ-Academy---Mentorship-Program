// tests/migration-0096-draft-private.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const BS = String.fromCharCode(92);
const read = (f: string) => readFileSync(`supabase/migrations/${f}`, "utf8");
const escapeExpr = (sql: string) => /'%' \|\| (replace\(replace\(replace\(p_query.*?\)) \|\| '%'/.exec(sql)?.[1];

describe("0096 draft batches stay private", () => {
  const sql = read("0096_portal_draft_private.sql");

  it("keeps the backslash escape from 0094", () => {
    expect(sql).toContain(`replace(p_query, '${BS}', '${BS}${BS}')`);
    expect(escapeExpr(sql)).toBe(escapeExpr(read("0094_progress_lookup.sql")));
  });

  it("uses the three-valued rule in the search and makes the column nullable", () => {
    expect(sql).toContain("coalesce(lp.show_in_portal, lp.status in ('published', 'closed'))");
    expect(sql).not.toContain("lp.show_in_portal = true");
    expect(sql).toContain("alter column show_in_portal drop not null");
    expect(sql).toContain("alter column show_in_portal drop default");
  });

  it("runs the data step only while the column is still NOT NULL, before the drop", () => {
    const guard = sql.indexOf("select is_nullable");
    expect(guard).toBeGreaterThan(-1);
    expect(sql).toContain("= 'NO' then");
    expect(guard).toBeLessThan(sql.indexOf("set show_in_portal = null"));
    expect(guard).toBeLessThan(sql.indexOf("set show_in_portal = true"));
    expect(sql.indexOf("set show_in_portal = true")).toBeLessThan(sql.indexOf("alter column show_in_portal drop not null"));
  });

  it("resets true to null except ppc-batch-3, and is re-runnable", () => {
    expect(sql).toContain("where show_in_portal is true");
    expect(sql).toContain("slug <> 'ppc-batch-3'");
    expect(sql).toContain("show_in_portal is distinct from true");
  });
});
