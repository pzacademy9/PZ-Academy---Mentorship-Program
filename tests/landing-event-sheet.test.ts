// tests/landing-event-sheet.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let adminOk = true;
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (adminOk
    ? { ok: true, user: { id: "admin-user" } }
    : { ok: false, response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) }),
}));
const getPageSheetInfo = vi.fn();
const saveEventSheet = vi.fn();
vi.mock("@/lib/data/landing-event-sheet", () => ({
  getPageSheetInfo: (...a: unknown[]) => getPageSheetInfo(...a),
  saveEventSheet: (...a: unknown[]) => saveEventSheet(...a),
}));
// The client tests call the real createEventSheet; the route tests redirect it to a spy.
const createEventSheetSpy = vi.hoisted(() => vi.fn());
const spy = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/gas/event-sheet-client", async (orig) => {
  const real = await orig<typeof import("@/lib/gas/event-sheet-client")>();
  return {
    ...real,
    createEventSheet: (...a: Parameters<typeof real.createEventSheet>) => (spy.on ? createEventSheetSpy(...a) : real.createEventSheet(...a)),
  };
});

import { createEventSheet, appendRegistrationRows, uploadLandingVoucher } from "@/lib/gas/event-sheet-client";
import { POST as createSheet } from "@/app/api/admin/landing-pages/[id]/sheet/route";
import { SHEET_HEADERS } from "@/lib/landing/registration/sheet-row";

const fetchMock = vi.fn();
const gasReply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  adminOk = true;
  fetchMock.mockReset();
  getPageSheetInfo.mockReset();
  saveEventSheet.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GAS_SHEETS_SYNC_URL", "https://script.google.com/macros/s/abc/exec");
  vi.stubEnv("SHEETS_SYNC_SECRET", "sync-secret-value");
  vi.stubEnv("GAS_SHARED_SECRET", "drive-secret-value");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const sentBody = (i = 0) => JSON.parse(fetchMock.mock.calls[i][1].body as string);

