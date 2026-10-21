import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, memoryHandler, type Store, type Res } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
vi.mock("@/lib/data/landing-registration-admin", () => ({ queueStatusFollowUps: vi.fn(async () => {}) }));
const enqueueSheetStatus = vi.fn(async (_id: string) => true);
vi.mock("@/lib/data/landing-jobs", () => ({ enqueueSheetStatus: (id: string) => enqueueSheetStatus(id) }));

import { listSheetsToScan, runScan } from "@/lib/data/landing-sheet-sync";

let store: Store;
const regRow = (o: Record<string, unknown> = {}) => ({
  id: "r1", page_id: "p1", row_type: "individual", lead_registration_id: null, ref_id: "PZ-1", name: "A", email: "a@x.com",
  whatsapp: "923001234567", status: "pending", amount_received: null, expected_amount: 5000, is_test: false, student_id: null, ...o,
});
const sheetRow = (o: Record<string, unknown> = {}) => ({
  rowNumber: 2, refId: "PZ-1", email: "a@x.com", name: "A", whatsapp: "923001234567", status: "Pending", amount: "", rowType: "Individual", ...o,
});
const rpc = (_fn: string, args: unknown, st: Store): Res => {
  const a = args as { p_registration_id: string; p_to_status: string; p_expected_from: string; p_amount: number | null };
  const r = st.landing_registrations.find((x) => x.id === a.p_registration_id)!;
  if (r.status !== a.p_expected_from) return { data: { ok: false, reason: "stale" }, error: null };
  r.status = a.p_to_status;
  r.amount_received = a.p_amount;
  return { data: { ok: true, changed: 1 }, error: null };
};

function setup(state: "report" | "live", regs = [regRow()], snaps: Record<string, unknown>[] = []) {
  store = {
    landing_pages: [{ id: "p1", sheet_id: "S1", sheet_sync_state: state, sheet_last_scanned_at: null, sheet_sync_waiting: 0 }],
    landing_registrations: regs,
    landing_sheet_snapshots: snaps,
    landing_sheet_sync_log: [],
  };
  db.state.handler = memoryHandler(store, rpc);
}
const snap = (o: Record<string, unknown> = {}) => ({ registration_id: "r1", status: "pending", amount_received: null, name: "A", email: "a@x.com", whatsapp: "923001234567", ...o });
const log = () => store.landing_sheet_sync_log;

beforeEach(() => { db.reset(); enqueueSheetStatus.mockClear(); });

describe("listSheetsToScan", () => {
  it("returns pages with a sheet, nulls first then oldest scan first", async () => {
    store = {
      landing_pages: [
        { id: "p1", sheet_id: "A", sheet_sync_state: "live", sheet_last_scanned_at: "2026-10-02T00:00:00Z" },
        { id: "p2", sheet_id: "B", sheet_sync_state: "report", sheet_last_scanned_at: null },
        { id: "p3", sheet_id: "C", sheet_sync_state: "live", sheet_last_scanned_at: "2026-10-01T00:00:00Z" },
      ],
    };
    db.state.handler = memoryHandler(store);
    const out = await listSheetsToScan();
    const op = db.find("landing_pages", "select")[0];
    expect(op.orders).toEqual([["sheet_last_scanned_at", true]]);
    expect(op.filters).toContainEqual(["neq", "sheet_id", ""]);
    expect(out.map((s) => s.sheetId).sort()).toEqual(["A", "B", "C"]);
    expect(out.find((s) => s.sheetId === "B")).toEqual({ sheetId: "B", pageId: "p2", state: "report" });
  });
});

