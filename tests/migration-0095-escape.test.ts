// tests/migration-0095-escape.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const BS = String.fromCharCode(92);
const read = (f: string) => readFileSync(`supabase/migrations/${f}`, "utf8");
const escapeExpr = (sql: string) => /'%' \|\| (replace\(replace\(replace\(p_query.*?\)) \|\| '%'/.exec(sql)?.[1];

describe("0095 find_enrolled_ids_by_name", () => {
  it("keeps the backslash escape from 0094", () => {
    const sql = read("0095_portal_visibility.sql");
    expect(sql).toContain(`replace(p_query, '${BS}', '${BS}${BS}')`);
    expect(escapeExpr(sql)).toBeDefined();
    expect(escapeExpr(sql)).toBe(escapeExpr(read("0094_progress_lookup.sql")));
  });
});
