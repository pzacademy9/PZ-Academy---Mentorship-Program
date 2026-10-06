import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown[]][] };
const calls: Call[] = [];
let tables: Record<string, Record<string, unknown>[]> = {};
let failInsertOn: string | null = null;
let numberResult: unknown = { id: "n1" };

vi.mock("@/lib/data/sales-numbers", () => ({
  getNumberForAgent: vi.fn(async () => numberResult),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: (table: string) => {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      const resolve = () => {
        const rows = tables[table] ?? [];
        if (call.op === "insert") {
          if (failInsertOn === table) return { data: null, error: new Error("boom") };
          if (table === "whatsapp_batches") return { data: { id: "b-new" }, error: null };
          return { data: null, error: null };
        }
        if (call.op === "delete") return { data: null, error: null };
        let out = rows;
        for (const [name, args] of call.filters) {
          if (name === "in") out = out.filter((r) => (args[1] as unknown[]).includes(r[args[0] as string]));
          if (name === "eq") out = out.filter((r) => r[args[0] as string] === args[1]);
          if (name === "range") out = out.slice(args[0] as number, (args[1] as number) + 1);
        }
        return { data: out.slice(0, 1000), error: null }; // PostgREST row cap
      };
      const chain: Record<string, unknown> = new Proxy({}, {
        get: (_t, prop: string) => {
          if (prop === "then") return (res: (v: unknown) => unknown) => res(resolve());
          if (prop === "single") return async () => resolve();
          if (prop === "maybeSingle") return async () => {
            const r = resolve();
            return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
          };
          return (...args: unknown[]) => {
            if (prop === "insert" || prop === "delete") { call.op = prop; call.payload = args[0]; }
            else call.filters.push([prop, args]);
            return chain;
          };
        },
      });
      return chain;
    },
  }),
}));

import { createCampaign, getMyCampaign, listMyCampaigns, loadCampaignAudience } from "@/lib/data/sales-campaigns";
import { MAX_CAMPAIGN_RECIPIENTS } from "@/lib/crm/campaign-rules";

const actor = { id: "agent", role: "sales_agent" as const };
const contact = (id: string, over: Record<string, unknown> = {}) => ({
  id, full_name: `Name ${id}`, phone_e164: `+92300000${id.padStart(4, "0")}`, owner_id: "agent",
  do_not_contact_at: null, whatsapp_unsubscribed_at: null, last_outcome: null, ...over,
});
const inserts = (table: string) => calls.filter((c) => c.table === table && c.op === "insert");
const deletes = (table: string) => calls.filter((c) => c.table === table && c.op === "delete");
const base = { messageTemplate: "Hi {{first_name}}", numberId: "n1", followupInHours: 24 };

