// tests/landing-media-routes.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.GAS_SHEETS_SYNC_URL = "http://gas.test/exec";
  process.env.GAS_SHARED_SECRET = "s3cret";
});

const gate = vi.hoisted(() => ({ ok: true }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (gate.ok
    ? { ok: true, user: { id: "admin-1" } }
    : { ok: false, response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) }),
}));
vi.mock("@/lib/auth/require-mentor", () => ({
  requireMentor: async () => ({ ok: true, user: { id: "mentor-1" } }),
}));
const m = vi.hoisted(() => ({ listMedia: vi.fn(), addMedia: vi.fn(), updateMedia: vi.fn(), deleteMedia: vi.fn() }));
vi.mock("@/lib/data/landing-media", () => m);

import { GET, POST } from "@/app/api/admin/landing-media/route";
import { PATCH, DELETE } from "@/app/api/admin/landing-media/[id]/route";
import { POST as UPLOAD } from "@/app/api/admin/uploads/image/route";

const ID = "00000000-0000-4000-8000-000000000001";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const req = (body: unknown, method = "POST") =>
  new Request("http://x", { method, body: typeof body === "string" ? body : JSON.stringify(body) }) as never;
const getReq = (qs = "") => new Request(`http://x/api/admin/landing-media${qs}`) as never;
const URL_OK = "https://drive.google.com/thumbnail?id=abc123&sz=w1600";

beforeEach(() => {
  gate.ok = true;
  for (const f of Object.values(m)) f.mockReset();
});

describe("admin gate", () => {
  it("every handler answers the gate's 403 and touches no data", async () => {
    gate.ok = false;
    const calls = [
      () => GET(getReq()),
      () => POST(req({ url: URL_OK, name: "A" })),
      () => PATCH(req({ name: "B" }, "PATCH"), ctx()),
      () => DELETE(req({}, "DELETE"), ctx()),
    ];
    for (const call of calls) expect((await call()).status).toBe(403);
    for (const f of Object.values(m)) expect(f).not.toHaveBeenCalled();
  });
});

describe("GET", () => {
  it("passes q and a valid folder", async () => {
    m.listMedia.mockResolvedValue([{ id: ID }]);
    const res = await GET(getReq("?q=hero&folder=heroes"));
    expect(await res.json()).toEqual({ items: [{ id: ID }] });
    expect(m.listMedia).toHaveBeenCalledWith({ q: "hero", folder: "heroes" });
  });
  it("ignores an unknown folder", async () => {
    m.listMedia.mockResolvedValue([]);
    await GET(getReq("?folder=nope"));
    expect(m.listMedia).toHaveBeenCalledWith({ q: undefined, folder: undefined });
  });
  it("500 when the read fails", async () => {
    m.listMedia.mockRejectedValue(new Error("down"));
    const res = await GET(getReq());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Could not load the pictures");
  });
});

describe("POST", () => {
  it("201 with item and existing", async () => {
    m.addMedia.mockResolvedValue({ ok: true, item: { id: ID }, existing: false });
    const res = await POST(req({ url: URL_OK, name: "Hero", folder: "heroes", width: 10, height: 5, sizeBytes: 99 }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ item: { id: ID }, existing: false });
    expect(m.addMedia).toHaveBeenCalledWith(
      { url: URL_OK, name: "Hero", folder: "heroes", width: 10, height: 5, sizeBytes: 99 },
      "admin-1",
    );
  });
  it("400 for a missing url, bad name or bad JSON, nothing written", async () => {
    for (const body of [{ name: "A" }, { url: URL_OK }, { url: 5, name: "A" }, "not json"]) {
      expect((await POST(req(body))).status).toBe(400);
    }
    expect(m.addMedia).not.toHaveBeenCalled();
  });
  it("400 invalid and 500 error from the store", async () => {
    m.addMedia.mockResolvedValue({ ok: false, reason: "invalid" });
    expect((await POST(req({ url: URL_OK, name: "A" }))).status).toBe(400);
    m.addMedia.mockResolvedValue({ ok: false, reason: "error" });
    expect((await POST(req({ url: URL_OK, name: "A" }))).status).toBe(500);
  });
});

describe("PATCH /[id]", () => {
  it("404 for a non-uuid id", async () => {
    expect((await PATCH(req({ name: "A" }, "PATCH"), ctx("nope"))).status).toBe(404);
    expect(m.updateMedia).not.toHaveBeenCalled();
  });
  it("returns the item", async () => {
    m.updateMedia.mockResolvedValue({ ok: true, item: { id: ID } });
    const res = await PATCH(req({ name: "New", folder: "misc" }, "PATCH"), ctx());
    expect(await res.json()).toEqual({ item: { id: ID } });
    expect(m.updateMedia).toHaveBeenCalledWith(ID, { name: "New", folder: "misc" });
  });
  it("400, 404, 500 map from the store", async () => {
    m.updateMedia.mockResolvedValue({ ok: false, reason: "invalid" });
    expect((await PATCH(req({ name: "" }, "PATCH"), ctx())).status).toBe(400);
    m.updateMedia.mockResolvedValue({ ok: false, reason: "not-found" });
    expect((await PATCH(req({ name: "A" }, "PATCH"), ctx())).status).toBe(404);
    m.updateMedia.mockResolvedValue({ ok: false, reason: "error" });
    expect((await PATCH(req({ name: "A" }, "PATCH"), ctx())).status).toBe(500);
  });
});

describe("DELETE /[id]", () => {
  it("404 for a non-uuid id", async () => {
    expect((await DELETE(req({}, "DELETE"), ctx("nope"))).status).toBe(404);
    expect(m.deleteMedia).not.toHaveBeenCalled();
  });
  it("ok, 404, 500", async () => {
    m.deleteMedia.mockResolvedValue({ ok: true });
    const res = await DELETE(req({}, "DELETE"), ctx());
    expect(await res.json()).toEqual({ ok: true });
    m.deleteMedia.mockResolvedValue({ ok: false, reason: "not-found" });
    expect((await DELETE(req({}, "DELETE"), ctx())).status).toBe(404);
    m.deleteMedia.mockResolvedValue({ ok: false, reason: "error" });
    expect((await DELETE(req({}, "DELETE"), ctx())).status).toBe(500);
  });
  it("409 in use, with page titles in the message", async () => {
    const pages = [{ id: "p1", title: "Alpha", slug: "a" }, { id: "p2", title: "Beta", slug: "b" }];
    m.deleteMedia.mockResolvedValue({ ok: false, reason: "in-use", pages });
    const res = await DELETE(req({}, "DELETE"), ctx());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "This picture is used by: Alpha, Beta. Remove it from those pages first.",
      pages,
    });
  });
});

describe("upload route", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it("returns url and fileId from the upload service", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, url: URL_OK, fileId: "abc123" }), { status: 200 }),
    ) as never;
    const form = new FormData();
    form.set("file", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
    const res = await UPLOAD({ formData: async () => form } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: URL_OK, fileId: "abc123" });
  });
});
