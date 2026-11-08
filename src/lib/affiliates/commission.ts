// src/lib/affiliates/commission.ts
// Commission rules, pure. The database trigger in migration 0110 follows the same rules:
// change one, change the other.
//
// Automatic mode: LAST month decides THIS month. 10 or more paid participants in the previous calendar month
// (Pakistan time) means 10% for the whole of this month; otherwise 8%. Manual mode is whatever the owner typed.
// One-time bridge: imported affiliates with 10 or more past sales keep 10% until the end of November 2026.

export const AUTO_LOW = 8;
export const AUTO_HIGH = 10;
/** Paid participants in one calendar month that earn 10% for the next month. */
export const AUTO_STEP = 10;
/** First moment (Pakistan time) the imported-history bridge no longer applies. */
export const BRIDGE_END = "2026-12-01";

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** The Pakistan-time calendar month of a moment, as "YYYY-MM". Pakistan has no daylight saving. */
export function monthKey(d: Date | string): string {
  return new Date(new Date(d).getTime() + PKT_OFFSET_MS).toISOString().slice(0, 7);
}

export function previousMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Live (not cancelled) sales whose commission was first counted in the given Pakistan-time month. */
export function paidInMonth(rows: { createdAt: string; voided: boolean }[], key: string): number {
  return rows.filter((r) => !r.voided && monthKey(r.createdAt) === key).length;
}

export function commissionPercent(a: {
  mode: "manual" | "automatic";
  manualPercent: number | null;
  /** Paid participants in the previous calendar month. */
  lastMonthPaid: number;
  /** Imported past sales. */
  openingSecured: number;
  now: Date;
}): number {
  if (a.mode === "manual") {
    if (a.manualPercent === null || !Number.isFinite(a.manualPercent)) return AUTO_LOW;
    return Math.min(AUTO_HIGH, Math.max(AUTO_LOW, a.manualPercent));
  }
  if (a.openingSecured >= AUTO_STEP && monthKey(a.now) < BRIDGE_END.slice(0, 7)) return AUTO_HIGH;
  return a.lastMonthPaid >= AUTO_STEP ? AUTO_HIGH : AUTO_LOW;
}

export function commissionAmount(amountPaid: number, percent: number): number {
  if (!Number.isFinite(amountPaid) || !Number.isFinite(percent) || amountPaid <= 0 || percent <= 0) return 0;
  return Math.round(amountPaid * percent) / 100;
}

/** All-time paid participants (imported plus new). Used for the certificate, not for the percent. */
export function paidSoFar(openingSecured: number, liveSnapshots: number): number {
  return openingSecured + liveSnapshots;
}

export function balancePkr(a: { openingCommission: number; openingWithdrawn: number; pkrCommissions: number[] }): number {
  const sum = a.pkrCommissions.reduce((t, n) => t + n, 0);
  return Math.round((a.openingCommission - a.openingWithdrawn + sum) * 100) / 100;
}

export type CommissionRow = { currency: string; commission: number; commissionPkr: number | null; voided: boolean };

export function splitCommissions(rows: CommissionRow[]): { earnedPkr: number; waiting: { currency: string; amount: number }[] } {
  let earned = 0;
  const waiting = new Map<string, number>();
  for (const r of rows) {
    if (r.voided) continue;
    if (r.commissionPkr !== null) earned += r.commissionPkr;
    else if (r.currency === "PKR") earned += r.commission;
    else waiting.set(r.currency, (waiting.get(r.currency) ?? 0) + r.commission);
  }
  return {
    earnedPkr: Math.round(earned * 100) / 100,
    waiting: Array.from(waiting.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })),
  };
}
