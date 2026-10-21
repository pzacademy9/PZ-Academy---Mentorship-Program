import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

const queueStatusFollowUps = vi.fn(async (_id: string) => {});
vi.mock("@/lib/data/landing-registration-admin", () => ({ queueStatusFollowUps: (id: string) => queueStatusFollowUps(id) }));

import { saveSnapshots, saveStatusSnapshots, applySheetChanges } from "@/lib/data/landing-sheet-sync";
import type { PlannedChange } from "@/lib/landing/registration/sheet-sync-engine";

beforeEach(() => { db.reset(); queueStatusFollowUps.mockClear(); });

const reg = (id: string) => ({ id, status: "paid" as const, amountReceived: 5000, name: "A", email: "a@x.com", whatsapp: "923001234567" });

describe("saveSnapshots", () => {
  it("upserts all five values on registration_id", async () => {
    await saveSnapshots([reg("r1"), reg("r2")]);
    const [op] = db.find("landing_sheet_snapshots", "upsert");
    expect(op.upsertOptions).toMatchObject({ onConflict: "registration_id" });
    expect(op.payload).toHaveLength(2);
    expect((op.payload as Record<string, unknown>[])[0]).toMatchObject({
      registration_id: "r1", status: "paid", amount_received: 5000, name: "A", email: "a@x.com", whatsapp: "923001234567",
    });
  });
  it("stores the planner's normalized form: email lower+trim, WhatsApp digits, name trimmed", async () => {
    await saveSnapshots([{ ...reg("r1"), name: " Ayesha Khan ", email: "  Ayesha@Example.com ", whatsapp: "+92 300-1234567" }]);
    const [op] = db.find("landing_sheet_snapshots", "upsert");
    expect((op.payload as Record<string, unknown>[])[0]).toMatchObject({ name: "Ayesha Khan", email: "ayesha@example.com", whatsapp: "923001234567" });
  });
  it("insertOnly leaves existing rows alone (ignoreDuplicates); the default still overwrites", async () => {
    await saveSnapshots([reg("r1")], { insertOnly: true });
    expect(db.find("landing_sheet_snapshots", "upsert")[0].upsertOptions).toMatchObject({ onConflict: "registration_id", ignoreDuplicates: true });
    db.reset();
    await saveSnapshots([reg("r1")]);
    expect(db.find("landing_sheet_snapshots", "upsert")[0].upsertOptions).toEqual({ onConflict: "registration_id" });
  });
  it("does nothing for an empty list", async () => {
    await saveSnapshots([]);
    expect(db.state.ops).toHaveLength(0);
  });
  it("throws on a database error", async () => {
    db.state.handler = () => ({ data: null, error: { message: "boom" } });
    await expect(saveSnapshots([reg("r1")])).rejects.toThrow("boom");
  });
});

describe("saveStatusSnapshots", () => {
  it("updates only status, amount and updated_at of existing rows", async () => {
    await saveStatusSnapshots([{ id: "r1", status: "paid", amountReceived: 5000 }, { id: "r2", status: "pending", amountReceived: null }]);
    const ops = db.find("landing_sheet_snapshots", "update");
    expect(ops).toHaveLength(2);
    expect(db.find("landing_sheet_snapshots", "upsert")).toHaveLength(0);
    expect(ops[0].filters).toContainEqual(["eq", "registration_id", "r1"]);
    expect(Object.keys(ops[0].payload as object).sort()).toEqual(["amount_received", "status", "updated_at"]);
    expect(ops[1].payload).toMatchObject({ status: "pending", amount_received: null });
  });
  it("throws on a database error", async () => {
    db.state.handler = () => ({ data: null, error: { message: "boom" } });
    await expect(saveStatusSnapshots([{ id: "r1", status: "paid", amountReceived: 1 }])).rejects.toThrow("boom");
  });
});

