import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  allowed: vi.fn(),
  model: vi.fn(),
  request: vi.fn(),
}));
vi.mock("@/lib/pzid/caller-allowed", () => ({ affiliatePageCallerAllowed: m.allowed }));
vi.mock("@/lib/data/affiliate-page", () => ({ getAffiliatePageModel: m.model }));
vi.mock("@/lib/data/affiliate-payouts", () => ({ requestPayout: m.request }));

import { POST } from "@/app/api/affiliates/payout/route";

const TOKEN = "t".repeat(32);
const body = (over: Record<string, unknown> = {}) => ({ token: TOKEN, method: "jazzcash", title: "Sara Khan", number: "0300 1234567", ...over });
const post = (b: unknown, raw?: string) =>
  POST(new Request("http://x/api/affiliates/payout", { method: "POST", body: raw ?? JSON.stringify(b) }) as never);
const model = (balancePkr: number) => ({ affiliateId: "aff-1", balancePkr });

beforeEach(() => {
  m.allowed.mockReset().mockResolvedValue(true);
  m.model.mockReset().mockResolvedValue(model(5000));
  m.request.mockReset().mockResolvedValue({ ok: true, amountPkr: 5000 });
});

describe("POST /api/affiliates/payout", () => {
  it("returns 429 over the rate limit without reading the database", async () => {
    m.allowed.mockResolvedValue(false);
    const res = await post(body());
    expect(res.status).toBe(429);
    expect(m.model).not.toHaveBeenCalled();
    expect(m.request).not.toHaveBeenCalled();
  });

  it("returns 400 for a body that is not JSON or is missing fields", async () => {
    expect((await post(null, "nope")).status).toBe(400);
    expect((await post({ token: TOKEN })).status).toBe(400);
    expect(m.model).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown, dropped or left affiliate", async () => {
    m.model.mockResolvedValue(null);
    const res = await post(body());
    expect(res.status).toBe(404);
    expect(m.request).not.toHaveBeenCalled();
  });

  it("returns 404 before judging the details, so a bad token learns nothing else", async () => {
    m.model.mockResolvedValue(null);
    const res = await post(body({ number: "bad" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 with the plain sentence for a bad IBAN", async () => {
    const res = await post(body({ method: "bank", number: "PK12" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Enter a valid 24-character IBAN starting with PK." });
    expect(m.request).not.toHaveBeenCalled();
  });

  it("returns 409 when the balance is 3,499.99", async () => {
    m.model.mockResolvedValue(model(3499.99));
    const res = await post(body());
    expect(res.status).toBe(409);
    expect(m.request).not.toHaveBeenCalled();
  });

  it("asks for the whole server-computed balance and returns only the amount", async () => {
    m.model.mockResolvedValue(model(5234.5));
    m.request.mockResolvedValue({ ok: true, amountPkr: 5234.5 });
    const res = await post(body({ amountPkr: 999999 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, amountPkr: 5234.5 });
    expect(JSON.stringify(json)).not.toContain(TOKEN);
    expect(JSON.stringify(json)).not.toContain("03001234567");
    expect(m.request).toHaveBeenCalledWith({
      affiliateId: "aff-1",
      available: 5234.5,
      method: "jazzcash",
      title: "Sara Khan",
      number: "03001234567",
    });
  });

  it("returns 409 when a request is already pending", async () => {
    m.request.mockResolvedValue({ ok: false, reason: "already-pending" });
    const res = await post(body());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already/i);
  });

  it("returns 409 when the data layer says below-minimum", async () => {
    m.request.mockResolvedValue({ ok: false, reason: "below-minimum" });
    expect((await post(body())).status).toBe(409);
  });

  it("returns 500 when saving fails", async () => {
    m.request.mockResolvedValue({ ok: false, reason: "error" });
    const res = await post(body());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("03001234567");
  });

  it("returns 500 when reading the affiliate throws", async () => {
    m.model.mockRejectedValue(new Error("db down"));
    const res = await post(body());
    expect(res.status).toBe(500);
    expect(m.request).not.toHaveBeenCalled();
  });
});
