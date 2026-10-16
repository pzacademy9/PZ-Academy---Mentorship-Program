import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

type Res = { data: unknown; error: unknown };
interface Op { table: string; op: "select" | "insert" | "update" | "delete"; payload?: Record<string, unknown>; filters: [string, unknown][] }
let ops: Op[] = [];
let handler: (op: Op) => Res = () => ({ data: null, error: null });

function builder(table: string) {
  const op: Op = { table, op: "select", filters: [] };
  const done = () => { ops.push(op); return Promise.resolve(handler(op)); };
  const b: Record<string, unknown> = {
    select: () => b,
    insert: (p: Record<string, unknown>) => { op.op = "insert"; op.payload = p; return b; },
    update: (p: Record<string, unknown>) => { op.op = "update"; op.payload = p; return b; },
    delete: () => { op.op = "delete"; return b; },
    eq: (k: string, v: unknown) => { op.filters.push([k, v]); return b; },
    order: () => b,
    limit: () => b,
    maybeSingle: done,
    single: done,
    then: (res: (v: Res) => unknown, rej: (e: unknown) => unknown) => done().then(res, rej),
  };
  return b;
}
let rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let rpcHandler: (fn: string, args: Record<string, unknown>) => Res = () => ({ data: null, error: null });
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: builder,
    rpc: (fn: string, args: Record<string, unknown>) => { rpcCalls.push({ fn, args }); return Promise.resolve(rpcHandler(fn, args)); },
  }),
}));

import {
  ensureVariant, saveVariantDraft, publishVariant, rollbackVariant, setVariantEnabled, deleteVariant,
  getPublishedVariantPage, listVariants,
} from "@/lib/data/landing-variants";
import { emptyContent, newSection, type LandingContent } from "@/lib/landing/content";
import { DEFAULT_REGISTRATION } from "@/lib/landing/registration/config";

function mainContent(over: Partial<LandingContent> = {}): LandingContent {
  const c = emptyContent("course");
  const hero = { ...newSection("hero", "hero1"), data: { headline: "Main headline" } };
  const pricing = { ...newSection("pricing_cards", "pr1"), data: { heading: "Plans", items: [{ name: "Std", price: "PKR 4,800" }] } };
  return {
    ...c,
    seo: { ...c.seo, description: "A description" },
    settings: { ...c.settings, registerUrl: "https://example.com/register" },
    sections: [hero, pricing],
    registration: {
      ...DEFAULT_REGISTRATION,
      enabled: false,
      regions: [
        { key: "PK", label: "Pakistan", currency: "PKR", classTime: "", timezoneLabel: "", accountKeys: [] },
        { key: "UAE", label: "UAE", currency: "AED", classTime: "", timezoneLabel: "", accountKeys: [] },
      ],
      defaultRegionKey: "PK",
    },
    modules: [{ key: "diabetes", title: "Diabetes", format: "3-Day Workshop", days: 3, optionKey: "" }],
    ...over,
  };
}

const vRow = (over: Record<string, unknown> = {}) => ({
  id: "v1", page_id: "p1", region_key: null, module_key: "diabetes", enabled: true, draft: { sections: {} },
  published: null, revision: 3, published_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...over,
});
const pRow = (over: Record<string, unknown> = {}) => ({
  id: "p1", slug: "ppc-b4", kind: "course", title: "PPC", status: "published",
  draft: mainContent(), published: mainContent(), revision: 7, published_at: "2026-01-01T00:00:00Z",
  created_by: "u", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...over,
});
/** Routes reads by table; variants table answers with `variants` (array for list, first for single reads). */
function db(opts: { page?: unknown; variants?: Record<string, unknown>[]; onWrite?: (o: Op) => Res }) {
  handler = (o) => {
    if (o.op !== "select" && opts.onWrite) return opts.onWrite(o);
    if (o.table === "landing_pages") return { data: opts.page === undefined ? pRow() : opts.page, error: null };
    const hasId = o.filters.some(([k]) => k === "id");
    const vs = opts.variants ?? [];
    return { data: hasId ? (vs[0] ?? null) : vs, error: null };
  };
}

