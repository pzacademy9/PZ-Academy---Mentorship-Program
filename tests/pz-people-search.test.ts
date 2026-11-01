import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, type Op, type Res } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { findIdsByName, cleanNameQuery } from "@/lib/data/pz-people";

const row = (i: number) => ({ first_name: "Sample", pz_id: `Name-${String(i).padStart(4, "0")}`, batch_title: "Batch One" });
let reply: Res;

beforeEach(() => {
  db.reset();
  reply = { data: [row(0)], error: null };
  db.state.handler = (_op: Op) => reply;
});

const rpcOps = () => db.state.ops.filter((o) => o.op === "rpc");

describe("cleanNameQuery", () => {
  it("rejects short, symbol-only, too long and non-string input", () => {
    for (const q of ["sa", "a b", "...", "  a   b ", "x".repeat(61), "*s*", ""]) expect(cleanNameQuery(q)).toBeNull();
    expect(cleanNameQuery(undefined)).toBeNull();
  });
  it("strips *, collapses spaces, keeps 3 digits", () => {
    expect(cleanNameQuery("  *Sam   ple* ")).toBe("Sam ple");
    expect(cleanNameQuery("123")).toBe("123");
    expect(cleanNameQuery("x".repeat(60))).toBe("x".repeat(60));
  });
});

describe("findIdsByName", () => {
  it("does not call the database for a bad query", async () => {
    for (const q of ["sa", "...", "a b", "x".repeat(61)]) expect(await findIdsByName(q)).toEqual([]);
    expect(db.state.ops).toHaveLength(0);
  });

  it("calls the one database function with the cleaned query", async () => {
    await findIdsByName("  *Sample   Name* ");
    expect(rpcOps()).toHaveLength(1);
    expect(db.state.ops).toHaveLength(1);
    expect(rpcOps()[0].table).toBe("find_enrolled_ids_by_name");
    expect(rpcOps()[0].payload).toEqual({ p_query: "Sample Name" });
  });

  it("passes wildcard characters through untouched (the function escapes them)", async () => {
    await findIdsByName("100%_x");
    expect(rpcOps()[0].payload).toEqual({ p_query: "100%_x" });
  });

  it("maps rows to firstName, pzId, batchTitle only", async () => {
    reply = { data: [{ ...row(1), email: "a@b.test", display_name: "Sample Surname" }], error: null };
    const rows = await findIdsByName("sample");
    expect(rows).toEqual([{ firstName: "Sample", pzId: "Name-0001", batchTitle: "Batch One" }]);
    const json = JSON.stringify(rows);
    expect(json).not.toContain("@");
    expect(json).not.toContain("Surname");
  });

  it("caps the result at 5 rows even if the database returned more", async () => {
    reply = { data: Array.from({ length: 9 }, (_, i) => row(i)), error: null };
    expect(await findIdsByName("sample")).toHaveLength(5);
  });

  it("returns an empty list when nothing matches", async () => {
    reply = { data: [], error: null };
    expect(await findIdsByName("sample")).toEqual([]);
  });

  it("throws only the known plain error on a database failure", async () => {
    reply = { data: null, error: { message: "secret db text" } };
    await expect(findIdsByName("sample")).rejects.toThrow("Could not search IDs. Please try again.");
    await expect(findIdsByName("sample")).rejects.not.toThrow("secret");
  });
});
