import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

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
    ilike: (k: string, v: unknown) => { op.filters.push([`ilike:${k}`, v]); return b; },
    order: () => b,
    maybeSingle: done,
    single: done,
    then: (res: (v: Res) => unknown, rej: (e: unknown) => unknown) => done().then(res, rej),
  };
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => ({ from: builder }) }));

import { addMedia, listMedia, findMediaUsage, deleteMedia } from "@/lib/data/landing-media";

const FID = "1AbCdEfGhIjKlMnOp";
const row = (over: Record<string, unknown> = {}) => ({
  id: "m1", drive_file_id: FID, url: `https://drive.google.com/thumbnail?id=${FID}`, name: "Hero",
  folder: "heroes", width: 1600, height: 900, orientation: "wide", size_bytes: 1000,
  created_at: "2026-01-01T00:00:00Z", created_by: "u", ...over,
});
const find = (table: string, op: Op["op"]) => ops.filter((o) => o.table === table && o.op === op);

beforeEach(() => { ops = []; handler = () => ({ data: null, error: null }); });

describe("addMedia", () => {
  it("a url without a Drive file id is invalid and touches nothing", async () => {
    expect(await addMedia({ url: "https://example.com/a.png", name: "x" }, "u")).toEqual({ ok: false, reason: "invalid" });
    expect(ops).toHaveLength(0);
  });
  it("a file id already in the library returns that row and inserts nothing", async () => {
    handler = () => ({ data: row(), error: null });
    const r = await addMedia({ url: `https://drive.google.com/thumbnail?id=${FID}`, name: "Again" }, "u");
    expect(r.ok && r.existing).toBe(true);
    if (r.ok) expect(r.item.id).toBe("m1");
    expect(find("landing_media", "insert")).toHaveLength(0);
  });
  it("inserts a new picture with its orientation", async () => {
    handler = (o) => (o.op === "insert" ? { data: row(), error: null } : { data: null, error: null });
    const r = await addMedia({ url: `https://drive.google.com/thumbnail?id=${FID}`, name: " Hero ", width: 1600, height: 900 }, "u");
    expect(r.ok && !r.existing).toBe(true);
    const ins = find("landing_media", "insert")[0];
    expect(ins.payload).toMatchObject({ drive_file_id: FID, name: "Hero", folder: "misc", orientation: "wide", created_by: "u" });
  });
});

describe("listMedia", () => {
  it("escapes % _ and backslash in the search term", async () => {
    handler = () => ({ data: [], error: null });
    await listMedia({ q: "50%_a\\b" });
    expect(ops[0].filters).toContainEqual(["ilike:name", "%50\\%\\_a\\\\b%"]);
  });
  it("throws on a read error", async () => {
    handler = () => ({ data: null, error: { message: "down" } });
    await expect(listMedia()).rejects.toBeTruthy();
  });
});

const pages = (over: Record<string, unknown> = {}) => [
  { id: "p1", title: "Page One", slug: "one", draft: {}, published: null, ...over },
  { id: "p2", title: "Page Two", slug: "two", draft: {}, published: null },
];
function usageHandler(p: unknown[], v: unknown[]) {
  return (o: Op): Res => {
    if (o.table === "landing_pages") return { data: p, error: null };
    if (o.table === "landing_page_variants") return { data: v, error: null };
    return { data: null, error: null };
  };
}

describe("findMediaUsage", () => {
  it("finds an id that is only inside a variant's published copy, once per page", async () => {
    handler = usageHandler(pages({ draft: { img: FID } }), [{ page_id: "p1", draft: {}, published: { a: FID } }]);
    expect(await findMediaUsage(FID)).toEqual([{ id: "p1", title: "Page One", slug: "one" }]);
  });
  it("finds a page only through its variant", async () => {
    handler = usageHandler(pages(), [{ page_id: "p2", draft: {}, published: { a: FID } }]);
    expect(await findMediaUsage(FID)).toEqual([{ id: "p2", title: "Page Two", slug: "two" }]);
  });
  it("returns nothing when the id appears nowhere", async () => {
    handler = usageHandler(pages(), [{ page_id: "p1", draft: {}, published: null }]);
    expect(await findMediaUsage(FID)).toEqual([]);
  });
  it("throws when a read fails", async () => {
    handler = (o) => (o.table === "landing_page_variants" ? { data: null, error: { message: "down" } } : { data: pages(), error: null });
    await expect(findMediaUsage(FID)).rejects.toBeTruthy();
  });
});

describe("deleteMedia", () => {
  it("is in-use with page names and deletes nothing", async () => {
    handler = (o) => (o.table === "landing_media" ? { data: row(), error: null } : usageHandler(pages({ draft: { a: FID } }), [])(o));
    expect(await deleteMedia("m1")).toEqual({ ok: false, reason: "in-use", pages: [{ id: "p1", title: "Page One", slug: "one" }] });
    expect(find("landing_media", "delete")).toHaveLength(0);
  });
  it("is an error and deletes nothing when the scan read fails", async () => {
    handler = (o) => {
      if (o.table === "landing_media") return { data: row(), error: null };
      if (o.table === "landing_pages") return { data: null, error: { message: "down" } };
      return { data: [], error: null };
    };
    expect(await deleteMedia("m1")).toEqual({ ok: false, reason: "error" });
    expect(find("landing_media", "delete")).toHaveLength(0);
  });
  it("is not-found when the picture does not exist", async () => {
    handler = () => ({ data: null, error: null });
    expect(await deleteMedia("m1")).toEqual({ ok: false, reason: "not-found" });
  });
  it("deletes when unused", async () => {
    handler = (o) => (o.table === "landing_media" ? { data: row(), error: null } : usageHandler(pages(), [])(o));
    expect(await deleteMedia("m1")).toEqual({ ok: true });
    expect(find("landing_media", "delete")).toHaveLength(1);
  });
});
