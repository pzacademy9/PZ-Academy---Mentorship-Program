// @vitest-environment node
// tests/landing-list-actions-migration.test.ts
// The DB is not reachable from tests, so assert on the migration text.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const path = "supabase/migrations/0079_landing_list_actions.sql";
const sql = existsSync(path) ? readFileSync(path, "utf8") : "";

describe("0079 landing list actions migration", () => {
  it("exists", () => {
    expect(existsSync(path)).toBe(true);
  });
  it("re-creates the email kind check with all 8 kinds", () => {
    expect(sql).toMatch(/drop constraint if exists landing_email_log_kind_check/);
    for (const k of ["paid", "underpaid", "reserved", "portal_link", "manual_received", "manual_paid", "manual_underpaid", "manual_reserved"]) {
      expect(sql).toContain(`'${k}'`);
    }
  });
  it("re-creates the job type check with all 8 types", () => {
    expect(sql).toMatch(/drop constraint if exists landing_jobs_type_check/);
    for (const t of ["sheet_append", "email_received", "email_members", "email_admin", "sheet_status", "enrollment_sync", "email_status", "sheet_details"]) {
      expect(sql).toContain(`'${t}'`);
    }
  });
  it("creates no policies and leaves the once-only index alone", () => {
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).not.toMatch(/landing_email_log_status_once/);
  });
});
