import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0114_affiliate_payouts.sql"), "utf8");
const flat = sql.replace(/\s+/g, " ");

describe("0114 affiliate payouts", () => {
  it("creates the table idempotently with RLS on and no policies", () => {
    expect(flat).toMatch(/create table if not exists public\.affiliate_payouts \(/i);
    expect(flat).toMatch(/alter table public\.affiliate_payouts enable row level security/i);
    expect(sql).not.toMatch(/create policy/i);
  });

  it("has every column", () => {
    for (const col of [
      "id uuid primary key default gen_random_uuid()",
      "affiliate_id uuid not null references public.affiliates(id)",
      "amount_pkr numeric(12,2) not null",
      "method text not null",
      "account_title text not null",
      "account_number text not null",
      "status text not null default 'pending'",
      "reject_reason text",
      "requested_at timestamptz not null default now()",
      "decided_at timestamptz",
    ]) expect(flat, col).toContain(col);
  });

  it("limits method, status, amount and requires a reason when rejected", () => {
    expect(flat).toMatch(/method in \('jazzcash', ?'easypaisa', ?'bank'\)/i);
    expect(flat).toMatch(/status in \('pending', ?'paid', ?'rejected'\)/i);
    expect(flat).toMatch(/amount_pkr >= 3500/i);
    expect(flat).toMatch(/status <> 'rejected' or \(reject_reason is not null/i);
  });

  it("allows only one pending request per affiliate", () => {
    expect(flat).toMatch(
      /create unique index if not exists \w+ on public\.affiliate_payouts \(affiliate_id\) where status = 'pending'/i,
    );
  });

  it("adds both payout email kinds and keeps the old ones", () => {
    expect(flat).toMatch(/drop constraint if exists affiliate_emails_kind_check/i);
    const m = flat.match(/affiliate_emails_kind_check check \(kind in \(([^)]*)\)\)/i);
    expect(m).not.toBeNull();
    for (const k of ["accepted", "dropped", "left", "progress", "motivation", "payout_paid", "payout_rejected"])
      expect(m![1], k).toContain(`'${k}'`);
  });

  it("is safe to paste twice", () => {
    expect(flat).toMatch(/create table if not exists/i);
    expect(flat).toMatch(/drop constraint if exists/i);
  });
});
