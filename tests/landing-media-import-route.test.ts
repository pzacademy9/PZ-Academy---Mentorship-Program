import { describe, it, expect, vi, beforeEach } from "vitest";

const gate = vi.hoisted(() => ({ ok: true }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (gate.ok
    ? { ok: true, user: { id: "admin-1" } }
    : { ok: false, response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) }),
}));
const m = vi.hoisted(() => ({ importExistingMedia: vi.fn() }));
vi.mock("@/lib/data/landing-media", () => m);

import { POST } from "@/app/api/admin/landing-media/import-existing/route";

beforeEach(() => { gate.ok = true; m.importExistingMedia.mockReset(); });

describe("POST /api/admin/landing-media/import-existing", () => {
  it("403 from the gate and does nothing", async () => {
    gate.ok = false;
    expect((await POST()).status).toBe(403);
    expect(m.importExistingMedia).not.toHaveBeenCalled();
  });
  it("200 with the counts, passing the admin id", async () => {
    m.importExistingMedia.mockResolvedValue({ added: 3, alreadyThere: 1, skipped: 2 });
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ added: 3, alreadyThere: 1, skipped: 2 });
    expect(m.importExistingMedia).toHaveBeenCalledWith("admin-1");
  });
  it("500 with a plain message on failure", async () => {
    m.importExistingMedia.mockRejectedValue(new Error("down"));
    const res = await POST();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Could not add the existing pictures. Please try again." });
  });
});