beforeEach(() => {
  calls.length = 0;
  tables = {};
  failInsertOn = null;
  numberResult = { id: "n1" };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createCampaign", () => {
  it("drops unowned, do-not-contact, unsubscribed, phone-less and duplicate ids; inserts only the clean contact", async () => {
    tables.contacts = [
      contact("1"),
      contact("2", { owner_id: "someone-else" }),
      contact("3", { do_not_contact_at: "2026-10-01T00:00:00Z" }),
      contact("4", { whatsapp_unsubscribed_at: "2026-10-01T00:00:00Z" }),
      contact("5", { phone_e164: null }),
    ];
    const res = await createCampaign(actor, { ...base, contactIds: ["1", "2", "3", "4", "5", "1"] });
    expect(res).toEqual({
      ok: true, campaignId: "b-new", recipientCount: 1,
      dropped: { notOwned: 1, doNotContact: 2, noPhone: 1, duplicates: 1 },
    });
    const batch = inserts("whatsapp_batches");
    expect(batch).toHaveLength(1);
    expect(batch[0].payload).toMatchObject({
      owner_agent_id: "agent", created_by: "agent", status: "active", number_id: "n1", followup_in_hours: 24,
      recipient_count: 1, message_template: "Hi {{first_name}}",
    });
    const rec = inserts("whatsapp_batch_recipients");
    expect(rec).toHaveLength(1);
    expect(rec[0].payload).toEqual([
      { batch_id: "b-new", contact_id: "1", full_name: "Name 1", phone_e164: "+923000000001" },
    ]);
  });

  it("blocks a name-less template for 4 contacts with no batch insert; allows it with {{first_name}}", async () => {
    tables.contacts = ["1", "2", "3", "4"].map((i) => contact(i));
    const ids = ["1", "2", "3", "4"];
    const blocked = await createCampaign(actor, { ...base, messageTemplate: "Hello there", contactIds: ids });
    expect(blocked).toEqual({ ok: false, reason: "variety" });
    expect(inserts("whatsapp_batches")).toHaveLength(0);
    const ok = await createCampaign(actor, { ...base, contactIds: ids });
    expect(ok.ok).toBe(true);
  });

  it("returns number-not-assigned and inserts nothing when the number is not the agent's", async () => {
    numberResult = null;
    tables.contacts = [contact("1")];
    const res = await createCampaign(actor, { ...base, contactIds: ["1"] });
    expect(res).toEqual({ ok: false, reason: "number-not-assigned" });
    expect(inserts("whatsapp_batches")).toHaveLength(0);
  });

  it("returns too-many above the cap and empty-audience when nothing is clean", async () => {
    const many = Array.from({ length: MAX_CAMPAIGN_RECIPIENTS + 1 }, (_, i) => `x${i}`);
    expect(await createCampaign(actor, { ...base, contactIds: many })).toEqual({ ok: false, reason: "too-many" });
    tables.contacts = [contact("1", { owner_id: "other" })];
    expect(await createCampaign(actor, { ...base, contactIds: ["1"] })).toEqual({ ok: false, reason: "empty-audience" });
    expect(inserts("whatsapp_batches")).toHaveLength(0);
  });

  it("deletes the batch and returns db-error when the recipient insert fails", async () => {
    tables.contacts = [contact("1")];
    failInsertOn = "whatsapp_batch_recipients";
    const res = await createCampaign(actor, { ...base, contactIds: ["1"] });
    expect(res).toEqual({ ok: false, reason: "db-error" });
    const del = deletes("whatsapp_batches");
    expect(del).toHaveLength(1);
    expect(del[0].filters).toContainEqual(["eq", ["id", "b-new"]]);
  });

  it("rejects non-sales roles", async () => {
    const res = await createCampaign({ id: "m", role: "mentor" } as never, { ...base, contactIds: ["1"] });
    expect(res).toEqual({ ok: false, reason: "not-allowed" });
  });
});

