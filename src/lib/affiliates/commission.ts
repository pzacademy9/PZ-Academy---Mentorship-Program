// src/lib/affiliates/commission.ts
// Commission rules, pure. The database trigger in migration 0109 follows the same rules:
// change one, change the other.

export const AUTO_LOW = 8;
export const AUTO_HIGH = 10;
/** Paid participants (imported plus new) at which Automatic mode moves from 8% to 10%. */
export const AUTO_STEP = 10;

export function commissionPercent(a: {
  mode: "manual" | "automatic";
  manualPercent: number | null;
  paidSoFar: number;
}): number {
  if (a.mode === "manual") {
    if (a.manualPercent === null || !Number.isFinite(a.manualPercent)) return AUTO_LOW;
    return Math.min(AUTO_HIGH, Math.max(AUTO_LOW, a.manualPercent));
  }
  return a.paidSoFar >= AUTO_STEP ? AUTO_HIGH : AUTO_LOW;
}

export function commissionAmount(amountPaid: number, percent: number): number {
  if (!Number.isFinite(amountPaid) || !Number.isFinite(percent) || amountPaid <= 0 || percent <= 0) return 0;
  return Math.round(amountPaid * percent) / 100;
}

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
    waiting: [...waiting.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })),
  };
}
