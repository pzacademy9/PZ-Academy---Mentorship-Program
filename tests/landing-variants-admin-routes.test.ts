// @vitest-environment node
// tests/landing-variants-admin-routes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyContent } from "@/lib/landing/content";
import { buildVariantGrid } from "@/lib/landing/variant-grid";
import type { LandingVariant } from "@/lib/data/landing-variants";

vi.mock("server-only", () => ({}));

const gate = vi.hoisted(() => ({ ok: true, status: 403 }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (gate.ok
    ? { ok: true, user: { id: "admin-1" } }
    : { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: gate.status }) }),
}));
const m = vi.hoisted(() => ({
  getLandingPage: vi.fn(), listVariants: vi.fn(), ensureVariant: vi.fn(), getVariant: vi.fn(),
  saveVariantDraft: vi.fn(), setVariantEnabled: vi.fn(), deleteVariant: vi.fn(), publishVariant: vi.fn(), rollbackVariant: vi.fn(), listVariantVersions: vi.fn(),
}));
vi.mock("@/lib/data/landing-pages", () => ({ getLandingPage: m.getLandingPage }));
vi.mock("@/lib/data/landing-variants", () => ({
  listVariants: m.listVariants, ensureVariant: m.ensureVariant, getVariant: m.getVariant,
  saveVariantDraft: m.saveVariantDraft, setVariantEnabled: m.setVariantEnabled, deleteVariant: m.deleteVariant,
  publishVariant: m.publishVariant, rollbackVariant: m.rollbackVariant, listVariantVersions: m.listVariantVersions,
}));

import { GET as list, POST as create } from "@/app/api/admin/landing-pages/[id]/variants/route";
import { PATCH as patch, DELETE as del } from "@/app/api/admin/landing-pages/[id]/variants/[variantId]/route";
import { POST as publish } from "@/app/api/admin/landing-pages/[id]/variants/[variantId]/publish/route";
import { POST as rollback } from "@/app/api/admin/landing-pages/[id]/variants/[variantId]/rollback/route";
import { GET as versions } from "@/app/api/admin/landing-pages/[id]/variants/[variantId]/versions/route";

const PID = "00000000-0000-4000-8000-000000000001";
const VID = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-000000000002";
const pctx = (id = PID) => ({ params: Promise.resolve({ id }) });
const vctx = (id = PID, variantId = VID) => ({ params: Promise.resolve({ id, variantId }) });
const req = (body: unknown, method = "POST") =>
  new Request("http://x", { method, ...(method === "GET" || method === "DELETE" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) }) as never;

const variant = (over: Partial<LandingVariant> = {}): LandingVariant => ({
  id: VID, pageId: PID, ref: { regionKey: "UAE", moduleKey: null }, enabled: true,
  draft: { sections: {} }, published: null, revision: 1, publishedAt: null, ...over,
});

function draftWith(regions: string[], modules: string[]) {
  const c = emptyContent("course");
  c.registration.regions = regions.map((k) => ({ key: k, label: k, currency: "AED", classTime: "", timezoneLabel: "", accountKeys: [] }));
  c.modules = modules.map((k, i) => ({ key: k, title: `Module ${i + 1}`, format: "3-Day Workshop", days: 3, optionKey: "" }));
  return c;
}

beforeEach(() => {
  gate.ok = true; gate.status = 403;
  for (const f of Object.values(m)) f.mockReset();
  m.getVariant.mockResolvedValue(variant());
});

describe("buildVariantGrid", () => {
  it("2 regions x 4 modules = 2 + 4 + 8 = 14 rows", () => {
    const g = buildVariantGrid(draftWith(["UAE", "KSA"], ["m1", "m2", "m3", "m4"]), []);
    expect(g).toHaveLength(14);
    expect(g.every((r) => r.variantId === null && !r.enabled && !r.published)).toBe(true);
  });
  it("labels and paths", () => {
    const g = buildVariantGrid(draftWith(["UAE"], ["module-2"]), []);
    expect(g.map((r) => [r.label, r.path])).toEqual([
      ["UAE", "uae"], ["Module 1", "module-2"], ["UAE · Module 1", "uae/module-2"],
    ]);
  });
  it("joins existing variants", () => {
    const v = variant({ ref: { regionKey: "UAE", moduleKey: "m1" }, enabled: true, published: { sections: {} } });
    const g = buildVariantGrid(draftWith(["UAE"], ["m1"]), [v]);
    expect(g.find((r) => r.path === "uae/m1")).toMatchObject({ variantId: VID, enabled: true, published: true });
    expect(g.find((r) => r.path === "uae")).toMatchObject({ variantId: null });
  });
  it("is empty without regions and modules", () => {
    expect(buildVariantGrid(draftWith([], []), [])).toEqual([]);
  });
});

