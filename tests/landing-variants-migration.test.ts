// @vitest-environment node
// tests/landing-variants-migration.test.ts
// The DB is not reachable from tests, so assert on the migration text: the RPC that inserts registrations
// must write variant_key, otherwise every registration silently stores ''.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/0070_landing_variants.sql", "utf8");
const at = sql.indexOf("create or replace function public.landing_create_registration(");
const fn = at >= 0 ? sql.slice(at) : "";

describe("0070 redefines landing_create_registration with variant_key", () => {
  it("is defined after the column is added", () => {
    expect(at).toBeGreaterThan(sql.indexOf("add column if not exists variant_key"));
  });
  it("keeps the 0069 signature, security and search_path", () => {
    expect(fn).toMatch(/p_page_id\s+uuid,\s+p_rows\s+jsonb,\s+p_promo_id uuid\s+default null,\s+p_is_test\s+boolean default false,\s+p_capacity integer default 0\s*\) returns jsonb/);
    expect(fn).toMatch(/security definer\s+set search_path = public/);
  });
  it("lists variant_key as the last insert column and reads it as the last value", () => {
    expect(fn).toMatch(/session_id, is_test, variant_key\s*\) values \(/);
    expect(fn).toMatch(/v_test,\s+coalesce\(v_row->>'variant_key', ''\)\s*\)\s+returning id into v_id/);
  });
  it("revokes from public roles and grants only service_role, as 0069 does", () => {
    expect(fn).toContain("revoke all on function public.landing_create_registration(uuid, jsonb, uuid, boolean, integer) from public, anon, authenticated;");
    expect(fn).toContain("grant execute on function public.landing_create_registration(uuid, jsonb, uuid, boolean, integer) to service_role;");
  });
  it("is otherwise the 0069 body (only the variant_key lines differ)", () => {
    const orig = readFileSync("supabase/migrations/0069_landing_registration.sql", "utf8").replace(/\r\n/g, "\n");
    const o = orig.slice(orig.indexOf("create or replace function public.landing_create_registration("));
    const norm = (s: string) => s.replace(/\r\n/g, "\n").replace(/,\s*variant_key/, "").replace(/v_test,\s+coalesce\(v_row->>'variant_key', ''\)/, "v_test").trim();
    expect(norm(fn).slice(0, norm(o).length)).toBe(norm(o).trim());
  });
});
