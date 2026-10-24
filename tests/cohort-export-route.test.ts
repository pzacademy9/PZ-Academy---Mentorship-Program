import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const gate = vi.hoisted(() => ({ mode: "ok" as "ok" | "401" | "403" }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () =>
    gate.mode === "ok"
      ? { ok: true, user: { id: "admin-1" } }
      : { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: gate.mode === "401" ? 401 : 403 }) },
}));
const m = vi.hoisted(() => ({ loadCohortAudience: vi.fn() }));
vi.mock("@/lib/data/cohort-export", () => m);

import { GET } from "@/app/api/admin/crm/cohorts/export/route";

const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";
const get = (qs: string) => new Request(`http://x/api/admin/crm/cohorts/export${qs}`) as never;

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  gate.mode = "ok";
  m.loadCohortAudience.mockReset();
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

describe("cohort export route", () => {
  it("401/403 never reach the loader", async () => {
    for (const mode of ["401", "403"] as const) {
      gate.mode = mode;
      expect((await GET(get(`?ids=${U1}`))).status).toBe(Number(mode));
    }
    expect(m.loadCohortAudience).not.toHaveBeenCalled();
  });
  it("400 for missing, bad, or more than 20 ids", async () => {
    const many = Array.from({ length: 21 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`).join(",");
    for (const qs of ["", "?ids=", "?ids=nope", `?ids=${U1},bad`, `?ids=${many}`]) {
      expect((await GET(get(qs))).status).toBe(400);
    }
    expect(m.loadCohortAudience).not.toHaveBeenCalled();
  });
  it("404 when no cohort exists", async () => {
    m.loadCohortAudience.mockResolvedValue({ contacts: [], names: [] });
    const res = await GET(get(`?ids=${U1}`));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
  it("returns a hashed CSV attachment", async () => {
    m.loadCohortAudience.mockResolvedValue({
      names: ["PMH Batch 1 (paid)"],
      contacts: [{ id: "a", email: "a@x.com", phoneE164: null, fullName: "Ann Lee", country: "PK",
        emailUnsubscribedAt: null, whatsappUnsubscribedAt: null, doNotContactAt: null, emailSuppressed: false }],
    });
    const res = await GET(get(`?ids=${U1},${U2}`));
    expect(res.status).toBe(200);
    expect(m.loadCohortAudience).toHaveBeenCalledWith([U1, U2]);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename=pmh-batch-1-paid-meta-audience-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = await res.text();
    expect(text.split("\n")[0]).toBe("email,phone,fn,ln,country");
    expect(text).not.toContain("a@x.com");
  });
  it("format=plain returns an unhashed CSV with the plain filename", async () => {
    m.loadCohortAudience.mockResolvedValue({
      names: ["PMH Batch 1 (paid)"],
      contacts: [{ id: "a", email: "A@x.com", phoneE164: "+923001234567", fullName: "Ann Lee", country: "pk",
        emailUnsubscribedAt: null, whatsappUnsubscribedAt: null, doNotContactAt: null, emailSuppressed: false }],
    });
    const res = await GET(get(`?ids=${U1}&format=plain`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename=pmh-batch-1-paid-plain-meta-audience-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(await res.text()).toBe("email,phone,fn,ln,country\na@x.com,+923001234567,Ann,Lee,PK\n");
  });
  it("unknown format is 400 and never reaches the loader", async () => {
    for (const f of ["csv", "", "PLAIN", "hashed"]) {
      expect((await GET(get(`?ids=${U1}&format=${f}`))).status).toBe(400);
    }
    expect(m.loadCohortAudience).not.toHaveBeenCalled();
  });
  it("format=plain is still gated", async () => {
    for (const mode of ["401", "403"] as const) {
      gate.mode = mode;
      expect((await GET(get(`?ids=${U1}&format=plain`))).status).toBe(Number(mode));
    }
    expect(m.loadCohortAudience).not.toHaveBeenCalled();
  });
  it("format=plain 404s when no cohort exists", async () => {
    m.loadCohortAudience.mockResolvedValue({ contacts: [], names: [] });
    expect((await GET(get(`?ids=${U1}&format=plain`))).status).toBe(404);
  });
  it("500 is generic and logs no personal data", async () => {
    m.loadCohortAudience.mockRejectedValue(new Error("boom a@x.com"));
    const res = await GET(get(`?ids=${U1}`));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Something went wrong. Please try again." });
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain("a@x.com");
  });
});
