import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Op, type Store } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { findIdsByName } from "@/lib/data/pz-people";

let store: Store;

// The memory handler treats ilike as exact match; here it is a substring match instead.
function handler() {
  const mem = memoryHandler(store);
  return (op: Op) => {
    const like = op.filters.find(([k]) => k === "ilike");
    const res = mem({ ...op, filters: op.filters.filter(([k]) => k !== "ilike") });
    if (!like || !Array.isArray(res.data)) return res;
    const needle = String(like[2]).replace(/^%|%$/g, "").replace(/[\\](.)/g, "$1").toLowerCase();
    return { ...res, data: (res.data as Record<string, unknown>[]).filter((r) => String(r[like[1]]).toLowerCase().includes(needle)) };
  };
}

const reg = (id: string, person: string | null, page: string, o: Record<string, unknown> = {}) => ({
  id, page_id: page, person_id: person, email: `${id}@secret-mail.test`, status: "paid", is_test: false, ...o,
});

beforeEach(() => {
  db.reset();
  store = {
    landing_pages: [
      { id: "p1", slug: "b1", status: "published", title: "Batch One" },
      { id: "p2", slug: "b2", status: "closed", title: "Batch Two" },
      { id: "p3", slug: "b3", status: "draft", title: "Draft Batch" },
    ],
    pz_people: [
      { id: "a", pz_id: "Sample-0001", display_name: "Sample Alpha-Surname" },
      { id: "b", pz_id: "Sample-0002", display_name: "Sample 100% Beta" },
      { id: "c", pz_id: "Sample-0003", display_name: "Sample Pending" },
      { id: "d", pz_id: "Sample-0004", display_name: "Sample Drafty" },
      { id: "e", pz_id: "Sample-0005", display_name: "Sample Tester" },
    ],
    landing_registrations: [
      reg("r1", "a", "p1"),
      reg("r2", "a", "p1"),
      reg("r3", "a", "p2", { status: "free" }),
      reg("r4", "b", "p1"),
      reg("r5", "c", "p1", { status: "pending" }),
      reg("r6", "d", "p3"),
      reg("r7", "e", "p1", { is_test: true }),
      reg("r8", null, "p1"),
    ],
  };
  db.state.handler = handler();
});

describe("findIdsByName", () => {
  it("returns nothing for a query under 3 characters", async () => {
    expect(await findIdsByName("sa")).toEqual([]);
    expect(await findIdsByName("  s* ")).toEqual([]);
    expect(db.state.ops).toHaveLength(0);
  });

  it("needs 3 real letters or digits and at most 60 characters", async () => {
    for (const q of ["a b", "...", "  a   b ", "ab ", "x".repeat(61)]) expect(await findIdsByName(q)).toEqual([]);
    expect(db.state.ops).toHaveLength(0);
    expect((await findIdsByName("1 2 3")).length).toBe(0);
    expect(await findIdsByName("123")).toEqual([]);
    expect(db.state.ops.length).toBeGreaterThan(0);
  });

  it("finds the one enrolled match even among more than 1000 matching people", async () => {
    const many = Array.from({ length: 1500 }, (_, i) => ({
      id: `m${i}`, pz_id: `Name-${String(i).padStart(4, "0")}`, display_name: `Aaa Common${i}`,
    }));
    store.pz_people = [...many, { id: "z", pz_id: "Zed-0001", display_name: "Zzz Common" }];
    store.landing_registrations = [reg("only", "z", "p1")];
    const rows = await findIdsByName("common");
    expect(rows).toEqual([{ firstName: "Zzz", pzId: "Zed-0001", batchTitle: "Batch One" }]);
  });

  it("returns first name, id and batch title only, once per batch", async () => {
    const rows = await findIdsByName("alpha");
    expect(rows).toEqual([
      { firstName: "Sample", pzId: "Sample-0001", batchTitle: "Batch One" },
      { firstName: "Sample", pzId: "Sample-0001", batchTitle: "Batch Two" },
    ]);
  });

  it("never exposes a surname or an email", async () => {
    const json = JSON.stringify(await findIdsByName("sample"));
    expect(json).not.toContain("Surname");
    expect(json).not.toContain("Beta");
    expect(json).not.toContain("@");
    expect(json).not.toContain("secret-mail");
  });

  it("treats wildcard characters literally", async () => {
    const pct = await findIdsByName("100%");
    expect(pct.map((r) => r.pzId)).toEqual(["Sample-0002"]);
    expect(await findIdsByName("%%%")).toEqual([]);
    expect(await findIdsByName("s_m")).toEqual([]);
    expect(await findIdsByName("*sam*")).not.toEqual([]);
    const people = db.state.ops.find((o) => o.table === "pz_people");
    expect(String(people?.filters.find(([k]) => k === "ilike")?.[2])).not.toContain("*");
  });

  it("only returns enrolled people (paid or free, non-test, with a person)", async () => {
    expect(await findIdsByName("pending")).toEqual([]);
    expect(await findIdsByName("tester")).toEqual([]);
  });

  it("excludes draft batches", async () => {
    expect(await findIdsByName("drafty")).toEqual([]);
  });

  it("caps the result at 5 rows", async () => {
    store.pz_people = Array.from({ length: 12 }, (_, i) => ({
      id: `x${i}`, pz_id: `Name-${String(i).padStart(4, "0")}`, display_name: `Sample Name${i}`,
    }));
    store.landing_registrations = store.pz_people.map((p, i) => reg(`q${i}`, p.id as string, "p1"));
    const rows = await findIdsByName("sample");
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.pzId)).toEqual(["Name-0000", "Name-0001", "Name-0010", "Name-0011", "Name-0002"]);
  });

  it("counts a person in two batches twice toward the cap", async () => {
    store.pz_people = Array.from({ length: 4 }, (_, i) => ({
      id: `x${i}`, pz_id: `Name-000${i}`, display_name: `Sample Aaa${i}`,
    }));
    store.landing_registrations = store.pz_people.flatMap((p, i) => [
      reg(`q${i}a`, p.id as string, "p1"),
      reg(`q${i}b`, p.id as string, "p2"),
    ]);
    expect(await findIdsByName("sample")).toHaveLength(5);
  });

  it("throws a plain error when the database fails", async () => {
    db.state.handler = () => ({ data: null, error: { message: "secret db text" } });
    await expect(findIdsByName("sample")).rejects.toThrow("Could not search IDs. Please try again.");
  });
});
