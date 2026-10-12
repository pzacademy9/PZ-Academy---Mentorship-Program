import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Call = { table: string; op: string; filters: string[]; payload?: unknown };
const calls: Call[] = [];
const events: string[] = [];
let gate: Promise<void> | null = null;
let contact: Record<string, unknown> | null = null;
let twoWay: unknown[] = [];
let nearRows: unknown[] = [];

const getNumberForAgent = vi.fn();
const getSafetySettings = vi.fn();
const getNumberUsage = vi.fn();
const logBlockedAttempt = vi.fn();
const evaluate = vi.fn();
const violation = vi.fn();

vi.mock("@/lib/data/sales-numbers", () => ({
  getNumberForAgent: (...a: unknown[]) => getNumberForAgent(...a),
  getSafetySettings: (...a: unknown[]) => getSafetySettings(...a),
  getNumberUsage: (...a: unknown[]) => getNumberUsage(...a),
  logBlockedAttempt: (...a: unknown[]) => logBlockedAttempt(...a),
  toNumberState: () => ({ status: "active", frozenUntil: null, warmupStartedOn: "2026-01-01", dailyCapOverride: null, hourlyCapOverride: null }),
}));

vi.mock("@/lib/crm/send-limits", async (orig) => {
  const real = await orig<typeof import("@/lib/crm/send-limits")>();
  return { ...real, evaluateSend: (a: unknown) => evaluate(a), violationAfterInsert: (a: unknown) => violation(a) };
});

function run(call: Call): Promise<{ data: unknown; error: null }> {
  calls.push(call);
  events.push(`start:${call.table}:${call.op}`);
  const out = () => {
    if (call.table === "contacts" && call.op === "select") return { data: contact, error: null };
    if (call.table === "contact_activities" && call.op === "select") {
      return { data: call.filters.includes("neq") ? nearRows : twoWay, error: null };
    }
    if (call.op === "insert") return { data: { id: "act1" }, error: null };
    return { data: null, error: null };
  };
  const p = gate ? gate.then(out) : Promise.resolve(out());
  return p.then((r) => {
    events.push(`end:${call.table}:${call.op}`);
    return r;
  });
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: (table: string) => {
      const call: Call = { table, op: "select", filters: [] };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "neq", "gt", "lt", "limit", "order"]) {
        chain[m] = () => {
          call.filters.push(m);
          return chain;
        };
      }
      chain.insert = (payload: unknown) => {
        call.op = "insert";
        call.payload = payload;
        return chain;
      };
      chain.update = (payload: unknown) => {
        call.op = "update";
        call.payload = payload;
        return chain;
      };
      chain.delete = () => {
        call.op = "delete";
        return chain;
      };
      chain.maybeSingle = () => run(call);
      chain.single = () => run(call);
      chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run(call).then(res, rej);
      return chain;
    },
  }),
}));

import { requestSend } from "@/lib/data/sales-send";

const NOW = new Date("2026-10-12T10:00:00Z");
const actor = { id: "agent", role: "sales_agent" as const };
const settings = { spacing_min_s: 20 };
const args = { actor, contactId: "c1", numberId: "n1", messageTemplate: "Hi {{first_name}}", now: NOW };
const goodContact = { id: "c1", full_name: "Ali Khan", phone_e164: "+923001234567", owner_id: "agent", do_not_contact_at: null, whatsapp_unsubscribed_at: null };
const usage = { newChatsToday: 0, newChatsLastHour: 0, hourWindowOldestAt: null, lastSend: null };
const sendOk = { ok: true, burstPos: 1, nextUnlockAt: new Date("2026-10-12T10:00:30Z"), warnings: [] };

