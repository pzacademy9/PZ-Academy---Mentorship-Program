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
const brevo = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/brevo-affiliates", () => ({ sendAffiliateEmail: brevo.send }));

import { countSentLast24h } from "@/lib/data/affiliate-emails";
import { sendProgress, sendMotivation } from "@/lib/affiliates/send";
import type { ProgressInput, MotivationInput } from "@/lib/affiliates/rich-emails";

beforeEach(() => {
  calls.length = 0;
  answers = {};
  brevo.send.mockReset();
});

const who = { id: "a1", name: "Test Person", email: "t@example.com" };
const progressInput: ProgressInput = {
  name: "Test Person", code: "TP1", paid: 3, commissionPkr: 1500, balancePkr: 1500, percent: 10,
  rank: 4, gapLine: "", top: [], supportWa: "https://wa.me/1", message: "",
};
const motivationInput: MotivationInput = { name: "Test Person", code: "TP1", leaderLine: null, top: [], supportWa: "https://wa.me/1" };

describe("rich send helpers", () => {
  it('sendProgress logs kind "progress" and returns false without throwing when Brevo is not set up', async () => {
    answers.affiliate_emails = { error: null };
    brevo.send.mockResolvedValueOnce({ ok: false, error: "Brevo is not set up" });
    expect(await sendProgress(who, progressInput)).toBe(false);
    const ins = calls.find((c) => c.op === "insert")!;
    expect(ins.args[0]).toMatchObject({ affiliate_id: "a1", kind: "progress", status: "failed" });
  });
  it('sendMotivation logs kind "motivation"', async () => {
    answers.affiliate_emails = { error: null };
    brevo.send.mockResolvedValueOnce({ ok: true });
    expect(await sendMotivation(who, motivationInput)).toBe(true);
    expect(calls.find((c) => c.op === "insert")!.args[0]).toMatchObject({ kind: "motivation", status: "sent" });
  });
});

describe("countSentLast24h", () => {
  it("counts only sent rows from the last 24 hours", async () => {
    answers.affiliate_emails = { count: 42, error: null };
    expect(await countSentLast24h()).toBe(42);
    expect(calls.find((c) => c.op === "eq")!.args).toEqual(["status", "sent"]);
    const gte = calls.find((c) => c.op === "gte")!;
    expect(gte.args[0]).toBe("created_at");
    const t = new Date(gte.args[1] as string).getTime();
    expect(Math.abs(t - (Date.now() - 86_400_000))).toBeLessThan(60_000);
  });
  it("returns 300 when the read errors", async () => {
    answers.affiliate_emails = { count: null, error: { message: "x" } };
    expect(await countSentLast24h()).toBe(300);
  });
});
