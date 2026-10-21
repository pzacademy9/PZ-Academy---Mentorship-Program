import { describe, it, expect } from "vitest";
import {
  parseSheetAmount,
  parseSheetStatus,
  planScan,
  type AppReg,
  type SheetScanRow,
  type Snapshot,
} from "@/lib/landing/registration/sheet-sync-engine";

const reg = (o: Partial<AppReg> = {}): AppReg => ({
  id: "r1", refId: "PPC-1", leadRefId: "PPC-1", rowType: "individual", name: "Ann Lee", email: "ann@x.com",
  whatsapp: "923001234567", status: "pending", amountReceived: null, expectedAmount: 5000, isTest: false, ...o,
});
const row = (o: Partial<SheetScanRow> = {}): SheetScanRow => ({
  rowNumber: 2, refId: "PPC-1", email: "ann@x.com", name: "Ann Lee", whatsapp: "923001234567", status: "Pending", amount: "", rowType: "Individual", ...o,
});
const snap = (o: Partial<Snapshot> = {}): Snapshot => ({
  registrationId: "r1", status: "pending", amountReceived: null, name: "Ann Lee", email: "ann@x.com", whatsapp: "923001234567", ...o,
});

describe("parsers", () => {
  it("parses status words", () => {
    expect(parseSheetStatus(" paid ")).toBe("paid");
    expect(parseSheetStatus("UNDERPAID")).toBe("underpaid");
    expect(parseSheetStatus("done")).toBeNull();
  });
  it("parses amounts", () => {
    expect(parseSheetAmount("")).toBeNull();
    expect(parseSheetAmount("1,500")).toBe(1500);
    expect(parseSheetAmount("-5")).toBe("invalid");
    expect(parseSheetAmount("abc")).toBe("invalid");
  });
});

