import "server-only";
import type { EnrollmentStatus } from "@/lib/validations/sheet-sync";

/**
 * Pushes a confirmed status back to the team's Google Sheet so it never
 * silently drifts from what the app actually has.
 *
 * Fire-and-forget by design: a dead or misconfigured GAS deployment must
 * never block or roll back an in-app enrollment decision. This mirrors
 * sendEnrollmentEmail's "never throw" contract in src/lib/emails/enrollment.ts.
 */
export async function pushStatusToSheet(params: {
  email: string;
  status: EnrollmentStatus;
  shortfallPkr?: number | null;
}): Promise<void> {
  const url = process.env.GAS_SHEETS_SYNC_URL;
  const token = process.env.SHEETS_SYNC_SECRET;
  if (!url || !token) {
    console.warn("[sheets-sync] push skipped: GAS_SHEETS_SYNC_URL or SHEETS_SYNC_SECRET not set");
    return;
  }

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        action: "applyStatus",
        email: params.email,
        status: params.status,
        shortfallPkr: params.shortfallPkr ?? null,
      }),
    });
  } catch (error) {
    console.error(`[sheets-sync] failed to push status for ${params.email}:`, error);
  }
}
