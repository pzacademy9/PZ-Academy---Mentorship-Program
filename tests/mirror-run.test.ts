import { readFileSync } from "node:fs";
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

import { runMirror, runMirrorForAllPages, MIRROR_PAGE_NOT_FOUND, MIRROR_NO_SHEET } from "@/lib/data/landing-mirror";

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
const fetchMock = vi.fn(async (_url: string, _init?: unknown) => { onFetch?.(); return new Response(sheetBody, { status: sheetStatus }); });

let store: Store;
const rpcCalls: Record<string, unknown>[] = [];
let rpcReply: Res | null = null;
let failInsertFor: string | null = null;
let onFetch: (() => void) | null = null;
function handler(): (op: Op) => Res {
  const base = memoryHandler(store, (_fn, args, st) => {
    const a = args as { p_registration_id: string; p_to_status: string; p_expected_from: string; p_amount: number | null };
    rpcCalls.push(a);
    if (rpcReply) return rpcReply;
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
    if (op.table === "landing_registrations" && op.op === "insert") {
      const item = op.payload as Record<string, unknown>;
      if (failInsertFor && item.email === failInsertFor) return { data: null, error: { code: "XX000" } };
      // ref_id is unique across the whole table
      if (item.ref_id && store.landing_registrations.some((r) => r.ref_id === item.ref_id)) return { data: null, error: { code: "23505" } };
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
const sheetApp = () => ({
  regs: [{ id: "r1", page_id: "p1", row_type: "individual", email: "one@example.com", created_at: "2026-09-15T14:17:27.000Z", status: "pending", amount_received: null, status_source: "sheet", expected_amount: 5000, ref_id: "T-001" }],
  mem: [{ page_id: "p1", row_key: "one@example.com|2026-09-15T14:17", registration_id: "r1", last_status: "pending", last_amount: null }],
});
const writes = () => db.state.ops.filter((o) => ["insert", "update", "upsert", "delete", "rpc"].includes(o.op));
const regs = () => store.landing_registrations;

beforeEach(() => {
  db.reset(); rpcCalls.length = 0; rpcReply = null; failInsertFor = null; onFetch = null;
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

  it("reports an Underpaid row with no amount as a problem, without a status call", async () => {
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

  it("reports a Free target from the sheet as a problem, without a status call", async () => {
    setup(sheetApp());
    sheetBody = csv(csvLine({ "Payment Confirmation": "Free" }));
    const r = await runMirror("p1");
    expect(r.changed).toBe(0);
    expect(r.problems).toHaveLength(1);
    expect(rpcCalls).toHaveLength(0);
  });

  it("a stale reply counts as skipped and leaves the memory alone", async () => {
    setup(sheetApp());
    rpcReply = { data: { ok: false, reason: "stale" }, error: null };
    sheetBody = csv(csvLine({ "Payment Confirmation": "Paid", Amount: "5000" }));
    const r = await runMirror("p1");
    expect(r).toMatchObject({ changed: 0, skipped: 1, problems: [] });
    expect(store.landing_mirror_rows[0].last_status).toBe("pending");
  });

  it("an already-in-status reply counts as skipped and settles the memory", async () => {
    setup(sheetApp());
    rpcReply = { data: { ok: false, reason: "already-in-status" }, error: null };
    sheetBody = csv(csvLine({ "Payment Confirmation": "Paid", Amount: "5000" }));
    const r = await runMirror("p1");
    expect(r).toMatchObject({ changed: 0, skipped: 1, problems: [] });
    expect(store.landing_mirror_rows[0]).toMatchObject({ last_status: "paid", last_amount: 5000 });
  });

  it("loads more than 1000 app rows and memory rows (no false 'App row is gone')", async () => {
    const base = Date.UTC(2026, 8, 1);
    const regsBig = Array.from({ length: 1150 }, (_, i) => ({
      id: `r${String(i).padStart(4, "0")}`, page_id: "p1", row_type: "individual", email: `p${i}@example.com`,
      created_at: new Date(base + i * 60_000).toISOString(), status: "pending", amount_received: null, status_source: "sheet", expected_amount: 5000, ref_id: `B-${i}`,
    }));
    const mem = regsBig.map((r, i) => ({ page_id: "p1", row_key: `p${i}@example.com|${r.created_at.slice(0, 16)}`, registration_id: r.id, last_status: "pending", last_amount: null }));
    setup({ regs: regsBig, mem });
    // The sheet writes Submitted At as M/D/YYYY H:mm:ss in UTC+5.
    const t = new Date(base + 1149 * 60_000 + 5 * 3600_000);
    const at = `${t.getUTCMonth() + 1}/${t.getUTCDate()}/${t.getUTCFullYear()} ${t.getUTCHours()}:${String(t.getUTCMinutes()).padStart(2, "0")}:00`;
    sheetBody = csv(csvLine({ Email: "p1149@example.com", "Submitted At": at, "Ref ID": "B-1149" }));
    const r = await runMirror("p1");
    expect(r.problems).toEqual([]);
    expect(r).toMatchObject({ ok: true, inserted: 0, skipped: 1 });
  });

  it("a lead that cannot be saved blocks its members", async () => {
    setup();
    failInsertFor = "lead@example.com";
    sheetBody = csv(
      csvLine({ Name: "Lead", Email: "lead@example.com", "Row Type": "Group Lead", "Registration Option": "Live — Full Course – Group of 3", "Submitted At": "9/15/2026 19:00:00", "Ref ID": "G-001" }),
      csvLine({ Name: "Member A", Email: "a@example.com", "Row Type": "Group Member", "Group Lead Email": "lead@example.com", "Submitted At": "9/15/2026 19:00:01", "Ref ID": "", "Expected Amount": "" }),
    );
    const r = await runMirror("p1");
    expect(r.inserted).toBe(0);
    expect(r.problems.map((p) => p.reason)).toEqual(["Could not save this row", "The group lead could not be saved"]);
    expect(regs()).toHaveLength(0);
  });

  it("a member never links to an individual row with the lead's email", async () => {
    setup({ regs: [{ id: "i1", page_id: "p1", row_type: "individual", email: "lead@example.com", created_at: "2026-01-01T00:00:00.000Z", status: "pending", amount_received: null, status_source: "app", ref_id: "I-1" }] });
    sheetBody = csv(csvLine({ Name: "Member A", Email: "a@example.com", "Row Type": "Group Member", "Group Lead Email": "lead@example.com", "Ref ID": "", "Expected Amount": "" }));
    const r = await runMirror("p1");
    expect(r.inserted).toBe(0);
    expect(r.problems.map((p) => p.reason)).toEqual(["Group member without a group lead"]);
  });

  it("retries with a -dup suffix when a ref id is taken on another page", async () => {
    setup({ regs: [{ id: "o1", page_id: "p2", row_type: "individual", email: "other@example.com", created_at: "2026-01-01T00:00:00.000Z", status: "pending", amount_received: null, status_source: "app", ref_id: "T-001" }] });
    sheetBody = csv(csvLine({}));
    const r = await runMirror("p1");
    expect(r).toMatchObject({ inserted: 1, problems: [] });
    expect(regs().find((x) => x.page_id === "p1")!.ref_id).toBe("T-001-dup2");
  });

  it("gives up after 5 clashing tries as 'Could not save this row'", async () => {
    setup({ regs: ["T-001", "T-001-dup2", "T-001-dup3", "T-001-dup4", "T-001-dup5"].map((ref, i) => ({ id: `o${i}`, page_id: "p2", row_type: "individual", email: `o${i}@example.com`, created_at: "2026-01-01T00:00:00.000Z", status: "pending", amount_received: null, status_source: "app", ref_id: ref })) });
    sheetBody = csv(csvLine({}));
    const r = await runMirror("p1");
    expect(r.inserted).toBe(0);
    expect(r.problems.map((p) => p.reason)).toEqual(["Could not save this row"]);
  });

  it("makes a stable fallback Ref ID for a blank one and adds a note", async () => {
    sheetBody = csv(csvLine({ "Ref ID": "" }));
    setup();
    const r = await runMirror("p1");
    const ref = regs()[0].ref_id as string;
    expect(ref).toMatch(/^SHEETMIR-[0-9A-F]{10}$/);
    expect(r.problems).toEqual([]);
    expect(r.notes).toEqual(["Row 2 had no Ref ID, one was made"]);
    setup();
    await runMirror("p1");
    expect(regs()[0].ref_id).toBe(ref);
  });

  it("only releases the lock it took", async () => {
    setup();
    const other = new Date(Date.now() + 1000).toISOString();
    onFetch = () => { store.landing_pages[0].mirror_running_at = other; };
    await runMirror("p1");
    expect(store.landing_pages[0].mirror_running_at).toBe(other);
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

  it("one page throwing does not stop the others", async () => {
    store = {
      landing_pages: [
        { id: "p1", mirror_sheet_id: SHEET_ID, mirror_running_at: null },
        { id: "p2", mirror_sheet_id: SHEET_ID, mirror_running_at: null },
      ],
      landing_registrations: [], landing_mirror_rows: [],
    };
    const inner = handler();
    db.state.handler = (op) => {
      if (op.table === "landing_pages" && op.op === "select" && op.filters.some(([, k, v]) => k === "id" && v === "p1")) throw new Error("boom");
      return inner(op);
    };
    const out = await runMirrorForAllPages();
    expect(out.map((o) => o.pageId)).toEqual(["p1", "p2"]);
    expect(out[0].result).toMatchObject({ ok: false, error: "Unexpected error" });
    expect(out[1].result.ok).toBe(true);
  });
});

describe("module hygiene", () => {
  it("never imports anything that sends email, Meta events or jobs", () => {
    const src = readFileSync("src/lib/data/landing-mirror.ts", "utf8");
    const imports = src.split(/\r?\n/).filter((l) => /^\s*import\b/.test(l)).join("\n");
    expect(imports).not.toMatch(/landing-jobs|landing-registration-admin|landing-sheet-sync|email|brevo|meta/i);
  });
});

describe("runMirror not-configured signals", () => {
  it("reports an unknown page with the exported constant", async () => {
    setup();
    const r = await runMirror("missing-page");
    expect(r).toMatchObject({ ok: false, error: MIRROR_PAGE_NOT_FOUND });
  });
  it("reports a page with no sheet with the exported constant", async () => {
    setup({ page: { mirror_sheet_id: null } });
    const r = await runMirror("p1");
    expect(r).toMatchObject({ ok: false, error: MIRROR_NO_SHEET });
  });
});
