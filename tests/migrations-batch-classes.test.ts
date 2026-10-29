import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0091_batch_classes.sql"), "utf8");
const types = readFileSync(join(process.cwd(), "src", "lib", "supabase", "database.types.ts"), "utf8");

function block(table: string): string {
  const start = types.indexOf(`      ${table}: {`);
  const end = types.indexOf("Relationships:", start);
  return types.slice(start, end);
}

it("adds the landing_pages class defaults idempotently", () => {
  expect(sql).toContain("add column if not exists class_default_start time");
  expect(sql).toContain("add column if not exists class_default_end time");
  expect(sql).toContain("add column if not exists class_default_zoom text not null default ''");
  expect(sql).toContain("add column if not exists class_cover_url text");
  expect(sql).toMatch(/add column if not exists feedback_program_id uuid\s+references public\.feedback_programs \(id\) on delete set null/);
});

it("adds the batch_sessions columns, existing rows count as custom", () => {
  expect(sql).toContain("add column if not exists ends_at timestamptz");
  expect(sql).toContain("add column if not exists speaker text not null default ''");
  expect(sql).toMatch(/add column if not exists feedback_session_id uuid\s+references public\.feedback_sessions \(id\) on delete set null/);
  expect(sql).toContain("add column if not exists custom_time boolean not null default true");
  expect(sql).toContain("add column if not exists custom_zoom boolean not null default true");
});

it("widens the session_kind check to include feedback, safely", () => {
  expect(sql).toContain("drop constraint if exists participant_sends_session_kind_check");
  expect(sql).toMatch(/add constraint participant_sends_session_kind_check\s/);
  expect(sql).not.toContain("add constraint participant_sends_session_kind_check_v2");
  expect(sql).toContain("check (session_kind in ('reminder','update','feedback'))");
  expect(sql).not.toMatch(/drop index/i);
  expect(sql).not.toMatch(/participant_sends_reminder_key/);
});

it("never destroys data", () => {
  expect(sql).not.toMatch(/drop table/i);
  expect(sql).not.toMatch(/drop column/i);
});

it("hand-added types carry the new columns in Row, Insert and Update", () => {
  const lp = block("landing_pages");
  const bs = block("batch_sessions");
  for (const c of ["class_default_start", "class_default_end", "class_default_zoom", "class_cover_url", "feedback_program_id"]) {
    expect(lp.split(c).length - 1).toBe(3);
  }
  for (const c of ["ends_at", "speaker", "feedback_session_id", "custom_time", "custom_zoom"]) {
    expect(bs.split(c).length - 1).toBe(3);
  }
});
