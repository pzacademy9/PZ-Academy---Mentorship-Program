import { describe, it, expect } from "vitest";
import { planMirror, type AppRowLite, type MemoryRow } from "@/lib/landing/mirror/plan";
import { rowKey, type MapResult, type MirrorSheetRow } from "@/lib/landing/mirror/rows";

const T0 = new Date("2026-09-15T14:17:27Z");

function sheetRow(over: Partial<MirrorSheetRow> = {}): MirrorSheetRow {
  const email = over.email ?? "a@example.com";
  const submittedAt = over.submittedAt ?? T0;
  return {
    key: rowKey(email, submittedAt), email, submittedAt, name: "Student", whatsapp: "", profession: "", discovery: "",
    consent: true, rowType: "individual", leadEmail: "", optionLabel: "Live — Full Course – Individual", mode: "live",
    tierKey: "individual", groupSize: 1, region: "PK", currency: "PKR", promoCodeText: "", expectedAmount: 1000,
    paymentMethod: "", voucherUrl: "", status: "paid", amountReceived: 1000, emailStatusText: "", refId: "", ...over,
  };
}
const ok = (row: MirrorSheetRow, rowNumber = 2): { rowNumber: number; mapped: MapResult } => ({ rowNumber, mapped: { ok: true, row } });

function appRow(over: Partial<AppRowLite> = {}): AppRowLite {
  return {
    id: "r1", email: "a@example.com", createdAt: T0, status: "pending", amountReceived: null, statusSource: "sheet",
    rowType: "individual", ...over,
  };
}
function mem(row: MirrorSheetRow, registrationId = "r1", over: Partial<MemoryRow> = {}): MemoryRow {
  return { rowKey: row.key, registrationId, lastStatus: row.status, lastAmount: row.amountReceived, ...over };
}

