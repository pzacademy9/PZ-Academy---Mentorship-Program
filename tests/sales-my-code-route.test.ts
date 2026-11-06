import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const { requireSales, createPromo } = vi.hoisted(() => ({ requireSales: vi.fn(), createPromo: vi.fn() }));
vi.mock("@/lib/auth/require-sales", () => ({ requireSalesAgent: requireSales }));
vi.mock("@/lib/data/agent-promo-code", () => ({ createAgentPromo: createPromo }));

import { POST } from "@/app/api/sales/my-code/route";

const req = (body: unknown) =>
  new Request("http://x/api/sales/my-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  requireSales.mockReset().mockResolvedValue({ ok: true, user: { id: "agent-1" }, role: "sales_agent" });
  createPromo.mockReset().mockResolvedValue({ ok: true, code: "PZ-AHM" });
});

describe("POST /api/sales/my-code", () => {
  it("passes the gate's response through when not signed in", async () => {
    requireSales.mockResolvedValue({ ok: false, response: Response.json({ error: "Not authenticated" }, { status: 401 }) });
    expect((await POST(req({ name: "ahm" }))).status).toBe(401);
    expect(createPromo).not.toHaveBeenCalled();
  });
  it("only sales agents may make a code (an admin is turned away)", async () => {
    requireSales.mockResolvedValue({ ok: true, user: { id: "admin-1" }, role: "admin" });
    expect((await POST(req({ name: "ahm" }))).status).toBe(403);
    expect(createPromo).not.toHaveBeenCalled();
  });
  it("owns the code by the signed-in user, never by anything in the body", async () => {
    const res = await POST(req({ name: "ahm", ownerAgentId: "someone-else", agentId: "someone-else" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, code: "PZ-AHM" });
    expect(createPromo).toHaveBeenCalledWith("agent-1", "ahm");
  });
  it("rejects a missing name", async () => {
    expect((await POST(req({}))).status).toBe(400);
    expect(createPromo).not.toHaveBeenCalled();
  });
  it("maps refusals to plain messages", async () => {
    createPromo.mockResolvedValue({ ok: false, reason: "invalid", error: "Use 2 to 8 letters or numbers." });
    let res = await POST(req({ name: "a" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Use 2 to 8 letters or numbers.");
    createPromo.mockResolvedValue({ ok: false, reason: "exists" });
    res = await POST(req({ name: "ahm" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already have a code/i);
    createPromo.mockResolvedValue({ ok: false, reason: "taken" });
    res = await POST(req({ name: "ahm" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already taken/i);
    createPromo.mockResolvedValue({ ok: false, reason: "db-error" });
    expect((await POST(req({ name: "ahm" }))).status).toBe(500);
  });
});
