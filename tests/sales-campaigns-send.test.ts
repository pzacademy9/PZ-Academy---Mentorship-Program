import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
type Call = { table: string; op: string; payload?: Row; filters: [string, unknown[]][] };
const calls: Call[] = [];
const log: string[] = [];
let tables: Record<string, Row[]> = {};
let failUpdate: ((c: Call) => boolean) | null = null;

const requestSendMock = vi.fn();
vi.mock("@/lib/data/sales-send", () => ({
  requestSend: (...a: unknown[]) => {
    log.push("requestSend");
    return requestSendMock(...a);
  },
}));
vi.mock("@/lib/data/sales-numbers", () => ({ getNumberForAgent: vi.fn(async () => ({ id: "n1" })) }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: (table: string) => {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      let wantsRows = false;
      let head = false;
      const matching = () => {
        let out = tables[table] ?? [];
        for (const [name, args] of call.filters) {
          if (name === "in") out = out.filter((r) => (args[1] as unknown[]).includes(r[args[0] as string]));
          if (name === "eq") out = out.filter((r) => r[args[0] as string] === args[1]);
          if (name === "neq") out = out.filter((r) => r[args[0] as string] !== args[1]);
        }
        return out;
      };
      const resolve = (): { data: unknown; error: unknown; count?: number } => {
        if (call.op === "update") {
          if (failUpdate?.(call)) return { data: null, error: new Error("boom") };
          const hit = matching();
          for (const r of hit) Object.assign(r, call.payload);
          log.push(`update:${table}:${String(call.payload?.status ?? "-")}`);
          return { data: wantsRows ? hit.map((r) => ({ ...r })) : null, error: null };
        }
        const hit = matching();
        if (head) return { data: null, error: null, count: hit.length };
        return { data: hit.slice(0, 1000), error: null };
      };
      const chain: Record<string, unknown> = new Proxy({}, {
        get: (_t, prop: string) => {
          if (prop === "then") return (res: (v: unknown) => unknown) => res(resolve());
          if (prop === "maybeSingle")
            return async () => {
              const r = resolve();
              return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
            };
          return (...args: unknown[]) => {
            if (prop === "update") { call.op = "update"; call.payload = args[0] as Row; }
            else if (prop === "select") {
              if (call.op === "update") wantsRows = true;
              const opts = args[1] as { head?: boolean } | undefined;
              if (opts?.head) head = true;
              call.filters.push([prop, args]);
            } else call.filters.push([prop, args]);
            return chain;
          };
        },
      });
      return chain;
    },
  }),
}));

import { sendCampaignRecipient, setCampaignStatus, skipCampaignRecipient } from "@/lib/data/sales-campaigns";
import { DEFAULT_FOLLOWUP_HOURS } from "@/lib/crm/followup";

const actor = { id: "agent", role: "sales_agent" as const };
const NOW = new Date("2026-10-06T10:00:00Z");
const budget = { newChatsToday: 1 } as never;
const okSend = { ok: true, link: "https://wa.me/1", nextUnlockAt: "2026-10-06T10:01:00Z", warnings: [], isNewChat: true, budget };

const batch = (over: Row = {}): Row => ({
  id: "b1", status: "active", owner_agent_id: "agent", number_id: "n1", message_template: "Hi {{first_name}}",
  followup_in_hours: 48, recipient_count: 2, sent_count: 0, paused_reason: null, ...over,
});
const rec = (id: string, over: Row = {}): Row => ({
  id, batch_id: "b1", contact_id: `c-${id}`, status: "pending", sent_at: null, sent_by: null, ...over,
});
const recipient = (id: string) => tables.whatsapp_batch_recipients.find((r) => r.id === id)!;
const batchRow = () => tables.whatsapp_batches[0];

