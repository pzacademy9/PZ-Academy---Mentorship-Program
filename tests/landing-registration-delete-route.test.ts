// tests/landing-registration-delete-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const gate = vi.hoisted(() => ({ mode: "ok" as "ok" | "401" | "403" }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () =>
    gate.mode === "ok"
      ? { ok: true, user: { id: "admin-1" } }
      : { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: gate.mode === "401" ? 401 : 403 }) },
}));
const del = vi.hoisted(() => vi.fn());
vi.mock("@/lib/data/landing-registration-delete", () => ({ deleteRegistration: del }));
vi.mock("@/lib/data/landing-registration-admin", () => ({ changeRegistrationStatus: vi.fn() }));

import { DELETE } from "@/app/api/admin/registrations/[id]/route";

const ctx = { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }) };
const call = () => DELETE(new Request("http://x", { method: "DELETE" }) as never, ctx);

beforeEach(() => { gate.mode = "ok"; del.mockReset(); });

describe("DELETE /api/admin/registrations/[id]", () => {
  it("refuses anyone who is not an admin and deletes nothing", async () => {
    for (const mode of ["401", "403"] as const) {
      gate.mode = mode;
      expect((await call()).status).toBe(Number(mode));
    }
    expect(del).not.toHaveBeenCalled();
  });
  it("deletes and says how many members went with it", async () => {
    del.mockResolvedValue({ ok: true, removedMembers: 2 });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, removedMembers: 2 });
    expect(del).toHaveBeenCalledWith({ registrationId: "00000000-0000-4000-8000-000000000001" });
  });
  it("answers 404 for an id that is not a UUID, without touching the database", async () => {
    const res = await DELETE(new Request("http://x", { method: "DELETE" }) as never, { params: Promise.resolve({ id: "not-a-uuid" }) });
    expect(res.status).toBe(404);
    expect(del).not.toHaveBeenCalled();
  });
  it("maps the refusals to plain answers", async () => {
    del.mockResolvedValue({ ok: false, reason: "not-found" });
    expect((await call()).status).toBe(404);
    del.mockResolvedValue({ ok: false, reason: "member-row" });
    expect((await call()).status).toBe(404);
    del.mockResolvedValue({ ok: false, reason: "db-error" });
    expect((await call()).status).toBe(500);
  });
});
