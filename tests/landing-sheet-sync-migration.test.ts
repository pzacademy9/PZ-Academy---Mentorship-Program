// @vitest-environment node
// tests/landing-sheet-sync-migration.test.ts
// The DB is not reachable from tests, so assert on the migration text.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const path = "supabase/migrations/0078_landing_sheet_sync.sql";
const sql = existsSync(path) ? readFileSync(path, "utf8") : "";

describe("0078 landing sheet sync migration", () => {
  it("exists", () => {
    expect(existsSync(path)).toBe(true);
  });
  it("creates both tables idempotently", () => {
    expect(sql).toMatch(/create table if not exists public\.landing_sheet_snapshots/);
    expect(sql).toMatch(/create table if not exists public\.landing_sheet_sync_log/);
  });
  it("adds the three landing_pages columns", () => {
    expect(sql).toMatch(/add column if not exists sheet_sync_state text not null default 'report'/);
    expect(sql).toMatch(/add column if not exists sheet_last_scanned_at timestamptz/);
    expect(sql).toMatch(/add column if not exists sheet_sync_waiting integer not null default 0/);
  });
  it("enables RLS on both tables and creates no policies", () => {
    expect(sql.match(/enable row level security/g)?.length).toBe(2);
    expect(sql).not.toMatch(/create policy/i);
  });
  it("constrains sheet_sync_state to report/live", () => {
    expect(sql).toMatch(/check (sheet_sync_state in ('report','live'))/);
  });
  it("has the right foreign key actions", () => {
    expect(sql).toMatch(/page_ids+uuid not null references public.landing_pages(id) on delete cascade/);
    expect(sql).toMatch(/registration_id uuid references public.landing_registrations(id) on delete set null/);
  });
  it("indexes the log", () => {
    expect(sql).toMatch(/\(page_id, scan_id\)/);
    expect(sql).toMatch(/\(page_id, outcome, created_at desc\)/);
  });
});
