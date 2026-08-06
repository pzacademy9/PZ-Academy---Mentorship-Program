import "server-only";
import type { MentorshipBookingStatus, MentorApplicationStatus } from "@/lib/validations/mentorship-sync";

/**
 * Pushes a confirmed booking/application status back to the team's Sheet.
 * Structurally identical to pushStatusToSheet (src/lib/gas/sheets-sync-client.ts):
 * fire-and-forget, never throws — a dead GAS deployment must never block an
 * admin's in-app decision.
 */
export async function pushMentorshipStatusToSheet(params: {
  sheetKind: "booking" | "application";
  email: string;
  status: MentorshipBookingStatus | MentorApplicationStatus;
}): Promise<void> {
  const url = process.env.MENTORSHIP_SYNC_URL;
  const secret = process.env.MENTORSHIP_SYNC_SECRET;
  if (!url || !secret) {
    console.warn("[mentorship-sync] push skipped: MENTORSHIP_SYNC_URL or MENTORSHIP_SYNC_SECRET not set");
    return;
  }

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        action: "applyStatus",
        sheetKind: params.sheetKind,
        email: params.email,
        status: params.status,
      }),
    });
  } catch (error) {
    console.error(`[mentorship-sync] failed to push status for ${params.email}:`, error);
  }
}
