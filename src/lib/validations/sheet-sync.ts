import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";

export type EnrollmentStatus = Database["public"]["Enums"]["enrollment_status"];

/**
 * The four values the team's "Payment Confirmation" dropdown currently
 * supports. A 5th value is a follow-up, not handled here.
 */
export const PAYMENT_CONFIRMATION_VALUES = ["Paid", "Pending", "Underpaid", "Reserved"] as const;
export type PaymentConfirmation = (typeof PAYMENT_CONFIRMATION_VALUES)[number];

/**
 * Course-access rank per status. A sheet-driven change is a downgrade if it
 * would lower this number — see isDowngrade. rejected/expired share rank 0:
 * neither grants access, and there is no meaningful "downgrade" between them.
 */
export const RANK: Record<EnrollmentStatus, number> = {
  rejected: 0,
  expired: 0,
  pending: 1,
  reserved: 2,
  active: 3,
};

/**
 * True when applying `target` would lower the student's access below what
 * `current` already grants. Downgrades are never auto-applied from a sheet
 * edit — they're parked on sheet_pending_status until an admin confirms.
 */
export function isDowngrade(current: EnrollmentStatus, target: EnrollmentStatus): boolean {
  return RANK[target] < RANK[current];
}

/**
 * Translates one sheet row into the enrollment fields it implies.
 *
 * `amountPkr` is overloaded by the sheet's single "Amount" column: for every
 * confirmation value except Underpaid it is the amount received, stored on
 * payment_amount_pkr. For Underpaid, the team enters the amount still owed
 * in that same column — it becomes shortfallPkr instead, and
 * payment_amount_pkr is left null (the row doesn't tell us the partial
 * amount actually received, only the gap).
 */
export function mapSheetRow(row: {
  paymentConfirmation: PaymentConfirmation;
  amountPkr: number | null;
}): { status: EnrollmentStatus; paymentAmountPkr: number | null; shortfallPkr: number | null } {
  if (row.paymentConfirmation === "Underpaid") {
    return { status: "pending", paymentAmountPkr: null, shortfallPkr: row.amountPkr };
  }
  const status: EnrollmentStatus =
    row.paymentConfirmation === "Paid"
      ? "active"
      : row.paymentConfirmation === "Reserved"
        ? "reserved"
        : "pending";
  return { status, paymentAmountPkr: row.amountPkr, shortfallPkr: null };
}

const rowSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  paymentConfirmation: z.enum(PAYMENT_CONFIRMATION_VALUES),
  amountPkr: z.number().nonnegative().nullable().optional(),
});

/**
 * Inbound payload from gas/sheets-sync/Code.gs. Both actions carry the same
 * row shape — "newSubmission" is a row GAS has never synced before,
 * "statusChange" is an edit to the Payment Confirmation column on a row
 * GAS has already synced once.
 */
export const sheetSyncWebhookSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("newSubmission"), sheetId: z.string().min(1), row: rowSchema }),
  z.object({ action: z.literal("statusChange"), sheetId: z.string().min(1), row: rowSchema }),
]);

export type SheetSyncWebhookPayload = z.infer<typeof sheetSyncWebhookSchema>;
