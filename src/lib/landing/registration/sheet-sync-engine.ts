// src/lib/landing/registration/sheet-sync-engine.ts
// Pure planner for the sheet -> app sync. No I/O: callers load rows, registrations and snapshots, then apply the plan.
import type { RegistrationStatus } from "./config";
import { STATUS_LABELS } from "./sheet-row";
import { checkStatusChange, type ChangeableStatus } from "./status-rules";

export interface SheetScanRow { rowNumber: number; refId: string; email: string; name: string; whatsapp: string; status: string; amount: string; rowType: string }
export interface AppReg { id: string; refId: string | null; leadRefId: string; rowType: "individual" | "lead" | "member"; name: string; email: string; whatsapp: string; status: RegistrationStatus; amountReceived: number | null; expectedAmount: number; isTest: boolean }
export interface Snapshot { registrationId: string; status: RegistrationStatus; amountReceived: number | null; name: string; email: string; whatsapp: string }
export type SyncField = "status" | "amount" | "name" | "email" | "whatsapp";
export type RejectReason = "bad-status" | "bad-amount" | "member-status" | "free-row" | "test-row" | "bad-email" | "bad-name" | "bad-whatsapp" | "amount-required";
export interface PlannedChange { registrationId: string; field: SyncField; sheetValue: string | number | null; appValue: string | number | null }
export interface PlanResult {
  changes: PlannedChange[];
  appWins: { registrationId: string; field: SyncField }[];
  rejected: { registrationId: string; rowNumber: number; field: SyncField; reason: RejectReason; sheetValue: string }[];
  unknownRows: SheetScanRow[];
  duplicateRows: SheetScanRow[];
}

const STATUS_BY_WORD: Record<string, RegistrationStatus> = Object.fromEntries(
  (Object.keys(STATUS_LABELS) as RegistrationStatus[]).map((k) => [STATUS_LABELS[k].toLowerCase(), k]),
);

export function parseSheetStatus(text: string): RegistrationStatus | null {
  return STATUS_BY_WORD[text.trim().toLowerCase()] ?? null;
}

export function parseSheetAmount(text: string): number | null | "invalid" {
  const t = text.trim().replace(/,/g, "");
  if (t === "") return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return "invalid";
  const n = Number(t);
  return Number.isFinite(n) ? n : "invalid";
}

const normEmail = (s: string) => s.trim().toLowerCase();
const normName = (s: string) => s.trim();
const normWa = (s: string) => s.replace(/\D/g, "");
const normRef = (s: string) => s.trim().toUpperCase();
const keyOf = (ref: string, email: string) => `${normRef(ref)}|${normEmail(email)}`;
const validEmail = (e: string) => e.indexOf("@") >= 1;

export function planScan(rows: SheetScanRow[], regs: AppReg[], snapshots: Snapshot[], mode: "report" | "live"): PlanResult {
  const out: PlanResult = { changes: [], appWins: [], rejected: [], unknownRows: [], duplicateRows: [] };
  const snapById = new Map(snapshots.map((s) => [s.registrationId, s]));
  const regByKey = new Map(regs.map((r) => [keyOf(r.leadRefId, r.email), r]));

  // Pass 1: first row per key wins; later ones are duplicates.
  const seen = new Set<string>();
  const matched = new Set<string>();
  const pairs: { row: SheetScanRow; reg: AppReg; emailFix: boolean }[] = [];
  const leftoverRows: SheetScanRow[] = [];
  for (const row of rows) {
    const k = keyOf(row.refId, row.email);
    if (seen.has(k)) { out.duplicateRows.push(row); continue; }
    seen.add(k);
    const reg = regByKey.get(k);
    if (reg) { matched.add(reg.id); pairs.push({ row, reg, emailFix: false }); }
    else leftoverRows.push(row);
  }

  // Pass 2: a leftover row is an email fix only when it is the single leftover row
  // and the single unmatched registration for its Ref ID.
  for (const row of leftoverRows) {
    const ref = normRef(row.refId);
    const rowsLeft = leftoverRows.filter((r) => normRef(r.refId) === ref);
    const regsLeft = regs.filter((r) => !matched.has(r.id) && normRef(r.leadRefId) === ref);
    if (rowsLeft.length === 1 && regsLeft.length === 1) pairs.push({ row, reg: regsLeft[0], emailFix: true });
    else out.unknownRows.push(row);
  }

  for (const { row, reg, emailFix } of pairs) {
    if (reg.isTest) continue;
    planPair(row, reg, emailFix, snapById.get(reg.id), mode, out);
  }
  return out;
}

