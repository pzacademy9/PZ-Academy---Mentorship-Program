import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Call = { table: string; op: "select" | "update" | "insert" | "delete"; payload?: unknown; filters: [string, unknown[]][]; head?: boolean };
const calls: Call[] = [];
let tables: Record<string, Record<string, unknown>[]> = {};

const resolveSegment = vi.fn(async () => ({ ok: true as const, contacts: [] }));
vi.mock("@/lib/data/admin-crm-segments", () => ({ resolveWhatsAppSegment: () => resolveSegment() }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: (table: string) => {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      const resolve = () => {
        if (call.op === "insert" || call.op === "delete") return { data: null, error: null, count: null };
        let out = tables[table] ?? [];
        for (const [name, args] of call.filters) {
          if (name === "in") out = out.filter((r) => (args[1] as unknown[]).includes(r[args[0] as string]));
          if (name === "eq") out = out.filter((r) => r[args[0] as string] === args[1]);
        }
        if (call.op === "update") return { data: out, error: null, count: null };
        return { data: call.head ? null : out, error: null, count: out.length };
      };
      const chain: Record<string, unknown> = new Proxy({}, {
        get: (_t, prop: string) => {
          if (prop === "then") return (res: (v: unknown) => unknown) => res(resolve());
          if (prop === "single" || prop === "maybeSingle") return async () => {
            const r = resolve();
            return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
          };
          return (...args: unknown[]) => {
            if (prop === "insert" || prop === "delete" || prop === "update") { call.op = prop; call.payload = args[0]; }
            else if (prop === "select") { if ((args[1] as { head?: boolean } | undefined)?.head) call.head = true; }
            else call.filters.push([prop, args]);
            return chain;
          };
        },
      });
      return chain;
    },
  }),
}));

import { listWhatsAppBatches, updateRecipientStatus, updateWhatsAppBatch, getWhatsAppBatchDetail } from "@/lib/data/admin-crm-whatsapp";
import { reconcileWhatsAppSegment } from "@/lib/crm/whatsapp-batch-reconcile";

const adminBatch = {
  id: "b-admin", name: "Admin batch", message_template: "Hi", recipient_count: 2, sent_count: 1,
  created_at: "2026-10-01T10:00:00Z", conversion_course_id: null, conversion_label_match: null, courses: null, segment: [],
};
const agentBatch = {
  ...adminBatch, id: "b-agent", name: "Agent campaign", owner_agent_id: "agent-1", status: "paused", paused_reason: "Daily limit reached",
};

beforeEach(() => {
  calls.length = 0;
  resolveSegment.mockClear();
  tables = {
    whatsapp_batches: [agentBatch, { ...adminBatch, owner_agent_id: null, status: "active", paused_reason: null }],
    profiles: [{ id: "agent-1", full_name: "Sara Agent" }],
    whatsapp_batch_recipients: [
      { id: "r-admin", batch_id: "b-admin", status: "pending", contact_id: "c1", full_name: "A", phone_e164: "+1", sent_at: null, contacts: { do_not_contact_at: null } },
      { id: "r-agent", batch_id: "b-agent", status: "skipped", contact_id: "c2", full_name: "B", phone_e164: "+2", sent_at: null, contacts: { do_not_contact_at: null } },
    ],
  };
});

describe("listWhatsAppBatches", () => {
  it("resolves the owner's name for agent campaigns and null for admin batches", async () => {
    const rows = await listWhatsAppBatches();
    const agent = rows.find((r) => r.id === "b-agent")!;
    const admin = rows.find((r) => r.id === "b-admin")!;
    expect(agent).toMatchObject({ ownerAgentId: "agent-1", ownerAgentName: "Sara Agent", status: "paused" });
    expect(admin).toMatchObject({ ownerAgentId: null, ownerAgentName: null });
  });

  it("admin batch rows without the new columns keep their existing fields (regression)", async () => {
    tables.whatsapp_batches = [adminBatch];
    const [row] = await listWhatsAppBatches();
    expect(row).toEqual({
      id: "b-admin", name: "Admin batch", messageTemplate: "Hi", recipientCount: 2, sentCount: 1,
      createdAt: "2026-10-01T10:00:00Z", conversionTag: { kind: "none" }, conversionCourseTitle: null, conversion: null,
      ownerAgentId: null, ownerAgentName: null, status: "active",
    });
    // no owners -> no profiles lookup
    expect(calls.some((c) => c.table === "profiles")).toBe(false);
  });
});

describe("getWhatsAppBatchDetail", () => {
  it("returns owner fields and paused reason for an agent campaign", async () => {
    const d = await getWhatsAppBatchDetail("b-agent");
    expect(d).toMatchObject({ ownerAgentId: "agent-1", ownerAgentName: "Sara Agent", status: "paused", pausedReason: "Daily limit reached" });
    expect(d!.recipients[0].status).toBe("skipped");
  });

  it("admin batch detail has null owner fields", async () => {
    const d = await getWhatsAppBatchDetail("b-admin");
    expect(d).toMatchObject({ ownerAgentId: null, ownerAgentName: null, pausedReason: null });
  });
});

describe("updateRecipientStatus", () => {
  it("refuses a recipient of an agent campaign and issues no update", async () => {
    const res = await updateRecipientStatus("b-agent", "r-agent", "sent", "admin-user");
    expect(res).toEqual({ ok: false, reason: "agent-campaign" });
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });

  it("still works for an admin batch exactly as before", async () => {
    const res = await updateRecipientStatus("b-admin", "r-admin", "sent", "admin-user");
    expect(res).toEqual({ ok: true });
    const recipientUpdate = calls.find((c) => c.table === "whatsapp_batch_recipients" && c.op === "update")!;
    expect(recipientUpdate.payload).toMatchObject({ status: "sent", sent_by: "admin-user" });
    const batchUpdate = calls.find((c) => c.table === "whatsapp_batches" && c.op === "update")!;
    expect(batchUpdate.payload).toHaveProperty("sent_count");
  });

  it("404s an unknown batch", async () => {
    expect(await updateRecipientStatus("nope", "r-admin", "sent", "u")).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("updateWhatsAppBatch", () => {
  it("refuses an agent campaign with no update and no recipient changes", async () => {
    const res = await updateWhatsAppBatch("b-agent", { name: "x", segment: [] });
    expect(res).toEqual({ ok: false, reason: "agent-campaign" });
    expect(calls.some((c) => c.op !== "select")).toBe(false);
    expect(calls.some((c) => c.table === "whatsapp_batch_recipients")).toBe(false);
    expect(resolveSegment).not.toHaveBeenCalled();
  });

  it("still updates an admin batch", async () => {
    const res = await updateWhatsAppBatch("b-admin", { name: "Renamed" });
    expect(res).toEqual({ ok: true });
    const upd = calls.find((c) => c.table === "whatsapp_batches" && c.op === "update")!;
    expect(upd.payload).toEqual({ name: "Renamed" });
  });
});

describe("reconcileWhatsAppSegment never treats skipped/blocked as deletable", () => {
  it("only pending recipients that fell out of the segment are deleted", () => {
    const { toDeleteIds } = reconcileWhatsAppSegment([], [
      { id: "p", contactId: "c1", status: "pending" },
      { id: "s", contactId: "c2", status: "skipped" },
      { id: "b", contactId: "c3", status: "blocked" },
      { id: "x", contactId: "c4", status: "sent" },
    ]);
    expect(toDeleteIds).toEqual(["p"]);
  });
});
