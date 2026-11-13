import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));
const gate = vi.hoisted(() => ({ result: null as unknown, area: null as unknown }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async (area: unknown) => {
    gate.area = area;
    return gate.result;
  },
}));
const d = vi.hoisted(() => ({
  decidePayout: vi.fn(),
  getAffiliateDetail: vi.fn(),
  sendPaid: vi.fn(),
  sendRejected: vi.fn(),
}));
vi.mock("@/lib/data/affiliate-payouts", () => ({ decidePayout: d.decidePayout }));
vi.mock("@/lib/data/affiliates", () => ({ getAffiliateDetail: d.getAffiliateDetail }));
vi.mock("@/lib/affiliates/send", () => ({ sendPayoutPaid: d.sendPaid, sendPayoutRejected: d.sendRejected }));

import { PATCH } from "@/app/api/admin/affiliates/payouts/[id]/route";

const ctx = { params: Promise.resolve({ id: "p1" }) };
const patch = (body: unknown) => PATCH(new Request("http://x/api/admin/affiliates/payouts/p1", { method: "PATCH", body: JSON.stringify(body) }) as never, ctx);
const decided = (over: Record<string, unknown> = {}) => ({
  id: "p1", affiliateId: "a1", affiliateName: "Sara", affiliateCode: "SA1", amountPkr: 4120.75, method: "bank",
  accountTitle: "Sara", accountNumber: "PK00", status: "paid", rejectReason: null, requestedAt: "2026-11-10T10:00:00Z", decidedAt: "2026-11-13T10:00:00Z", ...over,
});

beforeEach(() => {
  Object.values(d).forEach((f) => f.mockReset());
  gate.result = { ok: true, user: { id: "u" } };
  d.getAffiliateDetail.mockResolvedValue({ id: "a1", name: "Sara", email: "sara@example.com", status: "accepted", token: "tok1" });
  d.sendPaid.mockResolvedValue(true);
  d.sendRejected.mockResolvedValue(true);
});

describe("PATCH /api/admin/affiliates/payouts/[id]", () => {
  it("gives a non-admin the guard response and does nothing", async () => {
    gate.result = { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    expect((await patch({ action: "paid" })).status).toBe(403);
    expect(gate.area).toBe("sales_hub");
    expect(d.decidePayout).not.toHaveBeenCalled();
    expect(d.sendPaid).not.toHaveBeenCalled();
  });

  it("marks paid, sends the paid email with the amount and returns emailSent true", async () => {
    d.decidePayout.mockResolvedValue({ ok: true, row: decided() });
    const res = await patch({ action: "paid" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, emailSent: true });
    expect(d.decidePayout).toHaveBeenCalledWith("p1", { action: "paid" });
    expect(d.sendPaid).toHaveBeenCalledTimes(1);
    const [who, input] = d.sendPaid.mock.calls[0];
    expect(who).toEqual({ id: "a1", name: "Sara", email: "sara@example.com" });
    expect(input.amountPkr).toBe(4120.75);
    expect(input.method).toBe("bank");
    expect(input.pageUrl).toContain("/affiliate/tok1");
  });

  it("writes the paid date in Pakistan time (20:00 UTC is already the next day)", async () => {
    d.decidePayout.mockResolvedValue({ ok: true, row: decided({ decidedAt: "2026-11-13T20:00:00Z" }) });
    await patch({ action: "paid" });
    expect(d.sendPaid.mock.calls[0][1].paidOn).toBe("14 Nov 2026");
  });

  it("keeps the decision when the email fails and says emailSent false", async () => {
    d.decidePayout.mockResolvedValue({ ok: true, row: decided() });
    d.sendPaid.mockResolvedValue(false);
    const res = await patch({ action: "paid" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, emailSent: false });
  });

  it("rejects with a trimmed reason and sends the rejected email", async () => {
    d.decidePayout.mockResolvedValue({ ok: true, row: decided({ status: "rejected", rejectReason: "Wrong account number" }) });
    const res = await patch({ action: "reject", reason: "  Wrong account number  " });
    expect(res.status).toBe(200);
    expect(d.decidePayout).toHaveBeenCalledWith("p1", { action: "reject", reason: "Wrong account number" });
    expect(d.sendRejected.mock.calls[0][1].reason).toBe("Wrong account number");
    expect(d.sendPaid).not.toHaveBeenCalled();
  });

  it("returns 400 for a reject without a reason and decides nothing", async () => {
    expect((await patch({ action: "reject" })).status).toBe(400);
    expect((await patch({ action: "reject", reason: "  " })).status).toBe(400);
    expect((await patch({ action: "reject", reason: "x".repeat(301) })).status).toBe(400);
    expect(d.decidePayout).not.toHaveBeenCalled();
  });

  it("returns 409 on a second decision and sends no email", async () => {
    d.decidePayout.mockResolvedValue({ ok: false, reason: "not-pending" });
    const res = await patch({ action: "paid" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "This payout was already decided." });
    expect(d.sendPaid).not.toHaveBeenCalled();
    expect(d.sendRejected).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown payout and 500 for a data error", async () => {
    d.decidePayout.mockResolvedValue({ ok: false, reason: "not-found" });
    expect((await patch({ action: "paid" })).status).toBe(404);
    d.decidePayout.mockResolvedValue({ ok: false, reason: "error" });
    expect((await patch({ action: "paid" })).status).toBe(500);
  });

  it("still decides a payout whose affiliate was dropped", async () => {
    d.decidePayout.mockResolvedValue({ ok: true, row: decided() });
    d.getAffiliateDetail.mockResolvedValue({ id: "a1", name: "Sara", email: "sara@example.com", status: "dropped", token: "tok1" });
    const res = await patch({ action: "paid" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, emailSent: true });
  });

  it("says emailSent false when the affiliate cannot be found, without undoing the decision", async () => {
    d.decidePayout.mockResolvedValue({ ok: true, row: decided() });
    d.getAffiliateDetail.mockResolvedValue(null);
    const res = await patch({ action: "paid" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, emailSent: false });
    expect(d.sendPaid).not.toHaveBeenCalled();
  });
});
