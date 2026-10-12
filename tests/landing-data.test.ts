import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

vi.mock("@/lib/landing/content", async () => {
  const actual = await vi.importActual<typeof import("@/lib/landing/content")>("@/lib/landing/content");
  return { ...actual, computeReadiness: (...a: Parameters<typeof actual.computeReadiness>) => (forceReady ? { ready: true, problems: [] } : actual.computeReadiness(...a)) };
});

type Res = { data: unknown; error: unknown };
interface Op { table: string; op: "select" | "insert" | "update" | "delete"; payload?: Record<string, unknown>; filters: [string, unknown][] }
let forceReady = false;
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
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => ({ from: builder }) }));

import {
  rollbackLandingPage, saveDraft, publishLandingPage, getPublishedLandingPage,
} from "@/lib/data/landing-pages";
import { emptyContent } from "@/lib/landing/content";

const content = emptyContent("course");
const pageRow = (over: Record<string, unknown> = {}) => ({
  id: "p1", slug: "ppc-b4", kind: "course", title: "PPC", status: "published",
  draft: content, published: content, revision: 7, published_at: "2026-01-01T00:00:00Z",
  created_by: "u", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...over,
});
const find = (table: string, op: Op["op"]) => ops.filter((o) => o.table === table && o.op === op);

beforeEach(() => {
  ops = []; forceReady = false; revalidatePath.mockReset();
});

describe("rollbackLandingPage", () => {
  const script = (pageUpdate: Res) => (o: Op): Res => {
    if (o.table === "landing_pages" && o.op === "select") return { data: pageRow(), error: null };
    if (o.table === "landing_page_versions" && o.op === "select" && o.filters.some(([k]) => k === "version") ) return { data: { content }, error: null };
    if (o.table === "landing_page_versions" && o.op === "select") return { data: { version: 3 }, error: null };
    if (o.table === "landing_page_versions" && o.op === "insert") return { data: null, error: null };
    if (o.table === "landing_pages" && o.op === "update") return pageUpdate;
    return { data: null, error: null };
  };

  it("reports conflict, removes the version it inserted and does not revalidate when the revision moved", async () => {
    handler = script({ data: null, error: null });
    const r = await rollbackLandingPage("u", "p1", 2);
    expect(r).toEqual({ ok: false, reason: "conflict" });
    const del = find("landing_page_versions", "delete");
    expect(del).toHaveLength(1);
    expect(del[0].filters).toEqual(expect.arrayContaining([["page_id", "p1"], ["version", 4]]));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("happy path writes draft + published + revision+1 guarded by the loaded revision", async () => {
    handler = script({ data: { id: "p1" }, error: null });
    const r = await rollbackLandingPage("u", "p1", 2);
    expect(r).toEqual({ ok: true });
    const upd = find("landing_pages", "update")[0];
    expect(upd.filters).toEqual(expect.arrayContaining([["id", "p1"], ["revision", 7]]));
    expect(upd.payload).toMatchObject({ revision: 8 });
    expect(upd.payload).toHaveProperty("draft");
    expect(upd.payload).toHaveProperty("published");
    expect(find("landing_page_versions", "delete")).toHaveLength(0);
    expect(revalidatePath).toHaveBeenCalledWith("/e/ppc-b4");
  });
});

describe("saveDraft", () => {
  it("stale revision with an existing page is a conflict", async () => {
    handler = (o) => (o.op === "update" ? { data: null, error: null } : { data: { id: "p1" }, error: null });
    expect(await saveDraft("p1", content, 1)).toEqual({ ok: false, reason: "conflict" });
  });
  it("missing page is not-found", async () => {
    handler = () => ({ data: null, error: null });
    expect(await saveDraft("p1", content, 1)).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("publishLandingPage", () => {
  it("incomplete draft returns not-ready with problems and writes nothing", async () => {
    handler = (o) => (o.table === "landing_pages" && o.op === "select" ? { data: pageRow({ status: "draft", published: null }), error: null } : { data: null, error: null });
    const r = await publishLandingPage("u", "p1");
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === "not-ready") expect(r.problems.length).toBeGreaterThan(0);
    else throw new Error("expected not-ready");
    expect(ops.filter((o) => o.op === "insert" || o.op === "update")).toHaveLength(0);
  });

  it("publishing a closed page keeps it closed", async () => {
    forceReady = true;
    handler = (o) => {
      if (o.table === "landing_pages" && o.op === "select") return { data: pageRow({ status: "closed" }), error: null };
      if (o.table === "landing_page_versions" && o.op === "select") return { data: { version: 1 }, error: null };
      return { data: { id: "p1" }, error: null };
    };
    expect(await publishLandingPage("u", "p1")).toEqual({ ok: true });
    expect(find("landing_pages", "update")[0].payload).toMatchObject({ status: "closed" });
  });
});

describe("getPublishedLandingPage", () => {
  it("hides draft-status pages", async () => {
    handler = () => ({ data: pageRow({ status: "draft" }), error: null });
    expect(await getPublishedLandingPage("ppc-b4")).toBeNull();
  });
  it("hides pages with no published copy", async () => {
    handler = () => ({ data: pageRow({ published: null }), error: null });
    expect(await getPublishedLandingPage("ppc-b4")).toBeNull();
  });
  it("returns a published page", async () => {
    handler = () => ({ data: pageRow(), error: null });
    expect((await getPublishedLandingPage("ppc-b4"))?.page.slug).toBe("ppc-b4");
  });
});
