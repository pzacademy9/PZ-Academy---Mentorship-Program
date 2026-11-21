import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0120_checkin_window.sql"), "utf8");
const types = readFileSync(join(process.cwd(), "src", "lib", "supabase", "database.types.ts"), "utf8");

const COLS = ["checkin_open_minutes", "checkin_close_minutes"];

it("alters both tables with idempotent column adds", () => {
  expect(sql).toContain("alter table public.landing_pages");
  expect(sql).toContain("alter table public.batch_sessions");
  for (const c of COLS) {
    expect(sql).toMatch(new RegExp(`add column if not exists ${c} int`, "i"));
    expect(sql.split(c).length - 1).toBeGreaterThanOrEqual(4);
  }
  expect(sql.match(/add column if not exists/gi)?.length).toBe(4);
});

it("defaults page columns to 15 and bounds all to 0..180", () => {
  expect(sql).toContain("default 15");
  expect(sql.match(/between 0 and 180/g)?.length).toBeGreaterThanOrEqual(4);
});

it("has hand-added types for both tables", () => {
  for (const c of COLS) {
    expect(types.split(`${c}: number`).length - 1).toBe(2); // Row: pages (number), sessions (number | null)
    expect(types.split(`${c}?: number`).length - 1).toBe(4); // Insert + Update, both tables
  }
});
