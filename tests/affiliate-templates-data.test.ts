import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const calls: { table: string; op: string; args: unknown[] }[] = [];
let answers: Record<string, unknown> = {};

function chain(table: string): unknown {
  const proxy: unknown = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === "then") return (res: (v: unknown) => void) => res(answers[table]);
      return (...args: unknown[]) => {
        calls.push({ table, op: prop, args });
        return proxy;
      };
    },
  });
  return proxy;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => ({ from: (t: string) => chain(t) }) }));

import { listAffiliateTemplates } from "@/lib/data/affiliate-templates";

beforeEach(() => {
  calls.length = 0;
  answers = {};
});

describe("listAffiliateTemplates", () => {
  it("filters by channel and orders by sort_order", async () => {
    answers.affiliate_message_templates = {
      data: [{ id: "t1", channel: "email", name: "Hello", subject: "Hi {name}", body: "Body", sort_order: 1, created_at: "x" }],
      error: null,
    };
    const r = await listAffiliateTemplates("email");
    expect(r).toEqual([{ id: "t1", channel: "email", name: "Hello", subject: "Hi {name}", body: "Body" }]);
    expect(calls.some((c) => c.op === "eq" && c.args[0] === "channel" && c.args[1] === "email")).toBe(true);
    expect(calls.some((c) => c.op === "order" && c.args[0] === "sort_order")).toBe(true);
  });
  it("without a channel it does not filter", async () => {
    answers.affiliate_message_templates = { data: [], error: null };
    await listAffiliateTemplates();
    expect(calls.some((c) => c.op === "eq")).toBe(false);
  });
  it("throws on a database error", async () => {
    answers.affiliate_message_templates = { data: null, error: { code: "XX000" } };
    await expect(listAffiliateTemplates()).rejects.toBeTruthy();
  });
});