describe("planScan live", () => {
  it("yields nothing for an unchanged sheet", () => {
    const p = planScan([row()], [reg()], [snap()], "live");
    expect(p.changes).toEqual([]);
    expect(p.appWins).toEqual([]);
    expect(p.rejected).toEqual([]);
  });
  it("applies a sheet status edit (' paid ' becomes Paid)", () => {
    const p = planScan([row({ status: " paid " })], [reg()], [snap()], "live");
    expect(p.changes).toEqual([
      { registrationId: "r1", field: "status", sheetValue: "paid", appValue: "pending" },
      { registrationId: "r1", field: "amount", sheetValue: null, appValue: null },
    ]);
  });
  it("app wins when both sheet and app moved from the snapshot", () => {
    const p = planScan([row({ status: "Paid" })], [reg({ status: "reserved" })], [snap()], "live");
    expect(p.changes).toEqual([]);
    expect(p.appWins).toEqual([{ registrationId: "r1", field: "status" }]);
  });
  it("app change alone with an unchanged sheet is not a change", () => {
    const p = planScan([row()], [reg({ status: "paid" })], [snap()], "live");
    expect(p.changes).toEqual([]);
    expect(p.appWins).toEqual([]);
  });
  it("treats a missing snapshot as equal to app", () => {
    const p = planScan([row()], [reg()], [], "live");
    expect(p.changes).toEqual([]);
  });
  it("underpaid needs an amount", () => {
    const p = planScan([row({ status: "Underpaid" })], [reg()], [snap()], "live");
    expect(p.changes).toEqual([]);
    expect(p.rejected[0]).toMatchObject({ field: "status", reason: "amount-required", rowNumber: 2 });
  });
  it("underpaid with a valid amount changes status and amount", () => {
    const p = planScan([row({ status: "Underpaid", amount: "1,500" })], [reg()], [snap()], "live");
    expect(p.changes.map((c) => [c.field, c.sheetValue])).toEqual([["status", "underpaid"], ["amount", 1500]]);
  });
  it("rejects an amount at or above the price for underpaid", () => {
    const p = planScan([row({ status: "Underpaid", amount: "5000" })], [reg()], [snap()], "live");
    expect(p.rejected[0]).toMatchObject({ reason: "bad-amount" });
  });
  it("rejects bad status text and Free on a paid row", () => {
    expect(planScan([row({ status: "done" })], [reg()], [snap()], "live").rejected[0]).toMatchObject({ field: "status", reason: "bad-status", sheetValue: "done" });
    expect(planScan([row({ status: "Free" })], [reg()], [snap()], "live").rejected[0]).toMatchObject({ reason: "bad-status" });
  });
  it("rejects an invalid amount", () => {
    const p = planScan([row({ status: "Paid", amount: "-5" })], [reg()], [snap()], "live");
    expect(p.rejected[0]).toMatchObject({ field: "status", reason: "bad-amount" });
    const q = planScan([row({ status: "Paid", amount: "-5" })], [reg({ status: "paid" })], [snap({ status: "paid" })], "live");
    expect(q.rejected[0]).toMatchObject({ field: "amount", reason: "bad-amount" });
  });
  it("rejects edits on free and member rows, ignores test rows", () => {
    const f = planScan([row({ status: "Paid" })], [reg({ status: "free" })], [snap({ status: "free" })], "live");
    expect(f.rejected[0]).toMatchObject({ reason: "free-row" });
    const m = planScan([row({ status: "Paid" })], [reg({ rowType: "member", refId: null })], [snap()], "live");
    expect(m.rejected[0]).toMatchObject({ reason: "member-status" });
    const t = planScan([row({ status: "Paid", name: "" })], [reg({ isTest: true })], [snap()], "live");
    expect(t.changes).toEqual([]);
    expect(t.rejected).toEqual([]);
  });
  it("validates name, whatsapp", () => {
    const p = planScan([row({ name: "  ", whatsapp: "12" })], [reg()], [snap()], "live");
    expect(p.rejected.map((r) => r.reason).sort()).toEqual(["bad-name", "bad-whatsapp"]);
    const q = planScan([row({ name: " Bob ", whatsapp: "+92 300 111 2222" })], [reg()], [snap()], "live");
    expect(q.changes.map((c) => [c.field, c.sheetValue])).toEqual([["name", "Bob"], ["whatsapp", "923001112222"]]);
  });
  it("flags duplicates and unknown rows", () => {
    const p = planScan([row(), row({ rowNumber: 3 }), row({ rowNumber: 4, refId: "ZZ-9", email: "q@x.com" })], [reg()], [snap()], "live");
    expect(p.duplicateRows.map((r) => r.rowNumber)).toEqual([3]);
    expect(p.unknownRows.map((r) => r.rowNumber)).toEqual([4]);
  });
});

describe("email fix pairing", () => {
  it("pairs an individual", () => {
    const p = planScan([row({ email: " New@X.com " })], [reg()], [snap()], "live");
    expect(p.changes).toEqual([{ registrationId: "r1", field: "email", sheetValue: "new@x.com", appValue: "ann@x.com" }]);
    expect(p.unknownRows).toEqual([]);
  });
  it("pairs a group member under the lead ref", () => {
    const regs = [reg({ id: "lead", rowType: "lead" }), reg({ id: "m1", rowType: "member", refId: null, email: "m@x.com", name: "Mem" })];
    const rows = [row({ rowNumber: 2 }), row({ rowNumber: 3, email: "mm@x.com", name: "Mem" })];
    const p = planScan(rows, regs, [], "live");
    expect(p.changes).toEqual([{ registrationId: "m1", field: "email", sheetValue: "mm@x.com", appValue: "m@x.com" }]);
  });
  it("rejects a malformed new email", () => {
    const p = planScan([row({ email: "@x.com" })], [reg()], [snap()], "live");
    expect(p.rejected[0]).toMatchObject({ field: "email", reason: "bad-email" });
  });
  it("sends ambiguous leftovers to unknownRows", () => {
    const regs = [reg({ id: "m1", rowType: "member", email: "a@x.com" }), reg({ id: "m2", rowType: "member", email: "b@x.com" })];
    const rows = [row({ email: "c@x.com" }), row({ rowNumber: 3, email: "d@x.com" })];
    const p = planScan(rows, regs, [], "live");
    expect(p.unknownRows).toHaveLength(2);
    expect(p.changes).toEqual([]);
  });
});

