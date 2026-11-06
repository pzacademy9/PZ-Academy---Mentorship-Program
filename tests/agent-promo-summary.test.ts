import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const calls: { table: string; op: string; args: unknown[] }[] = [];
let answers: Record<string, unknown> = {};

function chain(table: string): unknown {
  const target: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(target, {
    get(_t, prop: string) {
      if (prop === "then") {
        const key = calls.some((c) => c.table === table && c.op === "eq" && c.args[0] === "status") ? `${table}:paid` : table;
        return (res: (v: unknown) => void) => res(answers[key] ?? answers[table]);
      }
      return (...args: unknown[]) => {
        calls.push({ table, op: prop, args });
        if (prop === "maybeSingle") return Promise.resolve(answers[`${table}:one`]);
        return proxy;
      };
    },
  });
  return proxy;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => ({ from: (t: string) => chain(t) }) }));
vi.mock("@/lib/data/landing-promo-codes", () => ({ createPromoCode: vi.fn() }));

import { getAgentPromoSummary } from "@/lib/data/agent-promo-code";

beforeEach(() => {
  calls.length = 0;
  answers = {
    landing_promo_codes: { data: [{ id: "p1", code: "PZ-AHM" }], error: null },
    landing_registrations: { count: 4, error: null },
    "landing_registrations:paid": { count: 2, error: null },
  };
});

describe("getAgentPromoSummary", () => {
  it("counts only real sales: lead and individual rows, never test rows or group member rows", async () => {
    const s = await getAgentPromoSummary("agent-1");
    expect(s).toEqual({ code: "PZ-AHM", used: 4, paid: 2 });
    const regCalls = calls.filter((c) => c.table === "landing_registrations");
    expect(regCalls.some((c) => c.op === "eq" && c.args[0] === "is_test" && c.args[1] === false)).toBe(true);
    expect(regCalls.some((c) => c.op === "in" && c.args[0] === "row_type" && JSON.stringify(c.args[1]) === JSON.stringify(["individual", "lead"]))).toBe(true);
    expect(regCalls.some((c) => c.op === "eq" && c.args[0] === "status" && c.args[1] === "paid")).toBe(true);
  });
  it("returns null when the agent has no owner code", async () => {
    answers.landing_promo_codes = { data: [], error: null };
    expect(await getAgentPromoSummary("agent-1")).toBeNull();
  });
});
