import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Call = { table: string; op: string; payload?: unknown; filters: string[] };
const calls: Call[] = [];
let contact: { id: string; owner_id: string | null } | null = null;
let updateRows: { id: string }[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: (table: string) => {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      const resolve = () => {
        if (table === "contacts" && call.op === "select") return { data: contact, error: null };
        if (table === "contacts" && call.op === "update") return { data: updateRows, error: null };
        return { data: null, error: null };
      };
      const chain: Record<string, unknown> = new Proxy({}, {
        get: (_t, prop: string) => {
          if (prop === "then") return (res: (v: unknown) => unknown) => res(resolve());
          return (...args: unknown[]) => {
            if (prop === "update" || prop === "insert") { call.op = prop; call.payload = args[0]; }
            else if (prop === "eq") call.filters.push(`eq:${args[0]}=${args[1]}`);
            return chain;
          };
        },
      });
      return chain;
    },
  }),
}));

import { releaseOwnContact } from "@/lib/data/sales-assignment";

const agent = { id: "agent", role: "sales_agent" as const };
const updates = () => calls.filter((c) => c.table === "contacts" && c.op === "update");
const acts = () => calls.filter((c) => c.table === "contact_activities");

beforeEach(() => {
  calls.length = 0;
  contact = { id: "c1", owner_id: "agent" };
  updateRows = [{ id: "c1" }];
});

describe("releaseOwnContact behavior", () => {
  it("owner releases: clears ownership with an owner guard and logs one released event", async () => {
    const res = await releaseOwnContact(agent, "c1", new Date("2026-10-06T10:00:00.000Z"));
    expect(res).toEqual({ ok: true });
    expect(updates()).toHaveLength(1);
    expect(updates()[0].payload).toEqual({ owner_id: null, claimed_at: null, next_followup_at: null });
    expect(updates()[0].filters).toContain("eq:owner_id=agent");
    expect(acts()).toHaveLength(1);
    expect(acts()[0].payload).toMatchObject({ contact_id: "c1", agent_id: "agent", kind: "released" });
  });

  it("not the owner: refuses with no update", async () => {
    contact = { id: "c1", owner_id: "hina" };
    expect(await releaseOwnContact(agent, "c1")).toEqual({ ok: false, reason: "not-owner" });
    expect(updates()).toHaveLength(0);
    expect(acts()).toHaveLength(0);
  });

  it("an admin who does not own it is refused too", async () => {
    contact = { id: "c1", owner_id: "hina" };
    expect(await releaseOwnContact({ id: "boss", role: "admin" }, "c1")).toEqual({ ok: false, reason: "not-owner" });
    expect(updates()).toHaveLength(0);
  });

  it("missing contact: not-found", async () => {
    contact = null;
    expect(await releaseOwnContact(agent, "nope")).toEqual({ ok: false, reason: "not-found" });
    expect(updates()).toHaveLength(0);
  });

  it("update hits zero rows (lost a race): not-owner and no activity", async () => {
    updateRows = [];
    expect(await releaseOwnContact(agent, "c1")).toEqual({ ok: false, reason: "not-owner" });
    expect(acts()).toHaveLength(0);
  });
});
