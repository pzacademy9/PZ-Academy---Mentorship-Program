import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0113_affiliate_emails_progress.sql"), "utf8");
const flat = sql.replace(/\s+/g, " ");

describe("0113 affiliate progress and motivation emails", () => {
  it("adds the new columns", () => {
    expect(flat).toMatch(/add column if not exists progress_emailed_at timestamptz/i);
    expect(flat).toMatch(/add column if not exists progress_attempts integer not null default 0/i);
    expect(flat).toMatch(/add column if not exists motivation_emailed_at timestamptz/i);
  });
  it("makes the settings table, service role only, with one row", () => {
    expect(flat).toMatch(/create table if not exists public\.affiliate_email_settings/i);
    expect(flat).toMatch(/id boolean primary key default true check \(id\)/i);
    expect(flat).toMatch(/message text not null default ''/i);
    expect(flat).toMatch(/alter table public\.affiliate_email_settings enable row level security/i);
    expect(sql).not.toMatch(/create policy/i);
    expect(flat).toMatch(/on conflict \(id\) do nothing/i);
  });
  it("widens the kind check to the five kinds", () => {
    expect(flat).toMatch(/drop constraint if exists affiliate_emails_kind_check/i);
    expect(flat).toMatch(
      /add constraint affiliate_emails_kind_check check \(kind in \('accepted', 'dropped', 'left', 'progress', 'motivation'\)\)/i,
    );
  });
  it("backfills old sales before anything else can create rows", () => {
    const backfill = flat.search(
      /update public\.affiliate_commissions set progress_emailed_at = now\(\) where progress_emailed_at is null/i,
    );
    expect(backfill).toBeGreaterThan(-1);
    expect(backfill).toBeGreaterThan(flat.search(/add column if not exists progress_emailed_at/i));
    expect(backfill).toBeLessThan(flat.search(/create index/i));
    expect(backfill).toBeLessThan(flat.search(/create table if not exists public\.affiliate_email_settings/i));
  });
  it("adds the pending partial index", () => {
    expect(flat).toMatch(
      /create index if not exists affiliate_commissions_progress_pending_idx on public\.affiliate_commissions \(affiliate_id\) where progress_emailed_at is null and voided_at is null/i,
    );
  });
  it("never deletes or drops tables", () => {
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/delete from/i);
  });
});