describe("admin gate", () => {
  it("every handler answers 401/403 and touches no data", async () => {
    for (const status of [401, 403]) {
      gate.ok = false; gate.status = status;
      const calls = [
        () => list(req(null, "GET"), pctx()),
        () => create(req({ regionKey: "UAE", moduleKey: null, enabled: true }), pctx()),
        () => patch(req({}, "PATCH"), vctx()),
        () => del(req(null, "DELETE"), vctx()),
        () => publish(req(null), vctx()),
        () => rollback(req({ version: 1 }), vctx()),
        () => versions(req(null, "GET"), vctx()),
      ];
      for (const call of calls) expect((await call()).status).toBe(status);
    }
    for (const f of Object.values(m)) expect(f).not.toHaveBeenCalled();
  });
});

describe("GET /variants", () => {
  it("returns variants and the grid built from the draft", async () => {
    m.getLandingPage.mockResolvedValue({ draft: draftWith(["UAE", "KSA"], ["m1", "m2", "m3", "m4"]) });
    m.listVariants.mockResolvedValue([variant()]);
    const res = await list(req(null, "GET"), pctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.variants).toHaveLength(1);
    expect(body.grid).toHaveLength(14);
    expect(body.grid.find((r: { path: string }) => r.path === "uae").variantId).toBe(VID);
  });
  it("404 for a bad id or missing page", async () => {
    expect((await list(req(null, "GET"), pctx("nope"))).status).toBe(404);
    m.getLandingPage.mockResolvedValue(null);
    expect((await list(req(null, "GET"), pctx())).status).toBe(404);
  });
});

describe("POST /variants", () => {
  it("creates via ensureVariant", async () => {
    m.ensureVariant.mockResolvedValue({ ok: true, variant: variant() });
    const res = await create(req({ regionKey: "UAE", moduleKey: null, enabled: false }), pctx());
    expect(res.status).toBe(200);
    expect(m.ensureVariant).toHaveBeenCalledWith(PID, { regionKey: "UAE", moduleKey: null }, false);
  });
  it("400 for a bad body and for bad-ref", async () => {
    expect((await create(req({ regionKey: "UAE" }), pctx())).status).toBe(400);
    expect((await create(req({ regionKey: "UAE", moduleKey: null, enabled: true, extra: 1 }), pctx())).status).toBe(400);
    m.ensureVariant.mockResolvedValue({ ok: false, reason: "bad-ref" });
    expect((await create(req({ regionKey: "ZZ", moduleKey: null, enabled: true }), pctx())).status).toBe(400);
  });
});

