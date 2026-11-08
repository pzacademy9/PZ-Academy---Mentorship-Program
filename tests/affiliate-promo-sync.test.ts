import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { ensureAffiliatePromo, deactivateAffiliatePromo } from "@/lib/data/affiliate-promo";

const existing = (rows: { id: string; active: boolean }[]) => {
  db.state.handler = (op) => {
    if (op.table === "landing_promo_codes" && op.op === "select") return { data: rows, error: null };
    if (op.op === "insert") return { data: { id: "new-1" }, error: null };
    return { data: null, error: null };
  };
};

beforeEach(() => db.reset());

describe("ensureAffiliatePromo", () => {
  it("makes the owner code from the affiliate's code when there is none", async () => {
    existing([]);
    expect(await ensureAffiliatePromo({ id: "aff-1", code: "AB321" })).toBe("ok");
    const ins = db.find("landing_promo_codes", "insert");
    expect(ins.length).toBe(1);
    expect(ins[0].payload).toMatchObject({
      code: "AB321", type: "percent", value: 0, is_owner_code: true, plain_percent: 10,
      owner_affiliate_id: "aff-1", owner_agent_id: null, active: true,
    });
  });
  it("does nothing when an active code already exists (a retry never makes a second)", async () => {
    existing([{ id: "p1", active: true }]);
    expect(await ensureAffiliatePromo({ id: "aff-1", code: "AB321" })).toBe("ok");
    expect(db.find("landing_promo_codes", "insert").length).toBe(0);
    expect(db.find("landing_promo_codes", "update").length).toBe(0);
  });
  it("switches an old, switched-off code back on", async () => {
    existing([{ id: "p1", active: false }]);
    expect(await ensureAffiliatePromo({ id: "aff-1", code: "AB321" })).toBe("ok");
    const up = db.find("landing_promo_codes", "update");
    expect(up.length).toBe(1);
    expect(up[0].payload).toMatchObject({ active: true });
    expect(up[0].filters.some((f) => f[0] === "eq" && f[1] === "id" && f[2] === "p1")).toBe(true);
  });
  it("reports failed when the code text is already used by an unrelated code", async () => {
    db.state.handler = (op) => (op.op === "insert" ? { data: null, error: { code: "23505", message: "dup" } } : { data: [], error: null });
    expect(await ensureAffiliatePromo({ id: "aff-1", code: "AB321" })).toBe("failed");
  });
  it("reports failed, never throws, when the database fails", async () => {
    db.state.handler = () => ({ data: null, error: { code: "57014", message: "x" } });
    expect(await ensureAffiliatePromo({ id: "aff-1", code: "AB321" })).toBe("failed");
  });
});

describe("deactivateAffiliatePromo", () => {
  it("switches off only this affiliate's owner code", async () => {
    await deactivateAffiliatePromo("aff-1");
    const up = db.find("landing_promo_codes", "update");
    expect(up.length).toBe(1);
    expect(up[0].payload).toMatchObject({ active: false });
    expect(up[0].filters.some((f) => f[0] === "eq" && f[1] === "owner_affiliate_id" && f[2] === "aff-1")).toBe(true);
  });
  it("never throws", async () => {
    db.state.handler = () => ({ data: null, error: { code: "XX000", message: "boom" } });
    await expect(deactivateAffiliatePromo("aff-1")).resolves.toBeUndefined();
  });
});
