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
    const rows = [
      sheetRow({ email: "lead@example.com", rowType: "lead" }),
      sheetRow({ email: "m@example.com", rowType: "member", leadEmail: "lead@example.com", status: "free", amountReceived: null }),
      sheetRow({ email: "solo@example.com", status: "pending", amountReceived: null }),
      sheetRow({ email: "old@example.com" }),
    ];
    const sheet = rows.map((r, i) => ok(r, i + 2));
    let apps: AppRowLite[] = [appRow({ id: "old", email: "old@example.com", status: "pending" })];
    const memory: MemoryRow[] = [];
    const first = planMirror(sheet, apps, memory);
    let n = 0;
    for (const a of first) {
      if (a.kind === "insert") {
        const id = "new" + n++;
        apps = [...apps, appRow({ id, email: a.row.email, createdAt: a.row.submittedAt, status: a.row.status, amountReceived: a.row.amountReceived, rowType: a.row.rowType })];
        memory.push({ rowKey: a.row.key, registrationId: id, lastStatus: a.row.status, lastAmount: a.row.amountReceived });
      } else if (a.kind === "link" || a.kind === "remember" || a.kind === "apply") {
        const id = a.registrationId;
        const status = a.kind === "apply" ? a.to : a.status;
        apps = apps.map((x) => (x.id === id ? { ...x, status, amountReceived: a.amount } : x));
        memory.push({ rowKey: a.rowKey, registrationId: id, lastStatus: status, lastAmount: a.amount });
      }
    }
    expect(first.every((a) => a.kind !== "problem")).toBe(true);
    const second = planMirror(sheet, apps, memory);
    expect(second).toHaveLength(4);
    expect(second.every((a) => a.kind === "skip")).toBe(true);
  });

  it("amount-only change applies with the new amount", () => {
    const r = sheetRow({ status: "underpaid", amountReceived: 600 });
    const out = planMirror([ok(r)], [appRow({ status: "underpaid", amountReceived: 500 })], [mem(r, "r1", { lastStatus: "underpaid", lastAmount: 500 })]);
    expect(out).toEqual([{ kind: "apply", rowKey: r.key, registrationId: "r1", to: "underpaid", amount: 600, from: "underpaid" }]);
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
    expect(planMirror([ok(m, 4)], [], [])).toEqual([{ kind: "problem", rowNumber: 4, reason: "Group member without a group lead" }]);
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

  it("link does not depend on sheet order: the near-time row gets the app row", () => {
    const late = sheetRow({ submittedAt: new Date("2026-09-15T14:00:00Z") });
    const early = sheetRow({ submittedAt: new Date("2026-09-01T10:00:00Z") });
    const apps = [appRow({ id: "R1", createdAt: new Date("2026-09-01T10:00:20Z") })];
    for (const order of [[late, early], [early, late]]) {
      const out = planMirror(order.map((r, i) => ok(r, i + 2)), apps, []);
      expect(out.filter((a) => a.kind === "link")).toEqual([
        { kind: "link", rowKey: early.key, registrationId: "R1", status: "paid", amount: 1000 },
      ]);
      expect(out.filter((a) => a.kind === "insert")).toEqual([{ kind: "insert", row: late }]);
    }
  });

  it("a second sheet row cannot claim an app row already claimed in the same plan", () => {
    const a = sheetRow({ submittedAt: new Date(T0.getTime() + 10_000) });
    const b = sheetRow({ submittedAt: new Date(T0.getTime() + 50_000) });
    const out = planMirror([ok(a, 2), ok(b, 3)], [appRow()], []);
    expect(out.filter((x) => x.kind === "link")).toHaveLength(1);
    expect(out.filter((x) => x.kind === "insert" || x.kind === "problem")).toHaveLength(1);
  });

  it("member insert whose lead exists only as a member row in the app is a problem", () => {
    const m = sheetRow({ email: "m@example.com", rowType: "member", leadEmail: "lead@example.com" });
    const out = planMirror([ok(m, 6)], [appRow({ id: "x", email: "lead@example.com", rowType: "member" })], []);
    expect(out).toEqual([{ kind: "problem", rowNumber: 6, reason: "Group member without a group lead" }]);
  });

  it("a member sheet row never links to a non-member app row", () => {
    const m = sheetRow({ email: "a@example.com", rowType: "member", leadEmail: "lead@example.com" });
    const out = planMirror([ok(m)], [appRow({ rowType: "lead" })], []);
    expect(out).toEqual([{ kind: "problem", rowNumber: 2, reason: "Group member without a group lead" }]);
  });
  it("a new row whose Ref ID belongs to a remembered app row whose old sheet key vanished is a problem (email or time edited)", () => {
    const old = sheetRow({ email: "a@example.com", refId: "T-001" });
    const edited = sheetRow({ email: "a2@example.com", refId: "t-001" });
    const out = planMirror([ok(edited, 5)], [appRow({ refId: "T-001" })], [mem(old)]);
    expect(out).toEqual([{ kind: "problem", rowNumber: 5, reason: "Looks like an existing sign-up whose email or time was edited in the sheet; fix it in the app" }]);
  });

  it("a reused Ref ID still inserts when the old row is still in the sheet", () => {
    const old = sheetRow({ email: "a@example.com", refId: "T-001" });
    const again = sheetRow({ email: "b@example.com", refId: "T-001" });
    const out = planMirror([ok(old, 2), ok(again, 3)], [appRow({ refId: "T-001" })], [mem(old)]);
    expect(out.filter((a) => a.kind === "insert")).toHaveLength(1);
    expect(out.some((a) => a.kind === "problem")).toBe(false);
  });
});