describe("event-sheet-client", () => {
  beforeEach(() => { spy.on = false; });
  it("createEventSheet posts the sync token and returns the ids", async () => {
    fetchMock.mockReturnValue(gasReply({ status: "success", sheetId: "sheet-1", driveFolderId: "folder-1" }));
    expect(await createEventSheet("PPC Batch 4")).toEqual({ ok: true, sheetId: "sheet-1", driveFolderId: "folder-1" });
    expect(sentBody()).toEqual({ token: "sync-secret-value", action: "createEventSheet", title: "PPC Batch 4", folderName: "PPC Batch 4" });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", cache: "no-store" });
  });
  it("surfaces the Apps Script error message but never the secret", async () => {
    fetchMock.mockReturnValue(gasReply({ status: "error", message: "Wrong password." }));
    const r = await createEventSheet("x");
    expect(r).toEqual({ ok: false, message: "Wrong password." });
    expect(JSON.stringify(r)).not.toContain("sync-secret-value");
  });
  it("reports missing configuration without calling out", async () => {
    vi.stubEnv("SHEETS_SYNC_SECRET", "");
    expect((await createEventSheet("x")).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("handles HTTP errors, bad JSON, timeouts and missing ids", async () => {
    fetchMock.mockReturnValueOnce(gasReply({}, 500));
    expect(await createEventSheet("x")).toEqual({ ok: false, message: "Apps Script returned HTTP 500." });
    fetchMock.mockReturnValueOnce(Promise.resolve(new Response("<html>", { status: 200 })));
    expect(await createEventSheet("x")).toEqual({ ok: false, message: "Apps Script returned a non-JSON reply." });
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("t"), { name: "TimeoutError" }));
    expect(await createEventSheet("x")).toEqual({ ok: false, message: "Apps Script timed out." });
    fetchMock.mockReturnValueOnce(gasReply({ status: "success" }));
    expect((await createEventSheet("x")).ok).toBe(false);
  });
  it("appendRegistrationRows sends rows with the sync token", async () => {
    fetchMock.mockReturnValue(gasReply({ status: "success", appended: 1 }));
    const row = Array.from({ length: 23 }, (_, i) => `c${i}`);
    expect(await appendRegistrationRows("sheet-1", [row])).toEqual({ ok: true });
    expect(sentBody()).toEqual({ token: "sync-secret-value", action: "appendRegistrationRows", sheetId: "sheet-1", rows: [row] });
  });
  it("uploadLandingVoucher uses the Drive secret and the page folder", async () => {
    fetchMock.mockReturnValue(gasReply({ status: "success", url: "https://drive.google.com/file/d/f1/view", fileId: "f1" }));
    const r = await uploadLandingVoucher("ppc-b3", { base64: "AAAA", mimeType: "image/png", filename: "voucher_1.png" }, "folder-1");
    expect(r).toEqual({ ok: true, url: "https://drive.google.com/file/d/f1/view" });
    expect(sentBody()).toEqual({
      action: "uploadLandingVoucher", secret: "drive-secret-value", pageSlug: "ppc-b3",
      mimeType: "image/png", base64: "AAAA", filename: "voucher_1.png", folderId: "folder-1",
    });
  });
  it("uploadLandingVoucher rejects a non-https url", async () => {
    fetchMock.mockReturnValue(gasReply({ status: "success", url: "javascript:alert(1)" }));
    expect((await uploadLandingVoucher("ppc-b3", { base64: "A", mimeType: "image/png", filename: "v.png" })).ok).toBe(false);
  });
});

describe("POST /api/admin/landing-pages/[id]/sheet", () => {
  const PAGE_ID = "00000000-0000-4000-8000-000000000001";
  const ctx = { params: Promise.resolve({ id: PAGE_ID }) };
  const req = () => new Request("http://x", { method: "POST" }) as never;
  const info = (over: Record<string, unknown> = {}) => ({
    id: PAGE_ID, slug: "ppc-b4", title: "PPC Batch 4", sheetId: null, driveFolderId: null, refPrefix: null, draftRefPrefix: "ppc", ...over,
  });
  beforeEach(() => { spy.on = true; createEventSheetSpy.mockReset(); });

  it("passes the admin gate response through", async () => {
    adminOk = false;
    expect((await createSheet(req(), ctx)).status).toBe(403);
    expect(getPageSheetInfo).not.toHaveBeenCalled();
  });
  it("404 for an unknown page", async () => {
    getPageSheetInfo.mockResolvedValue(null);
    expect((await createSheet(req(), ctx)).status).toBe(404);
  });
  it("404s a malformed id without reading the page", async () => {
    const res = await createSheet(req(), { params: Promise.resolve({ id: "page-1" }) });
    expect(res.status).toBe(404);
    expect(getPageSheetInfo).not.toHaveBeenCalled();
  });
  it("409 and no new sheet when one already exists", async () => {
    getPageSheetInfo.mockResolvedValue(info({ sheetId: "sheet-0" }));
    const res = await createSheet(req(), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ sheetId: "sheet-0" });
    expect(createEventSheetSpy).not.toHaveBeenCalled();
  });
  it("422 without a usable reference prefix", async () => {
    getPageSheetInfo.mockResolvedValue(info({ draftRefPrefix: "" }));
    expect((await createSheet(req(), ctx)).status).toBe(422);
  });
  it("creates the sheet, then saves sheet, folder and uppercase prefix", async () => {
    getPageSheetInfo.mockResolvedValue(info());
    createEventSheetSpy.mockResolvedValue({ ok: true, sheetId: "sheet-1", driveFolderId: "folder-1" });
    saveEventSheet.mockResolvedValue({ ok: true });
    const res = await createSheet(req(), ctx);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ sheetId: "sheet-1", driveFolderId: "folder-1", refPrefix: "PPC", sheetUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit" });
    expect(createEventSheetSpy).toHaveBeenCalledWith("PPC Batch 4", "PPC Batch 4 - ppc-b4");
    expect(saveEventSheet).toHaveBeenCalledWith(PAGE_ID, { sheetId: "sheet-1", driveFolderId: "folder-1", refPrefix: "PPC" });
  });
  it("502 when Apps Script fails; 409 when a parallel click won the race", async () => {
    getPageSheetInfo.mockResolvedValue(info());
    createEventSheetSpy.mockResolvedValueOnce({ ok: false, message: "Exception: no access" });
    expect((await createSheet(req(), ctx)).status).toBe(502);
    createEventSheetSpy.mockResolvedValueOnce({ ok: true, sheetId: "sheet-2", driveFolderId: "folder-2" });
    saveEventSheet.mockResolvedValueOnce({ ok: false, reason: "already-set" });
    expect((await createSheet(req(), ctx)).status).toBe(409);
  });
});

