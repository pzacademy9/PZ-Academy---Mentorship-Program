// tests/landing-promo-delete.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Call = { table: string; op: string; args: unknown[] };
const calls: Call[] = [];
const answers = {
  row: { data: null as unknown, error: null as unknown },
  count: { count: 0, error: null as unknown },
  del: { error: null as unknown },
};

function chain(table: string): unknown {
  const mine: string[] = [];
  const proxy: unknown = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === "then") {
        return (res: (v: unknown) => void) => res(mine.includes("delete") ? answers.del : answers.count);
      }
      return (...args: unknown[]) => {
        mine.push(prop);
        calls.push({ table, op: prop, args });
        if (prop === "maybeSingle") return Promise.resolve(answers.row);
        return proxy;
      };
    },
  });
  return proxy;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => ({ from: (t: string) => chain(t) }) }));

import { deletePromoCode } from "@/lib/data/landing-promo-codes";

const ID = "00000000-0000-4000-8000-000000000001";
const row = (over: Record<string, unknown> = {}) => ({
  id: ID, code: "PPC-10", type: "percent", value: 10, fixed_amounts: {}, max_discount_percent: 0, page_ids: [], option_keys: [],
  max_uses: 100, used_count: 0, one_per_email: false, starts_at: null, ends_at: null, active: true, owner_agent_id: null,
  is_owner_code: false, plain_percent: 0, max_percent: null, owner_affiliate_id: null, ...over,
});
const deletes = () => calls.filter((c) => c.op === "delete");

beforeEach(() => {
  calls.length = 0;
  answers.row = { data: row(), error: null };
  answers.count = { count: 0, error: null };
  answers.del = { error: null };
});

describe("deletePromoCode", () => {
  it("deletes an unused ordinary code by id", async () => {
    expect(await deletePromoCode(ID)).toEqual({ ok: true });
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0].table).toBe("landing_promo_codes");
    expect(calls.some((c) => c.table === "landing_promo_codes" && c.op === "eq" && c.args[0] === "id" && c.args[1] === ID)).toBe(true);
  });
  it("not-found when the code does not exist", async () => {
    answers.row = { data: null, error: null };
    expect(await deletePromoCode(ID)).toEqual({ ok: false, reason: "not-found" });
    expect(deletes()).toHaveLength(0);
  });
  it("owner-code for an owner code, with no delete", async () => {
    answers.row = { data: row({ is_owner_code: true }), error: null };
    expect(await deletePromoCode(ID)).toEqual({ ok: false, reason: "owner-code" });
    expect(deletes()).toHaveLength(0);
  });
  it("used when any registration points at it, with no delete", async () => {
    answers.count = { count: 1, error: null };
    expect(await deletePromoCode(ID)).toEqual({ ok: false, reason: "used" });
    expect(deletes()).toHaveLength(0);
  });
  it("counts every registration row, test rows included", async () => {
    answers.count = { count: 1, error: null };
    expect(await deletePromoCode(ID)).toEqual({ ok: false, reason: "used" });
    const reg = calls.filter((c) => c.table === "landing_registrations");
    expect(reg.some((c) => c.op === "eq" && c.args[0] === "promo_code_id" && c.args[1] === ID)).toBe(true);
    expect(reg.some((c) => c.args[0] === "is_test")).toBe(false);
  });
  it("db-error when the count fails, with no delete", async () => {
    answers.count = { count: 0, error: { code: "XX000" } };
    expect(await deletePromoCode(ID)).toEqual({ ok: false, reason: "db-error" });
    expect(deletes()).toHaveLength(0);
  });
  it("db-error when the read fails, with no delete", async () => {
    answers.row = { data: null, error: { code: "XX000" } };
    expect(await deletePromoCode(ID)).toEqual({ ok: false, reason: "db-error" });
    expect(deletes()).toHaveLength(0);
  });
  it("db-error when the delete itself fails", async () => {
    answers.del = { error: { code: "XX000" } };
    expect(await deletePromoCode(ID)).toEqual({ ok: false, reason: "db-error" });
  });
});
