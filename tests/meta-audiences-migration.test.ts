import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0086_meta_audiences.sql"), "utf8");
const types = readFileSync(join(process.cwd(), "src", "lib", "supabase", "database.types.ts"), "utf8");

it("adds kind and source_page_id to import_batches idempotently", () => {
  expect(sql).toContain("add column if not exists kind text not null default 'imported'");
  expect(sql).toContain("check (kind in ('imported','closed_paid','closed_interested'))");
  expect(sql).toMatch(/add column if not exists source_page_id uuid references public\.landing_pages\(id\) on delete set null/i);
});

it("has the partial unique index for closed cohorts", () => {
  expect(sql).toMatch(/create unique index if not exists \w+\s+on public\.import_batches \(sheet_id, tab_name\)\s+where kind <> 'imported'/i);
});

it("creates import_batch_contacts with RLS on and no policies", () => {
  expect(sql).toMatch(/create table if not exists public\.import_batch_contacts \(/i);
  expect(sql).toMatch(/primary key \(import_batch_id, contact_id\)/i);
  expect(sql).toMatch(/alter table public\.import_batch_contacts enable row level security/i);
  expect(sql).not.toMatch(/create policy/i);
});

it("defines landing_close_batch with the merge guards", () => {
  expect(sql).toMatch(/create or replace function public\.landing_close_batch\(/i);
  expect(sql).toMatch(/security definer/i);
  expect(sql).toContain("set search_path = public");
  expect(sql).toContain("'enquiry'");
  expect(sql).toContain("'purchase'");
  expect(sql).toContain("on conflict (source_sheet_id, source_row_ref)");
  expect(sql).toContain("exception when unique_violation");
  expect(sql).toContain("delete from public.import_batch_contacts");
  expect(sql).toMatch(/not exists \(\s*select 1 from public\.contact_purchases/i);
  expect(sql).toMatch(/revoke all on function public\.landing_close_batch\(uuid, text, uuid, uuid, jsonb\) from public, anon, authenticated/i);
});

it("processes paid rows first so consent_basis does not depend on row order", () => {
  expect(sql).toMatch(/order by \(value ->> 'bucket'\) = 'paid' desc/i);
});

it("serialises per page and skips rows with no identity", () => {
  expect(sql).toContain("perform pg_advisory_xact_lock(hashtext('landing:' || p_page_id::text))");
  expect(sql).toMatch(/if v_email is null and v_phone is null then\s+continue;/i);
});

it("never touches landing_registrations", () => {
  expect(sql).not.toMatch(/landing_registrations/i);
});

it("hand-adds the types", () => {
  expect(types).toContain("import_batch_contacts: {");
  expect(types).toContain("landing_close_batch: {");
  expect(types).toContain("source_page_id: string | null");
  expect(types).toContain('kind: "imported" | "closed_paid" | "closed_interested"');
});
