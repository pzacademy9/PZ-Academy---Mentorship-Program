// tests/landing-registration-status-routes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const adminGate = vi.hoisted(() => ({ mode: "ok" as "ok" | "401" | "403" }));
const salesGate = vi.hoisted(() => ({ mode: "ok" as "ok" | "401" | "403", role: "sales_agent" as string }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () =>
    adminGate.mode === "ok"
      ? { ok: true, user: { id: "admin-1" } }
      : { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: adminGate.mode === "401" ? 401 : 403 }) },
}));
vi.mock("@/lib/auth/require-sales", () => ({
  requireSalesAgent: async () =>
    salesGate.mode === "ok"
      ? { ok: true, user: { id: "user-1" }, role: salesGate.role }
      : { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: salesGate.mode === "401" ? 401 : 403 }) },
}));
const change = vi.hoisted(() => vi.fn());
vi.mock("@/lib/data/landing-registration-admin", () => ({ changeRegistrationStatus: change }));

import { PATCH as adminPatch } from "@/app/api/admin/registrations/[id]/route";
import { PATCH as salesPatch } from "@/app/api/sales/registrations/[id]/route";
import { STATUS_CHANGE_MESSAGES } from "@/lib/landing/registration/status-rules";

const ID = "00000000-0000-4000-8000-000000000001";
const ctx = { params: Promise.resolve({ id: ID }) };
const req = (body: unknown) =>
  new Request("http://x", { method: "PATCH", body: typeof body === "string" ? body : JSON.stringify(body) }) as never;
const body = { status: "paid", from: "pending" };

beforeEach(() => {
  adminGate.mode = "ok";
  salesGate.mode = "ok";
  salesGate.role = "sales_agent";
  change.mockReset();
});

describe.each([
  ["admin", adminPatch],
  ["sales", salesPatch],
] as const)("%s route", (_name, patch) => {
  it("401 when signed out and the data layer is not called", async () => {
    adminGate.mode = "401";
    salesGate.mode = "401";
    expect((await patch(req(body), ctx)).status).toBe(401);
    expect(change).not.toHaveBeenCalled();
  });

  it("invalid body 400 and the data layer is not called", async () => {
    for (const bad of ["not json", {}, { status: "free", from: "pending" }, { ...body, extra: 1 }, { status: "underpaid", from: "pending", amount: "5" }]) {
      const res = await patch(req(bad), ctx);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid input" });
    }
    expect(change).not.toHaveBeenCalled();
  });

  it("success returns id and status, from becomes expectedFrom", async () => {
    change.mockResolvedValue({ ok: true, id: ID, status: "underpaid", rowsChanged: 1 });
    const res = await patch(req({ status: "underpaid", from: "pending", amount: 500 }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ID, status: "underpaid" });
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ registrationId: ID, to: "underpaid", expectedFrom: "pending", amount: 500 }));
  });

  it("each reason maps to its status code", async () => {
    const cases: [string, number, string][] = [
      ["not-found", 404, "Registration not found"],
      ["member-row", 404, "Registration not found"],
      ["free-row", 400, STATUS_CHANGE_MESSAGES["free-row"]],
      ["amount-required", 400, STATUS_CHANGE_MESSAGES["amount-required"]],
      ["amount-invalid", 400, STATUS_CHANGE_MESSAGES["amount-invalid"]],
      ["already-in-status", 422, STATUS_CHANGE_MESSAGES["already-in-status"]],
      ["stale", 409, "Someone else changed this just now. Reload to see the latest."],
      ["db-error", 500, "Could not update registration"],
    ];
    for (const [reason, code, error] of cases) {
      change.mockResolvedValue({ ok: false, reason });
      const res = await patch(req(body), ctx);
      expect(res.status, reason).toBe(code);
      expect((await res.json()).error, reason).toBe(error);
    }
  });
});

describe("admin route", () => {
  it("403 for a student", async () => {
    adminGate.mode = "403";
    expect((await adminPatch(req(body), ctx)).status).toBe(403);
    expect(change).not.toHaveBeenCalled();
  });
  it("passes an admin actor", async () => {
    change.mockResolvedValue({ ok: true, id: ID, status: "paid", rowsChanged: 1 });
    await adminPatch(req(body), ctx);
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ actor: { userId: "admin-1", role: "admin" } }));
  });
});

describe("sales route", () => {
  it("403 for a student", async () => {
    salesGate.mode = "403";
    expect((await salesPatch(req(body), ctx)).status).toBe(403);
    expect(change).not.toHaveBeenCalled();
  });
  it("agent actor passed with sales_agent role", async () => {
    change.mockResolvedValue({ ok: true, id: ID, status: "paid", rowsChanged: 1 });
    await salesPatch(req(body), ctx);
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ actor: { userId: "user-1", role: "sales_agent" } }));
  });
  it("admins pass through with an admin role", async () => {
    change.mockResolvedValue({ ok: true, id: ID, status: "paid", rowsChanged: 1 });
    salesGate.role = "super_admin";
    await salesPatch(req(body), ctx);
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ actor: { userId: "user-1", role: "super_admin" } }));
    salesGate.role = "admin";
    await salesPatch(req(body), ctx);
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ actor: { userId: "user-1", role: "admin" } }));
  });
});
