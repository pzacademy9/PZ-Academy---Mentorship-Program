// @vitest-environment node
// tests/landing-main-page-migration.test.ts
// The DB is not reachable from tests, so assert on the migration text.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const path = "supabase/migrations/0084_landing_main_page.sql";
const sql = existsSync(path) ? readFileSync(path, "utf8") : "";

describe("0084 landing main page migration", () => {
  it("exists", () => {
    expect(existsSync(path)).toBe(true);
  });
  it("adds the is_main_page column idempotently", () => {
    expect(sql).toContain("add column if not exists is_main_page");
  });
  it("adds the course check and the unique partial index", () => {
    expect(sql).toMatch(/drop constraint if exists landing_pages_main_needs_course/);
    expect(sql).toContain("landing_pages_main_needs_course");
    expect(sql).toMatch(/create unique index if not exists landing_pages_main_per_course/);
  });
  it("creates the RPC and locks it to service_role", () => {
    expect(sql).toContain("create or replace function public.landing_set_main_page");
    expect(sql).toContain("revoke all on function public.landing_set_main_page");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("main_needs_course");
  });
  it("clears the main flag when a course is deleted (before update trigger)", () => {
    expect(sql).toContain("drop trigger if exists landing_pages_clear_main_without_course");
    expect(sql).toMatch(/create trigger landing_pages_clear_main_without_course\s+before update on public\.landing_pages/);
    expect(sql).toContain("new.is_main_page := false");
    expect(sql).toContain("revoke all on function public.landing_pages_clear_main_without_course");
  });
  it("raises page_not_found on a bad page id", () => {
    expect(sql.match(/raise exception 'page_not_found'/g)?.length).toBe(2);
  });
  it("creates no policies", () => {
    expect(sql).not.toMatch(/create policy/i);
  });
});
