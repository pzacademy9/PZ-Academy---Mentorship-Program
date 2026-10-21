import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

const gate = vi.hoisted(() => ({ mode: "ok" as "ok" | "401" | "403" }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () =>
    gate.mode === "ok"
      ? { ok: true, user: { id: "admin-1" } }
      : { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: gate.mode === "401" ? 401 : 403 }) },
}));

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const queueStatusFollowUps = vi.fn(async (_id: string) => {});
vi.mock("@/lib/data/landing-registration-admin", () => ({ queueStatusFollowUps: (id: string) => queueStatusFollowUps(id) }));
const enqueueSheetStatus = vi.fn(async (_id: string) => true);
const runJobsFor = vi.fn(async (_id: string) => {});
vi.mock("@/lib/data/landing-jobs", () => ({ enqueueSheetStatus: (id: string) => enqueueSheetStatus(id), runJobsFor: (id: string) => runJobsFor(id) }));
vi.mock("@/lib/landing/registration/background", () => ({ runInBackground: (p: Promise<unknown>) => { void p.catch(() => {}); } }));
const gas = vi.hoisted(() => ({ requestSheetScan: vi.fn(), installLandingScanTrigger: vi.fn() }));
vi.mock("@/lib/gas/event-sheet-client", () => gas);
const sheetInfo = vi.hoisted(() => ({ getPageSheetInfo: vi.fn() }));
vi.mock("@/lib/data/landing-event-sheet", () => sheetInfo);

import { GET as statusGet } from "@/app/api/admin/landing-sheet-sync/route";
import { POST as approvePost } from "@/app/api/admin/landing-sheet-sync/approve/route";
import { POST as scanPost } from "@/app/api/admin/landing-sheet-sync/scan/route";
import { runScan } from "@/lib/data/landing-sheet-sync";
import { POST as installPost } from "@/app/api/admin/landing-sheet-sync/install/route";

const PAGE = "00000000-0000-4000-8000-000000000001";
const R1 = "00000000-0000-4000-8000-0000000000a1";
const R2 = "00000000-0000-4000-8000-0000000000a2";
const post = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) }) as never;
const get = (qs: string) => new Request(`http://x/api/admin/landing-sheet-sync${qs}`) as never;

let store: Store;
let errSpy: ReturnType<typeof vi.spyOn>;

function reg(id: string, o: Record<string, unknown> = {}) {
  return {
    id, page_id: PAGE, row_type: "individual", status: "pending", amount_received: null, expected_amount: 5000,
    name: "Ayesha", email: `${id}@x.com`, whatsapp: "923001234567", ...o,
  };
}
const rep = (id: string, registration_id: string, field: string, sheet_value: string | null, app_value: string | null) =>
  ({ id, page_id: PAGE, registration_id, field, outcome: "report", sheet_value, app_value, detail: "", ref_id: "X-1", row_number: 2, scan_id: "s" });

function seed(state: "report" | "live", regs: Record<string, unknown>[], reports: Record<string, unknown>[]) {
  store = {
    landing_pages: [{ id: PAGE, sheet_id: "sheet-1", sheet_sync_state: state, sheet_last_scanned_at: null, sheet_sync_waiting: reports.length }],
    landing_registrations: regs,
    landing_sheet_snapshots: [],
    landing_sheet_sync_log: reports,
  };
  const mem = memoryHandler(store, (fn, args) => {
    if (fn !== "landing_apply_status") return { data: null, error: { message: "no rpc" } };
    const a = args as { p_registration_id: string; p_to_status: string; p_amount: number | null };
    const r = store.landing_registrations.find((x) => x.id === a.p_registration_id)!;
    r.status = a.p_to_status;
    r.amount_received = a.p_amount;
    return { data: { ok: true, changed: 1 }, error: null };
  });
  // Like Postgres: an upsert on registration_id replaces the row, or (ignoreDuplicates) leaves an existing one alone.
  db.state.handler = (op) => {
    if (op.table === "landing_sheet_snapshots" && op.op === "upsert") {
      const items = (Array.isArray(op.payload) ? op.payload : [op.payload]) as Record<string, unknown>[];
      const ignore = op.upsertOptions?.ignoreDuplicates === true;
      for (const it of items) {
        const at = store.landing_sheet_snapshots.findIndex((x) => x.registration_id === it.registration_id);
        if (at === -1) store.landing_sheet_snapshots.push({ ...it });
        else if (!ignore) store.landing_sheet_snapshots[at] = { ...it };
      }
      return { data: null, error: null };
    }
    return mem(op);
  };
}

