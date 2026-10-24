import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const gate = vi.hoisted(() => ({ mode: "ok" as "ok" | "401" | "403" }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () =>
    gate.mode === "ok"
      ? { ok: true, user: { id: "admin-1" } }
      : { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: gate.mode === "401" ? 401 : 403 }) },
}));
const m = vi.hoisted(() => ({ previewCloseBatch: vi.fn(), closeBatch: vi.fn() }));
vi.mock("@/lib/data/landing-close-batch", () => m);

import { POST, GET, maxDuration } from "@/app/api/admin/landing/close-batch/route";

const PAGE = "00000000-0000-4000-8000-000000000001";
const post = (body: unknown) => new Request("http://x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }) as never;
const get = (qs: string) => new Request(`http://x/api/admin/landing/close-batch${qs}`) as never;
const GENERIC = { error: "Something went wrong. Please try again." };

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  gate.mode = "ok";
  for (const f of Object.values(m)) f.mockReset();
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

describe("close-batch route", () => {
  it("401/403 never reach the data layer", async () => {
    for (const mode of ["401", "403"] as const) {
      gate.mode = mode;
      expect((await POST(post({ pageId: PAGE }))).status).toBe(Number(mode));
      expect((await GET(get(`?pageId=${PAGE}`))).status).toBe(Number(mode));
    }
    for (const f of Object.values(m)) expect(f).not.toHaveBeenCalled();
  });
  it("maxDuration is 60", () => expect(maxDuration).toBe(60));
  it("POST passes adminId and returns the result", async () => {
    const result = { paidAdded: 1, interestedAdded: 2, contactsCreated: 3, contactsMerged: 0, skipped: 0 };
    m.closeBatch.mockResolvedValue(result);
    const res = await POST(post({ pageId: PAGE }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(m.closeBatch).toHaveBeenCalledWith({ pageId: PAGE, adminId: "admin-1" });
  });
  it("GET returns the preview", async () => {
    const preview = { pageTitle: "T", paid: 1, interested: 2, skipped: 0, alreadyClosed: false, newPaid: 1 };
    m.previewCloseBatch.mockResolvedValue(preview);
    const res = await GET(get(`?pageId=${PAGE}`));
    expect(await res.json()).toEqual(preview);
    expect(m.previewCloseBatch).toHaveBeenCalledWith(PAGE);
  });
  it("400 for bad uuid, missing field, bad json", async () => {
    for (const body of [{ pageId: "nope" }, {}, "not json"]) {
      const res = await POST(post(body));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid input" });
    }
    for (const qs of ["", "?pageId=nope"]) expect((await GET(get(qs))).status).toBe(400);
    for (const f of Object.values(m)) expect(f).not.toHaveBeenCalled();
  });
  it("404 when the page is missing", async () => {
    m.closeBatch.mockRejectedValue(new Error("Page not found"));
    m.previewCloseBatch.mockRejectedValue(new Error("Page not found"));
    for (const res of [await POST(post({ pageId: PAGE })), await GET(get(`?pageId=${PAGE}`))]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Page not found" });
    }
  });
  it("500 generic body and no personal data in logs", async () => {
    m.closeBatch.mockRejectedValue(new Error("secret ayesha@example.com"));
    m.previewCloseBatch.mockRejectedValue(new Error("boom"));
    for (const res of [await POST(post({ pageId: PAGE })), await GET(get(`?pageId=${PAGE}`))]) {
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual(GENERIC);
    }
    expect(errSpy).toHaveBeenCalled();
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain("ayesha");
  });
});
