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
let rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let rpcHandler: (fn: string, args: Record<string, unknown>) => Res = () => ({ data: null, error: null });
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: builder,
    rpc: (fn: string, args: Record<string, unknown>) => { rpcCalls.push({ fn, args }); return Promise.resolve(rpcHandler(fn, args)); },
  }),
}));

import {
  rollbackLandingPage, saveDraft, publishLandingPage, getPublishedLandingPage, getLandingPage, renameLandingPage,
  duplicateLandingPage, setPageStatus, listVersions,
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
  rpcCalls = []; rpcHandler = () => ({ data: null, error: null });
});

describe("rollbackLandingPage (atomic RPC)", () => {
  it("restores through landing_rollback_page in one call and returns the new version", async () => {
    handler = () => ({ data: pageRow(), error: null });
    rpcHandler = () => ({ data: 5, error: null });
    expect(await rollbackLandingPage("u", "p1", 2)).toEqual({ ok: true, version: 5 });
    expect(rpcCalls).toEqual([{ fn: "landing_rollback_page", args: { p_page_id: "p1", p_version: 2, p_user: "u" } }]);
    // No more client-side insert / update / compensating delete: the function does it all.
    expect(ops.filter((o) => o.op !== "select")).toHaveLength(0);
    expect(revalidatePath).toHaveBeenCalledWith("/e/ppc-b4", "layout");
  });
  it("a missing version is not-found and revalidates nothing", async () => {
    handler = () => ({ data: pageRow(), error: null });
    rpcHandler = () => ({ data: null, error: { message: "landing_version_not_found" } });
    expect(await rollbackLandingPage("u", "p1", 99)).toEqual({ ok: false, reason: "not-found" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("a missing page is not-found without calling the function", async () => {
    handler = () => ({ data: null, error: null });
    expect(await rollbackLandingPage("u", "p1", 2)).toEqual({ ok: false, reason: "not-found" });
    expect(rpcCalls).toHaveLength(0);
  });
  it("a read error is db-error, never not-found", async () => {
    handler = () => ({ data: null, error: { code: "08006", message: "down" } });
    expect(await rollbackLandingPage("u", "p1", 2)).toEqual({ ok: false, reason: "db-error" });
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
  it("a read error while telling conflict from not-found is db-error, never a 404", async () => {
    handler = (o) => (o.op === "update" ? { data: null, error: null } : { data: null, error: { code: "08006", message: "down" } });
    expect(await saveDraft("p1", content, 1)).toEqual({ ok: false, reason: "db-error" });
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
    expect(rpcCalls).toHaveLength(0);
  });

  it("publishes through landing_publish_page with the revision the readiness check saw", async () => {
    forceReady = true;
    handler = () => ({ data: pageRow(), error: null });
    rpcHandler = () => ({ data: 4, error: null });
    expect(await publishLandingPage("u", "p1")).toEqual({ ok: true, version: 4 });
    expect(rpcCalls).toEqual([{ fn: "landing_publish_page", args: { p_page_id: "p1", p_user: "u", p_revision: 7 } }]);
    expect(ops.filter((o) => o.op !== "select")).toHaveLength(0);
    expect(revalidatePath).toHaveBeenCalledWith("/e/ppc-b4", "layout");
  });
  it("a draft saved after the readiness check is a conflict (409), not a 500", async () => {
    forceReady = true;
    handler = () => ({ data: pageRow(), error: null });
    rpcHandler = () => ({ data: null, error: { message: "landing_revision_conflict" } });
    expect(await publishLandingPage("u", "p1")).toEqual({ ok: false, reason: "conflict" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("a page deleted mid-publish is not-found; any other function error is db-error", async () => {
    forceReady = true;
    handler = () => ({ data: pageRow(), error: null });
    rpcHandler = () => ({ data: null, error: { message: "landing_page_not_found" } });
    expect(await publishLandingPage("u", "p1")).toEqual({ ok: false, reason: "not-found" });
    rpcHandler = () => ({ data: null, error: { message: "boom" } });
    expect(await publishLandingPage("u", "p1")).toEqual({ ok: false, reason: "db-error" });
  });
  it("a read error while loading the page is db-error and calls nothing", async () => {
    handler = () => ({ data: null, error: { code: "08006", message: "down" } });
    expect(await publishLandingPage("u", "p1")).toEqual({ ok: false, reason: "db-error" });
    expect(rpcCalls).toHaveLength(0);
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
  it("throws on a DB error so ISR never caches a 404 for a live page", async () => {
    handler = () => ({ data: null, error: { code: "08006", message: "down" } });
    await expect(getPublishedLandingPage("ppc-b4")).rejects.toBeTruthy();
  });
  it("still returns null for a genuinely missing slug", async () => {
    handler = () => ({ data: null, error: null });
    expect(await getPublishedLandingPage("nope")).toBeNull();
  });
  it("getLandingPage throws on a DB error but returns null when the row is missing", async () => {
    handler = () => ({ data: null, error: { code: "08006", message: "down" } });
    await expect(getLandingPage("p1")).rejects.toBeTruthy();
    handler = () => ({ data: null, error: null });
    expect(await getLandingPage("p1")).toBeNull();
  });
  it("returns a published page", async () => {
    handler = () => ({ data: pageRow(), error: null });
    expect((await getPublishedLandingPage("ppc-b4"))?.page.slug).toBe("ppc-b4");
  });
});

describe("renameLandingPage", () => {
  it("updates only the title and updated_at, never slug, revision or draft", async () => {
    handler = () => ({ data: { id: "p1", slug: "ppc-b4" }, error: null });
    expect(await renameLandingPage("p1", "New name")).toEqual({ ok: true });
    const upd = find("landing_pages", "update");
    expect(upd).toHaveLength(1);
    expect(Object.keys(upd[0].payload!).sort()).toEqual(["title", "updated_at"]);
    expect(upd[0].payload!.title).toBe("New name");
    expect(upd[0].filters).toContainEqual(["id", "p1"]);
    expect(revalidatePath).toHaveBeenCalledWith("/e/ppc-b4");
  });
  it("missing page is not-found", async () => {
    handler = () => ({ data: null, error: null });
    expect(await renameLandingPage("p1", "x")).toEqual({ ok: false, reason: "not-found" });
  });
  it("database error is db-error", async () => {
    handler = () => ({ data: null, error: { message: "boom" } });
    expect(await renameLandingPage("p1", "x")).toEqual({ ok: false, reason: "db-error" });
  });
});

describe("read errors are never reported as missing", () => {
  const down = () => ({ data: null, error: { code: "08006", message: "down" } });
  it("setPageStatus returns db-error", async () => {
    handler = down;
    expect(await setPageStatus("p1", "closed")).toEqual({ ok: false, reason: "db-error" });
  });
  it("duplicateLandingPage returns db-error", async () => {
    handler = down;
    expect(await duplicateLandingPage("u", "p1", { title: "Copy", slug: "copy-page" })).toEqual({ ok: false, reason: "db-error" });
  });
  it("listVersions throws instead of claiming there are no versions", async () => {
    handler = down;
    await expect(listVersions("p1")).rejects.toBeTruthy();
  });
});