describe("planMirror", () => {
  it("unmappable sheet row becomes a problem with the row number", () => {
    const out = planMirror([{ rowNumber: 7, mapped: { ok: false, reason: "no-email" } }], [], []);
    expect(out).toEqual([{ kind: "problem", rowNumber: 7, reason: "Row has no email" }]);
  });

  it("every unmappable reason has a plain-English message", () => {
    const reasons = ["no-email", "bad-status", "bad-time", "no-name", "bad-option", "bad-amount"] as const;
    const out = planMirror(reasons.map((reason, i) => ({ rowNumber: i + 2, mapped: { ok: false as const, reason } })), [], []);
    expect(out.map((a) => (a.kind === "problem" ? a.reason : ""))).toEqual([
      "Row has no email", "Unknown status", "Bad date", "No name", "Unknown option", "Bad amount",
    ]);
  });

  it("new sheet row with no app match is inserted", () => {
    const r = sheetRow();
    expect(planMirror([ok(r)], [], [])).toEqual([{ kind: "insert", row: r }]);
  });

  it("memory hit with a changed status applies from the current app status", () => {
    const r = sheetRow({ status: "paid", amountReceived: 1000 });
    const out = planMirror([ok(r)], [appRow({ status: "pending" })], [mem(r, "r1", { lastStatus: "pending", lastAmount: null })]);
    expect(out).toEqual([{ kind: "apply", rowKey: r.key, registrationId: "r1", to: "paid", amount: 1000, from: "pending" }]);
  });

  it("second run over the same data yields only skips", () => {
    const r = sheetRow();
    const out = planMirror([ok(r)], [appRow({ status: "paid", amountReceived: 1000 })], [mem(r)]);
    expect(out).toEqual([{ kind: "skip", rowKey: r.key, reason: "unchanged" }]);
  });

  it("app-owned row is never moved by the sheet", () => {
    const r = sheetRow({ status: "paid" });
    const out = planMirror([ok(r)], [appRow({ status: "underpaid", statusSource: "app" })], [mem(r, "r1", { lastStatus: "pending", lastAmount: null })]);
    expect(out).toEqual([{ kind: "remember", rowKey: r.key, registrationId: "r1", status: "paid", amount: 1000 }]);
  });

  it("member and free app rows are skipped on change", () => {
    const r = sheetRow({ status: "paid" });
    const stale = { lastStatus: "pending" as const, lastAmount: null };
    expect(planMirror([ok(r)], [appRow({ rowType: "member" })], [mem(r, "r1", stale)]))
      .toEqual([{ kind: "skip", rowKey: r.key, reason: "member-row" }]);
    expect(planMirror([ok(r)], [appRow({ status: "free" })], [mem(r, "r1", stale)]))
      .toEqual([{ kind: "skip", rowKey: r.key, reason: "free-row" }]);
  });

  it("memory hit where the app already matches the sheet remembers instead of applying", () => {
    const r = sheetRow({ status: "paid", amountReceived: 1000 });
    const out = planMirror([ok(r)], [appRow({ status: "paid", amountReceived: 1000 })], [mem(r, "r1", { lastStatus: "pending", lastAmount: null })]);
    expect(out).toEqual([{ kind: "remember", rowKey: r.key, registrationId: "r1", status: "paid", amount: 1000 }]);
  });

  it("memory points at a deleted app row becomes a problem", () => {
    const r = sheetRow({});
    const out = planMirror([ok(r, 5)], [], [mem(r, "gone")]);
    expect(out).toEqual([{ kind: "problem", rowNumber: 5, reason: "App row is gone" }]);
  });

  it("unmemorised sheet row with one same-email app row links to it", () => {
    const r = sheetRow({ status: "paid", amountReceived: 1000 });
    const out = planMirror([ok(r)], [appRow({ createdAt: new Date(T0.getTime() + 30_000) })], []);
    expect(out).toEqual([{ kind: "link", rowKey: r.key, registrationId: "r1", status: "paid", amount: 1000 }]);
  });

  it("link prefers the app row within a minute when several share the email", () => {
    const r = sheetRow();
    const apps = [
      appRow({ id: "far", createdAt: new Date(T0.getTime() - 3600_000) }),
      appRow({ id: "near", createdAt: new Date(T0.getTime() + 20_000) }),
    ];
    const out = planMirror([ok(r)], apps, []);
    expect(out[0]).toMatchObject({ kind: "link", registrationId: "near" });
  });

  it("several same-email app rows and none close is ambiguous", () => {
    const r = sheetRow();
    const apps = [
      appRow({ id: "x", createdAt: new Date(T0.getTime() - 3600_000) }),
      appRow({ id: "y", createdAt: new Date(T0.getTime() + 3600_000) }),
    ];
    expect(planMirror([ok(r, 9)], apps, [])).toEqual([{ kind: "problem", rowNumber: 9, reason: "Ambiguous match" }]);
  });

  it("same email at a different time is a separate insert", () => {
    const first = sheetRow();
    const second = sheetRow({ submittedAt: new Date(T0.getTime() + 86_400_000) });
    const out = planMirror([ok(first, 2), ok(second, 3)], [appRow({ status: "paid", amountReceived: 1000 })], [mem(first)]);
    expect(out).toEqual([
      { kind: "insert", row: second },
      { kind: "skip", rowKey: first.key, reason: "unchanged" },
    ]);
  });

  it("duplicate key in one read: first processed, second is a problem", () => {
    const r = sheetRow();
    const out = planMirror([ok(r, 2), ok({ ...r }, 3)], [], []);
    expect(out).toEqual([{ kind: "insert", row: r }, { kind: "problem", rowNumber: 3, reason: "Same row twice" }]);
  });

  it("orphan member becomes a problem", () => {
    const m = sheetRow({ email: "m@example.com", rowType: "member", leadEmail: "lead@example.com" });
    expect(planMirror([ok(m, 4)], [], [])).toEqual([{ kind: "problem", rowNumber: 4, reason: "orphan-member" }]);
  });

  it("member insert is accepted when its lead is in the app list", () => {
    const m = sheetRow({ email: "m@example.com", rowType: "member", leadEmail: "lead@example.com" });
    const out = planMirror([ok(m)], [appRow({ id: "L", email: "lead@example.com", rowType: "lead" })], []);
    expect(out).toEqual([{ kind: "insert", row: m }]);
  });

  it("members are inserted after their leads regardless of sheet order, other actions last", () => {
    const m = sheetRow({ email: "m@example.com", rowType: "member", leadEmail: "lead@example.com" });
    const lead = sheetRow({ email: "lead@example.com", rowType: "lead" });
    const solo = sheetRow({ email: "solo@example.com" });
    const old = sheetRow({ email: "old@example.com" });
    const out = planMirror(
      [ok(m, 2), ok(old, 3), ok(lead, 4), ok(solo, 5)],
      [appRow({ id: "o", email: "old@example.com", status: "paid", amountReceived: 1000 })],
      [mem(old, "o")],
    );
    expect(out.map((a) => a.kind + ":" + (a.kind === "insert" ? a.row.email : ""))).toEqual([
      "insert:lead@example.com", "insert:solo@example.com", "insert:m@example.com", "skip:",
    ]);
  });
});
