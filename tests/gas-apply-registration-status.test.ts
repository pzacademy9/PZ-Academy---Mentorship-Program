// tests/gas-apply-registration-status.test.ts
// Runs the real Apps Script source in a vm sandbox with a fake SpreadsheetApp.
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const root = process.cwd();
const code = readFileSync(join(root, "gas", "sheets-sync", "Code.gs"), "utf8");
const mirror = readFileSync(join(root, "gas", "clasp-project", "Sheet Sync.js"), "utf8");

const COLS = 24;
type Cell = string | number;
const makeRow = (ref: string, email: string, o: Cell = "", p: Cell = ""): Cell[] => {
  const r: Cell[] = Array(COLS).fill("");
  r[0] = "Name " + email; r[1] = email; r[7] = "Group Lead"; r[14] = o; r[15] = p; r[18] = ref; r[23] = "keep-" + ref;
  return r;
};

function fakeSheet(data: Cell[][]) {
  const writes: { row: number; col: number; values: Cell[][] }[] = [];
  const sheet = {
    getLastRow: () => data.length,
    getRange(row: number, col: number, nr = 1, nc = 1) {
      const slice = () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (data[row - 1 + i] ?? [])[col - 1 + j] ?? ""));
      return {
        getDisplayValues: () => slice().map((r) => r.map(String)),
        getValues: slice,
        setValues(values: Cell[][]) {
          writes.push({ row, col, values });
          values.forEach((vr, i) => vr.forEach((v, j) => { data[row - 1 + i][col - 1 + j] = v; }));
        },
      };
    },
  };
  return { sheet, writes };
}

function load(data: Cell[][], secret = "good") {
  const { sheet, writes } = fakeSheet(data);
  const sandbox: Record<string, unknown> = {
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet, getSheets: () => [sheet] }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => (k === "SYNC_SECRET" ? secret : null) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (s: string) => ({ s, setMimeType() { return this; }, getContent() { return s; } }),
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  const post = (body: unknown) => JSON.parse((sandbox.doPost as (e: unknown) => { getContent(): string })({ postData: { contents: JSON.stringify(body) } }).getContent());
  return { post, writes };
}

const grid = () => [
  Array(COLS).fill("hdr"),
  makeRow("PPC-1", "a@x.com", "", "Pending"),
  makeRow("PPC-1", "b@x.com", "", "Pending"),
  makeRow("PPC-2", "a@x.com", 100, "Pending"),
];

describe("applyRegistrationStatus", () => {
  let data: Cell[][];
  beforeEach(() => { data = grid(); });

  it("updates P and O for the matching ref and email only", () => {
    const { post } = load(data);
    const r = post({ token: "good", action: "applyRegistrationStatus", sheetId: "s", rows: [{ refId: "ppc-1", email: " A@X.com ", status: "Paid", amountReceived: 5000 }] });
    expect(r).toMatchObject({ status: "success", ok: true, updated: 1, missing: [] });
    expect(data[1][15]).toBe("Paid");
    expect(data[1][14]).toBe(5000);
    expect(data[2][15]).toBe("Pending");
    expect(data[3][15]).toBe("Pending");
    expect(data[3][14]).toBe(100);
  });

  it("blanks O when amountReceived is null", () => {
    const { post } = load(data);
    post({ token: "good", action: "applyRegistrationStatus", sheetId: "s", rows: [{ refId: "PPC-2", email: "a@x.com", status: "Reserved", amountReceived: null }] });
    expect(data[3][14]).toBe("");
    expect(data[3][15]).toBe("Reserved");
  });

  it("leaves other rows and columns untouched", () => {
    const before = JSON.stringify(data);
    const { post, writes } = load(data);
    post({ token: "good", action: "applyRegistrationStatus", sheetId: "s", rows: [
      { refId: "PPC-1", email: "a@x.com", status: "Underpaid", amountReceived: 1 },
      { refId: "PPC-1", email: "b@x.com", status: "Paid", amountReceived: 2 },
    ] });
    for (const w of writes) {
      expect(w.col).toBe(15);
      expect(w.values.every((row) => row.length === 2)).toBe(true);
    }
    const after = data.map((row, i) => row.map((c, j) => ((i === 1 || i === 2) && (j === 14 || j === 15) ? "" : c)));
    const orig = (JSON.parse(before) as Cell[][]).map((row, i) => row.map((c, j) => ((i === 1 || i === 2) && (j === 14 || j === 15) ? "" : c)));
    expect(after).toEqual(orig);
    expect(writes.length).toBe(1); // adjacent rows are batched into one write
  });

  it("reports missing rows", () => {
    const { post } = load(data);
    const r = post({ token: "good", action: "applyRegistrationStatus", sheetId: "s", rows: [
      { refId: "PPC-9", email: "z@x.com", status: "Paid", amountReceived: 1 },
      { refId: "PPC-2", email: "a@x.com", status: "Paid", amountReceived: 1 },
    ] });
    expect(r).toMatchObject({ ok: true, updated: 1, missing: ["PPC-9|z@x.com"] });
    expect(data[3][15]).toBe("Paid");
  });

  it("rejects a wrong secret", () => {
    const { post, writes } = load(data);
    const r = post({ token: "bad", action: "applyRegistrationStatus", sheetId: "s", rows: [{ refId: "PPC-1", email: "a@x.com", status: "Paid", amountReceived: 1 }] });
    expect(r).toEqual({ status: "error", message: "Wrong password." });
    expect(writes).toHaveLength(0);
  });

  it("the two script files are identical", () => {
    expect(mirror).toBe(code);
  });
});
