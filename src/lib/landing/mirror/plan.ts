// src/lib/landing/mirror/plan.ts
// Pure decision table for the batch sheet mirror: sheet rows + app rows + memory -> a list of actions. No I/O.
import type { RegistrationStatus } from "@/lib/landing/registration/config";
import type { MapResult, MirrorSheetRow } from "@/lib/landing/mirror/rows";

export interface AppRowLite {
  id: string; email: string; createdAt: Date; status: RegistrationStatus; amountReceived: number | null;
  statusSource: "app" | "sheet"; rowType: "individual" | "lead" | "member";
}
export interface MemoryRow { rowKey: string; registrationId: string; lastStatus: RegistrationStatus; lastAmount: number | null }

export type MirrorAction =
  | { kind: "insert"; row: MirrorSheetRow }
  | { kind: "link"; rowKey: string; registrationId: string; status: RegistrationStatus; amount: number | null }
  | { kind: "apply"; rowKey: string; registrationId: string; to: RegistrationStatus; amount: number | null; from: RegistrationStatus }
  | { kind: "remember"; rowKey: string; registrationId: string; status: RegistrationStatus; amount: number | null }
  | { kind: "skip"; rowKey: string; reason: "unchanged" | "free-row" | "member-row" }
  | { kind: "problem"; rowNumber: number; reason: string };

const UNMAPPABLE: Record<string, string> = {
  "no-email": "Row has no email", "bad-status": "Unknown status", "bad-time": "Bad date",
  "no-name": "No name", "bad-option": "Unknown option", "bad-amount": "Bad amount",
};
const LINK_WINDOW_MS = 60_000;

type Entry = { rowNumber: number; row: MirrorSheetRow | null; action: MirrorAction | null };

export function planMirror(
  sheet: { rowNumber: number; mapped: MapResult }[],
  app: AppRowLite[],
  memory: MemoryRow[],
): MirrorAction[] {
  const memByKey = new Map(memory.map((m) => [m.rowKey, m]));
  const appById = new Map(app.map((a) => [a.id, a]));
  // App rows already tied to a sheet row (by memory, or by a link made earlier in this plan) are not link candidates.
  const claimed = new Set(memory.map((m) => m.registrationId));
  const seen = new Set<string>();
  const entries: Entry[] = [];

  // Step 1: problems, duplicates and memory hits. Rows left with action === null still need a link or an insert.
  for (const { rowNumber, mapped } of sheet) {
    if (!mapped.ok) {
      entries.push({ rowNumber, row: null, action: { kind: "problem", rowNumber, reason: UNMAPPABLE[mapped.reason] ?? "Bad row" } });
      continue;
    }
    const row = mapped.row;
    // Limitation: two rows with the same email in the same minute share a key and cannot be told apart, so the later one is reported.
    if (seen.has(row.key)) {
      entries.push({ rowNumber, row: null, action: { kind: "problem", rowNumber, reason: "Same row twice" } });
      continue;
    }
    seen.add(row.key);
    const mem = memByKey.get(row.key);
    if (!mem) { entries.push({ rowNumber, row, action: null }); continue; }
    const target = appById.get(mem.registrationId);
    let action: MirrorAction;
    if (!target) action = { kind: "problem", rowNumber, reason: "App row is gone" };
    else if (row.status === mem.lastStatus && row.amountReceived === mem.lastAmount) action = { kind: "skip", rowKey: row.key, reason: "unchanged" };
    else if (target.rowType === "member") action = { kind: "skip", rowKey: row.key, reason: "member-row" };
    else if (target.status === "free") action = { kind: "skip", rowKey: row.key, reason: "free-row" };
    else if (target.statusSource === "app" || (target.status === row.status && target.amountReceived === row.amountReceived)) {
      action = { kind: "remember", rowKey: row.key, registrationId: target.id, status: row.status, amount: row.amountReceived };
    } else {
      action = { kind: "apply", rowKey: row.key, registrationId: target.id, to: row.status, amount: row.amountReceived, from: target.status };
    }
    entries.push({ rowNumber, row, action });
  }

  const link = (e: Entry, a: AppRowLite) => {
    claimed.add(a.id);
    e.action = { kind: "link", rowKey: e.row!.key, registrationId: a.id, status: e.row!.status, amount: e.row!.amountReceived };
  };
  const unclaimed = (row: MirrorSheetRow) =>
    app.filter((a) => !claimed.has(a.id) && a.email.trim().toLowerCase() === row.email && (a.rowType === "member") === (row.rowType === "member"));

  // Step 2: claim near-time matches (within a minute) for every row first, so sheet order cannot steal a row.
  for (const e of entries) {
    if (e.action || !e.row) continue;
    const t = e.row.submittedAt.getTime();
    const near = unclaimed(e.row)
      .filter((a) => Math.abs(a.createdAt.getTime() - t) <= LINK_WINDOW_MS)
      .sort((x, y) => Math.abs(x.createdAt.getTime() - t) - Math.abs(y.createdAt.getTime() - t))[0];
    if (near) link(e, near);
  }

  // Step 3: for the rest, a lone unclaimed app row matches a lone unmatched sheet row with that email; otherwise insert.
  const waiting = (row: MirrorSheetRow) =>
    entries.filter((x) => !x.action && x.row && x.row.email === row.email && (x.row.rowType === "member") === (row.rowType === "member")).length;
  for (const e of entries) {
    if (e.action || !e.row) continue;
    const cands = unclaimed(e.row);
    if (cands.length === 0 || waiting(e.row) > 1) continue; // stays an insert
    if (cands.length === 1) link(e, cands[0]);
    else e.action = { kind: "problem", rowNumber: e.rowNumber, reason: "Ambiguous match" };
  }

  // Step 4: whatever is left is an insert. Members need a lead in the app or among this plan's inserts.
  const insertEmails = new Set(entries.filter((e) => !e.action && e.row && e.row.rowType !== "member").map((e) => e.row!.email));
  const appLeadEmails = new Set(app.filter((a) => a.rowType !== "member").map((a) => a.email.trim().toLowerCase()));
  const first: MirrorAction[] = [];
  const members: MirrorAction[] = [];
  const rest: MirrorAction[] = [];
  for (const e of entries) {
    if (e.action) { rest.push(e.action); continue; }
    const row = e.row!;
    if (row.rowType !== "member") { first.push({ kind: "insert", row }); continue; }
    if (row.leadEmail && (insertEmails.has(row.leadEmail) || appLeadEmails.has(row.leadEmail))) members.push({ kind: "insert", row });
    else rest.push({ kind: "problem", rowNumber: e.rowNumber, reason: "Group member without a group lead" });
  }
  return [...first, ...members, ...rest];
}