describe("PATCH /variants/[variantId]", () => {
  const good = { overrides: { sections: { s1: { hidden: true, fields: { headline: "Hi" } } }, order: ["s1"], seo: { title: "T" } }, baseRevision: 3 };

  it("saves and returns the revision", async () => {
    m.saveVariantDraft.mockResolvedValue({ ok: true, revision: 4 });
    const res = await patch(req(good, "PATCH"), vctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revision: 4 });
    expect(m.saveVariantDraft).toHaveBeenCalledWith(VID, good.overrides, 3);
  });
  it("409 on revision conflict", async () => {
    m.saveVariantDraft.mockResolvedValue({ ok: false, reason: "conflict" });
    const res = await patch(req(good, "PATCH"), vctx());
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("conflict");
  });
  it("400 for malformed overrides", async () => {
    const bad: unknown[] = [
      { overrides: { sections: { s1: { fields: "nope" } } }, baseRevision: 1 },
      { overrides: { sections: { s1: { fields: ["a"] } } }, baseRevision: 1 },
      { overrides: { sections: { s1: { hidden: "yes" } } }, baseRevision: 1 },
      { overrides: { sections: { s1: { extra: 1 } } }, baseRevision: 1 },
      { overrides: { sections: { ["k".repeat(65)]: {} } }, baseRevision: 1 },
      { overrides: { sections: { s1: { fields: { ["k".repeat(65)]: 1 } } } }, baseRevision: 1 },
      { overrides: { sections: {}, order: Array.from({ length: 41 }, () => "a") }, baseRevision: 1 },
      { overrides: { sections: {}, order: [1] }, baseRevision: 1 },
      { overrides: { sections: {}, seo: { bogus: "x" } }, baseRevision: 1 },
      { overrides: { sections: {}, settings: { registerLabel: "x".repeat(41) } }, baseRevision: 1 },
      { overrides: { sections: {}, settings: { registerUrl: "javascript:alert(1)" } }, baseRevision: 1 },
      { overrides: { sections: {}, unknown: 1 }, baseRevision: 1 },
      { overrides: { sections: {} }, baseRevision: 0 },
      { overrides: { sections: {} } },
      "not json",
    ];
    for (const b of bad) expect((await patch(req(b, "PATCH"), vctx())).status).toBe(400);
    expect(m.saveVariantDraft).not.toHaveBeenCalled();
  });
  it("never carries a __proto__ field key through to the data layer", async () => {
    m.saveVariantDraft.mockResolvedValue({ ok: true, revision: 2 });
    const raw = '{"overrides":{"sections":{"s1":{"fields":{"__proto__":{"x":1},"a":1}}}},"baseRevision":1}';
    expect((await patch(req(raw, "PATCH"), vctx())).status).toBe(200);
    const saved = m.saveVariantDraft.mock.calls[0][1].sections.s1.fields;
    expect(Object.keys(saved)).toEqual(["a"]);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
  it("413 over the 100 KB cap", async () => {
    const big = { overrides: { sections: { s1: { fields: { a: "x".repeat(100_001) } } } }, baseRevision: 1 };
    expect((await patch(req(big, "PATCH"), vctx())).status).toBe(413);
    expect(m.saveVariantDraft).not.toHaveBeenCalled();
  });
  it("toggles enabled", async () => {
    m.setVariantEnabled.mockResolvedValue({ ok: true });
    expect((await patch(req({ enabled: false }, "PATCH"), vctx())).status).toBe(200);
    expect(m.setVariantEnabled).toHaveBeenCalledWith(VID, false);
  });
});

describe("DELETE / publish / rollback", () => {
  it("delete ok", async () => {
    m.deleteVariant.mockResolvedValue({ ok: true });
    expect((await del(req(null, "DELETE"), vctx())).status).toBe(200);
    expect(m.deleteVariant).toHaveBeenCalledWith(VID);
  });
  it("publish not-ready returns 422 with problems", async () => {
    m.publishVariant.mockResolvedValue({ ok: false, reason: "not-ready", problems: [{ message: "Nothing is priced" }] });
    const res = await publish(req(null), vctx());
    expect(res.status).toBe(422);
    expect((await res.json()).problems).toEqual([{ message: "Nothing is priced" }]);
  });
  it("publish ok / conflict / main-not-published", async () => {
    m.publishVariant.mockResolvedValueOnce({ ok: true, version: 2 });
    expect(await (await publish(req(null), vctx())).json()).toEqual({ ok: true, version: 2 });
    m.publishVariant.mockResolvedValueOnce({ ok: false, reason: "conflict" });
    expect((await publish(req(null), vctx())).status).toBe(409);
    m.publishVariant.mockResolvedValueOnce({ ok: false, reason: "main-not-published" });
    expect((await publish(req(null), vctx())).status).toBe(409);
  });
  it("rollback validates and maps results", async () => {
    expect((await rollback(req({ version: 0 }), vctx())).status).toBe(400);
    m.rollbackVariant.mockResolvedValueOnce({ ok: true, version: 5 });
    expect(await (await rollback(req({ version: 2 }), vctx())).json()).toEqual({ ok: true, version: 5 });
    expect(m.rollbackVariant).toHaveBeenCalledWith("admin-1", VID, 2);
    m.rollbackVariant.mockResolvedValueOnce({ ok: false, reason: "not-found" });
    expect((await rollback(req({ version: 9 }), vctx())).status).toBe(404);
  });
});

describe("GET /variants/[variantId]/versions", () => {
  it("lists the link's published versions", async () => {
    m.listVariantVersions.mockResolvedValue([{ version: 2, createdAt: "2026-10-05T10:00:00Z" }]);
    const res = await versions(req(null, "GET"), vctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ versions: [{ version: 2, createdAt: "2026-10-05T10:00:00Z" }] });
    expect(m.listVariantVersions).toHaveBeenCalledWith(VID);
  });
  it("500 when the versions cannot be read", async () => {
    m.listVariantVersions.mockRejectedValue(new Error("db"));
    expect((await versions(req(null, "GET"), vctx())).status).toBe(500);
  });
});

describe("IDOR guard: variant must belong to the page in the URL", () => {
  it("404 and no mutation when the variant belongs to another page", async () => {
    m.getVariant.mockResolvedValue(variant({ pageId: OTHER }));
    const calls = [
      () => patch(req({ overrides: { sections: {} }, baseRevision: 1 }, "PATCH"), vctx()),
      () => patch(req({ enabled: true }, "PATCH"), vctx()),
      () => del(req(null, "DELETE"), vctx()),
      () => publish(req(null), vctx()),
      () => rollback(req({ version: 1 }), vctx()),
      () => versions(req(null, "GET"), vctx()),
    ];
    for (const call of calls) {
      const res = await call();
      expect(res.status).toBe(404);
      expect(JSON.stringify(await res.json())).not.toContain(OTHER);
    }
    for (const k of ["saveVariantDraft", "setVariantEnabled", "deleteVariant", "publishVariant", "rollbackVariant", "listVariantVersions"] as const) {
      expect(m[k]).not.toHaveBeenCalled();
    }
  });
  it("404 for a missing variant or a non-uuid variant id (no query)", async () => {
    m.getVariant.mockResolvedValue(null);
    expect((await del(req(null, "DELETE"), vctx())).status).toBe(404);
    m.getVariant.mockClear();
    expect((await del(req(null, "DELETE"), vctx(PID, "nope"))).status).toBe(404);
    expect(m.getVariant).not.toHaveBeenCalled();
  });
  it("500 on a read error", async () => {
    m.getVariant.mockRejectedValue(new Error("db"));
    expect((await del(req(null, "DELETE"), vctx())).status).toBe(500);
  });
});
