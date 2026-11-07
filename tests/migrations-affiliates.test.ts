import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0107_affiliates.sql"), "utf8");
const flat = sql.replace(/\s+/g, " ");

describe("0107 affiliates", () => {
  it("creates the affiliates table idempotently with RLS and no policies", () => {
    expect(flat).toMatch(/create table if not exists public\.affiliates \(/i);
    expect(flat).toMatch(/alter table public\.affiliates enable row level security/i);
    expect(sql).not.toMatch(/create policy/i);
  });

  it("has every column", () => {
    for (const col of [
      "id uuid primary key default gen_random_uuid()",
      "status text not null default 'applied'",
      "name text not null",
      "email text not null",
      "whatsapp text not null",
      "city_country text not null",
      "answers jsonb not null default '{}'",
      "code text",
      "code_serial integer",
      "token text",
      "team text",
      "commission_mode text not null default 'automatic'",
      "manual_percent numeric(4,2)",
      "opening_secured integer not null default 0",
      "opening_commission numeric(12,2) not null default 0",
      "opening_withdrawn numeric(12,2) not null default 0",
      "is_imported boolean not null default false",
      "terms_accepted_at timestamptz",
      "terms_version text",
      "accepted_at timestamptz",
      "dropped_at timestamptz",
      "left_at timestamptz",
      "created_at timestamptz not null default now()",
      "updated_at timestamptz not null default now()",
    ]) expect(flat, col).toContain(col);
  });

  it("limits status, team, mode and manual percent", () => {
    expect(flat).toMatch(/status in \('applied', ?'accepted', ?'dropped', ?'left'\)/i);
    expect(flat).toMatch(/team in \('Green', ?'White', ?'Yellow', ?'Blue', ?'Pink'\)/i);
    expect(flat).toMatch(/commission_mode in \('manual', ?'automatic'\)/i);
    expect(flat).toMatch(/manual_percent between 8 and 10/i);
  });

  it("makes code and token unique and email unique ignoring case", () => {
    expect(flat).toMatch(/code text unique/i);
    expect(flat).toMatch(/token text unique/i);
    expect(flat).toMatch(/create unique index if not exists affiliates_email_lower_uidx on public\.affiliates \(lower\(email\)\)/i);
  });

  it("starts the serial at 321 and keeps the function away from anon and authenticated", () => {
    expect(flat).toMatch(/create sequence if not exists public\.affiliate_code_serial start 321/i);
    expect(flat).toMatch(/create or replace function public\.next_affiliate_serial\(\) returns integer/i);
    expect(flat).toMatch(/security definer/i);
    expect(flat).toMatch(/revoke all on function public\.next_affiliate_serial\(\) from public, anon, authenticated/i);
  });

  it("widens the site_terms key check and seeds the three affiliate documents", () => {
    expect(flat).toMatch(/drop constraint if exists site_terms_key_check/i);
    expect(flat).toMatch(/check \(key in \('general', ?'affiliate_terms', ?'affiliate_rules', ?'affiliate_privacy'\)\)/i);
    for (const k of ["affiliate_terms", "affiliate_rules", "affiliate_privacy"]) expect(sql).toContain(`'${k}'`);
    expect(flat).toMatch(/on conflict \(key\) do nothing/i);
  });
});
