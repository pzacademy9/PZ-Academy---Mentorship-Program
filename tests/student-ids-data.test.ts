import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Op, type Store } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { listBatchIdRowsWithScope } from "@/lib/data/pz-people";

let store: Store;
let failTable: string | null = null;

const reg = (id: string, person: string | null, label: string | null, o: Record<string, unknown> = {}) => ({
  id, page_id: "p1", person_id: person, email: `${id}@example.com`, phone: "0300", option_label: label,
  status: "paid", is_test: false, ...o,
});

beforeEach(() => {
  db.reset();
  failTable = null;
  store = {
    pz_people: [
      { id: "a", pz_id: "Sample-0001", display_name: "Sample Bravo" },
      { id: "b", pz_id: "Sample-0002", display_name: "Sample Alpha" },
      { id: "c", pz_id: "Sample-0003", display_name: "Sample Charlie" },
    ],
    landing_registrations: [
      reg("r1", "a", "Live - Modules: M1"),
      reg("r2", "a", "Recorded - Modules: M3"),
      reg("r3", "b", "Live - Full Course"),
      reg("r4", "b", "Live - Modules: M2"),
      reg("r5", "c", null),
      reg("r6", "c", "Live - Modules: M4", { status: "pending" }),
    ],
  };
  const mem = memoryHandler(store);
  db.state.handler = (op: Op) => (failTable === op.table ? { data: null, error: { message: "boom" } } : mem(op));
});

describe("listBatchIdRowsWithScope", () => {
  it("gives one sorted row per person with the union of their scopes", async () => {
    const rows = await listBatchIdRowsWithScope("p1");
    expect(rows.map((r) => r.name)).toEqual(["Sample Alpha", "Sample Bravo", "Sample Charlie"]);
    expect(rows[0]).toMatchObject({ pzId: "Sample-0002", full: true, modules: [], known: true });
    expect(rows[1]).toMatchObject({ pzId: "Sample-0001", full: false, modules: [1, 3], known: true });
    expect(rows[2]).toMatchObject({ full: false, modules: [], known: false });
  });
  it("never returns an email or phone", async () => {
    const rows = await listBatchIdRowsWithScope("p1");
    expect(Object.keys(rows[0]).sort()).toEqual(["full", "known", "modules", "name", "pzId"]);
  });
  it("throws a plain error when a read fails", async () => {
    failTable = "pz_people";
    await expect(listBatchIdRowsWithScope("p1")).rejects.toThrow("Could not load IDs. Please try again.");
  });
});