beforeEach(() => {
  ops = []; revalidatePath.mockReset(); rpcCalls = [];
  rpcHandler = () => ({ data: null, error: null });
});

describe("ensureVariant", () => {
  it("creating a module variant seeds the hero headline override", async () => {
    db({ variants: [], onWrite: (o) => ({ data: vRow({ draft: o.payload!.draft, enabled: o.payload!.enabled }), error: null }) });
    const r = await ensureVariant("p1", { regionKey: null, moduleKey: "diabetes" }, false);
    expect(r.ok).toBe(true);
    const ins = ops.find((o) => o.op === "insert")!;
    expect(ins.payload).toMatchObject({ page_id: "p1", region_key: null, module_key: "diabetes", enabled: false });
    expect(ins.payload!.draft).toEqual({ sections: { hero1: { fields: { headline: "3-Day Workshop: Diabetes" } } } });
  });
  it("a region variant is created with empty overrides and the canonical upper-case key", async () => {
    db({ variants: [], onWrite: (o) => ({ data: vRow({ region_key: "PK", module_key: null, draft: o.payload!.draft }), error: null }) });
    await ensureVariant("p1", { regionKey: "pk", moduleKey: null }, true);
    const ins = ops.find((o) => o.op === "insert")!;
    expect(ins.payload).toMatchObject({ region_key: "PK", module_key: null });
    expect(ins.payload!.draft).toEqual({ sections: {} });
  });
  it("unknown region or module is bad-ref and writes nothing", async () => {
    db({ variants: [] });
    expect(await ensureVariant("p1", { regionKey: "ZZ", moduleKey: null }, false)).toEqual({ ok: false, reason: "bad-ref" });
    expect(await ensureVariant("p1", { regionKey: null, moduleKey: "nope" }, false)).toEqual({ ok: false, reason: "bad-ref" });
    expect(ops.filter((o) => o.op === "insert")).toHaveLength(0);
  });
  it("returns the existing variant instead of inserting", async () => {
    db({ variants: [vRow()] });
    const r = await ensureVariant("p1", { regionKey: null, moduleKey: "diabetes" }, false);
    expect(r.ok && r.variant.id).toBe("v1");
    expect(ops.filter((o) => o.op === "insert")).toHaveLength(0);
  });
  it("missing page is not-found", async () => {
    db({ page: null });
    expect(await ensureVariant("p1", { regionKey: "PK", moduleKey: null }, false)).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("saveVariantDraft", () => {
  it("stale revision with an existing variant is a conflict and sets updated_at on success", async () => {
    handler = (o) => (o.op === "update" ? { data: null, error: null } : { data: { id: "v1" }, error: null });
    expect(await saveVariantDraft("v1", { sections: {} }, 1)).toEqual({ ok: false, reason: "conflict" });
    handler = (o) => (o.op === "update" ? { data: { revision: 4 }, error: null } : { data: null, error: null });
    ops = [];
    expect(await saveVariantDraft("v1", { sections: {} }, 3)).toEqual({ ok: true, revision: 4 });
    const upd = ops.find((o) => o.op === "update")!;
    expect(upd.filters).toContainEqual(["revision", 3]);
    expect(upd.payload).toHaveProperty("updated_at");
  });
  it("missing variant is not-found", async () => {
    handler = () => ({ data: null, error: null });
    expect(await saveVariantDraft("v1", { sections: {} }, 1)).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("publishVariant", () => {
  it("main unpublished is main-not-published, no RPC", async () => {
    db({ page: pRow({ published: null, status: "draft" }), variants: [vRow()] });
    expect(await publishVariant("u", "v1")).toEqual({ ok: false, reason: "main-not-published" });
    expect(rpcCalls).toHaveLength(0);
  });
  it("blocks a module whose option has no price (plain problem)", async () => {
    const reg = { ...mainContent().registration, enabled: true };
    const main = mainContent({ registration: reg });
    db({ page: pRow({ published: main, draft: main }), variants: [vRow()] });
    const r = await publishVariant("u", "v1");
    expect(r.ok).toBe(false);
    if (r.ok || r.reason !== "not-ready") throw new Error("expected not-ready");
    expect(r.problems.some((p) => /not linked to a priced registration option/.test(p.message))).toBe(true);
    expect(rpcCalls).toHaveLength(0);
  });
  it("blocks a region variant whose Prices section still shows another region's currency", async () => {
    // Registration off so only the currency check can fire; region AED, section says PKR.
    db({ page: pRow(), variants: [vRow({ region_key: "UAE", module_key: null })] });
    const r = await publishVariant("u", "v1");
    if (r.ok || r.reason !== "not-ready") throw new Error("expected not-ready");
    expect(r.problems.map((p) => p.message)).toContain("The Prices section still shows PKR amounts. Edit it for this link.");
  });
  it("a region variant whose Prices section was edited publishes through the RPC with its revision", async () => {
    const draft = { sections: { pr1: { fields: { items: [{ name: "Std", price: "AED 200" }] } } } };
    db({ page: pRow(), variants: [vRow({ region_key: "UAE", module_key: null, draft })] });
    rpcHandler = () => ({ data: 2, error: null });
    expect(await publishVariant("u", "v1")).toEqual({ ok: true, version: 2 });
    expect(rpcCalls).toEqual([{ fn: "landing_publish_variant", args: { p_variant_id: "v1", p_user: "u", p_revision: 3 } }]);
    expect(revalidatePath).toHaveBeenCalledWith("/e/[slug]", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/e/ppc-b4");
  });
  it("skips the currency check when the variant has no region", async () => {
    db({ page: pRow(), variants: [vRow()] });
    rpcHandler = () => ({ data: 1, error: null });
    expect((await publishVariant("u", "v1")).ok).toBe(true);
  });
  it("a module not on the live main page yet is main-out-of-date, before any price problem", async () => {
    const reg = { ...mainContent().registration, enabled: true };
    const draft = mainContent({ registration: reg });
    const live = mainContent({ registration: reg, modules: [] });
    db({ page: pRow({ published: live, draft }), variants: [vRow()] });
    expect(await publishVariant("u", "v1")).toEqual({ ok: false, reason: "main-out-of-date" });
    expect(rpcCalls).toHaveLength(0);
  });
  it("a country added after the main page went live is main-out-of-date (registration off too)", async () => {
    const qa = { key: "QA", label: "Qatar", currency: "QAR", classTime: "", timezoneLabel: "", accountKeys: [] };
    const draft = mainContent({ registration: { ...mainContent().registration, regions: [...mainContent().registration.regions, qa] } });
    db({ page: pRow({ published: mainContent(), draft }), variants: [vRow({ region_key: "QA", module_key: null })] });
    rpcHandler = () => ({ data: 1, error: null });
    expect(await publishVariant("u", "v1")).toEqual({ ok: false, reason: "main-out-of-date" });
    expect(rpcCalls).toHaveLength(0);
  });
  it("maps RPC errors", async () => {
    db({ page: pRow(), variants: [vRow()] });
    const cases: [string, string][] = [
      ["landing_variant_not_found", "not-found"], ["landing_main_not_published", "main-not-published"],
      ["landing_revision_conflict", "conflict"], ["boom", "db-error"],
    ];
    for (const [msg, reason] of cases) {
      rpcHandler = () => ({ data: null, error: { message: msg } });
      expect(await publishVariant("u", "v1")).toEqual({ ok: false, reason });
    }
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("rollback, enable, delete", () => {
  it("rollbackVariant calls the RPC and revalidates the layout", async () => {
    db({ page: pRow(), variants: [vRow()] });
    rpcHandler = () => ({ data: 5, error: null });
    expect(await rollbackVariant("u", "v1", 2)).toEqual({ ok: true, version: 5 });
    expect(rpcCalls).toEqual([{ fn: "landing_rollback_variant", args: { p_variant_id: "v1", p_version: 2, p_user: "u" } }]);
    expect(revalidatePath).toHaveBeenCalledWith("/e/[slug]", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/e/ppc-b4");
  });
  it("setVariantEnabled sets updated_at and revalidates the layout", async () => {
    db({ page: pRow(), variants: [vRow()], onWrite: () => ({ data: null, error: null }) });
    expect(await setVariantEnabled("v1", false)).toEqual({ ok: true });
    const upd = ops.find((o) => o.op === "update")!;
    expect(upd.payload).toMatchObject({ enabled: false });
    expect(upd.payload).toHaveProperty("updated_at");
    expect(revalidatePath).toHaveBeenCalledWith("/e/[slug]", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/e/ppc-b4");
  });
  it("deleteVariant deletes and revalidates the layout", async () => {
    db({ page: pRow(), variants: [vRow()], onWrite: () => ({ data: null, error: null }) });
    expect(await deleteVariant("v1")).toEqual({ ok: true });
    expect(ops.some((o) => o.op === "delete")).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/e/[slug]", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/e/ppc-b4");
  });
  it("a missing variant is not-found", async () => {
    db({ page: pRow(), variants: [] });
    expect(await deleteVariant("v1")).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("getPublishedVariantPage", () => {
  const published = { sections: { hero1: { fields: { headline: "Custom headline" } } } };
  it("null for a disabled variant", async () => {
    db({ variants: [] }); // the query filters enabled=true, so a disabled variant is simply absent
    expect(await getPublishedVariantPage("ppc-b4", ["diabetes"])).toBeNull();
    const q = ops.find((o) => o.table === "landing_page_variants")!;
    expect(q.filters).toContainEqual(["enabled", true]);
  });
  it("null for an unpublished variant", async () => {
    db({ variants: [vRow({ published: null })] });
    expect(await getPublishedVariantPage("ppc-b4", ["diabetes"])).toBeNull();
  });
  it("null for an unknown path and for a draft main", async () => {
    db({ variants: [vRow({ published })] });
    expect(await getPublishedVariantPage("ppc-b4", ["nope"])).toBeNull();
    db({ page: pRow({ status: "draft", published: null }), variants: [vRow({ published })] });
    expect(await getPublishedVariantPage("ppc-b4", ["diabetes"])).toBeNull();
  });
  it("returns resolved content for an enabled, published variant", async () => {
    db({ variants: [vRow({ published })] });
    const r = await getPublishedVariantPage("ppc-b4", ["Diabetes".toLowerCase()]);
    expect(r?.ref).toEqual({ regionKey: null, moduleKey: "diabetes" });
    expect(r?.status).toBe("published");
    const hero = r!.content.sections.find((s) => s.id === "hero1")!;
    expect(hero.data.headline).toBe("Custom headline");
  });
  it("matches a region path case-insensitively", async () => {
    db({ variants: [vRow({ region_key: "UAE", module_key: null, published: { sections: {} } })] });
    const r = await getPublishedVariantPage("ppc-b4", ["uae"]);
    expect(r?.ref).toEqual({ regionKey: "UAE", moduleKey: null });
  });
  it("throws on a DB error", async () => {
    handler = () => ({ data: null, error: { code: "08006", message: "down" } });
    await expect(getPublishedVariantPage("ppc-b4", ["pk"])).rejects.toBeTruthy();
  });
});

describe("listVariants", () => {
  it("throws on a DB error", async () => {
    handler = () => ({ data: null, error: { message: "down" } });
    await expect(listVariants("p1")).rejects.toBeTruthy();
  });
});
