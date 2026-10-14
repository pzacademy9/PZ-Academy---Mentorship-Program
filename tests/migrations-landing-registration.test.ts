import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0069_landing_registration.sql"), "utf8");
const types = readFileSync(join(process.cwd(), "src", "lib", "supabase", "database.types.ts"), "utf8");

const TABLES = [
  "payment_accounts", "landing_registrations", "landing_promo_codes", "landing_status_events",
  "landing_funnel_events", "landing_agent_links", "landing_ref_counters", "landing_jobs",
];
const block = (name: string, next: string) => types.slice(types.indexOf(`      ${name}: {`), types.indexOf(`      ${next}: {`));
const count = (text: string, word: string) => (text.match(new RegExp(`\\b${word}\\b`, "g")) ?? []).length;

it("creates every table idempotently with RLS on and zero policies", () => {
  for (const t of TABLES) {
    expect(sql).toMatch(new RegExp(`create table if not exists public\\.${t} \\(`, "i"));
    expect(sql).toMatch(new RegExp(`alter table public\\.${t} enable row level security`, "i"));
  }
  expect(sql).not.toMatch(/create policy/i);
  expect(sql).not.toMatch(/drop table/i);
});

it("adds the four landing_pages columns", () => {
  for (const col of ["course_id", "sheet_id", "drive_folder_id", "ref_prefix"]) {
    expect(sql).toMatch(new RegExp(`add column if not exists ${col}\\b`, "i"));
  }
  expect(sql).toMatch(/course_id\s+uuid references public\.courses\(id\) on delete set null/i);
  expect(sql).toMatch(/ref_prefix\s+text check \(ref_prefix is null or ref_prefix ~ '\^\[A-Z0-9\]\{2,6\}\$'\)/);
});

it("constrains registrations and indexes the lookups", () => {
  expect(sql).toMatch(/row_type\s+text not null check \(row_type in \('individual', 'lead', 'member'\)\)/i);
  expect(sql).toMatch(/\bstatus\s+text not null default 'pending' check \(status in \('pending', 'paid', 'underpaid', 'reserved', 'free'\)\)/i);
  expect(sql).toMatch(/check \(\(row_type = 'member'\) = \(lead_registration_id is not null\)\)/i);
  expect(sql).toMatch(/create unique index if not exists landing_registrations_ref_id_key\s+on public\.landing_registrations \(ref_id\) where ref_id is not null/i);
  for (const idx of ["landing_registrations_page_email_idx", "landing_registrations_student_idx", "landing_registrations_lead_idx", "landing_registrations_email_idx"]) {
    expect(sql).toContain(`create index if not exists ${idx}`);
  }
  expect(sql).toMatch(/unique \(registration_id, type\)/i);
});

it("seeds the eight real payment accounts once", () => {
  for (const key of ["faysal", "easypaisa", "mashreq", "anb", "pnb_ph", "gcash", "pnb_in", "paypal"]) {
    expect(sql).toContain(`('${key}',`);
  }
  expect(sql).toMatch(/on conflict \(key\) do nothing/i);
  for (const number of ["3573499000006913", "03401940624", "AE800330000019101064212", "SA55301009740171345304360", "3137-1020-0139", "09457717033", "0884001500003043", "PUNB0088400"]) {
    expect(sql).toContain(number);
  }
});

it("defines the create-registration RPC as service-role only", () => {
  expect(sql).toMatch(/create or replace function public\.landing_create_registration\(/i);
  expect(sql).toMatch(/returns jsonb\s+language plpgsql\s+security definer\s+set search_path = public/i);
  const sig = "public.landing_create_registration(uuid, jsonb, uuid, boolean, integer)";
  expect(sql).toContain(`revoke all on function ${sig} from public, anon, authenticated;`);
  expect(sql).toContain(`grant execute on function ${sig} to service_role;`);
});

it("allocates refs race-free, never truncates past 999, and keeps test rows out of counts", () => {
  expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\(p_page_id::text, 0\)\)/i);
  expect(sql).toMatch(/on conflict \(page_id\) do update set last_number = c\.last_number \+ 1/i);
  expect(sql).toMatch(/case when v_n < 1000 then lpad\(v_n::text, 3, '0'\) else v_n::text end/i);
  expect(sql).toContain("'TEST-'");
  expect(sql).toMatch(/raise exception 'capacity_full'/);
  expect(sql).toMatch(/raise exception 'promo_exhausted'/);
  expect(sql).toMatch(/raise exception 'invalid_rows'/);
  expect(sql).toMatch(/and not r\.is_test/i);
  expect(sql).toMatch(/pc\.max_uses is null or pc\.used_count < pc\.max_uses/i);
});

it("database.types.ts knows every new table, column and the RPC", () => {
  for (const t of TABLES) expect(types).toContain(`      ${t}: {`);
  const pages = block("landing_pages", "landing_promo_codes");
  for (const col of ["course_id", "sheet_id", "drive_folder_id", "ref_prefix"]) expect(count(pages, col)).toBeGreaterThanOrEqual(3);
  expect(pages).toContain('foreignKeyName: "landing_pages_course_id_fkey"');
  const regs = block("landing_registrations", "landing_status_events");
  for (const col of ["row_type", "lead_registration_id", "option_keys", "expected_amount", "ref_id", "is_test", "tier_key", "group_size", "session_id"]) {
    expect(count(regs, col)).toBeGreaterThanOrEqual(3);
  }
  expect(types).toMatch(/landing_create_registration: \{\s+Args: \{\s+p_capacity\?: number\s+p_is_test\?: boolean\s+p_page_id: string\s+p_promo_id\?: string \| null\s+p_rows: Json\s+\}\s+Returns: Json/);
});