beforeEach(() => {
  calls.length = 0;
  log.length = 0;
  failUpdate = null;
  requestSendMock.mockReset();
  tables = { whatsapp_batches: [batch()], whatsapp_batch_recipients: [rec("r1"), rec("r2")] };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sendCampaignRecipient", () => {
  it("reserves pending -> sent BEFORE requestSend, recounts and returns the link", async () => {
    requestSendMock.mockResolvedValue(okSend);
    const res = await sendCampaignRecipient(actor, "b1", "r1", NOW);
    expect(res).toMatchObject({ ok: true, link: "https://wa.me/1", sentCount: 1, pendingCount: 1, done: false });
    expect(log.indexOf("update:whatsapp_batch_recipients:sent")).toBeGreaterThanOrEqual(0);
    expect(log.indexOf("update:whatsapp_batch_recipients:sent")).toBeLessThan(log.indexOf("requestSend"));
    expect(recipient("r1")).toMatchObject({ status: "sent", sent_by: "agent", sent_at: NOW.toISOString() });
    expect(batchRow().sent_count).toBe(1);
    expect(batchRow().status).toBe("active");
  });

  it("double tap: the second call gets already-handled and requestSend ran once", async () => {
    requestSendMock.mockResolvedValue(okSend);
    const a = await sendCampaignRecipient(actor, "b1", "r1", NOW);
    const b = await sendCampaignRecipient(actor, "b1", "r1", NOW);
    expect(a.ok).toBe(true);
    expect(b).toEqual({ ok: false, reason: "already-handled" });
    expect(requestSendMock).toHaveBeenCalledTimes(1);
  });

  it("quiet_hours pauses: recipient back to pending, campaign paused with the message, ok:false paused:true", async () => {
    requestSendMock.mockResolvedValue({ ok: false, reason: "quiet_hours", message: "Back at 9am.", retryAt: "2026-10-07T04:00:00Z" });
    const res = await sendCampaignRecipient(actor, "b1", "r1", NOW);
    expect(res).toMatchObject({ ok: false, reason: "quiet_hours", paused: true, retryAt: "2026-10-07T04:00:00Z", pendingCount: 2 });
    expect(recipient("r1")).toMatchObject({ status: "pending", sent_at: null, sent_by: null });
    expect(batchRow()).toMatchObject({ status: "paused", paused_reason: "Back at 9am." });
  });

  it("daily_cap pauses; resuming then sending sends the SAME recipient and clears paused_reason", async () => {
    requestSendMock.mockResolvedValueOnce({ ok: false, reason: "daily_cap", message: "Today's new chats are used up." });
    const first = await sendCampaignRecipient(actor, "b1", "r1", NOW);
    expect(first).toMatchObject({ ok: false, paused: true });
    expect(batchRow().status).toBe("paused");
    expect(recipient("r1").status).toBe("pending");

    expect(await setCampaignStatus(actor, "b1", "active")).toEqual({ ok: true, status: "active" });
    expect(batchRow()).toMatchObject({ status: "active", paused_reason: null });

    requestSendMock.mockResolvedValueOnce(okSend);
    const second = await sendCampaignRecipient(actor, "b1", "r1", NOW);
    expect(second).toMatchObject({ ok: true, sentCount: 1, pendingCount: 1 });
    expect(recipient("r1").status).toBe("sent");
    expect(recipient("r2").status).toBe("pending");
    expect(requestSendMock).toHaveBeenCalledTimes(2);
    expect(batchRow().paused_reason).toBeNull();
  });

  it("a successful send from a paused campaign resumes it and clears paused_reason", async () => {
    batchRow().status = "paused";
    batchRow().paused_reason = "Messaging is paused overnight.";
    requestSendMock.mockResolvedValue(okSend);
    const res = await sendCampaignRecipient(actor, "b1", "r1", NOW);
    expect(res.ok).toBe(true);
    expect(batchRow()).toMatchObject({ status: "active", paused_reason: null });
  });

  it("spacing (retry): recipient back to pending, campaign status unchanged, retryAt passed through", async () => {
    requestSendMock.mockResolvedValue({ ok: false, reason: "spacing", message: "Wait a moment.", retryAt: "2026-10-06T10:00:30Z" });
    const res = await sendCampaignRecipient(actor, "b1", "r1", NOW);
    expect(res).toMatchObject({ ok: false, reason: "spacing", retryAt: "2026-10-06T10:00:30Z", pendingCount: 2 });
    expect((res as { paused?: boolean }).paused).toBeUndefined();
    expect(recipient("r1")).toMatchObject({ status: "pending", sent_at: null, sent_by: null });
    expect(batchRow()).toMatchObject({ status: "active", paused_reason: null });
  });

  it.each(["do-not-contact", "not-owner"])("%s blocks the recipient without pausing the campaign", async (reason) => {
    requestSendMock.mockResolvedValue({ ok: false, reason });
    const res = await sendCampaignRecipient(actor, "b1", "r1", NOW);
    expect(res).toMatchObject({ ok: false, reason, recipientBlocked: true, pendingCount: 1 });
    expect((res as { link?: string }).link).toBeUndefined();
    expect(recipient("r1")).toMatchObject({ status: "blocked", sent_at: null, sent_by: null });
    expect(batchRow().status).toBe("active");
  });

  it("a deleted contact (null contact_id) is blocked without calling requestSend", async () => {
    recipient("r1").contact_id = null;
    const res = await sendCampaignRecipient(actor, "b1", "r1", NOW);
    expect(res).toMatchObject({ ok: false, reason: "not-found", recipientBlocked: true, pendingCount: 1 });
    expect(requestSendMock).not.toHaveBeenCalled();
    expect(recipient("r1").status).toBe("blocked");
  });

  it("sending the last pending recipient marks the campaign done; a further send is campaign-done", async () => {
    tables.whatsapp_batch_recipients = [rec("r1"), rec("r2", { status: "sent", sent_by: "agent" })];
    requestSendMock.mockResolvedValue(okSend);
    const res = await sendCampaignRecipient(actor, "b1", "r1", NOW);
    expect(res).toMatchObject({ ok: true, done: true, pendingCount: 0, sentCount: 2 });
    expect(batchRow().status).toBe("done");
    expect(await sendCampaignRecipient(actor, "b1", "r2", NOW)).toEqual({ ok: false, reason: "campaign-done" });
    expect(requestSendMock).toHaveBeenCalledTimes(1);
  });

  it("counts correctly beyond the 1000-row cap", async () => {
    tables.whatsapp_batch_recipients = Array.from({ length: 2500 }, (_, i) => rec(`r${i}`));
    batchRow().recipient_count = 2500;
    requestSendMock.mockResolvedValue(okSend);
    const res = await sendCampaignRecipient(actor, "b1", "r0", NOW);
    expect(res).toMatchObject({ ok: true, sentCount: 1, pendingCount: 2499, done: false });
  });

  it("another agent's campaign is not-found with no writes", async () => {
    batchRow().owner_agent_id = "someone-else";
    expect(await sendCampaignRecipient(actor, "b1", "r1", NOW)).toEqual({ ok: false, reason: "not-found" });
    expect(await skipCampaignRecipient(actor, "b1", "r1")).toEqual({ ok: false, reason: "not-found" });
    expect(await setCampaignStatus(actor, "b1", "paused")).toEqual({ ok: false, reason: "not-found" });
    expect(await sendCampaignRecipient(actor, "missing", "r1", NOW)).toEqual({ ok: false, reason: "not-found" });
    expect(calls.filter((c) => c.op !== "select")).toHaveLength(0);
    expect(requestSendMock).not.toHaveBeenCalled();
  });

  it("an unknown recipient id is not-found; non-sales roles are not-allowed", async () => {
    expect(await sendCampaignRecipient(actor, "b1", "nope", NOW)).toEqual({ ok: false, reason: "not-found" });
    expect(await sendCampaignRecipient({ id: "m", role: "mentor" } as never, "b1", "r1", NOW)).toEqual({ ok: false, reason: "not-allowed" });
    expect(requestSendMock).not.toHaveBeenCalled();
  });

  it("a campaign with no number pauses with number-not-assigned and sends nothing", async () => {
    batchRow().number_id = null;
    const res = await sendCampaignRecipient(actor, "b1", "r1", NOW);
    expect(res).toMatchObject({ ok: false, reason: "number-not-assigned", paused: true });
    expect(requestSendMock).not.toHaveBeenCalled();
    expect(recipient("r1").status).toBe("pending");
    expect(batchRow()).toMatchObject({ status: "paused", paused_reason: "No WhatsApp number is assigned to you." });
  });

  it("passes the campaign's number, template and follow-up hours to requestSend (default when null)", async () => {
    requestSendMock.mockResolvedValue(okSend);
    await sendCampaignRecipient(actor, "b1", "r1", NOW);
    expect(requestSendMock).toHaveBeenLastCalledWith({
      actor, contactId: "c-r1", numberId: "n1", messageTemplate: "Hi {{first_name}}", followupInHours: 48, now: NOW,
    });
    batchRow().followup_in_hours = null;
    await sendCampaignRecipient(actor, "b1", "r2", NOW);
    expect(requestSendMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ contactId: "c-r2", followupInHours: DEFAULT_FOLLOWUP_HOURS }),
    );
  });

  it("returns db-error (does not throw) when the revert fails", async () => {
    requestSendMock.mockResolvedValue({ ok: false, reason: "spacing", message: "wait" });
    failUpdate = (c) => c.table === "whatsapp_batch_recipients" && c.payload?.status === "pending";
    await expect(sendCampaignRecipient(actor, "b1", "r1", NOW)).resolves.toEqual({ ok: false, reason: "db-error" });
  });

  it("two tabs on the last two recipients: a refusal reverting the second reopens a campaign the first marked done", async () => {
    requestSendMock.mockImplementationOnce(async () => {
      // Tab A runs entirely while tab B (r2, already reserved) is inside requestSend.
      requestSendMock.mockResolvedValueOnce(okSend);
      const a = await sendCampaignRecipient(actor, "b1", "r1", NOW);
      expect(a).toMatchObject({ ok: true, done: true });
      return { ok: false, reason: "spacing", message: "wait" };
    });
    // r1 is the only other pending one; reserve r2 first via tab B.
    const b = await sendCampaignRecipient(actor, "b1", "r2", NOW);
    expect(b).toMatchObject({ ok: false, reason: "spacing", pendingCount: 1 });
    expect(recipient("r2").status).toBe("pending");
    expect(batchRow().status).toBe("active");
    requestSendMock.mockResolvedValueOnce(okSend);
    const again = await sendCampaignRecipient(actor, "b1", "r2", NOW);
    expect(again).toMatchObject({ ok: true, done: true });
  });

  it("returns db-error when requestSend itself throws", async () => {
    requestSendMock.mockRejectedValue(new Error("kaboom"));
    await expect(sendCampaignRecipient(actor, "b1", "r1", NOW)).resolves.toEqual({ ok: false, reason: "db-error" });
  });
});

