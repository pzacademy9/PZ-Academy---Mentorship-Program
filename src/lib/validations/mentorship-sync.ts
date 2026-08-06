import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";

export type MentorshipBookingStatus = Database["public"]["Enums"]["mentorship_booking_status"];
export type MentorApplicationStatus = Database["public"]["Enums"]["mentor_application_status"];

/**
 * These are the only Sheet Status-column dropdown values gas/mentorship-sync/Code.gs
 * and this webhook agree on — both sheets are new columns added for this
 * integration, so the wording was chosen to match the enum 1:1 rather than
 * needing an arbitrary translation layer like the enrollment sheet's legacy
 * "Paid"/"Underpaid" wording (see src/lib/validations/sheet-sync.ts).
 */
export const BOOKING_SHEET_STATUS_VALUES = ["Pending", "Confirmed", "Cancelled"] as const;
export const APPLICATION_SHEET_STATUS_VALUES = ["Pending", "Approved", "Rejected"] as const;

export function mapBookingSheetStatus(value: string): MentorshipBookingStatus | null {
  switch (value.trim()) {
    case "Confirmed":
      return "confirmed";
    case "Cancelled":
      return "cancelled";
    case "Pending":
      return "pending";
    default:
      return null;
  }
}

export function mapApplicationSheetStatus(value: string): MentorApplicationStatus | null {
  switch (value.trim()) {
    case "Approved":
      return "approved";
    case "Rejected":
      return "rejected";
    case "Pending":
      return "pending";
    default:
      return null;
  }
}

const rowSchema = z.object({
  email: z.string().trim().email(),
  status: z.string().trim().min(1),
});

/** Inbound payload from gas/mentorship-sync/Code.gs. */
export const mentorshipSyncWebhookSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("newSubmission"),
    sheetKind: z.enum(["booking", "application"]),
    row: rowSchema,
  }),
  z.object({
    action: z.literal("statusChange"),
    sheetKind: z.enum(["booking", "application"]),
    row: rowSchema,
  }),
]);

export type MentorshipSyncWebhookPayload = z.infer<typeof mentorshipSyncWebhookSchema>;
