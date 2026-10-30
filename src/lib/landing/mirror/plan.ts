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
  | { kind: "skip"; rowKey: string; reason: "unchanged" | "app-owns-row" | "free-row" | "member-row" | "orphan-member" }
  | { kind: "problem"; rowNumber: number; reason: string };

const UNMAPPABLE: Record<string, string> = {
  "no-email": "Row has no email", "bad-status": "Unknown status", "bad-time": "Bad date",
  "no-name": "No name", "bad-option": "Unknown option", "bad-amount": "Bad amount",
};
const LINK_WINDOW_MS = 60_000;

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

  const inserts: { rowNumber: number; row: MirrorSheetRow }[] = [];
  const out: { order: number; action: MirrorAction }[] = []; // non-insert actions with sheet position
  const insertEmails = new Set<string>();

  // Pass 1: decide every row except the orphan-member check, which needs the full insert list.
  sheet.forEach(({ rowNumber, mapped }, order) => {
    if (!mapped.ok) {
      out.push({ order, action: { kind: "problem", rowNumber, reason: UNMAPPABLE[mapped.reason] ?? "Bad row" } });
      return;
    }
    const row = mapped.row;
    // Limitation: two rows with the same email in the same minute share a key and cannot be told apart, so the later one is reported.
    if (seen.has(row.key)) {
      out.push({ order, action: { kind: "problem", rowNumber, reason: "Same row twice" } });
      return;
    }
    seen.add(row.key);

    const mem = memByKey.get(row.key);
    if (mem) {
      const target = appById.get(mem.registrationId);
      if (!target) { out.push({ order, action: { kind: "problem", rowNumber, reason: "App row is gone" } }); return; }
      const remember: MirrorAction = { kind: "remember", rowKey: row.key, registrationId: target.id, status: row.status, amount: row.amountReceived };
      if (row.status === mem.lastStatus && row.amountReceived === mem.lastAmount) {
        out.push({ order, action: { kind: "skip", rowKey: row.key, reason: "unchanged" } });
      } else if (target.rowType === "member") {
        out.push({ order, action: { kind: "skip", rowKey: row.key, reason: "member-row" } });
      } else if (target.status === "free") {
        out.push({ order, action: { kind: "skip", rowKey: row.key, reason: "free-row" } });
      } else if (target.statusSource === "app") {
        out.push({ order, action: remember });
      } else if (target.status === row.status && target.amountReceived === row.amountReceived) {
        out.push({ order, action: remember });
      } else {
        out.push({ order, action: { kind: "apply", rowKey: row.key, registrationId: target.id, to: row.status, amount: row.amountReceived, from: target.status } });
      }
      return;
    }

    const candidates = app.filter((a) => a.email.trim().toLowerCase() === row.email && !claimed.has(a.id));
    if (candidates.length > 0) {
      const t = row.submittedAt.getTime();
      const near = candidates
        .filter((a) => Math.abs(a.createdAt.getTime() - t) <= LINK_WINDOW_MS)
        .sort((x, y) => Math.abs(x.createdAt.getTime() - t) - Math.abs(y.createdAt.getTime() - t))[0];
      const pick = near ?? (candidates.length === 1 ? candidates[0] : undefined);
      if (!pick) { out.push({ order, action: { kind: "problem", rowNumber, reason: "Ambiguous match" } }); return; }
      claimed.add(pick.id);
      out.push({ order, action: { kind: "link", rowKey: row.key, registrationId: pick.id, status: row.status, amount: row.amountReceived } });
      return;
    }

    inserts.push({ rowNumber, row });
    if (row.rowType !== "member") insertEmails.add(row.email);
    out.push({ order, action: { kind: "insert", row } });
  });

  const appLeadEmails = new Set(app.filter((a) => a.rowType !== "member").map((a) => a.email.trim().toLowerCase()));
  const rowNumberByKey = new Map(inserts.map((i) => [i.row.key, i.rowNumber]));

  const first: MirrorAction[] = [];
  const members: MirrorAction[] = [];
  const rest: MirrorAction[] = [];
  for (const { action } of out) {
    if (action.kind !== "insert") { rest.push(action); continue; }
    if (action.row.rowType !== "member") { first.push(action); continue; }
    const lead = action.row.leadEmail;
    if (lead && (insertEmails.has(lead) || appLeadEmails.has(lead))) members.push(action);
    else rest.push({ kind: "problem", rowNumber: rowNumberByKey.get(action.row.key) ?? 0, reason: "orphan-member" });
  }
  return [...first, ...members, ...rest];
}
