// Pure rules for changing a registration's payment status by hand.
import type { RegistrationStatus } from "./config";

export const CHANGEABLE_STATUSES = ["pending", "reserved", "underpaid", "paid"] as const;
export type ChangeableStatus = (typeof CHANGEABLE_STATUSES)[number];

export type StatusChangeCheck =
  | { ok: true; amountReceived: number | null }
  | { ok: false; reason: "free-row" | "member-row" | "amount-required" | "amount-invalid" | "already-in-status" };

export const STATUS_CHANGE_MESSAGES: Record<Exclude<StatusChangeCheck, { ok: true }>["reason"], string> = {
  "free-row": "Free registrations have no payment, so their status cannot be changed.",
  "member-row": "This person is part of a group. Change the status on the group's main registration instead.",
  "amount-required": "Enter the amount that was actually received.",
  "amount-invalid": "Enter an amount received that is more than 0 (for Underpaid, also less than the full price).",
  "already-in-status": "This registration is already in that status.",
};

export function checkStatusChange(i: {
  rowType: "individual" | "lead" | "member";
  from: RegistrationStatus;
  to: ChangeableStatus;
  expectedAmount: number | null;
  amount: number | null;
}): StatusChangeCheck {
  if (i.rowType === "member") return { ok: false, reason: "member-row" };
  if (i.from === "free") return { ok: false, reason: "free-row" };
  const reEnter = i.to === "underpaid" && i.from === "underpaid" && i.amount !== null;
  if (i.from === i.to && !reEnter) return { ok: false, reason: "already-in-status" };

  if (i.to === "underpaid") {
    if (i.amount === null) return { ok: false, reason: "amount-required" };
    if (!Number.isFinite(i.amount) || i.amount <= 0) return { ok: false, reason: "amount-invalid" };
    if (i.expectedAmount !== null && i.amount >= i.expectedAmount) return { ok: false, reason: "amount-invalid" };
    return { ok: true, amountReceived: i.amount };
  }
  if (i.to === "paid") {
    if (i.amount !== null) {
      if (!Number.isFinite(i.amount) || i.amount <= 0) return { ok: false, reason: "amount-invalid" };
      return { ok: true, amountReceived: i.amount };
    }
    return { ok: true, amountReceived: i.expectedAmount };
  }
  return { ok: true, amountReceived: null };
}