function planPair(row: SheetScanRow, reg: AppReg, emailFix: boolean, snap: Snapshot | undefined, mode: "report" | "live", out: PlanResult): void {
  const live = mode === "live";
  // What the sheet is compared with: the app value (report) or the last pushed value (live; no snapshot = app).
  const base = live && snap
    ? snap
    : { status: reg.status, amountReceived: reg.amountReceived, name: reg.name, email: reg.email, whatsapp: reg.whatsapp };
  const reject = (field: SyncField, reason: RejectReason, sheetValue: string) =>
    out.rejected.push({ registrationId: reg.id, rowNumber: row.rowNumber, field, reason, sheetValue });
  const change = (field: SyncField, sheetValue: string | number | null, appValue: string | number | null) =>
    out.changes.push({ registrationId: reg.id, field, sheetValue, appValue });
  // In live mode a field the app also moved since the last push is not applied.
  const appMoved = (appChanged: boolean, field: SyncField): boolean => {
    if (live && appChanged) { out.appWins.push({ registrationId: reg.id, field }); return true; }
    return false;
  };

  // Email only differs through the email-fix pairing, since email is part of the match key.
  if (emailFix) {
    const e = normEmail(row.email);
    if (e !== normEmail(base.email) && !appMoved(normEmail(reg.email) !== normEmail(base.email), "email")) {
      if (!validEmail(e)) reject("email", "bad-email", row.email);
      else change("email", e, reg.email);
    }
  }

  const name = normName(row.name);
  if (name !== normName(base.name) && !appMoved(normName(reg.name) !== normName(base.name), "name")) {
    if (name.length < 1 || name.length > 200) reject("name", "bad-name", row.name);
    else change("name", name, reg.name);
  }

  const wa = normWa(row.whatsapp);
  if (wa !== normWa(base.whatsapp) && !appMoved(normWa(reg.whatsapp) !== normWa(base.whatsapp), "whatsapp")) {
    if (wa.length < 8 || wa.length > 15) reject("whatsapp", "bad-whatsapp", row.whatsapp);
    else change("whatsapp", wa, reg.whatsapp);
  }

  // Status and amount are planned together because a status change needs the amount to be valid.
  const status = parseSheetStatus(row.status);
  const amount = parseSheetAmount(row.amount);
  const statusDiff = status === null || status !== base.status;
  const amountDiff = amount === "invalid" || amount !== base.amountReceived;
  const statusActive = statusDiff && !appMoved(reg.status !== base.status, "status");
  const amountActive = amountDiff && !appMoved(reg.amountReceived !== base.amountReceived, "amount");

  if (reg.status === "free" || reg.rowType === "member") {
    const reason: RejectReason = reg.status === "free" ? "free-row" : "member-status";
    if (statusActive) reject("status", reason, row.status);
    if (amountActive) reject("amount", reason, row.amount);
    return;
  }

  if (statusActive) {
    if (status === null || status === "free") { reject("status", "bad-status", row.status); return; }
    if (amount === "invalid") { reject("status", "bad-amount", row.amount); return; }
    const check = checkStatusChange({
      rowType: reg.rowType, from: reg.status, to: status as ChangeableStatus, expectedAmount: reg.expectedAmount, amount,
    });
    if (!check.ok) {
      if (check.reason === "amount-required") reject("status", "amount-required", row.status);
      else if (check.reason === "amount-invalid") reject("status", "bad-amount", row.amount);
      else reject("status", "bad-status", row.status);
      return;
    }
    change("status", status, reg.status);
    if (amountActive) change("amount", amount, reg.amountReceived);
    return;
  }

  if (amountActive) {
    if (amount === "invalid") { reject("amount", "bad-amount", row.amount); return; }
    if (reg.status === "underpaid") {
      if (amount === null) { reject("amount", "amount-required", row.amount); return; }
      if (amount <= 0 || amount >= reg.expectedAmount) { reject("amount", "bad-amount", row.amount); return; }
    } else if (amount !== null && amount <= 0) {
      reject("amount", "bad-amount", row.amount);
      return;
    }
    change("amount", amount, reg.amountReceived);
  }
}
