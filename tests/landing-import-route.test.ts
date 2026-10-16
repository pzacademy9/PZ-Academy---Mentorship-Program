// @vitest-environment node
// tests/landing-import-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const gate = vi.hoisted(() => ({ ok: true, status: 403 }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (gate.ok
    ? { ok: true, user: { id: "admin-1" } }
    : { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: gate.status }) }),
}));
const m = vi.hoisted(() => ({ importLandingPage: vi.fn() }));
vi.mock("@/lib/data/landing-import", () => ({ importLandingPage: m.importLandingPage }));

import { POST } from "@/app/api/admin/landing-pages/import/route";

const req = (body: unknown) =>
  new Request("http://x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }) as never;

beforeEach(() => {
  gate.ok = true; gate.status = 403;
  m.importLandingPage.mockReset();
});

describe("POST /api/admin/landing-pages/import", () => {
  it("blocks non-admin and never imports", async () => {
    gate.ok = false;
    const res = await POST(req({ markdown: "x" }));
    expect(res.status).toBe(403);
    expect(m.importLandingPage).not.toHaveBeenCalled();
  });

  it.each([
    ["not json", "{nope"],
    ["missing field", {}],
    ["empty string", { markdown: "" }],
    ["wrong type", { markdown: 5 }],
    ["too long", { markdown: "a".repeat(400_001) }],
  ])("returns 400 for invalid body: %s", async (_n, body) => {
    const res = await POST(req(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ errors: ["Choose a file or paste the text first."] });
    expect(m.importLandingPage).not.toHaveBeenCalled();
  });

  it("returns 400 with errors for blocking problems", async () => {
    m.importLandingPage.mockResolvedValue({ ok: false, errors: ["The title is missing."] });
    const res = await POST(req({ markdown: "abc" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ errors: ["The title is missing."] });
    expect(m.importLandingPage).toHaveBeenCalledWith("admin-1", "abc");
  });

  it("returns 201 with the success shape", async () => {
    const ok = { pageId: "p1", slug: "s-2", slugChanged: true, warnings: ["w"], linksCreated: 3, linksFailed: ["uae"] };
    m.importLandingPage.mockResolvedValue({ ok: true, ...ok });
    const res = await POST(req({ markdown: "abc" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(ok);
  });

  it("returns a safe 500 on unexpected throw without leaking error text", async () => {
    m.importLandingPage.mockRejectedValue(new Error("secret db password at stack/line"));
    const res = await POST(req({ markdown: "abc" }));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ errors: ["Something went wrong while importing. Nothing was lost; please try again."] });
    expect(text).not.toMatch(/secret|stack|Error/);
  });
});