describe("runScan", () => {
  it("unknown sheet returns an error and writes nothing", async () => {
    setup("live");
    expect(await runScan("NOPE", [])).toEqual({ error: "unknown-sheet" });
    expect(log()).toHaveLength(0);
  });

  it("report mode logs differences, applies nothing, writes no snapshots", async () => {
    setup("report");
    const res = await runScan("S1", [sheetRow({ status: "Paid", amount: "5000" })]);
    expect(res).toMatchObject({ applied: 0, differences: 2 });
    expect(log().every((l) => l.outcome === "report")).toBe(true);
    expect(db.find("landing_registrations", "update")).toHaveLength(0);
    expect(db.find("landing_sheet_snapshots", "upsert")).toHaveLength(0);
    expect(db.find("landing_sheet_snapshots", "update")).toHaveLength(0);
    expect(store.landing_registrations[0].status).toBe("pending");
    expect(store.landing_pages[0].sheet_sync_waiting).toBe(2);
    expect(store.landing_pages[0].sheet_last_scanned_at).toBeTruthy();
  });

  it("report mode replaces the previous report rows of this page only", async () => {
    setup("report");
    store.landing_sheet_sync_log.push(
      { id: "old", page_id: "p1", outcome: "report", scan_id: "x" },
      { id: "keep1", page_id: "p1", outcome: "applied", scan_id: "x" },
      { id: "keep2", page_id: "p2", outcome: "report", scan_id: "x" },
    );
    await runScan("S1", [sheetRow()]);
    const ids = log().map((l) => l.id);
    expect(ids).not.toContain("old");
    expect(ids).toContain("keep1");
    expect(ids).toContain("keep2");
  });

  it("live mode applies a status change, logs it, and a second identical scan applies nothing", async () => {
    setup("live", [regRow()], [snap()]);
    const rows = [sheetRow({ status: "Paid", amount: "5000" })];
    const first = await runScan("S1", rows);
    expect(first).toMatchObject({ applied: 2, rejected: 0 });
    expect(store.landing_registrations[0].status).toBe("paid");
    const scanIds = new Set(log().map((l) => l.scan_id));
    expect(scanIds.size).toBe(1);
    expect(log().filter((l) => l.outcome === "applied")).toHaveLength(2);
    const second = await runScan("S1", rows);
    expect(second).toMatchObject({ applied: 0, rejected: 0, skipped: 0, unknown: 0, duplicates: 0 });
  });

  it("live mode queues a sheet rewrite when the app changed and the sheet did not win", async () => {
    // app moved to underpaid since last push (snapshot pending); someone also typed Paid in the sheet
    setup("live", [regRow({ status: "underpaid", amount_received: 2000 })], [snap()]);
    const res = await runScan("S1", [sheetRow({ status: "Paid", amount: "5000" })]);
    expect(res).toMatchObject({ applied: 0 });
    expect(enqueueSheetStatus).toHaveBeenCalledWith("r1");
    expect(store.landing_registrations[0].status).toBe("underpaid");
    expect(log().some((l) => l.outcome === "skipped" && l.field === "status")).toBe(true);
  });

  it("does not queue a rewrite for name/email/whatsapp appWins; only logs them", async () => {
    setup("live", [regRow({ name: "New Name" })], [snap()]);
    const res = await runScan("S1", [sheetRow({ name: "Sheet Name" })]);
    expect(enqueueSheetStatus).not.toHaveBeenCalled();
    expect(res).toMatchObject({ applied: 0, skipped: 1 });
    expect(log().find((l) => l.field === "name")?.outcome).toBe("skipped");
  });

  it("a hand-typed row lands in the unknown-row log and raises the waiting count", async () => {
    setup("live", [regRow()], [snap()]);
    const res = await runScan("S1", [sheetRow(), sheetRow({ rowNumber: 3, refId: "PZ-999", email: "z@x.com", name: "Zed" })]);
    expect(res).toMatchObject({ unknown: 1 });
    const u = log().filter((l) => l.outcome === "unknown-row");
    expect(u).toHaveLength(1);
    expect(u[0]).toMatchObject({ row_number: 3, ref_id: "PZ-999", page_id: "p1" });
    expect(store.landing_pages[0].sheet_sync_waiting).toBe(1);
  });

  it("logs duplicate rows and rejected fields", async () => {
    setup("live", [regRow()], [snap()]);
    const res = await runScan("S1", [sheetRow({ status: "Banana" }), sheetRow({ rowNumber: 3 })]);
    expect(res).toMatchObject({ duplicates: 1 });
    expect(log().some((l) => l.outcome === "duplicate-row")).toBe(true);
  });

  it("group members use their lead's ref id", async () => {
    setup(
      "live",
      [
        regRow({ id: "lead", row_type: "lead", ref_id: "PZ-7", email: "lead@x.com" }),
        regRow({ id: "m1", row_type: "member", ref_id: null, lead_registration_id: "lead", email: "m@x.com", name: "M" }),
      ],
      [snap({ registration_id: "lead", email: "lead@x.com" }), snap({ registration_id: "m1", email: "m@x.com", name: "M" })],
    );
    const res = await runScan("S1", [
      sheetRow({ refId: "PZ-7", email: "lead@x.com", rowType: "Lead" }),
      sheetRow({ rowNumber: 3, refId: "PZ-7", email: "m@x.com", name: "M", rowType: "Member" }),
    ]);
    expect(res).toMatchObject({ unknown: 0, duplicates: 0, rejected: 0 });
  });

  it("pages through registrations in chunks of 1000", async () => {
    const regs = Array.from({ length: 1500 }, (_, i) => regRow({ id: `r${i}`, ref_id: `PZ-${i}`, email: `u${i}@x.com` }));
    setup("live", regs, []);
    await runScan("S1", []);
    const ranges = db.find("landing_registrations", "select").filter((o) => o.range).map((o) => o.range);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });

  it("reads snapshots in chunks of at most 100 ids and still sees all of them", async () => {
    const regs = Array.from({ length: 250 }, (_, i) => regRow({ id: `r${i}`, ref_id: `PZ-${i}`, email: `u${i}@x.com` }));
    const snaps = regs.map((r, i) => snap({ registration_id: r.id, email: `u${i}@x.com` }));
    setup("live", regs, snaps);
    // Rows equal the snapshots, so a missed snapshot would show up as a change against the app.
    const rows = regs.map((r, i) => sheetRow({ rowNumber: i + 2, refId: `PZ-${i}`, email: `u${i}@x.com`, name: "A" }));
    const res = await runScan("S1", rows);
    const reads = db.find("landing_sheet_snapshots", "select");
    expect(reads).toHaveLength(3);
    for (const op of reads) expect((op.filters.find(([k]) => k === "in")![2] as string[]).length).toBeLessThanOrEqual(100);
    expect(res).toMatchObject({ applied: 0, rejected: 0, unknown: 0 });
  });

  it("two scans with the same problem leave one set of problem rows and keep applied history", async () => {
    setup("live", [regRow()], [snap()]);
    store.landing_sheet_sync_log.push({ id: "hist", page_id: "p1", outcome: "applied", scan_id: "old", field: "name" });
    const rows = [sheetRow(), sheetRow({ rowNumber: 3, refId: "PZ-999", email: "z@x.com", name: "Zed" }), sheetRow({ rowNumber: 4 })];
    await runScan("S1", rows);
    const first = log().filter((l) => l.outcome !== "applied").length;
    await runScan("S1", rows);
    expect(first).toBe(2);
    expect(log().filter((l) => l.outcome === "unknown-row")).toHaveLength(1);
    expect(log().filter((l) => l.outcome === "duplicate-row")).toHaveLength(1);
    expect(log().map((l) => l.id)).toContain("hist");
  });

  it("never logs tokens or row contents to the console", async () => {
    const spies = (["log", "error", "warn"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    setup("live", [regRow()], [snap()]);
    await runScan("S1", [sheetRow({ name: "Secret Person", status: "Paid", amount: "5000" })]);
    for (const spy of spies) { expect(spy).not.toHaveBeenCalled(); spy.mockRestore(); }
  });
});
