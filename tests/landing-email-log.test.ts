import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseMock, filterValue, memoryHandler, type Op, type Res } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { claimEmail, releaseEmail, listEmailLog, markEmailSent, logPortalLink, sweepStaleClaims } from "@/lib/data/landing-email-log";

/** In-memory table that enforces the partial unique index (registration_id, kind) on status kinds like Postgres. */
function pkHandler(store: Record<string, Record<string, unknown>[]>) {
  const inner = memoryHandler(store);
  return (op: Op): Res => {
    if (op.op === "insert") {
      const p = op.payload as Record<string, unknown>;
      const guarded = ["paid", "underpaid", "reserved"].includes(p.kind as string);
      const dup = guarded && (store[op.table] ?? []).some((r) => r.registration_id === p.registration_id && r.kind === p.kind);
      if (dup) return { data: null, error: { code: "23505" } };
    }
    return inner(op);
  };
}

beforeEach(() => db.reset());

describe("claimEmail", () => {
  it("returns true on the first claim and false on a duplicate", async () => {
    db.state.handler = pkHandler({});
    expect(await claimEmail("reg-1", "paid", "a@x.com")).toBe(true);
    expect(await claimEmail("reg-1", "paid", "a@x.com")).toBe(false);
    expect(db.find("landing_email_log", "insert")[0].payload).toEqual({ registration_id: "reg-1", kind: "paid", to_email: "a@x.com", state: "claimed" });
  });
  it("a different kind is a separate claim", async () => {
    db.state.handler = pkHandler({});
    expect(await claimEmail("reg-1", "paid", "a@x.com")).toBe(true);
    expect(await claimEmail("reg-1", "portal_link", "a@x.com")).toBe(true);
  });
  it("throws on any other error", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    await expect(claimEmail("reg-1", "paid", "a@x.com")).rejects.toBeTruthy();
  });
});

describe("markEmailSent", () => {
  it("moves the claimed row to sent with a timestamp", async () => {
    const store: Record<string, Record<string, unknown>[]> = {};
    db.state.handler = pkHandler(store);
    await claimEmail("reg-1", "paid", "a@x.com");
    await markEmailSent("reg-1", "paid");
    expect(store.landing_email_log[0]).toMatchObject({ state: "sent" });
    expect(typeof store.landing_email_log[0].sent_at).toBe("string");
    const up = db.find("landing_email_log", "update")[0];
    expect(filterValue(up, "eq", "state")).toBe("claimed");
  });
  it("throws when the update fails", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    await expect(markEmailSent("reg-1", "paid")).rejects.toBeTruthy();
  });
});

describe("logPortalLink", () => {
  it("inserts a sent row each time with no guard", async () => {
    const store: Record<string, Record<string, unknown>[]> = {};
    db.state.handler = pkHandler(store);
    await logPortalLink("reg-1", "a@x.com");
    await logPortalLink("reg-1", "a@x.com");
    expect(store.landing_email_log).toHaveLength(2);
    expect(store.landing_email_log[0]).toMatchObject({ kind: "portal_link", state: "sent", to_email: "a@x.com" });
  });
});

describe("releaseEmail", () => {
  it("deletes the row so the next claim succeeds", async () => {
    db.state.handler = pkHandler({});
    await claimEmail("reg-1", "paid", "a@x.com");
    await releaseEmail("reg-1", "paid");
    const del = db.find("landing_email_log", "delete")[0];
    expect(filterValue(del, "eq", "registration_id")).toBe("reg-1");
    expect(filterValue(del, "eq", "kind")).toBe("paid");
    expect(filterValue(del, "eq", "state")).toBe("claimed");
    expect(await claimEmail("reg-1", "paid", "a@x.com")).toBe(true);
  });
  it("never deletes sent history", async () => {
    const store: Record<string, Record<string, unknown>[]> = {};
    db.state.handler = pkHandler(store);
    await logPortalLink("reg-1", "a@x.com");
    await releaseEmail("reg-1", "portal_link");
    expect(store.landing_email_log).toHaveLength(1);
  });
  it("throws when the delete fails", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    await expect(releaseEmail("reg-1", "paid")).rejects.toBeTruthy();
  });
});

describe("sweepStaleClaims", () => {
  const NOW = new Date("2026-10-20T10:00:00.000Z");
  const ago = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
  const row = (id: string, over: Record<string, unknown> = {}) => ({ id, registration_id: `reg-${id}`, kind: "paid", to_email: "a@x.com", state: "claimed", claimed_at: ago(1), ...over });
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });
  afterEach(() => vi.useRealTimers());

  it("releases a claim 16 minutes old and reports its registration; leaves a 2 minute old claim", async () => {
    const store = { landing_email_log: [row("old", { claimed_at: ago(16) }), row("fresh", { claimed_at: ago(2) })] };
    db.state.handler = memoryHandler(store);
    expect(await sweepStaleClaims()).toEqual({ released: 1, registrationIds: ["reg-old"] });
    expect(store.landing_email_log.map((r) => r.id)).toEqual(["fresh"]);
  });
  it("never touches a sent row, however old", async () => {
    const store = { landing_email_log: [row("s1", { state: "sent", claimed_at: ago(60 * 24) })] };
    db.state.handler = memoryHandler(store);
    expect(await sweepStaleClaims()).toEqual({ released: 0, registrationIds: [] });
    expect(store.landing_email_log).toHaveLength(1);
  });
  it("does not delete a row that became sent between the select and the delete", async () => {
    const store = { landing_email_log: [row("race", { claimed_at: ago(20) })] };
    const inner = memoryHandler(store);
    db.state.handler = (op) => {
      const res = inner(op);
      if (op.op === "select") store.landing_email_log[0].state = "sent"; // markEmailSent lands after the select
      return res;
    };
    expect(await sweepStaleClaims()).toEqual({ released: 0, registrationIds: [] });
    expect(store.landing_email_log).toHaveLength(1);
    const del = db.find("landing_email_log", "delete")[0];
    expect(filterValue(del, "eq", "state")).toBe("claimed");
    expect(filterValue(del, "in", "id")).toEqual(["race"]);
  });
  it("honours a custom cutoff", async () => {
    const store = { landing_email_log: [row("a", { claimed_at: ago(6) })] };
    db.state.handler = memoryHandler(store);
    expect((await sweepStaleClaims(5)).released).toBe(1);
  });
  it("throws when the lookup fails", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    await expect(sweepStaleClaims()).rejects.toBeTruthy();
  });
});

describe("listEmailLog", () => {
  it("maps rows to camelCase", async () => {
    db.state.handler = (op) => {
      expect(filterValue(op, "in", "registration_id")).toEqual(["reg-1", "reg-2"]);
      expect(filterValue(op, "eq", "state")).toBe("sent");
      return { data: [{ registration_id: "reg-1", kind: "paid", to_email: "a@x.com", sent_at: "2026-10-19T10:00:00Z" }], error: null };
    };
    expect(await listEmailLog(["reg-1", "reg-2"])).toEqual([
      { registrationId: "reg-1", kind: "paid", toEmail: "a@x.com", sentAt: "2026-10-19T10:00:00Z" },
    ]);
  });
  it("returns [] without a query for empty input", async () => {
    expect(await listEmailLog([])).toEqual([]);
    expect(db.state.ops).toHaveLength(0);
  });
  it("throws when the lookup fails", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    await expect(listEmailLog(["reg-1"])).rejects.toBeTruthy();
  });
});
