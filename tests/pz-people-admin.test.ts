import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Op, type Store } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { findPeople, mergePeople } from "@/lib/data/pz-people-admin";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

let store: Store;
let rpcError: unknown = null;

// The memory handler treats ilike as exact match; here it is a substring match instead.
function handler() {
  const mem = memoryHandler(store);
  return (op: Op) => {
    if (op.op === "rpc") {
      if (rpcError) return { data: null, error: rpcError };
      const { p_keep, p_drop } = op.payload as { p_keep: string; p_drop: string };
      for (const t of ["pz_person_emails", "pz_id_aliases", "landing_registrations"]) {
        for (const r of store[t]) if (r.person_id === p_drop) r.person_id = p_keep;
      }
      store.pz_people = store.pz_people.filter((p) => p.id !== p_drop);
      return { data: null, error: null };
    }
    const like = op.filters.find(([k]) => k === "ilike");
    const res = mem({ ...op, filters: op.filters.filter(([k]) => k !== "ilike") });
    if (!like || !Array.isArray(res.data)) return res;
    const needle = String(like[2]).replace(/^%|%$/g, "").replace(/\\(.)/g, "$1").toLowerCase();
    return { ...res, data: (res.data as Record<string, unknown>[]).filter((r) => String(r[like[1]]).toLowerCase().includes(needle)) };
  };
}

beforeEach(() => {
  db.reset();
  rpcError = null;
  store = {
    pz_people: [
      { id: A, pz_id: "Hamid-1002", display_name: "Hamid Ali" },
      { id: B, pz_id: "Hamid-4821", display_name: "Hamid A." },
    ],
    pz_person_emails: [
      { email: "hamid@gmail.com", person_id: A },
      { email: "h.ali@yahoo.com", person_id: B },
    ],
    pz_id_aliases: [
      { alias_norm: "hamid-1002", person_id: A, source: "own" },
      { alias_norm: "hamid-4821", person_id: B, source: "own" },
    ],
    landing_registrations: [
      { id: "r1", person_id: A, status: "paid", is_test: false },
      { id: "r2", person_id: A, status: "free", is_test: false },
      { id: "r3", person_id: A, status: "pending", is_test: false },
      { id: "r4", person_id: B, status: "paid", is_test: false },
    ],
  };
  db.state.handler = handler();
});

describe("findPeople", () => {
  it("finds a person by PZ ID, ignoring case and spaces", async () => {
    const { people: res } = await findPeople("HAMID - 1002");
    expect(res).toEqual([{ id: A, pzId: "Hamid-1002", name: "Hamid Ali", emails: ["hamid@gmail.com"], batches: 2 }]);
  });

  it("finds a person by email", async () => {
    const { people: res } = await findPeople("h.ali@yahoo");
    expect(res.map((p) => p.id)).toEqual([B]);
    expect(res[0].batches).toBe(1);
  });

  it("finds people by name", async () => {
    const { people: res } = await findPeople("hamid");
    expect(res.map((p) => p.id).sort()).toEqual([A, B].sort());
  });

  it("returns nothing and does not query for a short query", async () => {
    expect(await findPeople("  ab ")).toEqual({ people: [], truncated: false });
    expect(db.state.ops).toHaveLength(0);
  });

  it("treats a query of only asterisks as too short, with no queries", async () => {
    expect(await findPeople("***")).toEqual({ people: [], truncated: false });
    expect(db.state.ops).toHaveLength(0);
  });

  it("removes asterisks from the patterns", async () => {
    await findPeople("ha*mid");
    const likes = db.state.ops.flatMap((o) => o.filters).filter(([k]) => k === "ilike");
    expect(likes.length).toBeGreaterThan(0);
    for (const l of likes) expect(String(l[2])).not.toContain("*");
    expect(likes.some((l) => String(l[2]) === "%hamid%")).toBe(true);
  });

  it("escapes wildcards in the ilike argument", async () => {
    await findPeople("100%_x");
    const likes = db.state.ops.flatMap((o) => o.filters).filter(([k]) => k === "ilike");
    expect(likes.length).toBeGreaterThan(0);
    for (const l of likes) expect(String(l[2])).toContain("100\\%\\_x");
  });

  it("returns at most 20 people", async () => {
    for (let i = 0; i < 30; i++) {
      const id = `00000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`;
      store.pz_people.push({ id, pz_id: `Zed-${2000 + i}`, display_name: "Zed Person" });
    }
    const { people: res, truncated } = await findPeople("zed");
    expect(res.length).toBeLessThanOrEqual(20);
    expect(truncated).toBe(true);
  });

  it("puts an exact PZ ID or alias match first, then sorts by name, then slices to 20", async () => {
    const X = "99999999-9999-4999-8999-999999999999";
    store.pz_people.push({ id: X, pz_id: "Zed-9999", display_name: "Zed Zebra" });
    store.pz_id_aliases.push({ alias_norm: "ali", person_id: X, source: "legacy" });
    for (let i = 0; i < 25; i++) {
      const id = `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`;
      store.pz_people.push({ id, pz_id: `Ali-${3000 + i}`, display_name: `Ali Person ${String(i).padStart(2, "0")}` });
    }
    const { people, truncated } = await findPeople("ali");
    expect(people).toHaveLength(20);
    expect(people[0].id).toBe(X);
    expect(people[1].name).toBe("Ali Person 00");
    expect(truncated).toBe(true);
  });

  it("is not truncated when 20 or fewer people match", async () => {
    const { people, truncated } = await findPeople("hamid");
    expect(people).toHaveLength(2);
    expect(truncated).toBe(false);
  });

  it("throws a plain message when the database fails", async () => {
    db.state.handler = () => ({ data: null, error: { message: "pg exploded" } });
    await expect(findPeople("hamid")).rejects.toThrow("Could not search people. Please try again.");
  });
});

describe("mergePeople", () => {
  it("refuses a person merged into itself without touching the database", async () => {
    const res = await mergePeople(A, A);
    expect(res.ok).toBe(false);
    expect(db.state.ops).toHaveLength(0);
  });

  it("refuses ids that are not UUIDs without touching the database", async () => {
    const res = await mergePeople("nope", B);
    expect(res.ok).toBe(false);
    expect(db.state.ops).toHaveLength(0);
  });

  it("calls pz_merge_people and the dropped ID is then found as an alias of the kept person", async () => {
    expect(await mergePeople(A, B)).toEqual({ ok: true });
    const call = db.state.ops.find((o) => o.op === "rpc");
    expect(call?.table).toBe("pz_merge_people");
    expect(call?.payload).toEqual({ p_keep: A, p_drop: B });
    const { people: res } = await findPeople("hamid-4821");
    expect(res.map((p) => p.id)).toEqual([A]);
    expect(res[0].batches).toBe(3);
  });

  it("returns a plain message on a database error without the raw text", async () => {
    rpcError = { message: "pz_merge_people: person not found" };
    const res = await mergePeople(A, B);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).not.toMatch(/pz_merge_people|not found/);
  });
});
