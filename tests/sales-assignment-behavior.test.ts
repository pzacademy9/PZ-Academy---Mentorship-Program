import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Call = { table: string; op: string; payload?: unknown; filters: string[] };
const calls: Call[] = [];
let notifyError: unknown = null;

const CONTACTS = [
  { id: "free1", owner_id: null, do_not_contact_at: null },
  { id: "free2", owner_id: null, do_not_contact_at: null },
  { id: "mine", owner_id: "agent", do_not_contact_at: null },
  { id: "other", owner_id: "hina", do_not_contact_at: null },
  { id: "dnc", owner_id: null, do_not_contact_at: "2026-10-01T00:00:00.000Z" },
];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: (table: string) => {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      const resolve = () => {
        if (table === "profiles") return { data: { id: "agent", role: "sales_agent", full_name: "Ayesha" }, error: null };
        if (table === "contacts" && call.op === "select") return { data: CONTACTS, error: null };
        if (table === "contacts" && call.op === "update") {
          const ids = CONTACTS.filter((c) => c.owner_id === null && !c.do_not_contact_at).map((c) => ({ id: c.id }));
          return { data: call.filters.includes("is:owner_id") ? ids : [{ id: "other" }, ...ids], error: null };
        }
        if (table === "notifications") return { data: null, error: notifyError };
        return { data: null, error: null };
      };
      const chain: Record<string, unknown> = new Proxy({}, {
        get: (_t, prop: string) => {
          if (prop === "then") return (res: (v: unknown) => unknown) => res(resolve());
          return (...args: unknown[]) => {
            if (prop === "update" || prop === "insert") { call.op = prop; call.payload = args[0]; }
            else if (prop === "is") call.filters.push(`is:${args[0]}`);
            return chain;
          };
        },
      });
      return chain;
    },
  }),
}));

import { previewAssignment, commitAssignment } from "@/lib/data/sales-assignment";

const admin = { id: "boss", role: "admin" as const };
const source = { kind: "contacts" as const, contactIds: CONTACTS.map((c) => c.id) };

beforeEach(() => {
  calls.length = 0;
  notifyError = null;
});

describe("assignment behavior", () => {
  it("refuses non-admins before touching the database", async () => {
    const res = await commitAssignment({ id: "x", role: "sales_agent" }, source, "agent", false);
    expect(res).toEqual({ ok: false, reason: "not-allowed" });
    expect(calls).toHaveLength(0);
  });

  it("previews the plan counts", async () => {
    const res = await previewAssignment(admin, source, "agent", false);
    expect(res).toEqual({
      ok: true,
      preview: {
        counts: { toAssign: 2, alreadyYours: 1, skippedOwned: 1, skippedDnc: 1, reassigning: 0, total: 5 },
        agentName: "Ayesha",
      },
    });
  });

  it("commit assigns only the planned contacts, logs events and notifies once", async () => {
    const res = await commitAssignment(admin, source, "agent", false, new Date("2026-10-06T10:00:00.000Z"));
    expect(res).toEqual({ ok: true, result: { assigned: 2, reassigned: 0 } });
    const update = calls.find((c) => c.table === "contacts" && c.op === "update")!;
    expect(update.filters).toContain("is:owner_id");
    const acts = calls.find((c) => c.table === "contact_activities")!.payload as { agent_id: string; kind: string }[];
    expect(acts).toHaveLength(2);
    expect(acts.every((a) => a.agent_id === "boss" && a.kind === "claimed")).toBe(true);
    expect(calls.filter((c) => c.table === "notifications")).toHaveLength(1);
  });

  it("reassign mode drops the owner guard, moves other-owned contacts and labels events", async () => {
    const res = await commitAssignment(admin, source, "agent", true);
    expect(res).toEqual({ ok: true, result: { assigned: 3, reassigned: 1 } });
    const update = calls.find((c) => c.table === "contacts" && c.op === "update")!;
    expect(update.filters).not.toContain("is:owner_id");
    expect(update.filters).toContain("is:do_not_contact_at");
    const acts = calls.find((c) => c.table === "contact_activities")!.payload as { contact_id: string; kind: string }[];
    expect(Object.fromEntries(acts.map((a) => [a.contact_id, a.kind]))).toEqual({
      other: "reassigned",
      free1: "claimed",
      free2: "claimed",
    });
  });

  it("a notification failure does not fail the commit", async () => {
    notifyError = new Error("boom");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await commitAssignment(admin, source, "agent", false);
    expect(res.ok).toBe(true);
    spy.mockRestore();
  });
});