describe("getMyCampaign / listMyCampaigns", () => {
  const batch = (id: string, owner: string) => ({
    id, name: `C ${id}`, status: "active", recipient_count: 3, owner_agent_id: owner, message_template: "Hi",
    number_id: "n1", followup_in_hours: 24, paused_reason: null, created_at: "2026-10-06T00:00:00Z",
  });

  it("returns not-found (never not-allowed) for another agent's campaign", async () => {
    tables.whatsapp_batches = [batch("b1", "other")];
    expect(await getMyCampaign(actor, "b1")).toEqual({ ok: false, reason: "not-found" });
    expect(await getMyCampaign(actor, "missing")).toEqual({ ok: false, reason: "not-found" });
  });

  it("returns own campaign with recipients ordered by name and correct pendingCount", async () => {
    tables.whatsapp_batches = [batch("b1", "agent")];
    tables.whatsapp_batch_recipients = [
      { id: "r1", batch_id: "b1", contact_id: "c1", full_name: "Zed", phone_e164: "+1", status: "pending" },
      { id: "r2", batch_id: "b1", contact_id: "c2", full_name: "Amy", phone_e164: "+2", status: "sent" },
      { id: "r3", batch_id: "b1", contact_id: "c3", full_name: "Bob", phone_e164: "+3", status: "pending" },
    ];
    const res = await getMyCampaign(actor, "b1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const rc = calls.find((c) => c.table === "whatsapp_batch_recipients")!;
    expect(rc.filters).toContainEqual(["order", ["full_name", { ascending: true }]]);
    expect(res.campaign.pendingCount).toBe(2);
    expect(res.campaign.sentCount).toBe(1);
    expect(res.campaign.messageTemplate).toBe("Hi");
    expect(res.campaign.followupInHours).toBe(24);
    expect(res.campaign.recipients).toHaveLength(3);
  });

  it("lists only the actor's campaigns via owner_agent_id filter, with pending counts", async () => {
    tables.whatsapp_batches = [batch("b1", "agent"), batch("b2", "other")];
    tables.whatsapp_batch_recipients = [
      { id: "r1", batch_id: "b1", status: "pending" },
      { id: "r2", batch_id: "b1", status: "pending" },
    ];
    const res = await listMyCampaigns(actor);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const bc = calls.find((c) => c.table === "whatsapp_batches")!;
    expect(bc.filters).toContainEqual(["eq", ["owner_agent_id", "agent"]]);
    expect(res.campaigns.map((c) => c.id)).toEqual(["b1"]);
    expect(res.campaigns[0].pendingCount).toBe(2);
  });
});

describe("large campaigns beyond the 1000-row cap", () => {
  const big = (n: number, pendingEvery: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `r${String(i).padStart(4, "0")}`, batch_id: "b1", contact_id: `c${i}`, full_name: `N${String(i).padStart(4, "0")}`,
      phone_e164: "+1", status: i % pendingEvery === 0 ? "pending" : "sent",
    }));
  const batch = { id: "b1", name: "Big", status: "active", recipient_count: 2000, owner_agent_id: "agent", message_template: "Hi",
    number_id: "n1", followup_in_hours: 24, paused_reason: null, created_at: "2026-10-06T00:00:00Z" };

  it("getMyCampaign returns all 2000 recipients with correct counts", async () => {
    tables.whatsapp_batches = [batch];
    tables.whatsapp_batch_recipients = big(2000, 2);
    const res = await getMyCampaign(actor, "b1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.campaign.recipients).toHaveLength(2000);
    expect(res.campaign.pendingCount).toBe(1000);
    expect(res.campaign.sentCount).toBe(1000);
  });

  it("listMyCampaigns counts pending and sent correctly for 2000 recipients", async () => {
    tables.whatsapp_batches = [batch];
    tables.whatsapp_batch_recipients = big(2000, 4);
    const res = await listMyCampaigns(actor);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.campaigns[0].pendingCount).toBe(500);
    expect(res.campaigns[0].sentCount).toBe(1500);
  });
});

describe("loadCampaignAudience", () => {
  it("selects only own contacts, drops unsendable rows and attaches courses from the segment view", async () => {
    tables.contacts = [
      contact("1"),
      contact("2", { owner_id: "other" }),
      contact("3", { do_not_contact_at: "x" }),
      contact("4", { whatsapp_unsubscribed_at: "x" }),
      contact("5", { phone_e164: null }),
    ];
    tables.crm_contact_segment_source = [{ id: "1", product_labels: ["PPC - Individual USD 100", "PPC - Group USD 50"] }];
    const res = await loadCampaignAudience(actor);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const cc = calls.find((c) => c.table === "contacts")!;
    expect(cc.filters).toContainEqual(["eq", ["owner_id", "agent"]]);
    expect(res.rows.map((r) => r.id)).toEqual(["1"]);
    expect(res.truncated).toBe(false);
    expect(res.rows[0].courses).toEqual(["PPC"]);
    expect(calls.some((c) => c.table === "crm_contact_segment_source")).toBe(true);
  });
});
