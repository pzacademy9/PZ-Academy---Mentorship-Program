// tests/landing-whatsapp-routes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const gate = vi.hoisted(() => ({ ok: true }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (gate.ok
    ? { ok: true, user: { id: "admin-1" } }
    : { ok: false, response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) }),
}));
const m = vi.hoisted(() => ({ listWhatsappNumbers: vi.fn(), addWhatsappNumber: vi.fn(), deleteWhatsappNumber: vi.fn() }));
vi.mock("@/lib/data/landing-whatsapp", () => m);

import { GET, POST } from "@/app/api/admin/landing-whatsapp/route";
import { DELETE } from "@/app/api/admin/landing-whatsapp/[id]/route";

const ID = "00000000-0000-4000-8000-000000000001";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const req = (body: unknown, method = "POST") =>
  new Request("http://x", { method, body: typeof body === "string" ? body : JSON.stringify(body) }) as never;

beforeEach(() => {
  gate.ok = true;
  for (const f of Object.values(m)) f.mockReset();
});

describe("admin gate", () => {
  it("every handler answers the gate's 403 and touches no data", async () => {
    gate.ok = false;
    const calls = [() => GET(), () => POST(req({ label: "A", number: "923001234567" })), () => DELETE(req({}, "DELETE"), ctx())];
    for (const call of calls) expect((await call()).status).toBe(403);
    for (const f of Object.values(m)) expect(f).not.toHaveBeenCalled();
  });
});

describe("GET", () => {
  it("returns the numbers, 500 when the read fails", async () => {
    m.listWhatsappNumbers.mockResolvedValue([{ label: "PZ Academy main", number: "923700199429", official: true }]);
    expect(await (await GET()).json()).toEqual({ numbers: [{ label: "PZ Academy main", number: "923700199429", official: true }] });
    m.listWhatsappNumbers.mockRejectedValue(new Error("down"));
    expect((await GET()).status).toBe(500);
  });
});

describe("POST", () => {
  it("stores the cleaned number with a trimmed label", async () => {
    const row = { id: ID, label: "Sales", number: "923001234567", official: false };
    m.addWhatsappNumber.mockResolvedValue({ ok: true, row });
    const res = await POST(req({ label: "  Sales ", number: "+92 300 1234567" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ number: row });
    expect(m.addWhatsappNumber).toHaveBeenCalledWith({ label: "Sales", number: "923001234567" }, "admin-1");
  });
  it("400 for a bad number, a bad label or bad JSON, and nothing is written", async () => {
    for (const body of [
      { label: "Sales", number: "0370" },
      { label: "Sales", number: 5 },
      { label: "   ", number: "923001234567" },
      { label: "x".repeat(61), number: "923001234567" },
      { number: "923001234567" },
      "not json",
    ]) {
      const res = await POST(req(body));
      expect(res.status).toBe(400);
      expect(typeof (await res.json()).error).toBe("string");
    }
    expect(m.addWhatsappNumber).not.toHaveBeenCalled();
  });
  it("409 for a duplicate, 400 for invalid from the store, 500 for an error", async () => {
    const body = { label: "Sales", number: "923001234567" };
    m.addWhatsappNumber.mockResolvedValue({ ok: false, reason: "duplicate" });
    expect((await POST(req(body))).status).toBe(409);
    m.addWhatsappNumber.mockResolvedValue({ ok: false, reason: "invalid" });
    expect((await POST(req(body))).status).toBe(400);
    m.addWhatsappNumber.mockResolvedValue({ ok: false, reason: "error" });
    expect((await POST(req(body))).status).toBe(500);
  });
});

describe("DELETE /[id]", () => {
  it("404 for a non-uuid id without touching the database", async () => {
    expect((await DELETE(req({}, "DELETE"), ctx("not-a-uuid"))).status).toBe(404);
    expect((await DELETE(req({}, "DELETE"), ctx("923700199429"))).status).toBe(404);
    expect(m.deleteWhatsappNumber).not.toHaveBeenCalled();
  });
  it("deletes a saved number, 500 on failure", async () => {
    m.deleteWhatsappNumber.mockResolvedValue({ ok: true });
    const res = await DELETE(req({}, "DELETE"), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(m.deleteWhatsappNumber).toHaveBeenCalledWith(ID);
    m.deleteWhatsappNumber.mockResolvedValue({ ok: false });
    expect((await DELETE(req({}, "DELETE"), ctx())).status).toBe(500);
  });
});