describe("skipCampaignRecipient", () => {
  it("marks pending skipped, never touches a sent recipient, and flips done on the last pending", async () => {
    tables.whatsapp_batch_recipients = [rec("r1"), rec("r2", { status: "sent", sent_by: "agent" })];
    expect(await skipCampaignRecipient(actor, "b1", "r2")).toEqual({ ok: false, reason: "already-handled" });
    expect(recipient("r2").status).toBe("sent");
    expect(await skipCampaignRecipient(actor, "b1", "r1")).toEqual({ ok: true, pendingCount: 0, done: true });
    expect(recipient("r1").status).toBe("skipped");
    expect(batchRow().status).toBe("done");
  });

  it("skipping one of two leaves the campaign active", async () => {
    expect(await skipCampaignRecipient(actor, "b1", "r1")).toEqual({ ok: true, pendingCount: 1, done: false });
    expect(batchRow().status).toBe("active");
  });
});

describe("setCampaignStatus", () => {
  it("pauses with 'Paused by you' and refuses on a done campaign", async () => {
    expect(await setCampaignStatus(actor, "b1", "paused")).toEqual({ ok: true, status: "paused" });
    expect(batchRow()).toMatchObject({ status: "paused", paused_reason: "Paused by you" });
    batchRow().status = "done";
    expect(await setCampaignStatus(actor, "b1", "active")).toEqual({ ok: false, reason: "campaign-done" });
    expect(batchRow().status).toBe("done");
  });

  it("does not overwrite a campaign that became done after it was loaded (guarded update)", async () => {
    const rows = tables.whatsapp_batches;
    // Simulate the race: the campaign flips to done between the owner check and the update.
    const real = rows[0];
    let reads = 0;
    Object.defineProperty(real, "status", {
      configurable: true, enumerable: true,
      get: () => (reads++ < 1 ? "active" : "done"), set: () => {},
    });
    expect(await setCampaignStatus(actor, "b1", "paused")).toEqual({ ok: false, reason: "campaign-done" });
  });
});
