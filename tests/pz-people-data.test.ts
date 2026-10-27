import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Op, type Store } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { searchBatchIds, listBatchIdsForAdmin } from "@/lib/data/pz-people";

let store: Store;
let failTable: string | null = null;

// The memory handler treats ilike as exact match; here it is a substring match instead.
function handler() {
  const mem = memoryHandler(store);
  return (op: Op) => {
    if (failTable === op.table) return { data: null, error: { message: "boom" } };
    const like = op.filters.find(([k]) => k === "ilike");
    const res = mem({ ...op, filters: op.filters.filter(([k]) => k !== "ilike") });
    if (!like || !Array.isArray(res.data)) return res;
    const needle = String(like[2]).replace(/^%|%$/g, "").replace(/\\(.)/g, "$1").toLowerCase();
    return { ...res, data: (res.data as Record<string, unknown>[]).filter((r) => String(r[like[1]]).toLowerCase().includes(needle)) };
  };
}

const reg = (id: string, person: string | null, email: string, o: Record<string, unknown> = {}) => ({
  id, page_id: "p1", person_id: person, email, status: "paid", is_test: false, ...o,
});

beforeEach(() => {
  db.reset();
  failTable = null;
  store = {
    landing_pages: [
      { id: "p1", slug: "batch-1", status: "published" },
      { id: "p2", slug: "draft-one", status: "draft" },
    ],
    pz_people: [
      { id: "a", pz_id: "Ali-1111", display_name: "Ali Khan" },
      { id: "b", pz_id: "Ali-2222", display_name: "Ali Raza" },
      { id: "c", pz_id: "Sara-3333", display_name: "Sara 100%" },
    ],
    landing_registrations: [
      reg("r1", "a", "ali.khan@gmail.com"),
      reg("r2", "a", "ali.khan@gmail.com"),
      reg("r3", "b", "ali.raza@gmail.com", { status: "free" }),
      reg("r4", "c", "sara@gmail.com", { status: "pending" }),
    ],
  };
  db.state.handler = handler();
});

describe("searchBatchIds", () => {
  it("returns null for a draft page", async () => {
    expect(await searchBatchIds("draft-one", "ali")).toBeNull();
  });

  it("returns null for an unknown slug", async () => {
    expect(await searchBatchIds("nope", "ali")).toBeNull();
  });

  it("returns no rows and no registrations query for a short query", async () => {
    const res = await searchBatchIds("batch-1", "  ab ");
    expect(res).toEqual({ found: false, rows: [] });
    expect(db.state.ops.some((o) => o.table === "landing_registrations")).toBe(false);
  });

  it("escapes wildcards in the ilike argument", async () => {
    await searchBatchIds("batch-1", "%%%");
    const like = db.state.ops.flatMap((o) => o.filters).find(([k]) => k === "ilike");
    expect(like?.[2]).toBe("%\\%\\%\\%%");
    db.reset();
    db.state.handler = handler();
    await searchBatchIds("batch-1", "a_\\b");
    const like2 = db.state.ops.flatMap((o) => o.filters).find(([k]) => k === "ilike");
    expect(like2?.[2]).toBe("%a\\_\\\\b%");
  });

  it("sends a single percent escaped when padded to 3 chars", async () => {
    await searchBatchIds("batch-1", " % x");
    const like = db.state.ops.flatMap((o) => o.filters).find(([k]) => k === "ilike");
    expect(like?.[2]).toBe("%\\% x%");
  });

  it("returns one row for a person with two registrations", async () => {
    const res = await searchBatchIds("batch-1", "khan");
    expect(res?.rows).toHaveLength(1);
    expect(res?.found).toBe(true);
  });

  it("returns two people with the same first name and different pzIds", async () => {
    const res = await searchBatchIds("batch-1", "Ali");
    expect(res?.rows.map((r) => r.pzId)).toEqual(["Ali-1111", "Ali-2222"]);
  });

  it("masks emails and leaks no raw email", async () => {
    const res = await searchBatchIds("batch-1", "Ali");
    expect(res?.rows[0].emailMasked).toBe("al***@gmail.com");
    const json = JSON.stringify(res);
    expect(json).not.toContain("ali.khan@gmail.com");
    expect(json).not.toContain("ali.raza@gmail.com");
  });

  it("excludes unpaid registrations", async () => {
    const res = await searchBatchIds("batch-1", "Sara");
    expect(res).toEqual({ found: false, rows: [] });
  });

  it("caps at five rows", async () => {
    for (let i = 0; i < 8; i++) {
      store.pz_people.push({ id: `x${i}`, pz_id: `Zed-${1000 + i}`, display_name: `Zed ${i}` });
      store.landing_registrations.push(reg(`rx${i}`, `x${i}`, `z${i}@x.com`));
    }
    const res = await searchBatchIds("batch-1", "Zed");
    expect(res?.rows).toHaveLength(5);
  });
});

describe("listBatchIdsForAdmin", () => {
  it("lists enrolled people once each, sorted by name, with raw email", async () => {
    const rows = await listBatchIdsForAdmin("p1");
    expect(rows).toEqual([
      { name: "Ali Khan", email: "ali.khan@gmail.com", pzId: "Ali-1111" },
      { name: "Ali Raza", email: "ali.raza@gmail.com", pzId: "Ali-2222" },
    ]);
  });

  it("throws the plain error when the registrations query fails", async () => {
    failTable = "landing_registrations";
    await expect(listBatchIdsForAdmin("p1")).rejects.toThrow("Could not load IDs. Please try again.");
  });

  it("throws the plain error when the people query fails", async () => {
    failTable = "pz_people";
    await expect(listBatchIdsForAdmin("p1")).rejects.toThrow("Could not load IDs. Please try again.");
  });
});
