import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0109_affiliate_earning.sql"), "utf8");
const flat = sql.replace(/\s+/g, " ");

describe("0109 affiliate earning: columns", () => {
  it("adds the affiliate owner to promo codes and the affiliate to registrations and funnel events", () => {
    expect(flat).toMatch(/alter table public\.landing_promo_codes add column if not exists owner_affiliate_id uuid references public\.affiliates\(id\) on delete set null/i);
    expect(flat).toMatch(/alter table public\.landing_registrations add column if not exists affiliate_id uuid references public\.affiliates\(id\) on delete set null/i);
    expect(flat).toMatch(/alter table public\.landing_funnel_events add column if not exists affiliate_id uuid references public\.affiliates\(id\) on delete set null/i);
  });
  it("never lets one row carry both an agent and an affiliate", () => {
    expect(flat).toMatch(/check \(agent_id is null or affiliate_id is null\)/i);
  });
  it("indexes the new columns only where set", () => {
    expect(flat).toMatch(/landing_registrations_affiliate_idx on public\.landing_registrations \(affiliate_id\) where affiliate_id is not null/i);
    expect(flat).toMatch(/landing_funnel_events_affiliate_idx on public\.landing_funnel_events \(affiliate_id\) where affiliate_id is not null/i);
  });
});

describe("0109 affiliate earning: commission table", () => {
  it("is created idempotently, one row per registration, service role only", () => {
    expect(flat).toMatch(/create table if not exists public\.affiliate_commissions \(/i);
    expect(flat).toMatch(/registration_id uuid not null unique references public\.landing_registrations\(id\) on delete cascade/i);
    expect(flat).toMatch(/affiliate_id uuid not null references public\.affiliates\(id\) on delete cascade/i);
    expect(flat).toMatch(/alter table public\.affiliate_commissions enable row level security/i);
    expect(sql).not.toMatch(/create policy/i);
  });
  it("keeps the amounts, the percent, the PKR value and the void stamp", () => {
    for (const col of [
      "currency text not null",
      "amount_paid numeric(12,2) not null",
      "percent numeric(4,2) not null",
      "commission numeric(12,2) not null",
      "commission_pkr numeric(12,2)",
      "voided_at timestamptz",
    ]) expect(flat).toContain(col);
  });
});

describe("0109 affiliate earning: trigger", () => {
  it("fires when the status changes or the amount received is corrected, and only then", () => {
    expect(flat).toMatch(/drop trigger if exists landing_registrations_affiliate_commission on public\.landing_registrations/i);
    expect(flat).toMatch(
      /create trigger landing_registrations_affiliate_commission after update of status, amount_received on public\.landing_registrations for each row when \(old\.status is distinct from new\.status or old\.amount_received is distinct from new\.amount_received\)/i,
    );
  });
  it("only counts real sales: lead or individual, not a test, with an affiliate", () => {
    expect(flat).toMatch(/new\.row_type in \('individual', 'lead'\)/i);
    expect(flat).toMatch(/new\.is_test = false/i);
    expect(flat).toMatch(/new\.affiliate_id is not null/i);
  });
  it("locks the affiliate so two sales at once step the percent once", () => {
    expect(flat).toMatch(/from public\.affiliates where id = new\.affiliate_id for update/i);
  });
  it("uses the same percent rules as commission.ts (8, then 10 at 10 paid)", () => {
    expect(flat).toMatch(/>= 10 then 10 else 8/i);
    expect(flat).toMatch(/manual_percent/i);
    expect(flat).toMatch(/opening_secured/i);
  });
  it("an amount received is always PKR, whatever currency the price was in", () => {
    expect(flat).toMatch(/if new\.amount_received is not null then v_amount := new\.amount_received; v_currency := 'PKR';/i);
  });
  it("only a sale with no amount received falls back to its price in its own currency, which waits for a manual conversion", () => {
    expect(flat).toMatch(/else v_amount := new\.expected_amount; v_currency := new\.currency; end if;/i);
    expect(flat).toMatch(/commission_pkr[\s\S]{0,80}case when v_currency = 'PKR' then/i);
    expect(flat).not.toMatch(/coalesce\(new\.amount_received, new\.expected_amount\)/i);
  });
  it("rounds the commission to 2 decimals", () => {
    expect(flat).toMatch(/round\(v_amount \* v_percent \/ 100, 2\)/i);
  });
  it("paid again after a void restores the same row with the amount as it is now, instead of adding a second", () => {
    expect(flat).toMatch(/update public\.affiliate_commissions set voided_at = null, currency = v_currency, amount_paid = v_amount/i);
    expect(flat).toMatch(/on conflict \(registration_id\) do nothing/i);
  });
  it("correcting the amount of a sale that stays Paid corrects its commission at the percent already fixed", () => {
    expect(flat).toMatch(/old\.status = 'paid' and new\.status = 'paid'/i);
    expect(flat).toMatch(/set currency = v_currency, amount_paid = v_amount, commission = round\(v_amount \* percent \/ 100, 2\)/i);
  });
  it("leaving paid voids the row", () => {
    expect(flat).toMatch(/old\.status = 'paid' and new\.status <> 'paid'/i);
    expect(flat).toMatch(/voided_at = now\(\)/i);
  });
});

describe("0109 affiliate earning: stats and backfill", () => {
  it("affiliate_link_stats mirrors the agent one on affiliate_id and is service role only", () => {
    expect(flat).toMatch(/create or replace function public\.affiliate_link_stats\(p_affiliate_id uuid\)/i);
    expect(flat).toMatch(/f\.affiliate_id = p_affiliate_id and f\.type = 'view'/i);
    expect(flat).toMatch(/r\.affiliate_id = p_affiliate_id/i);
    expect(flat).toMatch(/revoke all on function public\.affiliate_link_stats\(uuid\) from public, anon, authenticated/i);
    expect(flat).toMatch(/grant execute on function public\.affiliate_link_stats\(uuid\) to service_role/i);
  });
  it("the trigger function is not callable by clients", () => {
    expect(flat).toMatch(/revoke all on function public\.affiliate_snapshot_commission\(\) from public, anon, authenticated/i);
  });
  it("makes an owner promo code for every accepted affiliate, safe to run twice", () => {
    expect(flat).toMatch(/insert into public\.landing_promo_codes/i);
    expect(flat).toMatch(/where a\.status = 'accepted' and a\.code is not null/i);
    expect(flat).toMatch(/on conflict \(code\) do nothing/i);
    expect(flat).toMatch(/true, 10, a\.id/i);
  });
  it("is safe to run twice", () => {
    expect(sql).not.toMatch(/create table public\./i);
    expect(sql).not.toMatch(/create index public\./i);
  });
});
