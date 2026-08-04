import { z } from "zod";

/**
 * Fixed reasons an admin can reject a payment submission. Presets rather than
 * free text because this string is emailed to the student verbatim — the
 * wording should not depend on who happens to be reviewing that day. "Other"
 * exists as the escape hatch, paired with the optional note.
 */
export const REJECTION_REASONS = [
  "Screenshot unreadable",
  "Amount incorrect",
  "Payment not received",
  "Duplicate submission",
  "Other",
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

const note = z.string().trim().max(500, "Note must be under 500 characters").optional();

export const reviewActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reserve"), note }),
  z.object({ action: z.literal("reject"), reason: z.enum(REJECTION_REASONS), note }),
  z.object({ action: z.literal("expire"), note }),
]);

export type ReviewAction = z.infer<typeof reviewActionSchema>;
export type ReviewActionName = ReviewAction["action"];

/** The status each action moves an enrollment into. */
export const ACTION_TARGET_STATUS = {
  approve: "active",
  reserve: "reserved",
  reject: "rejected",
  expire: "expired",
} as const satisfies Record<ReviewActionName, string>;

/**
 * Builds the rejection_reason string stored on the row and shown to the
 * student. The preset carries the meaning; the note adds specifics.
 */
export function composeRejectionReason(reason: RejectionReason, note?: string): string {
  const extra = note?.trim();
  return extra ? `${reason} — ${extra}` : reason;
}
