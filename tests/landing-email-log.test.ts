import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, filterValue, memoryHandler, type Op, type Res } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { claimEmail, releaseEmail, listEmailLog } from "@/lib/data/landing-email-log";

/** In-memory table that enforces the (registration_id, kind) primary key like Postgres. */
function pkHandler(store: Record<string, Record<string, unknown>[]>) {
  const inner = memoryHandler(store);
  return (op: Op): Res => {
    if (op.op === "insert") {
      const p = op.payload as Record<string, unknown>;
      const dup = (store[op.table] ?? []).some((r) => r.registration_id === p.registration_id && r.kind === p.kind);
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
    expect(db.find("landing_email_log", "insert")[0].payload).toEqual({ registration_id: "reg-1", kind: "paid", to_email: "a@x.com" });
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

describe("releaseEmail", () => {
  it("deletes the row so the next claim succeeds", async () => {
    db.state.handler = pkHandler({});
    await claimEmail("reg-1", "paid", "a@x.com");
    await releaseEmail("reg-1", "paid");
    const del = db.find("landing_email_log", "delete")[0];
    expect(filterValue(del, "eq", "registration_id")).toBe("reg-1");
    expect(filterValue(del, "eq", "kind")).toBe("paid");
    expect(await claimEmail("reg-1", "paid", "a@x.com")).toBe(true);
  });
  it("throws when the delete fails", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    await expect(releaseEmail("reg-1", "paid")).rejects.toBeTruthy();
  });
});

describe("listEmailLog", () => {
  it("maps rows to camelCase", async () => {
    db.state.handler = (op) => {
      expect(filterValue(op, "in", "registration_id")).toEqual(["reg-1", "reg-2"]);
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
