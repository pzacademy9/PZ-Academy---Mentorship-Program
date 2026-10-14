// tests/landing-admin-promo-routes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const gate = vi.hoisted(() => ({ ok: true }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (gate.ok
    ? { ok: true, user: { id: "admin-1" } }
    : { ok: false, response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) }),
}));
const m = vi.hoisted(() => ({ listPromoCodes: vi.fn(), createPromoCode: vi.fn(), updatePromoCode: vi.fn(), getOrCreateAgentLink: vi.fn() }));
vi.mock("@/lib/data/landing-promo-codes", () => ({
  listPromoCodes: m.listPromoCodes, createPromoCode: m.createPromoCode, updatePromoCode: m.updatePromoCode,
}));
vi.mock("@/lib/data/landing-agent-links", async (orig) => ({
  ...(await orig<typeof import("@/lib/data/landing-agent-links")>()),
  getOrCreateAgentLink: m.getOrCreateAgentLink,
}));

import { GET as listPromos, POST as createPromo } from "@/app/api/admin/landing-promo-codes/route";
import { PATCH as patchPromo } from "@/app/api/admin/landing-promo-codes/[id]/route";
import { POST as agentLink } from "@/app/api/admin/landing-agent-links/route";
import { AgentLinkError } from "@/lib/data/landing-agent-links";
import { promoIssues } from "@/lib/validations/landing-promo";

const ID = "00000000-0000-4000-8000-000000000001";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const req = (body: unknown, method = "POST") =>
  new Request("http://x", { method, body: typeof body === "string" ? body : JSON.stringify(body) }) as never;
const input = (over: Record<string, unknown> = {}) => ({
  code: "ppc-10", type: "percent", value: 10, fixedAmounts: {}, maxDiscountPercent: 0, pageIds: [], optionKeys: [],
  maxUses: 100, oneperEmail: false, startsAt: null, endsAt: "2026-10-31T23:59:00+05:00", active: true, ownerAgentId: null, ...over,
});
const fieldOf = async (res: Response) => (await res.json()).field;

beforeEach(() => {
  gate.ok = true;
  for (const f of Object.values(m)) f.mockReset();
});

describe("admin gate", () => {
  it("every handler answers the gate's 403 and touches no data", async () => {
    gate.ok = false;
    const calls = [
      () => listPromos(),
      () => createPromo(req(input())),
      () => patchPromo(req({ active: false }, "PATCH"), ctx()),
      () => agentLink(req({ agentId: ID })),
    ];
    for (const call of calls) expect((await call()).status).toBe(403);
    for (const f of Object.values(m)) expect(f).not.toHaveBeenCalled();
  });
});

describe("promo rules", () => {
  it("percent between 0 and 100, fixed needs an amount, the end after the start", () => {
    expect(promoIssues({ type: "percent", value: 10 })).toEqual([]);
    expect(promoIssues({ type: "percent", value: 0 })[0].path).toBe("value");
    expect(promoIssues({ type: "percent", value: 150 })[0].path).toBe("value");
    expect(promoIssues({ type: "percent" })[0].path).toBe("value");
    expect(promoIssues({ type: "fixed", fixedAmounts: {} })[0].path).toBe("fixedAmounts");
    expect(promoIssues({ type: "fixed", fixedAmounts: { PKR: 500 } })).toEqual([]);
    expect(promoIssues({ startsAt: "2026-10-20T00:00:00Z", endsAt: "2026-10-19T00:00:00Z" })[0].path).toBe("endsAt");
  });
});

