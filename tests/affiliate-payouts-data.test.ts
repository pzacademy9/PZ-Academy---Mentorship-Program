import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const calls: { table: string; op: string; args: unknown[] }[] = [];
let answers: Record<string, unknown[]> = {};
function chain(table: string): unknown {
  const proxy: unknown = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === "then") {
        return (res: (v: unknown) => void) => {
          const q = answers[table] ?? [];
          res(q.length > 1 ? q.shift() : q[0]);
        };
      }
      return (...args: unknown[]) => {
        calls.push({ table, op: prop, args });
        return proxy;
      };
    },
  });
  return proxy;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => ({ from: (t: string) => chain(t) }) }));

import { requestPayout, decidePayout, listAffiliateHistory, listAdminPayouts } from "@/lib/data/affiliate-payouts";

const dbRow = {
  id: "p1", affiliate_id: "a1", amount_pkr: 3500, method: "bank", account_title: "Test Person",
  account_number: "PK36SCBL0000001123456702", status: "paid", reject_reason: null,
  requested_at: "2026-11-13T00:00:00Z", decided_at: "2026-11-13T01:00:00Z",
  affiliates: { name: "Test Person", code: "TP1" },
};

beforeEach(() => {
  calls.length = 0;
  answers = {};
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("requestPayout", () => {
  it("refuses below the minimum and inserts nothing", async () => {
    const r = await requestPayout({ affiliateId: "a1", available: 3499.99, method: "bank", title: "T", number: "1" });
    expect(r).toEqual({ ok: false, reason: "below-minimum" });
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });
  it("inserts the whole available amount", async () => {
    answers.affiliate_payouts = [{ error: null }];
    const r = await requestPayout({ affiliateId: "a1", available: 3500, method: "jazzcash", title: "T", number: "03001234567" });
    expect(r).toEqual({ ok: true, amountPkr: 3500 });
    expect(calls.find((c) => c.op === "insert")!.args[0]).toMatchObject({ affiliate_id: "a1", amount_pkr: 3500, method: "jazzcash", account_number: "03001234567" });
  });
  it("a unique violation means already-pending", async () => {
    answers.affiliate_payouts = [{ error: { code: "23505", message: "dup" } }];
    expect(await requestPayout({ affiliateId: "a1", available: 5000, method: "bank", title: "T", number: "1" })).toEqual({ ok: false, reason: "already-pending" });
  });
  it("another error returns error", async () => {
    answers.affiliate_payouts = [{ error: { code: "XX", message: "boom" } }];
    expect(await requestPayout({ affiliateId: "a1", available: 5000, method: "bank", title: "T", number: "1" })).toEqual({ ok: false, reason: "error" });
  });
});

describe("decidePayout", () => {
  it("marks a pending row paid", async () => {
    answers.affiliate_payouts = [{ data: [dbRow], error: null }];
    const r = await decidePayout("p1", { action: "paid" });
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.op === "update")!.args[0]).toMatchObject({ status: "paid" });
    expect(calls.some((c) => c.op === "eq" && c.args[0] === "status" && c.args[1] === "pending")).toBe(true);
  });
  it("reject stores the reason", async () => {
    answers.affiliate_payouts = [{ data: [{ ...dbRow, status: "rejected", reject_reason: "Wrong account" }], error: null }];
    const r = await decidePayout("p1", { action: "reject", reason: "Wrong account" });
    expect(calls.find((c) => c.op === "update")!.args[0]).toMatchObject({ status: "rejected", reject_reason: "Wrong account" });
    expect(r.ok && r.row.rejectReason).toBe("Wrong account");
  });
  it("an already-paid row is not-pending and gets no second update", async () => {
    answers.affiliate_payouts = [{ data: [], error: null }, { data: { id: "p1" }, error: null }];
    const r = await decidePayout("p1", { action: "paid" });
    expect(r).toEqual({ ok: false, reason: "not-pending" });
    expect(calls.filter((c) => c.op === "update").length).toBe(1);
  });
  it("a missing row is not-found", async () => {
    answers.affiliate_payouts = [{ data: [], error: null }, { data: null, error: null }];
    expect(await decidePayout("zz", { action: "paid" })).toEqual({ ok: false, reason: "not-found" });
  });
  it("a database error returns error", async () => {
    answers.affiliate_payouts = [{ data: null, error: { message: "x" } }];
    expect(await decidePayout("p1", { action: "paid" })).toEqual({ ok: false, reason: "error" });
  });
});

describe("lists", () => {
  it("history carries only the masked number", async () => {
    answers.affiliate_payouts = [{ data: [dbRow], error: null }];
    const r = await listAffiliateHistory("a1");
    expect(r[0].accountMask).toBe("•••• 6702");
    expect(JSON.stringify(r)).not.toContain("PK36SCBL0000001123456702");
    expect(JSON.stringify(r)).not.toContain("accountNumber");
    expect(calls.some((c) => c.op === "order")).toBe(true);
  });
  it("history throws on a read error", async () => {
    answers.affiliate_payouts = [{ data: null, error: { message: "x" } }];
    await expect(listAffiliateHistory("a1")).rejects.toBeTruthy();
  });
  it("admin list joins name and code and keeps the full number", async () => {
    answers.affiliate_payouts = [{ data: [dbRow], error: null }];
    const r = await listAdminPayouts();
    expect(r[0]).toMatchObject({ affiliateName: "Test Person", affiliateCode: "TP1", accountNumber: "PK36SCBL0000001123456702", amountPkr: 3500 });
  });
  it("admin list throws on a read error", async () => {
    answers.affiliate_payouts = [{ data: null, error: { message: "x" } }];
    await expect(listAdminPayouts()).rejects.toBeTruthy();
  });
});