describe("applySheetChanges", () => {
  const row = (o: Record<string, unknown> = {}) => ({
    id: "r1", page_id: "p1", row_type: "individual", status: "pending", amount_received: null, expected_amount: 5000,
    name: "A", email: "a@x.com", whatsapp: "923001234567", student_id: null, ...o,
  });
  const ch = (field: PlannedChange["field"], sheetValue: PlannedChange["sheetValue"], appValue: PlannedChange["appValue"] = null): PlannedChange =>
    ({ registrationId: "r1", field, sheetValue, appValue });

  /** Registration table with a stateful status; the RPC mimics landing_apply_status. */
  function setup(initial = row(), others: Record<string, unknown>[] = []) {
    const cur: Record<string, unknown> = { ...initial };
    db.state.handler = (op) => {
      if (op.op === "rpc") {
        const a = op.payload as { p_to_status: string; p_expected_from: string; p_amount: number | null };
        if (cur.status !== a.p_expected_from) return { data: { ok: false, reason: "stale" }, error: null };
        if (cur.status === a.p_to_status && a.p_to_status !== "underpaid") return { data: { ok: false, reason: "already-in-status" }, error: null };
        cur.status = a.p_to_status;
        cur.amount_received = a.p_amount;
        return { data: { ok: true, changed: 1 }, error: null };
      }
      if (op.table === "landing_registrations" && op.op === "select") {
        if (op.filters.some(([, k]) => k === "page_id")) {
          const e = op.filters.find(([k, f]) => k === "ilike" && f === "email")?.[2];
          return { data: others.filter((o) => String(o.email).toLowerCase() === String(e).toLowerCase()), error: null };
        }
        return { data: { ...cur }, error: null };
      }
      return { data: null, error: null };
    };
    return cur;
  }

  it("sheet Paid on a pending row calls the RPC as the sheet (no actor), queues follow-ups once, and updates the snapshot", async () => {
    setup();
    const out = await applySheetChanges("p1", [ch("status", "paid", "pending"), ch("amount", null, null)]);
    const [rpc] = db.state.ops.filter((o) => o.op === "rpc");
    expect(rpc.table).toBe("landing_apply_status");
    expect(rpc.payload).toMatchObject({ p_registration_id: "r1", p_to_status: "paid", p_expected_from: "pending", p_amount: 5000, p_actor: null, p_source: "sheet" });
    expect(queueStatusFollowUps).toHaveBeenCalledTimes(1);
    expect(queueStatusFollowUps).toHaveBeenCalledWith("r1");
    expect(out.map((o) => o.outcome)).toEqual(["applied", "applied"]);
    const snap = db.find("landing_sheet_snapshots", "update");
    expect(snap[0].payload).toMatchObject({ status: "paid", amount_received: null });
    expect(snap[0].filters).toContainEqual(["eq", "registration_id", "r1"]);
    // the paired amount is never written as its own edit
    expect(db.find("landing_registrations", "update")).toHaveLength(0);
  });

  it("applying the same Paid change twice skips the second and does not queue again", async () => {
    setup();
    await applySheetChanges("p1", [ch("status", "paid", "pending"), ch("amount", null, null)]);
    const out = await applySheetChanges("p1", [ch("status", "paid", "pending"), ch("amount", null, null)]);
    expect(out[0].outcome).toBe("skipped");
    expect(queueStatusFollowUps).toHaveBeenCalledTimes(1);
  });

  it("Underpaid without an amount is rejected and the RPC is not called", async () => {
    setup();
    const out = await applySheetChanges("p1", [ch("status", "underpaid", "pending")]);
    expect(out[0].outcome).toBe("rejected");
    expect(db.state.ops.some((o) => o.op === "rpc")).toBe(false);
    expect(queueStatusFollowUps).not.toHaveBeenCalled();
  });

  it("uses the paired amount for Underpaid", async () => {
    setup();
    const out = await applySheetChanges("p1", [ch("status", "underpaid", "pending"), ch("amount", 2000, null)]);
    expect(out[0].outcome).toBe("applied");
    expect(db.state.ops.find((o) => o.op === "rpc")?.payload).toMatchObject({ p_amount: 2000 });
  });

  it("rejects an email another person on the page already uses and writes nothing", async () => {
    setup(row(), [{ id: "r9", email: "Taken@x.com" }]);
    const out = await applySheetChanges("p1", [ch("email", "taken@x.com", "a@x.com")]);
    expect(out[0]).toMatchObject({ outcome: "rejected", detail: "Another person on this page already uses that email" });
    expect(db.find("landing_registrations", "update")).toHaveLength(0);
    expect(db.find("landing_sheet_snapshots", "update")).toHaveLength(0);
  });

  it("changes a free email and leaves the account link alone", async () => {
    setup();
    const out = await applySheetChanges("p1", [ch("email", "new@x.com", "a@x.com")]);
    expect(out[0]).toMatchObject({ outcome: "applied", detail: "Email changed; account link unchanged" });
    const [u] = db.find("landing_registrations", "update");
    expect(u.payload).toEqual({ email: "new@x.com" });
    expect(db.find("landing_sheet_snapshots", "update")[0].payload).toMatchObject({ email: "new@x.com" });
  });

  it("stores WhatsApp as digits only", async () => {
    setup();
    const out = await applySheetChanges("p1", [ch("whatsapp", "+92 300 1234567", "923001234567")]);
    expect(out[0].outcome).toBe("applied");
    expect(db.find("landing_registrations", "update")[0].payload).toEqual({ whatsapp: "923001234567" });
    expect(db.find("landing_registrations", "update")[0].filters).toContainEqual(["eq", "id", "r1"]);
  });

  it("an amount-only change on a Paid row updates amount_received", async () => {
    setup(row({ status: "paid", amount_received: 5000 }));
    const out = await applySheetChanges("p1", [ch("amount", 4500, 5000)]);
    expect(out[0].outcome).toBe("applied");
    expect(db.find("landing_registrations", "update")[0].payload).toEqual({ amount_received: 4500 });
    expect(db.state.ops.some((o) => o.op === "rpc")).toBe(false);
    expect(db.find("landing_sheet_snapshots", "update")[0].payload).toMatchObject({ amount_received: 4500 });
  });

  it("refuses an amount-only change on a pending row", async () => {
    setup();
    const out = await applySheetChanges("p1", [ch("amount", 100, null)]);
    expect(out[0].outcome).toBe("rejected");
    expect(db.find("landing_registrations", "update")).toHaveLength(0);
  });

  it("refuses status changes on member and free rows", async () => {
    setup(row({ row_type: "member" }));
    expect((await applySheetChanges("p1", [ch("status", "paid", "pending")]))[0].outcome).toBe("rejected");
    setup(row({ status: "free" }));
    expect((await applySheetChanges("p1", [ch("status", "paid", "free")]))[0].outcome).toBe("rejected");
    expect(queueStatusFollowUps).not.toHaveBeenCalled();
  });

  it("skips a status change when the app moved on since the plan, without calling the RPC or follow-ups", async () => {
    setup(row({ status: "paid", amount_received: 5000 }));
    const out = await applySheetChanges("p1", [ch("status", "reserved", "pending")]);
    expect(out[0]).toMatchObject({ outcome: "skipped", detail: "Changed in the app since the sheet was checked" });
    expect(db.state.ops.some((o) => o.op === "rpc")).toBe(false);
    expect(queueStatusFollowUps).not.toHaveBeenCalled();
  });

  it("skips a name change when the app name differs from the planned one", async () => {
    setup(row({ name: "Changed In App" }));
    const out = await applySheetChanges("p1", [ch("name", "Sheet Name", "A")]);
    expect(out[0]).toMatchObject({ outcome: "skipped", detail: "Changed in the app since the sheet was checked" });
    expect(db.find("landing_registrations", "update")).toHaveLength(0);
  });

  it("updates the snapshot before queueing follow-ups", async () => {
    setup();
    const order: string[] = [];
    queueStatusFollowUps.mockImplementationOnce(async () => { order.push("queue"); });
    const inner = db.state.handler;
    db.state.handler = (op) => { if (op.table === "landing_sheet_snapshots" && op.op === "update") order.push("snapshot"); return inner(op); };
    await applySheetChanges("p1", [ch("status", "paid", "pending"), ch("amount", null, null)]);
    expect(order).toEqual(["snapshot", "queue"]);
  });
});