beforeEach(() => {
  gate.mode = "ok";
  db.reset();
  queueStatusFollowUps.mockClear();
  enqueueSheetStatus.mockClear();
  runJobsFor.mockClear();
  enqueueSheetStatus.mockResolvedValue(true);
  gas.requestSheetScan.mockReset();
  gas.installLandingScanTrigger.mockReset();
  sheetInfo.getPageSheetInfo.mockReset();
  seed("report", [], []);
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

describe("admin gate and ids", () => {
  it("anonymous and non-admin (including sales agents) are refused on every route before any work", async () => {
    for (const mode of ["401", "403"] as const) {
      gate.mode = mode;
      const status = Number(mode);
      expect((await statusGet(get(`?pageId=${PAGE}`))).status).toBe(status);
      expect((await approvePost(post({ pageId: PAGE, applyKeys: [] }))).status).toBe(status);
      expect((await scanPost(post({ pageId: PAGE }))).status).toBe(status);
      expect((await installPost()).status).toBe(status);
    }
    expect(gas.requestSheetScan).not.toHaveBeenCalled();
    expect(gas.installLandingScanTrigger).not.toHaveBeenCalled();
    expect(db.state.ops).toHaveLength(0);
  });

  it("a malformed page id is 404 after auth on status, approve and scan", async () => {
    expect((await statusGet(get("?pageId=nope"))).status).toBe(404);
    expect((await approvePost(post({ pageId: "nope", applyKeys: [] }))).status).toBe(404);
    expect((await scanPost(post({ pageId: "nope" }))).status).toBe(404);
    expect(db.state.ops).toHaveLength(0);
  });

  it("approve rejects bad keys", async () => {
    expect((await approvePost(post({ pageId: PAGE, applyKeys: [{ registrationId: "x", field: "status" }] }))).status).toBe(400);
    expect((await approvePost(post({ pageId: PAGE, applyKeys: [{ registrationId: R1, field: "city" }] }))).status).toBe(400);
  });
});

describe("approve", () => {
  it("refuses a page that is already live and changes nothing", async () => {
    seed("live", [reg(R1)], []);
    const res = await approvePost(post({ pageId: PAGE, applyKeys: [] }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/already/i);
    expect(db.state.ops.some((o) => ["update", "delete", "upsert", "insert"].includes(o.op))).toBe(false);
  });

  it("applies ticked rows, rewrites the sheet for unticked status rows, goes live and clears the report", async () => {
    seed("report",
      [reg(R1), reg(R2, { name: "Sana", email: "r2@x.com" })],
      [
        rep("l1", R1, "status", "paid", "pending"), rep("l2", R1, "amount", null, null),
        rep("l3", R2, "status", "paid", "pending"),
      ]);
    const res = await approvePost(post({ pageId: PAGE, applyKeys: [{ registrationId: R1, field: "status" }] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ applied: 1, keptApp: 0 });
    expect(store.landing_registrations.find((r) => r.id === R1)!.status).toBe("paid");
    expect(store.landing_registrations.find((r) => r.id === R2)!.status).toBe("pending");
    expect(enqueueSheetStatus).toHaveBeenCalledTimes(1);
    expect(enqueueSheetStatus).toHaveBeenCalledWith(R2);
    expect(store.landing_pages[0].sheet_sync_state).toBe("live");
    expect(store.landing_sheet_sync_log.filter((l) => l.outcome === "report")).toHaveLength(0);
    // every registration of the page has a remembered state
    expect(store.landing_sheet_snapshots.map((s) => s.registration_id).sort()).toEqual([R1, R2]);
    // the unticked row keeps the app value, but the snapshot remembers what the sheet still shows
    expect(store.landing_sheet_snapshots.find((s) => s.registration_id === R2)!.status).toBe("paid");
    expect(runJobsFor).toHaveBeenCalledWith(R2);
    expect(store.landing_sheet_snapshots.find((s) => s.registration_id === R1)!.status).toBe("paid");
  });

  it("unticked name, email and WhatsApp rows are not applied and the remembered value becomes the sheet's", async () => {
    seed("report", [reg(R1)], [
      rep("l1", R1, "name", "Ayesha K.", "Ayesha"),
      rep("l2", R1, "email", " NEW@X.com ", `${R1}@x.com`),
      rep("l3", R1, "whatsapp", "+92 300 7654321", "923001234567"),
    ]);
    const res = await approvePost(post({ pageId: PAGE, applyKeys: [] }));
    expect(await res.json()).toEqual({ applied: 0, keptApp: 3 });
    const r = store.landing_registrations[0];
    expect(r).toMatchObject({ name: "Ayesha", email: `${R1}@x.com`, whatsapp: "923001234567" });
    expect(store.landing_sheet_snapshots[0]).toMatchObject({ name: "Ayesha K.", email: "new@x.com", whatsapp: "923007654321" });
    expect(store.landing_sheet_sync_log.filter((l) => l.outcome === "kept-app")).toHaveLength(3);
    expect(enqueueSheetStatus).not.toHaveBeenCalled();
    expect(store.landing_pages[0].sheet_sync_state).toBe("live");
  });

  it("a ticked name is applied to the registration and remembered", async () => {
    seed("report", [reg(R1)], [rep("l1", R1, "name", "Ayesha K.", "Ayesha")]);
    const res = await approvePost(post({ pageId: PAGE, applyKeys: [{ registrationId: R1, field: "name" }] }));
    expect(await res.json()).toEqual({ applied: 1, keptApp: 0 });
    expect(store.landing_registrations[0].name).toBe("Ayesha K.");
    expect(store.landing_sheet_snapshots[0].name).toBe("Ayesha K.");
  });

  it("a ticked amount without a status row is an amount-only edit", async () => {
    seed("report", [reg(R1, { status: "paid", amount_received: 5000 })], [rep("l1", R1, "amount", "4500", "5000")]);
    // paid with a lower amount is allowed as an edit; expected amount 5000
    const res = await approvePost(post({ pageId: PAGE, applyKeys: [{ registrationId: R1, field: "amount" }] }));
    expect(await res.json()).toEqual({ applied: 1, keptApp: 0 });
    expect(store.landing_registrations[0].amount_received).toBe(4500);
  });

  it("a failure before going live leaves the page in review and keeps the report", async () => {
    seed("report", [reg(R1)], [rep("l1", R1, "status", "paid", "pending")]);
    enqueueSheetStatus.mockResolvedValue(false);
    const res = await approvePost(post({ pageId: PAGE, applyKeys: [] }));
    expect(res.status).toBe(500);
    expect(store.landing_pages[0].sheet_sync_state).toBe("report");
    expect(store.landing_sheet_sync_log.filter((l) => l.outcome === "report")).toHaveLength(1);
  });
});

describe("approve then live scan", () => {
  const sheetRow = (id: string, status: string) => ({ rowNumber: 2, refId: "X-1", email: `${id}@x.com`, name: "Ayesha", whatsapp: "923001234567", status, amount: "", rowType: "individual" });
  const live = () => ({ ...store.landing_pages[0] });

  it("a declined stale Paid is not applied by the next live scan", async () => {
    seed("report", [reg(R1, { ref_id: "X-1" })], [rep("l1", R1, "status", "paid", "pending")]);
    await approvePost(post({ pageId: PAGE, applyKeys: [] }));
    expect(store.landing_pages[0].sheet_sync_state).toBe("live");
    queueStatusFollowUps.mockClear();
    db.state.ops = [];
    const summary = await runScan("sheet-1", [sheetRow(R1, "Paid")]);
    expect(summary).toMatchObject({ applied: 0 });
    expect(db.state.ops.some((o) => o.op === "rpc")).toBe(false);
    expect(queueStatusFollowUps).not.toHaveBeenCalled();
    expect(store.landing_registrations[0].status).toBe("pending");
    expect(live().sheet_sync_state).toBe("live");
  });

  it("two approvals started together: each change is applied once, one snapshot per registration, and a following live scan applies nothing declined", async () => {
    seed("report",
      [reg(R1, { ref_id: "X-1" }), reg(R2, { ref_id: "X-2", email: "r2@x.com" })],
      [rep("l1", R1, "status", "paid", "pending"), rep("l2", R2, "status", "paid", "pending"), rep("l3", R2, "name", "Sana K.", "Ayesha")]);
    const body = { pageId: PAGE, applyKeys: [{ registrationId: R1, field: "status" }] };
    const [a, b] = await Promise.all([approvePost(post(body)), approvePost(post(body))]);
    expect([a.status, b.status].every((x) => x === 200 || x === 409)).toBe(true);
    expect(queueStatusFollowUps.mock.calls.filter(([id]) => id === R1)).toHaveLength(1);
    expect(store.landing_registrations.find((r) => r.id === R1)!.status).toBe("paid");
    expect(store.landing_registrations.find((r) => r.id === R2)!.status).toBe("pending");
    expect(store.landing_registrations.find((r) => r.id === R2)!.name).toBe("Ayesha");
    expect(store.landing_sheet_snapshots.filter((x) => x.registration_id === R2)).toHaveLength(1);
    expect(store.landing_sheet_snapshots.find((x) => x.registration_id === R2)).toMatchObject({ status: "paid", name: "Sana K." });
    queueStatusFollowUps.mockClear();
    db.state.ops = [];
    const rows = [sheetRow(R1, "Paid"), { ...sheetRow(R2, "Paid"), refId: "X-2", email: "r2@x.com", name: "Sana K." }];
    const summary = await runScan("sheet-1", rows);
    expect(summary).toMatchObject({ applied: 0 });
    expect(db.state.ops.some((o) => o.op === "rpc")).toBe(false);
    expect(store.landing_registrations.find((r) => r.id === R2)!.status).toBe("pending");
  });
});

describe("ticked change that cannot be applied", () => {
  it("is treated like an unticked one: sheet value remembered, sheet push queued, next live scan changes nothing", async () => {
    seed("report", [reg(R1, { ref_id: "X-1", status: "pending" })], [rep("l1", R1, "status", "paid", "pending")]);
    store.landing_registrations[0].status = "underpaid"; // the app moved on after the report was made
    const res = await approvePost(post({ pageId: PAGE, applyKeys: [{ registrationId: R1, field: "status" }] }));
    expect(await res.json()).toEqual({ applied: 0, keptApp: 0 });
    expect(store.landing_sheet_snapshots[0]).toMatchObject({ registration_id: R1, status: "paid" });
    expect(enqueueSheetStatus).toHaveBeenCalledWith(R1);
    expect(runJobsFor).toHaveBeenCalledWith(R1);
    queueStatusFollowUps.mockClear();
    db.state.ops = [];
    const summary = await runScan("sheet-1", [{ rowNumber: 2, refId: "X-1", email: `${R1}@x.com`, name: "Ayesha", whatsapp: "923001234567", status: "Paid", amount: "", rowType: "individual" }]);
    expect(summary).toMatchObject({ applied: 0 });
    expect(db.state.ops.some((o) => o.op === "rpc")).toBe(false);
    expect(queueStatusFollowUps).not.toHaveBeenCalled();
    expect(store.landing_registrations[0].status).toBe("underpaid");
  });
});

describe("status", () => {
  it("returns the review list with names and the latest problems", async () => {
    seed("report", [reg(R1)], [
      rep("l1", R1, "status", "paid", "pending"),
      { id: "p1", page_id: PAGE, registration_id: null, field: "row", outcome: "unknown-row", sheet_value: null, app_value: null, detail: "No match", ref_id: "X-9", row_number: 7, scan_id: "s" },
    ]);
    const res = await statusGet(get(`?pageId=${PAGE}`));
    const body = await res.json() as { state: string; report: { name: string; field: string }[]; problems: { rowNumber: number }[] };
    expect(body.state).toBe("report");
    expect(body.report).toMatchObject([{ name: "Ayesha", field: "status", sheetValue: "paid", appValue: "pending", registrationId: R1 }]);
    expect(body.problems).toMatchObject([{ rowNumber: 7, outcome: "unknown-row" }]);
  });
});

describe("scan and install", () => {
  it("scan asks for the page's sheet and says results come in a minute", async () => {
    sheetInfo.getPageSheetInfo.mockResolvedValue({ id: PAGE, sheetId: "sheet-1" });
    gas.requestSheetScan.mockResolvedValue({ ok: true });
    const res = await scanPost(post({ pageId: PAGE }));
    expect(res.status).toBe(200);
    expect(gas.requestSheetScan).toHaveBeenCalledWith("sheet-1");
    expect(((await res.json()) as { message: string }).message).toBe("Scan requested. Results appear in a minute.");
  });
  it("a timeout from Apps Script still counts as requested", async () => {
    sheetInfo.getPageSheetInfo.mockResolvedValue({ id: PAGE, sheetId: "sheet-1" });
    gas.requestSheetScan.mockResolvedValue({ ok: false, message: "Apps Script timed out." });
    const res = await scanPost(post({ pageId: PAGE }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { message: string }).message).toBe("Scan requested. Results appear in a minute.");
  });
  it("a real error is a 502 in plain words", async () => {
    sheetInfo.getPageSheetInfo.mockResolvedValue({ id: PAGE, sheetId: "sheet-1" });
    gas.requestSheetScan.mockResolvedValue({ ok: false, message: "SHEETS_SYNC_SECRET is not configured." });
    expect((await scanPost(post({ pageId: PAGE }))).status).toBe(502);
  });
  it("a page without a sheet is refused", async () => {
    sheetInfo.getPageSheetInfo.mockResolvedValue({ id: PAGE, sheetId: null });
    expect((await scanPost(post({ pageId: PAGE }))).status).toBe(422);
    expect(gas.requestSheetScan).not.toHaveBeenCalled();
  });
  it("install calls the trigger installer; failure is 502", async () => {
    gas.installLandingScanTrigger.mockResolvedValue({ ok: true });
    expect((await installPost()).status).toBe(200);
    gas.installLandingScanTrigger.mockResolvedValue({ ok: false, message: "nope" });
    expect((await installPost()).status).toBe(502);
  });
});
