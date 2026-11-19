import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const gate = vi.hoisted(() => ({ mode: "ok" as "ok" | "401" | "403", calls: [] as unknown[] }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async (area: unknown) => {
    gate.calls.push(area);
    return gate.mode === "ok"
      ? { ok: true, user: { id: "admin-1" } }
      : { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: gate.mode === "401" ? 401 : 403 }) };
  },
}));
const m = vi.hoisted(() => ({ listChoiceGroups: vi.fn(), applyChoice: vi.fn() }));
vi.mock("@/lib/data/portal-choices", () => m);

import { GET, POST } from "@/app/api/admin/landing/portal/choices/route";
import { PortalError } from "@/lib/data/portal-errors";

const PAGE = "00000000-0000-4000-8000-000000000001";
const post = (body: unknown) => new Request("http://x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }) as never;
const get = (qs: string) => new Request(`http://x/api${qs}`) as never;
const GENERIC = { error: "Something went wrong. Please try again." };

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  gate.mode = "ok";
  gate.calls = [];
  for (const f of Object.values(m)) f.mockReset();
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

describe("choices routes", () => {
  it("each method returns 401/403 for a non-admin and calls requireAdmin with \"enrollments\"", async () => {
    for (const mode of ["401", "403"] as const) {
      gate.mode = mode;
      gate.calls = [];
      expect((await GET(get(`?pageId=${PAGE}`))).status).toBe(Number(mode));
      expect((await POST(post({}))).status).toBe(Number(mode));
      expect(gate.calls).toEqual(["enrollments", "enrollments"]);
    }
    expect(m.listChoiceGroups).not.toHaveBeenCalled();
    expect(m.applyChoice).not.toHaveBeenCalled();
  });

  it("GET returns the overview", async () => {
    const overview = { hasOptions: true, options: [], groups: [] };
    m.listChoiceGroups.mockResolvedValue(overview);
    const res = await GET(get(`?pageId=${PAGE}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(overview);
    expect(m.listChoiceGroups).toHaveBeenCalledWith(PAGE);
  });

  it("GET returns 400 without a uuid pageId", async () => {
    expect((await GET(get(""))).status).toBe(400);
    const res = await GET(get("?pageId=nope"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
    expect(m.listChoiceGroups).not.toHaveBeenCalled();
  });

  it("POST passes the exact label (untrimmed) and cleaned keys and returns the counts", async () => {
    m.applyChoice.mockResolvedValue({ updated: 2, queued: 1 });
    const res = await POST(post({ pageId: PAGE, label: "  Live - Full Course  ", optionKeys: [" full "] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 2, queued: 1 });
    expect(m.applyChoice).toHaveBeenCalledWith({ pageId: PAGE, label: "  Live - Full Course  ", optionKeys: ["full"] });
  });

  it("POST returns 400 for a missing label or empty optionKeys", async () => {
    expect((await POST(post({ pageId: PAGE, optionKeys: ["full"] }))).status).toBe(400);
    expect((await POST(post({ pageId: PAGE, label: "  ", optionKeys: ["full"] }))).status).toBe(400);
    expect((await POST(post({ pageId: PAGE, label: "X", optionKeys: [] }))).status).toBe(400);
    expect((await POST(post("not json"))).status).toBe(400);
    expect(m.applyChoice).not.toHaveBeenCalled();
  });

  it("POST maps a PortalError to its status and calm message", async () => {
    m.applyChoice.mockRejectedValue(new PortalError("One of those choices is not an option on this page.", 409));
    const res = await POST(post({ pageId: PAGE, label: "X", optionKeys: ["nope"] }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "One of those choices is not an option on this page." });
  });

  it("POST returns 500 with the plain message on a thrown error", async () => {
    m.applyChoice.mockRejectedValue(new Error("secret db detail"));
    const res = await POST(post({ pageId: PAGE, label: "X", optionKeys: ["full"] }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual(GENERIC);
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(errSpy.mock.calls)).toContain("secret db detail");
  });
});
