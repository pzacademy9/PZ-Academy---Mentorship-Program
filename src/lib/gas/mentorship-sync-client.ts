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

/**
 * Permanently deletes the matching Sheet row for a deleted booking/
 * application. Unlike pushMentorshipStatusToSheet, this checks the GAS
 * response — a delete is destructive and rarer than a status change, so the
 * extra round-trip is worth surfacing a real failure to the admin instead
 * of silently leaving the Sheet row behind.
 */
export async function pushMentorshipDelete(params: {
  sheetKind: "booking" | "application";
  email: string;
  timestamp: string;
}): Promise<{ ok: boolean; message?: string }> {
  const url = process.env.MENTORSHIP_SYNC_URL;
  const secret = process.env.MENTORSHIP_SYNC_SECRET;
  if (!url || !secret) {
    const message = "MENTORSHIP_SYNC_URL or MENTORSHIP_SYNC_SECRET not set";
    console.warn(`[mentorship-sync] delete skipped: ${message}`);
    return { ok: false, message };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        action: "deleteRow",
        sheetKind: params.sheetKind,
        email: params.email,
        timestamp: params.timestamp,
      }),
    });
    const json: { status?: string; message?: string } = await res.json();
    if (json.status === "success") return { ok: true };

    const message = json.message ?? "GAS returned an unsuccessful response with no message";
    console.warn(`[mentorship-sync] delete row failed for ${params.email}: ${message}`);
    return { ok: false, message };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mentorship-sync] failed to delete row for ${params.email}:`, error);
    return { ok: false, message };
  }
}
