// tests/landing-gas-delete-rows.test.ts
// The Apps Script action that removes registration rows from an event sheet, and the app client for it.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));
import { deleteRegistrationRows } from "@/lib/gas/event-sheet-client";

const code = readFileSync(join(process.cwd(), "gas", "sheets-sync", "Code.gs"), "utf8").replaceAll("\r\n", "\n");
const fn = (() => {
  const start = code.indexOf("function handleDeleteRegistrationRows_");
  return start === -1 ? "" : code.slice(start, code.indexOf("\n}\n", start) + 3);
})();

describe("Apps Script: deleteRegistrationRows", () => {
  it("is wired into doPost", () => {
    expect(code).toMatch(/body\.action === "deleteRegistrationRows"\)\s*{\s*return handleDeleteRegistrationRows_\(body\);/);
  });
  it("finds rows by Ref ID + email, never by row number, under the sheet lock", () => {
    expect(fn).not.toBe("");
    expect(fn).toContain("landingRowKey_(r.refId, r.email)");
    expect(fn).toContain("LockService.getScriptLock()");
    expect(fn).toContain("lastRow >= 2"); // the header row is never read as data
  });
  it("deletes from the bottom up so row numbers stay right, and only deleteRow is used", () => {
    expect(fn).toMatch(/sort\(\(a, b\) => b - a\)/);
    expect(fn).toContain("sheet.deleteRow(");
    expect(fn).not.toMatch(/setValues|clear\(|clearContent|deleteRows\(|deleteColumn/);
  });
  it("reports rows it could not find instead of failing", () => {
    expect(fn).toContain("missing.push(key)");
    expect(fn).toMatch(/deleted:\s*rowNums\.length/);
  });
});

describe("app client: deleteRegistrationRows", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.GAS_SHEETS_SYNC_URL = "https://script.example/exec";
    process.env.SHEETS_SYNC_SECRET = "s3cret";
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  it("posts the rows with the token and returns the counts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success", ok: true, deleted: 2, missing: ["PZA-1|gone@x.com"] }) });
    globalThis.fetch = fetchMock as never;
    const r = await deleteRegistrationRows("sheet-1", [{ refId: "PZA-1", email: "a@x.com" }]);
    expect(r).toEqual({ ok: true, deleted: 2, missing: ["PZA-1|gone@x.com"] });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({ token: "s3cret", action: "deleteRegistrationRows", sheetId: "sheet-1", rows: [{ refId: "PZA-1", email: "a@x.com" }] });
  });
  it("does not call Apps Script for an empty list", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as never;
    expect(await deleteRegistrationRows("sheet-1", [])).toEqual({ ok: true, deleted: 0, missing: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("reports failure (an old script version answers Unknown action)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "error", message: "Unknown action: deleteRegistrationRows" }) }) as never;
    const r = await deleteRegistrationRows("sheet-1", [{ refId: "PZA-1", email: "a@x.com" }]);
    expect(r.ok).toBe(false);
  });
});
