// src/lib/affiliates/payouts.ts
// Pure payout rules (no database).

export const WITHDRAW_PKR = 3500;

export type PayoutMethod = "jazzcash" | "easypaisa" | "bank";
export type PayoutStatus = "pending" | "paid" | "rejected";

export type PayoutDetailsResult =
  | { ok: true; method: PayoutMethod; title: string; number: string }
  | { ok: false; error: string };

export function validatePayoutDetails(i: {
  method: string;
  title: string;
  number: string;
}): PayoutDetailsResult {
  const method = i.method;
  if (method !== "jazzcash" && method !== "easypaisa" && method !== "bank") {
    return { ok: false, error: "Choose JazzCash, Easypaisa or Bank." };
  }
  const title = i.title.trim();
  if (title.length < 2 || title.length > 80) {
    return { ok: false, error: "Account title must be 2 to 80 characters." };
  }
  if (method === "bank") {
    const iban = i.number.replace(/\s+/g, "").toUpperCase();
    if (!/^PK\d{2}[A-Z0-9]{20}$/.test(iban)) {
      return { ok: false, error: "Enter a valid 24-character IBAN starting with PK." };
    }
    return { ok: true, method, title, number: iban };
  }
  const num = i.number.replace(/[\s-]+/g, "");
  if (!/^03\d{9}$/.test(num)) {
    return { ok: false, error: "Enter an 11-digit mobile number starting with 03." };
  }
  return { ok: true, method, title, number: num };
}

export function maskAccount(number: string): string {
  return `•••• ${number.slice(-4)}`;
}

export function availableBalance(balancePkr: number, heldPkr: number): number {
  return Math.max(0, Math.round((balancePkr - heldPkr) * 100) / 100);
}

export function canRequest(available: number): boolean {
  return available >= WITHDRAW_PKR;
}

/** Whole rupees with no decimals, otherwise exactly 2 decimals: "PKR 4,120" or "PKR 4,120.75". */
export function formatPayoutPkr(n: number): string {
  const r = Math.round(n * 100) / 100;
  const whole = Number.isInteger(r);
  return "PKR " + r.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
}
