import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(process.cwd(), "supabase", "migrations", "0098_ref_id_from_last.sql");
const old = readFileSync(join(process.cwd(), "supabase", "migrations", "0070_landing_variants.sql"), "utf8");

describe("0098: the next reference number follows the last registration that still exists", () => {
  it("the migration file exists", () => {
    expect(existsSync(FILE)).toBe(true);
  });
  const sql = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";

  it("redefines landing_create_registration with the same signature, security and grants as 0070", () => {
    expect(sql).toMatch(/create or replace function public\.landing_create_registration\(\s*p_page_id\s+uuid,\s*p_rows\s+jsonb,\s*p_promo_id uuid\s+default null,\s*p_is_test\s+boolean default false,\s*p_capacity integer default 0\s*\) returns jsonb/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = public/i);
    expect(sql).toMatch(/revoke all on function public\.landing_create_registration\(uuid, jsonb, uuid, boolean, integer\) from public, anon, authenticated;/i);
    expect(sql).toMatch(/grant execute on function public\.landing_create_registration\(uuid, jsonb, uuid, boolean, integer\) to service_role;/i);
  });

  it("works out the next number from the highest number still in use for the prefix, across all pages", () => {
    expect(sql).toMatch(/max\(/i);
    expect(sql).toMatch(/from public\.landing_registrations r\s+where r\.ref_id like 'PZA-' \|\| v_prefix \|\| '-%'/i);
    expect(sql).toMatch(/v_n := v_max \+ 1/i);
  });

  it("no longer simply adds one to a counter that never goes down", () => {
    expect(sql).not.toMatch(/c\.last_number \+ 1/);
  });

  it("serialises registrations that share a prefix, even across different pages", () => {
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\('ref-prefix:' \|\| v_prefix, 0\)\)/);
  });

  it("still records the number it handed out in landing_ref_counters", () => {
    expect(sql).toMatch(/insert into public\.landing_ref_counters as c \(prefix, last_number, updated_at\)\s+values \(v_prefix, v_n, now\(\)\)\s+on conflict \(prefix\) do update set last_number = excluded\.last_number/i);
  });

  it("keeps everything else in the function exactly as 0070 has it (variant_key, test refs, capacity, promo)", () => {
    for (const piece of ["variant_key", "'TEST-'", "capacity_full", "promo_exhausted", "invalid_rows", "page_not_found", "pg_advisory_xact_lock(hashtextextended(p_page_id::text, 0))"]) {
      expect(sql).toContain(piece);
      expect(old).toContain(piece);
    }
  });

  it("changes no table and no data", () => {
    expect(sql).not.toMatch(/\balter table\b/i);
    expect(sql).not.toMatch(/\bdelete from\b/i);
    expect(sql).not.toMatch(/\bdrop\b/i);
    expect(sql).not.toMatch(/\bupdate public\.(?!landing_promo_codes)/i);
  });
});