beforeEach(() => {
  calls.length = 0;
  events.length = 0;
  gate = null;
  contact = { ...goodContact };
  twoWay = [];
  nearRows = [];
  getNumberForAgent.mockReset().mockResolvedValue({ id: "n1" });
  getSafetySettings.mockReset().mockResolvedValue(settings);
  getNumberUsage.mockReset().mockResolvedValue(usage);
  logBlockedAttempt.mockReset().mockResolvedValue(undefined);
  evaluate.mockReset().mockReturnValue(sendOk);
  violation.mockReset().mockReturnValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("requestSend refusal priority is unchanged when several conditions hold at once", () => {
  it("not-found beats everything", async () => {
    contact = null;
    getNumberForAgent.mockResolvedValue(null);
    expect(await requestSend(args)).toEqual({ ok: false, reason: "not-found" });
  });
  it("not-owner beats do-not-contact, no-phone and number-not-assigned", async () => {
    contact = { ...goodContact, owner_id: "someone", do_not_contact_at: "x", phone_e164: null };
    getNumberForAgent.mockResolvedValue(null);
    expect(await requestSend(args)).toEqual({ ok: false, reason: "not-owner" });
  });
  it("do-not-contact beats no-phone and number-not-assigned", async () => {
    contact = { ...goodContact, whatsapp_unsubscribed_at: "x", phone_e164: null };
    getNumberForAgent.mockResolvedValue(null);
    expect(await requestSend(args)).toEqual({ ok: false, reason: "do-not-contact" });
  });
  it("no-phone beats number-not-assigned", async () => {
    contact = { ...goodContact, phone_e164: null };
    getNumberForAgent.mockResolvedValue(null);
    expect(await requestSend(args)).toEqual({ ok: false, reason: "no-phone" });
  });
  it("number-not-assigned when only that holds", async () => {
    getNumberForAgent.mockResolvedValue(null);
    expect(await requestSend(args)).toEqual({ ok: false, reason: "number-not-assigned" });
  });
  it("a failing parallel lookup does not mask an earlier refusal, but is db-error when its decision is reached", async () => {
    getSafetySettings.mockRejectedValue(new Error("down"));
    contact = null;
    expect(await requestSend(args)).toEqual({ ok: false, reason: "not-found" });
    contact = { ...goodContact };
    getNumberForAgent.mockResolvedValue(null);
    expect(await requestSend(args)).toEqual({ ok: false, reason: "number-not-assigned" });
    getNumberForAgent.mockResolvedValue({ id: "n1" });
    expect(await requestSend(args)).toEqual({ ok: false, reason: "db-error" });
  });
});

describe("blocked sends", () => {
  it("a limit refusal writes no activity row and still logs the blocked attempt", async () => {
    evaluate.mockReturnValue({ ok: false, reason: "daily_cap", message: "m", retryAt: null });
    const res = await requestSend(args);
    expect(res).toMatchObject({ ok: false, reason: "daily_cap" });
    expect(calls.filter((c) => c.op !== "select")).toHaveLength(0);
    expect(logBlockedAttempt).toHaveBeenCalledWith(
      { numberId: "n1", agentId: "agent", contactId: "c1", reason: "daily_cap" },
      { now: NOW },
    );
  });
  it("a pre-insert refusal (not-owner) writes nothing", async () => {
    contact = { ...goodContact, owner_id: "other" };
    await requestSend(args);
    expect(calls.filter((c) => c.op !== "select")).toHaveLength(0);
  });
  it("a post-insert violation deletes the row, logs it, and does not move the follow-up", async () => {
    violation.mockReturnValue("spacing");
    const res = await requestSend(args);
    expect(res).toMatchObject({ ok: false, reason: "spacing" });
    expect(calls.map((c) => `${c.table}:${c.op}`)).toContain("contact_activities:delete");
    expect(calls.some((c) => c.table === "contacts" && c.op === "update")).toBe(false);
    expect(logBlockedAttempt).toHaveBeenCalledWith(expect.objectContaining({ reason: "spacing" }), { now: NOW });
  });
});

describe("requestSend issues independent lookups concurrently", () => {
  it("starts the contact, number, settings and two-way lookups before any resolves", async () => {
    let release!: () => void;
    gate = new Promise<void>((r) => {
      release = r;
    });
    const started: string[] = [];
    getNumberForAgent.mockImplementation(async () => {
      started.push("number");
      await gate;
      return { id: "n1" };
    });
    getSafetySettings.mockImplementation(async () => {
      started.push("settings");
      await gate;
      return settings;
    });
    const p = requestSend(args);
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toContain("start:contacts:select");
    expect(events).toContain("start:contact_activities:select");
    expect(started).toEqual(["number", "settings"]);
    expect(events.some((e) => e.startsWith("end:"))).toBe(false);
    release();
    expect(await p).toMatchObject({ ok: true });
  });

  it("starts the post-insert usage recount and the neighbouring-rows read together", async () => {
    let release!: () => void;
    const reverify = new Promise<void>((r) => {
      release = r;
    });
    let usageCalls = 0;
    getNumberUsage.mockImplementation(async () => {
      usageCalls += 1;
      if (usageCalls === 2) {
        events.push("start:usage2");
        await reverify;
        events.push("end:usage2");
      }
      return usage;
    });
    const p = requestSend(args);
    await vi.waitFor(() => expect(events).toContain("start:usage2"));
    await new Promise((r) => setTimeout(r, 0));
    // The near-rows query (a contact_activities select with neq) started while usage2 is still pending.
    expect(calls.some((c) => c.table === "contact_activities" && c.filters.includes("neq"))).toBe(true);
    expect(events).not.toContain("end:usage2");
    release();
    expect(await p).toMatchObject({ ok: true });
  });
});
