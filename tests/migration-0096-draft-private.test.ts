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

  it("inside one DO block: reads is_nullable, then drops not null BEFORE both updates, all under the NO check", () => {
    const doStart = sql.indexOf("do $$");
    const doEnd = sql.indexOf("$$;", doStart + 5);
    expect(doStart).toBeGreaterThan(-1);
    const block = sql.slice(doStart, doEnd);
    const read = block.indexOf("select is_nullable into v_nullable");
    const check = block.indexOf("if v_nullable = 'NO' then");
    const drop = block.indexOf("alter column show_in_portal drop not null");
    const toNull = block.indexOf("set show_in_portal = null");
    const toTrue = block.indexOf("set show_in_portal = true");
    expect(read).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(read);
    expect(drop).toBeGreaterThan(check);
    expect(drop).toBeLessThan(toNull);
    expect(drop).toBeLessThan(toTrue);
    expect(block.indexOf("end if;")).toBeGreaterThan(toTrue);
    expect(block).toContain("declare");
  });

  it("repeats drop not null and drop default after the block, then replaces the function", () => {
    const after = sql.slice(sql.indexOf("$$;") + 3);
    expect(after.indexOf("alter column show_in_portal drop not null")).toBeGreaterThan(-1);
    expect(after.indexOf("alter column show_in_portal drop default")).toBeGreaterThan(-1);
    expect(after.indexOf("create or replace function")).toBeGreaterThan(after.indexOf("drop default"));
  });

  it("resets true to null except ppc-batch-3, and is re-runnable", () => {
    expect(sql).toContain("where show_in_portal is true");
    expect(sql).toContain("slug <> 'ppc-batch-3'");
    expect(sql).toContain("show_in_portal is distinct from true");
  });
});
