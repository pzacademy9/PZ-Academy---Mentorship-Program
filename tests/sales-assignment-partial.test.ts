import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Call = { table: string; op: string; payload?: unknown };
const calls: Call[] = [];
let contactUpdates = 0;
let failOnUpdate = 0; // 1-based index of the contacts update that errors, 0 = never

const CONTACTS = Array.from({ length: 250 }, (_, i) => ({ id: `c${i}`, owner_id: null, do_not_contact_at: null }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: (table: string) => {
      const call: Call = { table, op: "select" };
      calls.push(call);
      let sliceIds: string[] = [];
      const resolve = () => {
        if (table === "profiles") return { data: { id: "agent", role: "sales_agent", full_name: "Ayesha" }, error: null };
        if (table === "contacts" && call.op === "select") {
          return { data: CONTACTS.filter((c) => sliceIds.includes(c.id)), error: null };
        }
        if (table === "contacts" && call.op === "update") {
          contactUpdates += 1;
          if (contactUpdates === failOnUpdate) return { data: null, error: new Error("boom") };
          return { data: sliceIds.map((id) => ({ id })), error: null };
        }
        return { data: null, error: null };
      };
      const chain: Record<string, unknown> = new Proxy({}, {
        get: (_t, prop: string) => {
          if (prop === "then") return (res: (v: unknown) => unknown) => res(resolve());
          return (...args: unknown[]) => {
            if (prop === "update" || prop === "insert") { call.op = prop; call.payload = args[0]; }
            else if (prop === "in") sliceIds = args[1] as string[];
            return chain;
          };
        },
      });
      return chain;
    },
  }),
}));

import { commitAssignment } from "@/lib/data/sales-assignment";

const admin = { id: "boss", role: "admin" as const };
const source = { kind: "contacts" as const, contactIds: CONTACTS.map((c) => c.id) };

beforeEach(() => {
  calls.length = 0;
  contactUpdates = 0;
  failOnUpdate = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const notifications = () => calls.filter((c) => c.table === "notifications");

describe("commitAssignment partial failure", () => {
  it("second chunk failing returns partial counts and sends one notification", async () => {
    failOnUpdate = 2;
    const res = await commitAssignment(admin, source, "agent", false);
    expect(res).toEqual({ ok: false, reason: "db-error", partial: { assigned: 200, reassigned: 0 } });
    expect(notifications()).toHaveLength(1);
    expect((notifications()[0].payload as { body: string }).body).toBe("200 contacts were assigned to you.");
  });

  it("first chunk failing assigns nothing and sends no notification", async () => {
    failOnUpdate = 1;
    const res = await commitAssignment(admin, source, "agent", false);
    expect(res).toEqual({ ok: false, reason: "db-error" });
    expect(notifications()).toHaveLength(0);
  });

  it("singular body for one contact", async () => {
    const res = await commitAssignment(admin, { kind: "contacts", contactIds: ["c0"] }, "agent", false);
    expect(res).toEqual({ ok: true, result: { assigned: 1, reassigned: 0 } });
    expect((notifications()[0].payload as { body: string }).body).toBe("1 contact was assigned to you.");
  });
});
