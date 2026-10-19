import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const gate = vi.hoisted(() => ({ mode: "ok" as "ok" | "401" | "403" }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () =>
    gate.mode === "ok"
      ? { ok: true, user: { id: "admin-1" } }
      : { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: gate.mode === "401" ? 401 : 403 }) },
}));
const m = vi.hoisted(() => ({ finishBatch: vi.fn(), emailPortalLinks: vi.fn(), getBatchOverview: vi.fn() }));
vi.mock("@/lib/data/landing-batch", () => m);

import { POST as batchPost, GET as batchGet, maxDuration as batchMax } from "@/app/api/admin/landing/batch/route";
import { POST as linksPost, maxDuration as linksMax } from "@/app/api/admin/landing/portal-links/route";

const PAGE = "00000000-0000-4000-8000-000000000001";
const MOD = "00000000-0000-4000-8000-000000000002";
const post = (body: unknown) => new Request("http://x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }) as never;
const get = (qs: string) => new Request(`http://x/api/admin/landing/batch${qs}`) as never;
const GENERIC = { error: "Something went wrong. Please try again." };

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  gate.mode = "ok";
  for (const f of Object.values(m)) f.mockReset();
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

describe("admin gate", () => {
  it("anonymous (401) and non-admin (403) never reach the data layer", async () => {
    for (const mode of ["401", "403"] as const) {
      gate.mode = mode;
      const status = Number(mode);
      expect((await batchPost(post({ pageId: PAGE, moduleId: null }))).status).toBe(status);
      expect((await linksPost(post({ pageId: PAGE, audience: "live" }))).status).toBe(status);
      expect((await batchGet(get(`?pageId=${PAGE}`))).status).toBe(status);
    }
    for (const f of Object.values(m)) expect(f).not.toHaveBeenCalled();
  });
});

describe("maxDuration", () => {
  it("is 60 on both POSTs", () => {
    expect(batchMax).toBe(60);
    expect(linksMax).toBe(60);
  });
});

describe("POST /api/admin/landing/batch", () => {
  it("passes adminId and returns the result object", async () => {
    const result = { modulesFinished: 1, opened: 2, emailed: 2, alreadyOpen: 0, waitingForAccount: 0, failed: 0 };
    m.finishBatch.mockResolvedValue(result);
    const res = await batchPost(post({ pageId: PAGE, moduleId: MOD }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(m.finishBatch).toHaveBeenCalledWith({ pageId: PAGE, moduleId: MOD, adminId: "admin-1" });
  });
  it("accepts moduleId null (whole course)", async () => {
    m.finishBatch.mockResolvedValue({});
    expect((await batchPost(post({ pageId: PAGE, moduleId: null }))).status).toBe(200);
    expect(m.finishBatch).toHaveBeenCalledWith({ pageId: PAGE, moduleId: null, adminId: "admin-1" });
  });
  it("400 for bad uuids, missing fields, bad json", async () => {
    for (const body of [{ pageId: "nope", moduleId: null }, { pageId: PAGE, moduleId: "nope" }, { pageId: PAGE }, { moduleId: null }, "not json"]) {
      const res = await batchPost(post(body));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid input" });
    }
    expect(m.finishBatch).not.toHaveBeenCalled();
  });
  it("500 with plain words when the data layer throws, and logs no internals", async () => {
    m.finishBatch.mockRejectedValue(new Error("secret db detail ayesha@example.com"));
    const res = await batchPost(post({ pageId: PAGE, moduleId: null }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual(GENERIC);
    expect(errSpy).toHaveBeenCalled();
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain("ayesha");
  });
});

describe("POST /api/admin/landing/portal-links", () => {
  it("passes adminId and returns the result for each audience", async () => {
    const result = { sent: 3, notOpenYet: 1, waitingForAccount: 0, failed: 0 };
    m.emailPortalLinks.mockResolvedValue(result);
    for (const audience of ["live", "recorded", "both"]) {
      const res = await linksPost(post({ pageId: PAGE, audience }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(result);
      expect(m.emailPortalLinks).toHaveBeenLastCalledWith({ pageId: PAGE, audience, adminId: "admin-1" });
    }
  });
  it("400 for a bad audience, bad uuid, missing field", async () => {
    for (const body of [{ pageId: PAGE, audience: "everyone" }, { pageId: "x", audience: "live" }, { pageId: PAGE }, "not json"]) {
      const res = await linksPost(post(body));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid input" });
    }
    expect(m.emailPortalLinks).not.toHaveBeenCalled();
  });
  it("500 with plain words when the data layer throws", async () => {
    m.emailPortalLinks.mockRejectedValue(new Error("boom"));
    const res = await linksPost(post({ pageId: PAGE, audience: "both" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual(GENERIC);
    expect(errSpy).toHaveBeenCalled();
  });
});

describe("GET /api/admin/landing/batch", () => {
  it("returns the overview, including the no-course shape", async () => {
    const overview = { courseTitle: null, modules: [], recordedPaid: 0 };
    m.getBatchOverview.mockResolvedValue(overview);
    const res = await batchGet(get(`?pageId=${PAGE}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(overview);
    expect(m.getBatchOverview).toHaveBeenCalledWith(PAGE);
  });
  it("400 for a missing or bad pageId", async () => {
    for (const qs of ["", "?pageId=nope"]) {
      const res = await batchGet(get(qs));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid input" });
    }
    expect(m.getBatchOverview).not.toHaveBeenCalled();
  });
  it("500 with plain words when the data layer throws", async () => {
    m.getBatchOverview.mockRejectedValue(new Error("boom"));
    const res = await batchGet(get(`?pageId=${PAGE}`));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual(GENERIC);
  });
});
