import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const gate = vi.hoisted(() => ({ mode: "ok" as "ok" | "401" | "403" }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () =>
    gate.mode === "ok"
      ? { ok: true, user: { id: "admin-1" } }
      : { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: gate.mode === "401" ? 401 : 403 }) },
}));

const q = vi.hoisted(() => ({ loadAudienceFile: vi.fn() }));
vi.mock("@/lib/data/audience-query", () => q);

import { DEFAULT_AUDIENCE_FILTER } from "@/lib/crm/audience-filter";
import { POST } from "@/app/api/admin/crm/audiences/preview/route";

const post = (body: unknown) =>
  new Request("http://x/api/admin/crm/audiences/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as never;

const mk = (i: number) => ({
  id: `id${i}`, email: `person${i}@example.com`, phoneE164: "+923001234567", fullName: `Ann Lee${i}`, country: "PK",
  emailUnsubscribedAt: null, whatsappUnsubscribedAt: null, doNotContactAt: null, emailSuppressed: false,
});
const F = { ...DEFAULT_AUDIENCE_FILTER, statuses: ["paid" as const] };

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  gate.mode = "ok";
  q.loadAudienceFile.mockReset();
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

describe("preview route", () => {
  it("401/403 never reach the engine", async () => {
    for (const mode of ["401", "403"] as const) {
      gate.mode = mode;
      expect((await POST(post(F))).status).toBe(Number(mode));
    }
    expect(q.loadAudienceFile).not.toHaveBeenCalled();
  });
  it("400 on a bad filter or bad json", async () => {
    for (const body of [{ ...F, statuses: ["nobody"] }, "not json"]) {
      const res = await POST(post(body));
      expect(res.status).toBe(400);
      expect(typeof (await res.json()).error).toBe("string");
    }
    expect(q.loadAudienceFile).not.toHaveBeenCalled();
  });
  it("200 with at most 10 people and masked emails", async () => {
    q.loadAudienceFile.mockResolvedValue({
      contacts: Array.from({ length: 15 }, (_, i) => mk(i)), tooLarge: false, needsUpdate: false,
    });
    const res = await POST(post(F));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.people).toHaveLength(10);
    expect(body.inFile).toBe(15);
    expect(body.people[0].email).toBe("p***@example.com");
    expect(JSON.stringify(body)).not.toContain("person0@");
  });
  it("413 when too large", async () => {
    q.loadAudienceFile.mockResolvedValue({ contacts: [], tooLarge: true, needsUpdate: false });
    const res = await POST(post(F));
    expect(res.status).toBe(413);
    expect(typeof (await res.json()).error).toBe("string");
  });
  it("409 when the update is missing", async () => {
    q.loadAudienceFile.mockResolvedValue({ contacts: [], tooLarge: false, needsUpdate: true });
    expect((await POST(post(F))).status).toBe(409);
  });
  it("400 when every chosen course is gone, never wider", async () => {
    q.loadAudienceFile.mockResolvedValue({
      contacts: [mk(1)], tooLarge: false, needsUpdate: false, ignoredChoices: ["Gone"], allCoursesGone: true,
    });
    const res = await POST(post({ ...F, courses: ["Gone"] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "The courses chosen for this audience no longer exist. Choose the courses again.",
    });
  });
  it("500 is generic and leaks no email", async () => {
    q.loadAudienceFile.mockRejectedValue(new Error("boom person1@example.com"));
    const res = await POST(post(F));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain("Something went wrong. Please try again.");
    expect(text).not.toContain("@");
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain("example.com");
  });
});