describe("GAS source", () => {
  const root = process.cwd();
  const code = readFileSync(join(root, "gas", "sheets-sync", "Code.gs"), "utf8");
  const mirror = readFileSync(join(root, "gas", "clasp-project", "Sheet Sync.js"), "utf8");

  it("the clasp mirror is byte-identical to the source of truth", () => {
    expect(mirror).toBe(code);
  });
  it("LANDING_HEADERS matches SHEET_HEADERS exactly", () => {
    const m = code.match(/const LANDING_HEADERS = (\[[^\]]*\]);/);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1])).toEqual(SHEET_HEADERS);
    expect(SHEET_HEADERS).toHaveLength(23);
  });
  it("voucher upload is dispatched before the SYNC_SECRET gate; sheet actions after it", () => {
    const gate = code.indexOf('body.token !== props.getProperty("SYNC_SECRET")');
    expect(code.indexOf('body.action === "uploadLandingVoucher"')).toBeGreaterThan(-1);
    expect(code.indexOf('body.action === "uploadLandingVoucher"')).toBeLessThan(gate);
    expect(code.indexOf('body.action === "createEventSheet"')).toBeGreaterThan(gate);
    expect(code.indexOf('body.action === "appendRegistrationRows"')).toBeGreaterThan(gate);
  });
  it("neutralizes formula injection and uses the Free/Paid status list", () => {
    expect(code).toContain('const LANDING_STATUS_VALUES = ["Paid", "Pending", "Underpaid", "Reserved", "Free"];');
    expect(code).toContain("/^[=+\\-@\\t\\r]/.test(s)");
  });
  it("grows the sheet before the first range write when appended rows pass the last row", () => {
    const fn = code.slice(code.indexOf("function handleAppendRegistrationRows_"), code.indexOf("function handleUploadLandingVoucher_"));
    const grow = fn.indexOf("sheet.insertRowsAfter(sheet.getMaxRows(), need)");
    expect(fn).toContain("const need = start + fresh.length - 1 - sheet.getMaxRows();");
    expect(grow).toBeGreaterThan(-1);
    expect(grow).toBeLessThan(fn.indexOf("setNumberFormat"));
    expect(grow).toBeLessThan(fn.indexOf(".setValues(values)"));
  });
  it("forces plain-text format on WhatsApp, Promo Code, Ref ID and Promo Code Used before setValues", () => {
    // Columns C, I, S, V (1-based) must be text so 03001234567 / 1E5 / numeric-looking ref ids survive.
    expect(code).toContain("const LANDING_TEXT_COLS = [3, 9, 19, 22];");
    expect(LANDING_COLS_HEADERS()).toEqual(["WhatsApp", "Promo Code", "Ref ID", "Promo Code Used"]);
    const fn = code.slice(code.indexOf("function handleAppendRegistrationRows_"), code.indexOf("function handleUploadLandingVoucher_"));
    const fmt = fn.indexOf("setNumberFormat(\"@\")");
    const set = fn.indexOf(".setValues(values)");
    expect(fmt).toBeGreaterThan(-1);
    expect(set).toBeGreaterThan(-1);
    expect(fmt).toBeLessThan(set);
    expect(fn).toContain("LANDING_TEXT_COLS");
  });
  it("never prefixes an apostrophe onto the text-formatted columns", () => {
    const fn = code.slice(code.indexOf("function landingCell_"), code.indexOf("function landingRowKey_"));
    expect(fn).toContain("LANDING_TEXT_COLS");
  });

  function LANDING_COLS_HEADERS() {
    return [3, 9, 19, 22].map((c) => SHEET_HEADERS[c - 1]);
  }
});
