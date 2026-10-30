import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
const gate = vi.hoisted(() => ({ mode: "ok" as "ok" | "401" | "403" }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () =>
    gate.mode === "ok"
      ? { ok: true, user: { id: "admin-1" } }
      : { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: gate.mode === "401" ? 401 : 403 }) },
}));
const mirror = vi.hoisted(() => ({ runMirror: vi.fn(), runMirrorForAllPages: vi.fn() }));
vi.mock("@/lib/data/landing-mirror", async (orig) => ({
  ...(await orig<typeof import("@/lib/data/landing-mirror")>()),
  runMirror: mirror.runMirror,
  runMirrorForAllPages: mirror.runMirrorForAllPages,
}));

import { GET as cronGet } from "@/app/api/cron/sheet-mirror/route";
import { POST as syncPost } from "@/app/api/admin/landing-mirror/sync/route";
import { MIRROR_NO_SHEET, MIRROR_PAGE_NOT_FOUND } from "@/lib/data/landing-mirror";

const PAGE = "00000000-0000-4000-8000-000000000001";
const SECRET = "test-secret-value";
const cron = (auth?: string) => new Request("http://x/api/cron/sheet-mirror", { headers: auth ? { authorization: auth } : {} }) as never;
const post = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) }) as never;
const okResult = { ok: true, preview: false, inserted: 2, changed: 1, linked: 0, skipped: 3, problems: [{ rowNumber: 4, reason: "Bad row" }], notes: [], ranAt: "2026-10-30T00:00:00.000Z" };
const fail = (error: string) => ({ ...okResult, ok: false, inserted: 0, changed: 0, problems: [], error });

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.CRON_SECRET;
  process.env.CRON_SECRET = SECRET;
  gate.mode = "ok";
  mirror.runMirror.mockReset();
  mirror.runMirrorForAllPages.mockReset();
});
afterEach(() => {
  if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved;
});

describe("cron /api/cron/sheet-mirror", () => {
  it("401 with no header or the wrong secret, without running", async () => {
    expect((await cronGet(cron())).status).toBe(401);
    expect((await cronGet(cron("Bearer nope"))).status).toBe(401);
    expect(mirror.runMirrorForAllPages).not.toHaveBeenCalled();
  });
  it("401 (fails closed) when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    expect((await cronGet(cron("Bearer undefined"))).status).toBe(401);
    expect((await cronGet(cron("Bearer "))).status).toBe(401);
    expect(mirror.runMirrorForAllPages).not.toHaveBeenCalled();
  });
  it("200 with the right secret, problems as a count only", async () => {
    mirror.runMirrorForAllPages.mockResolvedValue([{ pageId: "p1", result: okResult }, { pageId: "p2", result: fail("Could not read the sheet") }]);
    const res = await cronGet(cron(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      pages: 2,
      results: [
        { pageId: "p1", ok: true, inserted: 2, changed: 1, problems: 1 },
        { pageId: "p2", ok: false, inserted: 0, changed: 0, problems: 0 },
      ],
    });
  });
  it("500 with a generic message when listing fails", async () => {
    mirror.runMirrorForAllPages.mockRejectedValue(new Error("Could not list pages"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await cronGet(cron(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("list pages");
    errSpy.mockRestore();
  });
});

describe("admin POST /api/admin/landing-mirror/sync", () => {
  it("401 / 403 for a non-admin without running", async () => {
    gate.mode = "401";
    expect((await syncPost(post({ pageId: PAGE }))).status).toBe(401);
    gate.mode = "403";
    expect((await syncPost(post({ pageId: PAGE }))).status).toBe(403);
    expect(mirror.runMirror).not.toHaveBeenCalled();
  });
  it("400 for a bad body", async () => {
    expect((await syncPost(post({ pageId: "nope" }))).status).toBe(400);
    expect((await syncPost(post({}))).status).toBe(400);
    expect((await syncPost(post({ pageId: PAGE, preview: "yes" }))).status).toBe(400);
    expect(mirror.runMirror).not.toHaveBeenCalled();
  });
  it("returns the full result, passing preview through", async () => {
    mirror.runMirror.mockResolvedValue({ ...okResult, preview: true });
    const res = await syncPost(post({ pageId: PAGE, preview: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...okResult, preview: true });
    expect(mirror.runMirror).toHaveBeenCalledWith(PAGE, { preview: true });
  });
  it("defaults preview to false", async () => {
    mirror.runMirror.mockResolvedValue(okResult);
    await syncPost(post({ pageId: PAGE }));
    expect(mirror.runMirror).toHaveBeenCalledWith(PAGE, { preview: false });
  });
  it("404 when the page is missing or has no sheet", async () => {
    mirror.runMirror.mockResolvedValue(fail(MIRROR_PAGE_NOT_FOUND));
    expect((await syncPost(post({ pageId: PAGE }))).status).toBe(404);
    mirror.runMirror.mockResolvedValue(fail(MIRROR_NO_SHEET));
    expect((await syncPost(post({ pageId: PAGE }))).status).toBe(404);
  });
  it("returns other failed results as 200 with ok:false", async () => {
    mirror.runMirror.mockResolvedValue(fail("Already running"));
    const res = await syncPost(post({ pageId: PAGE }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: false, error: "Already running" });
  });
  it("500 generic when runMirror throws", async () => {
    mirror.runMirror.mockRejectedValue(new Error("secret detail"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await syncPost(post({ pageId: PAGE }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret detail");
    errSpy.mockRestore();
  });
});
