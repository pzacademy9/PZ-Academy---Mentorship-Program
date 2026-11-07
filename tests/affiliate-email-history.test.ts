import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

describe("0108 affiliate_emails", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0108_affiliate_emails.sql"), "utf8");
  const flat = sql.replace(/\s+/g, " ");
  it("creates the table idempotently, with RLS and no policies", () => {
    expect(flat).toMatch(/create table if not exists public\.affiliate_emails \(/i);
    expect(flat).toMatch(/affiliate_id uuid not null references public\.affiliates\(id\) on delete cascade/i);
    expect(flat).toMatch(/kind text not null check \(kind in \('accepted', 'dropped', 'left'\)\)/i);
    expect(flat).toMatch(/status text not null check \(status in \('sent', 'failed'\)\)/i);
    expect(flat).toMatch(/alter table public\.affiliate_emails enable row level security/i);
    expect(sql).not.toMatch(/create policy/i);
    expect(flat).toMatch(/create index if not exists affiliate_emails_affiliate_idx/i);
  });
});

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

import { logAffiliateEmail, listAffiliateEmails, affiliatesWithFailedEmail, clearAffiliateEmails } from "@/lib/data/affiliate-emails";
import { sendAccepted, sendDropped, sendLeft } from "@/lib/affiliates/send";

beforeEach(() => {
  calls.length = 0;
  answers = {};
  brevo.send.mockReset();
});

describe("affiliate email data", () => {
  it("logs one row with the kind, address and result", async () => {
    answers.affiliate_emails = { error: null };
    expect(await logAffiliateEmail({ affiliateId: "a1", kind: "accepted", toEmail: "t@example.com", ok: false, error: "boom" })).toBe(true);
    const ins = calls.find((c) => c.op === "insert")!;
    expect(ins.args[0]).toMatchObject({ affiliate_id: "a1", kind: "accepted", to_email: "t@example.com", status: "failed", error: "boom" });
  });
  it("a sent email is stored as sent with no error", async () => {
    answers.affiliate_emails = { error: null };
    await logAffiliateEmail({ affiliateId: "a1", kind: "left", toEmail: "t@example.com", ok: true });
    expect(calls.find((c) => c.op === "insert")!.args[0]).toMatchObject({ status: "sent", error: null });
  });
  it("never throws when the log cannot be written", async () => {
    answers.affiliate_emails = { error: { message: "no table" } };
    expect(await logAffiliateEmail({ affiliateId: "a1", kind: "left", toEmail: "t@example.com", ok: true })).toBe(false);
  });
  it("lists the history newest first", async () => {
    answers.affiliate_emails = { data: [{ id: "e1", kind: "accepted", to_email: "t@example.com", status: "sent", error: null, created_at: "2026-11-08T00:00:00Z" }], error: null };
    const r = await listAffiliateEmails("a1");
    expect(r).toEqual([{ id: "e1", kind: "accepted", toEmail: "t@example.com", status: "sent", error: null, createdAt: "2026-11-08T00:00:00Z" }]);
    expect(calls.some((c) => c.op === "order")).toBe(true);
  });
  it("only an affiliate whose LATEST email failed is flagged", async () => {
    answers.affiliate_emails = {
      data: [
        { affiliate_id: "a1", status: "sent", created_at: "2026-11-08T02:00:00Z" },
        { affiliate_id: "a1", status: "failed", created_at: "2026-11-08T01:00:00Z" },
        { affiliate_id: "a2", status: "failed", created_at: "2026-11-08T01:00:00Z" },
      ],
      error: null,
    };
    expect(Array.from(await affiliatesWithFailedEmail())).toEqual(["a2"]);
  });
  it("gives an empty set when the history cannot be read", async () => {
    answers.affiliate_emails = { data: null, error: { message: "x" } };
    expect((await affiliatesWithFailedEmail()).size).toBe(0);
  });
});

describe("clearAffiliateEmails", () => {
  it("deletes one affiliate's rows and returns the count", async () => {
    answers.affiliate_emails = { error: null, count: 3 };
    expect(await clearAffiliateEmails({ affiliateId: "a1" })).toBe(3);
    expect(calls.find((c) => c.op === "eq")!.args).toEqual(["affiliate_id", "a1"]);
  });
  it("deletes by age with a cutoff in the past", async () => {
    answers.affiliate_emails = { error: null, count: 9 };
    expect(await clearAffiliateEmails({ olderThanDays: 90 })).toBe(9);
    const lt = calls.find((c) => c.op === "lt")!;
    expect(lt.args[0]).toBe("created_at");
    expect(new Date(lt.args[1] as string).getTime()).toBeLessThan(Date.now() - 89 * 86_400_000);
  });
  it("throws on a database error so the screen can say it failed", async () => {
    answers.affiliate_emails = { error: { message: "x" } };
    await expect(clearAffiliateEmails({ olderThanDays: 1 })).rejects.toBeTruthy();
  });
});

describe("sending logs every attempt", () => {
  const who = { id: "a1", name: "Test Person", email: "t@example.com" };
  it("logs sent and failed for each kind", async () => {
    answers.affiliate_emails = { error: null };
    brevo.send.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, error: "nope" }).mockRejectedValueOnce(new Error("down"));
    expect(await sendAccepted({ ...who, code: "TP1", team: null, token: "t" })).toBe(true);
    expect(await sendDropped(who)).toBe(false);
    expect(await sendLeft(who)).toBe(false);
    const rows = calls.filter((c) => c.op === "insert").map((c) => c.args[0] as Record<string, unknown>);
    expect(rows.map((r) => [r.kind, r.status])).toEqual([["accepted", "sent"], ["dropped", "failed"], ["left", "failed"]]);
    expect(rows[1].error).toBe("nope");
    expect(rows[2].error).toBe("down");
  });
});
