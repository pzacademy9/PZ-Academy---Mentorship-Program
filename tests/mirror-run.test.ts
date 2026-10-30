import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSupabaseMock, memoryHandler, type Store, type Res, type Op } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
vi.mock("server-only", () => ({}));

// Nothing that sends email, Meta events, enrollments or sheet rewrites may ever run from the mirror.
const queueStatusFollowUps = vi.fn(async (_id: string) => {});
const enqueueStatusEffects = vi.fn(async () => {});
const enqueueSheetStatus = vi.fn(async (_id: string) => true);
const runJobsFor = vi.fn(async (_id: string) => {});
vi.mock("@/lib/data/landing-registration-admin", () => ({ queueStatusFollowUps: (id: string) => queueStatusFollowUps(id) }));
vi.mock("@/lib/data/landing-jobs", () => ({
  enqueueStatusEffects: () => enqueueStatusEffects(),
  enqueueSheetStatus: (id: string) => enqueueSheetStatus(id),
  runJobsFor: (id: string) => runJobsFor(id),
}));

import { runMirror, runMirrorForAllPages } from "@/lib/data/landing-mirror";

const SHEET_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
const HEADER = ["Name", "Email", "WhatsApp", "Profession", "Discovery", "Registration Option", "Consent", "Row Type", "Promo Code", "Voucher URL", "Submitted At", "Expected Amount", "Group Lead Email", "Payment Method", "Amount", "Payment Confirmation", "Email Confirmation", "Source", "Ref ID"];

function csvLine(over: Record<string, string>): string {
  const base: Record<string, string> = {
    Name: "Person One", Email: "one@example.com", WhatsApp: "+10000000001", Profession: "Tester", Discovery: "Friend",
    "Registration Option": "Live — Full Course – Individual", Consent: "Yes", "Row Type": "Individual", "Promo Code": "",
    "Voucher URL": "", "Submitted At": "9/15/2026 19:17:27", "Expected Amount": "5000", "Group Lead Email": "",
    "Payment Method": "Bank", Amount: "", "Payment Confirmation": "Pending", "Email Confirmation": "", Source: "ppc-v2-PK#T-001", "Ref ID": "T-001",
  };
  const m = { ...base, ...over };
  return HEADER.map((h) => `"${(m[h] ?? "").replace(/"/g, '""')}"`).join(",");
}
const csv = (...lines: string[]) => [HEADER.map((h) => `"${h}"`).join(","), ...lines].join("\n");
const THREE = () => csv(
  csvLine({}),
  csvLine({ Name: "Person Two", Email: "two@example.com", "Submitted At": "9/15/2026 19:20:00", "Ref ID": "T-002" }),
  csvLine({ Name: "Person Three", Email: "three@example.com", "Submitted At": "9/15/2026 19:25:00", "Ref ID": "T-003", "Payment Confirmation": "Paid", Amount: "5000" }),
);

let sheetBody = "";
let sheetStatus = 200;
const fetchMock = vi.fn(async (_url: string, _init?: unknown) => new Response(sheetBody, { status: sheetStatus }));

let store: Store;
const rpcCalls: Record<string, unknown>[] = [];
function handler(): (op: Op) => Res {
  const base = memoryHandler(store, (_fn, args, st) => {
    const a = args as { p_registration_id: string; p_to_status: string; p_expected_from: string; p_amount: number | null };
    rpcCalls.push(a);
    const r = st.landing_registrations.find((x) => x.id === a.p_registration_id)!;
    if (r.status !== a.p_expected_from) return { data: { ok: false, reason: "stale" }, error: null };
    r.status = a.p_to_status;
    r.amount_received = a.p_amount;
    return { data: { ok: true }, error: null };
  });
  return (op) => {
    // The lock: the in-memory fake does not evaluate "or", so decide it here.
    if (op.table === "landing_pages" && op.op === "update" && op.filters.some(([k]) => k === "or")) {
      const p = store.landing_pages[0];
      const held = typeof p.mirror_running_at === "string" && Date.now() - Date.parse(p.mirror_running_at) < 10 * 60_000;
      if (held) return { data: [], error: null };
    }
    if (op.table === "landing_mirror_rows" && op.op === "upsert") {
      const item = op.payload as Record<string, unknown>;
      const hit = store.landing_mirror_rows.find((r) => r.page_id === item.page_id && r.row_key === item.row_key);
      if (hit) { Object.assign(hit, item); return { data: [hit], error: null }; }
    }
    return base(op);
  };
}
function setup(over: { page?: Record<string, unknown>; regs?: Record<string, unknown>[]; mem?: Record<string, unknown>[] } = {}) {
  store = {
    landing_pages: [{ id: "p1", mirror_sheet_id: SHEET_ID, mirror_running_at: null, mirror_last_result: null, mirror_last_run_at: null, ...over.page }],
    landing_registrations: over.regs ?? [],
    landing_mirror_rows: over.mem ?? [],
  };
  db.state.handler = handler();
}
const writes = () => db.state.ops.filter((o) => ["insert", "update", "upsert", "delete", "rpc"].includes(o.op));
const regs = () => store.landing_registrations;