describe("GET/POST /api/admin/landing-promo-codes", () => {
  it("lists the codes", async () => {
    m.listPromoCodes.mockResolvedValue([{ id: "promo-1", code: "PZ10" }]);
    expect(await (await listPromos()).json()).toEqual({ promoCodes: [{ id: "promo-1", code: "PZ10" }] });
    m.listPromoCodes.mockRejectedValue(new Error("down"));
    expect((await listPromos()).status).toBe(500);
  });
  it("creates a code, upper-casing it", async () => {
    m.createPromoCode.mockResolvedValue({ ok: true, id: "promo-9" });
    const res = await createPromo(req(input()));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "promo-9" });
    expect(m.createPromoCode).toHaveBeenCalledWith(expect.objectContaining({ code: "PPC-10", type: "percent", value: 10, maxUses: 100 }));
  });
  it("accepts a fixed code with per-currency amounts", async () => {
    m.createPromoCode.mockResolvedValue({ ok: true, id: "promo-9" });
    expect((await createPromo(req(input({ type: "fixed", value: 0, fixedAmounts: { PKR: 500, USD: 5 } })))).status).toBe(201);
  });
  it("400 with the field for bad input, and nothing is written", async () => {
    expect(await fieldOf(await createPromo(req(input({ value: 150 }))))).toBe("value");
    expect(await fieldOf(await createPromo(req(input({ type: "fixed", fixedAmounts: {} }))))).toBe("fixedAmounts");
    expect(await fieldOf(await createPromo(req(input({ startsAt: "2026-11-01T00:00:00Z" }))))).toBe("endsAt");
    expect(await fieldOf(await createPromo(req(input({ endsAt: "tomorrow" }))))).toBe("endsAt");
    expect(await fieldOf(await createPromo(req(input({ code: "a" }))))).toBe("code");
    expect(await fieldOf(await createPromo(req(input({ fixedAmounts: { rupees: 5 } }))))).toMatch(/^fixedAmounts/);
    expect((await createPromo(req("not json"))).status).toBe(400);
    expect(m.createPromoCode).not.toHaveBeenCalled();
  });
  it("409 for a duplicate code, 500 for a database error", async () => {
    m.createPromoCode.mockResolvedValue({ ok: false, reason: "duplicate" });
    const dup = await createPromo(req(input()));
    expect(dup.status).toBe(409);
    expect(await fieldOf(dup)).toBe("code");
    m.createPromoCode.mockResolvedValue({ ok: false, reason: "db-error" });
    expect((await createPromo(req(input()))).status).toBe(500);
  });
});

describe("PATCH /api/admin/landing-promo-codes/[id]", () => {
  it("writes only the fields sent", async () => {
    m.updatePromoCode.mockResolvedValue({ ok: true, id: ID });
    const res = await patchPromo(req({ active: false }, "PATCH"), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ID });
    expect(m.updatePromoCode).toHaveBeenCalledWith(ID, { active: false });
  });
  it("404 for a malformed id without a query, 400 for an empty or inconsistent patch", async () => {
    expect((await patchPromo(req({ active: false }, "PATCH"), ctx("not-a-uuid"))).status).toBe(404);
    expect((await patchPromo(req({}, "PATCH"), ctx())).status).toBe(400);
    expect(await fieldOf(await patchPromo(req({ type: "percent" }, "PATCH"), ctx()))).toBe("value");
    expect(m.updatePromoCode).not.toHaveBeenCalled();
  });
  it("maps not-found, duplicate and database errors", async () => {
    m.updatePromoCode.mockResolvedValue({ ok: false, reason: "not-found" });
    expect((await patchPromo(req({ active: false }, "PATCH"), ctx())).status).toBe(404);
    m.updatePromoCode.mockResolvedValue({ ok: false, reason: "duplicate" });
    expect((await patchPromo(req({ code: "PZ10" }, "PATCH"), ctx())).status).toBe(409);
    m.updatePromoCode.mockResolvedValue({ ok: false, reason: "db-error" });
    expect((await patchPromo(req({ active: true }, "PATCH"), ctx())).status).toBe(500);
  });
});

describe("POST /api/admin/landing-agent-links", () => {
  it("returns the agent's code (created on first use)", async () => {
    m.getOrCreateAgentLink.mockResolvedValue({ code: "ayesha-7k2" });
    const res = await agentLink(req({ agentId: ID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: "ayesha-7k2" });
    expect(m.getOrCreateAgentLink).toHaveBeenCalledWith(ID);
  });
  it("400 for a bad id, 422 for someone who is not a sales agent, 500 otherwise", async () => {
    expect((await agentLink(req({ agentId: "x" }))).status).toBe(400);
    expect(m.getOrCreateAgentLink).not.toHaveBeenCalled();
    m.getOrCreateAgentLink.mockRejectedValue(new AgentLinkError("not-sales-agent"));
    const res = await agentLink(req({ agentId: ID }));
    expect(res.status).toBe(422);
    expect(await fieldOf(res)).toBe("agentId");
    m.getOrCreateAgentLink.mockRejectedValue(new AgentLinkError("db-error"));
    expect((await agentLink(req({ agentId: ID }))).status).toBe(500);
    m.getOrCreateAgentLink.mockRejectedValue(new Error("boom"));
    expect((await agentLink(req({ agentId: ID }))).status).toBe(500);
  });
});
