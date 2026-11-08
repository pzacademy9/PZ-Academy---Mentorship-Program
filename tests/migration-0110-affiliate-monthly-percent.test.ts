import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0110_affiliate_monthly_percent.sql"), "utf8");
const flat = sql.replace(/\s+/g, " ");
const check = readFileSync(join(process.cwd(), "supabase", "checks", "0110_affiliate_monthly_percent_check.sql"), "utf8");

describe("0110 affiliate monthly percent", () => {
  it("replaces only the snapshot function; the trigger and tables are not touched", () => {
    expect(flat).toMatch(/create or replace function public\.affiliate_snapshot_commission\(\)/i);
    expect(sql).not.toMatch(/create trigger/i);
    expect(sql).not.toMatch(/create table/i);
    expect(sql).not.toMatch(/alter table/i);
    expect(flat).toMatch(/revoke all on function public\.affiliate_snapshot_commission\(\) from public, anon, authenticated/i);
  });
  it("counts last month's live sales, in Pakistan time", () => {
    expect(flat).toMatch(/date_trunc\('month', now\(\) at time zone 'Asia\/Karachi'\)/i);
    expect(flat).toMatch(/voided_at is null/i);
    expect(flat).toMatch(/created_at at time zone 'Asia\/Karachi'\) >= v_month_start - interval '1 month'/i);
    expect(flat).toMatch(/created_at at time zone 'Asia\/Karachi'\) < v_month_start/i);
  });
  it("10 or more last month is 10%, otherwise 8%, manual is clamped to 8..10", () => {
    expect(flat).toMatch(/when v_last >= 10 then 10 else 8/i);
    expect(flat).toMatch(/least\(10, greatest\(8, coalesce\(v_aff\.manual_percent, 8\)\)\)/i);
  });
  it("imported history only bridges until 1 December 2026", () => {
    expect(flat).toMatch(/v_aff\.opening_secured >= 10 and \(now\(\) at time zone 'Asia\/Karachi'\) < timestamp '2026-12-01 00:00:00' then 10/i);
  });
  it("no longer uses the all-time count for the percent", () => {
    expect(flat).not.toMatch(/v_live \+ v_aff\.opening_secured/i);
  });
  it("keeps what 0109 got right: PKR amounts, locking, one row, void and restore", () => {
    expect(flat).toMatch(/from public\.affiliates where id = new\.affiliate_id for update/i);
    expect(flat).toMatch(/if new\.amount_received is not null then v_amount := new\.amount_received; v_currency := 'PKR';/i);
    expect(flat).toMatch(/update public\.affiliate_commissions set voided_at = null, currency = v_currency, amount_paid = v_amount/i);
    expect(flat).toMatch(/on conflict \(registration_id\) do nothing/i);
    expect(flat).toMatch(/old\.status = 'paid' and new\.status <> 'paid'/i);
    expect(flat).toMatch(/old\.status = 'paid' and new\.status = 'paid'/i);
  });
  it("the check script stops on purpose so nothing is saved", () => {
    expect(check).toMatch(/raise exception 'ALL CHECKS PASSED\. Nothing was saved\.'/);
    expect(check).toMatch(/CHECK 6 FAILED/);
  });
});