beforeEach(() => {
  db.reset(); rpcCalls.length = 0;
  queueStatusFollowUps.mockClear(); enqueueStatusEffects.mockClear(); enqueueSheetStatus.mockClear(); runJobsFor.mockClear();
  fetchMock.mockClear(); sheetStatus = 200; sheetBody = THREE();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

const noSideEffects = () => {
  expect(queueStatusFollowUps).not.toHaveBeenCalled();
  expect(enqueueStatusEffects).not.toHaveBeenCalled();
  expect(enqueueSheetStatus).not.toHaveBeenCalled();
  expect(runJobsFor).not.toHaveBeenCalled();
};

describe("runMirror", () => {
  it("(a) fresh page: inserts every row with sheet columns, remembers them, sends nothing", async () => {
    setup();
    const r = await runMirror("p1");
    expect(r).toMatchObject({ ok: true, preview: false, inserted: 3, changed: 0, linked: 0, skipped: 0, problems: [] });
    expect(regs()).toHaveLength(3);
    expect(regs()[0]).toMatchObject({
      page_id: "p1", row_type: "individual", email: "one@example.com", status: "pending", status_source: "sheet",
      is_test: false, ref_id: "T-001", region: "PK", currency: "PKR", expected_amount: 5000, email_status: "",
      created_at: "2026-09-15T14:17:27.000Z",
    });
    expect(regs()[2]).toMatchObject({ status: "paid", amount_received: 5000 });
    expect(store.landing_mirror_rows).toHaveLength(3);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`);
    expect(store.landing_pages[0].mirror_running_at).toBeNull();
    expect(store.landing_pages[0].mirror_last_result).toMatchObject({ ok: true, inserted: 3 });
    expect(store.landing_pages[0].mirror_last_run_at).toBeTruthy();
    noSideEffects();
  });

  it("(b) a second run changes nothing", async () => {
    setup();
    await runMirror("p1");
    db.state.ops = [];
    const r = await runMirror("p1");
    expect(r).toMatchObject({ ok: true, inserted: 0, changed: 0, linked: 0, skipped: 3, problems: [] });
    expect(regs()).toHaveLength(3);
    expect(db.find("landing_registrations", "insert")).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
    noSideEffects();
  });

  it("(c) the sheet moves a row Pending to Paid: one status call from the sheet, no actor, no follow-ups", async () => {
    setup();
    await runMirror("p1");
    sheetBody = csv(
      csvLine({ "Payment Confirmation": "Paid", Amount: "5000" }),
      csvLine({ Name: "Person Two", Email: "two@example.com", "Submitted At": "9/15/2026 19:20:00", "Ref ID": "T-002" }),
      csvLine({ Name: "Person Three", Email: "three@example.com", "Submitted At": "9/15/2026 19:25:00", "Ref ID": "T-003", "Payment Confirmation": "Paid", Amount: "5000" }),
    );
    const r = await runMirror("p1");
    expect(r).toMatchObject({ ok: true, inserted: 0, changed: 1, skipped: 2, problems: [] });
    expect(db.find("landing_registrations", "rpc")).toHaveLength(0);
    const rpcOps = db.state.ops.filter((o) => o.op === "rpc");
    expect(rpcOps).toHaveLength(1);
    expect(rpcOps[0].table).toBe("landing_apply_status");
    expect(rpcOps[0].payload).toMatchObject({ p_to_status: "paid", p_expected_from: "pending", p_amount: 5000, p_actor: null, p_source: "sheet" });
    expect(regs()[0].status).toBe("paid");
    expect(store.landing_mirror_rows.find((m) => m.registration_id === regs()[0].id)).toMatchObject({ last_status: "paid", last_amount: 5000 });
    noSideEffects();
  });

  it("(d) a row whose status the app set itself is remembered, never overwritten", async () => {
    setup({
      regs: [{ id: "r1", page_id: "p1", row_type: "individual", email: "one@example.com", created_at: "2026-09-15T14:17:27.000Z", status: "pending", amount_received: null, status_source: "app", expected_amount: 5000, ref_id: "T-001" }],
      mem: [{ page_id: "p1", row_key: "one@example.com|2026-09-15T14:17", registration_id: "r1", last_status: "pending", last_amount: null }],
    });
    sheetBody = csv(csvLine({ "Payment Confirmation": "Paid", Amount: "5000" }));
    const r = await runMirror("p1");
    expect(r).toMatchObject({ ok: true, changed: 0, inserted: 0 });
    expect(rpcCalls).toHaveLength(0);
    expect(regs()[0].status).toBe("pending");
    expect(store.landing_mirror_rows[0]).toMatchObject({ last_status: "paid" });
    noSideEffects();
  });

  it("(e) HTML instead of CSV: fails, writes nothing but the result and the lock", async () => {
    setup();
    sheetBody = "<!DOCTYPE html><html><body>Sign in</body></html>";
    const r = await runMirror("p1");
    expect(r).toMatchObject({ ok: false, error: "Could not read the sheet" });
    expect(db.find("landing_registrations", "insert")).toHaveLength(0);
    expect(db.find("landing_mirror_rows", "upsert")).toHaveLength(0);
    expect(store.landing_pages[0].mirror_running_at).toBeNull();
    expect(store.landing_pages[0].mirror_last_result).toMatchObject({ ok: false, error: "Could not read the sheet" });
    noSideEffects();
  });

  it("(e2) a failed run keeps the last good result and a non-200 is a failure", async () => {
    setup();
    await runMirror("p1");
    sheetStatus = 500;
    await runMirror("p1");
    const stored = store.landing_pages[0].mirror_last_result as { ok: boolean; lastGood?: { ok: boolean; inserted: number } };
    expect(stored.ok).toBe(false);
    expect(stored.lastGood).toMatchObject({ ok: true, inserted: 3 });
  });

  it("(f) lock already held: Already running, nothing touched", async () => {
    setup({ page: { mirror_running_at: new Date().toISOString() } });
    const held = store.landing_pages[0].mirror_running_at;
    const r = await runMirror("p1");
    expect(r).toMatchObject({ ok: false, error: "Already running" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.find("landing_registrations", "insert")).toHaveLength(0);
    expect(store.landing_pages[0].mirror_running_at).toBe(held);
    expect(store.landing_pages[0].mirror_last_result).toBeNull();
  });

  it("(g) preview: counts only, no writes at all", async () => {
    setup();
    const r = await runMirror("p1", { preview: true });
    expect(r).toMatchObject({ ok: true, preview: true, inserted: 3 });
    expect(writes()).toHaveLength(0);
    expect(regs()).toHaveLength(0);
    expect(store.landing_mirror_rows).toHaveLength(0);
    noSideEffects();
  });

  it("inserts a group lead first, then its members linked to the lead", async () => {
    setup();
    sheetBody = csv(
      csvLine({ Name: "Member A", Email: "a@example.com", "Row Type": "Group Member", "Group Lead Email": "lead@example.com", "Submitted At": "9/15/2026 19:00:01", "Ref ID": "", "Expected Amount": "" }),
      csvLine({ Name: "Lead", Email: "lead@example.com", "Row Type": "Group Lead", "Registration Option": "Live — Full Course – Group of 3", "Submitted At": "9/15/2026 19:00:00", "Ref ID": "G-001" }),
    );
    const r = await runMirror("p1");
    expect(r).toMatchObject({ inserted: 2, problems: [] });
    const lead = regs().find((x) => x.row_type === "lead")!;
    const member = regs().find((x) => x.row_type === "member")!;
    expect(regs()[0].row_type).toBe("lead");
    expect(member.lead_registration_id).toBe(lead.id);
    expect(member.ref_id).toBeNull();
  });

  it("gives a repeated Ref ID a -dup2 suffix, including one already on the page", async () => {
    setup({ regs: [{ id: "x", page_id: "p1", row_type: "individual", email: "old@example.com", created_at: "2026-01-01T00:00:00.000Z", status: "pending", amount_received: null, status_source: "app", ref_id: "T-001" }] });
    sheetBody = csv(
      csvLine({}),
      csvLine({ Name: "Person Two", Email: "two@example.com", "Submitted At": "9/15/2026 19:20:00" }),
    );
    await runMirror("p1");
    const refs = regs().map((x) => x.ref_id);
    expect(refs).toContain("T-001-dup2");
    expect(refs).toContain("T-001-dup3");
  });

  it("reports the sheet's Free target and a missing amount as problems, without a status call", async () => {
    setup({
      regs: [{ id: "r1", page_id: "p1", row_type: "individual", email: "one@example.com", created_at: "2026-09-15T14:17:27.000Z", status: "pending", amount_received: null, status_source: "sheet", expected_amount: 5000, ref_id: "T-001" }],
      mem: [{ page_id: "p1", row_key: "one@example.com|2026-09-15T14:17", registration_id: "r1", last_status: "pending", last_amount: null }],
    });
    sheetBody = csv(csvLine({ "Payment Confirmation": "Underpaid" }));
    const r = await runMirror("p1");
    expect(r.changed).toBe(0);
    expect(r.problems).toHaveLength(1);
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses a sheet id that is not a plain id", async () => {
    setup({ page: { mirror_sheet_id: "../evil" } });
    const r = await runMirror("p1");
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("runMirrorForAllPages", () => {
  it("runs every page that has a mirror sheet", async () => {
    store = {
      landing_pages: [
        { id: "p1", mirror_sheet_id: SHEET_ID, mirror_running_at: null },
        { id: "p2", mirror_sheet_id: null, mirror_running_at: null },
      ],
      landing_registrations: [], landing_mirror_rows: [],
    };
    db.state.handler = handler();
    const out = await runMirrorForAllPages();
    expect(out.map((o) => o.pageId)).toEqual(["p1"]);
    expect(out[0].result.ok).toBe(true);
  });
});