describe("review fixes", () => {
  const under = reg({ status: "underpaid", amountReceived: 1500 });
  const underSnap = snap({ status: "underpaid", amountReceived: 1500 });
  it("Underpaid -> Paid with unchanged amount cell carries the amount", () => {
    const p = planScan([row({ status: "Paid", amount: "1500" })], [under], [underSnap], "live");
    expect(p.changes.map((c) => [c.field, c.sheetValue])).toEqual([["status", "paid"], ["amount", 1500]]);
  });
  it("Underpaid -> Pending carries a null amount even if the cell still has one", () => {
    const p = planScan([row({ status: "Pending", amount: "1500" })], [under], [underSnap], "live");
    expect(p.changes.map((c) => [c.field, c.sheetValue])).toEqual([["status", "pending"], ["amount", null]]);
  });
  it("Paid with a blank amount leaves amount null", () => {
    const p = planScan([row({ status: "Paid" })], [reg()], [snap()], "live");
    expect(p.changes.map((c) => [c.field, c.sheetValue])).toEqual([["status", "paid"], ["amount", null]]);
  });
  it("hand-typed row with different name and WhatsApp stays unknown", () => {
    const p = planScan([row({ email: "other@x.com", name: "Someone Else", whatsapp: "923111111111" })], [reg()], [snap()], "live");
    expect(p.unknownRows).toHaveLength(1);
    expect(p.changes).toEqual([]);
  });
  it("duplicate key: winning row gets no identity changes, duplicate still reported", () => {
    const p = planScan([row({ name: "Other", whatsapp: "923009999999" }), row({ rowNumber: 3 })], [reg()], [snap()], "live");
    expect(p.duplicateRows).toHaveLength(1);
    expect(p.changes).toEqual([]);
  });
  it("email fix to an email owned by another registration is rejected", () => {
    const regs = [reg(), reg({ id: "r2", rowType: "member", email: "taken@x.com", name: "T" })];
    const p = planScan([row({ rowNumber: 2 }), row({ rowNumber: 3, email: "taken@x.com", name: "T" })], regs, [], "live");
    expect(p.rejected).toEqual([]);
    const q = planScan([row({ email: "taken@x.com" })], [reg({ email: "old@x.com" }), reg({ id: "r2", refId: "Z", leadRefId: "Z", email: "taken@x.com" })], [], "live");
    expect(q.rejected[0]).toMatchObject({ field: "email", reason: "bad-email" });
  });
  it("amount parsing is strict about separators", () => {
    expect(parseSheetAmount("1.500,00")).toBe("invalid");
    expect(parseSheetAmount("1,5")).toBe("invalid");
    expect(parseSheetAmount("Rs 1500")).toBe("invalid");
    expect(parseSheetAmount("1,50,000")).toBe(150000);
    expect(parseSheetAmount("1,500")).toBe(1500);
  });
});

describe("planScan report", () => {
  it("lists every difference without snapshots", () => {
    const p = planScan([row({ status: "Paid", name: "Zed", whatsapp: "923009999999" })], [reg()], [], "report");
    expect(p.changes.map((c) => c.field).sort()).toEqual(["amount", "name", "status", "whatsapp"]);
    expect(p.appWins).toEqual([]);
  });
  it("ignores snapshots entirely", () => {
    const p = planScan([row({ status: "Paid" })], [reg({ status: "reserved" })], [snap()], "report");
    expect(p.changes.map((c) => c.field)).toEqual(["status", "amount"]);
    expect(p.appWins).toEqual([]);
  });
});
