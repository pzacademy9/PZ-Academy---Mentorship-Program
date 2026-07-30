import "server-only";
import type { EnrollmentStatus } from "@/lib/validations/sheet-sync";

/**
 * Pushes a confirmed status back to the team's Google Sheet so it never
 * silently drifts from what the app actually has.
 *
 * One GAS deployment now serves every batch's sheet (see gas/sheets-sync/Code.gs),
 * so `sheetId` tells it which spreadsheet to open — it's no longer baked
 * into the script's own configuration.
 *
 * Fire-and-forget by design: a dead or misconfigured GAS deployment must
 * never block or roll back an in-app enrollment decision. This mirrors
 * sendEnrollmentEmail's "never throw" contract in src/lib/emails/enrollment.ts.
 */
export async function pushStatusToSheet(params: {
  sheetId: string;
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
        sheetId: params.sheetId,
        email: params.email,
        status: params.status,
        shortfallPkr: params.shortfallPkr ?? null,
      }),
    });
  } catch (error) {
    console.error(`[sheets-sync] failed to push status for ${params.email}:`, error);
  }
}

/**
 * Registers a new sheet with the GAS deployment so it starts watching that
 * spreadsheet for edits — the whole point being that onboarding a new batch
 * never requires opening the Apps Script editor. Idempotent on the GAS side
 * (calling it again for an already-registered sheet is a harmless no-op).
 *
 * Unlike pushStatusToSheet, this one does NOT swallow its own errors — an
 * admin clicking "Connect" needs to know whether the sheet is actually being
 * watched now, not just that the DB write succeeded.
 */
export async function registerSheet(
  sheetId: string,
): Promise<{ ok: boolean; message: string }> {
  const url = process.env.GAS_SHEETS_SYNC_URL;
  const token = process.env.SHEETS_SYNC_SECRET;
  if (!url || !token) {
    return { ok: false, message: "GAS_SHEETS_SYNC_URL or SHEETS_SYNC_SECRET is not configured." };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "registerSheet", sheetId }),
    });
    const data = (await res.json().catch(() => null)) as
      | { status?: string; message?: string }
      | null;

    if (!data || data.status !== "success") {
      return { ok: false, message: data?.message ?? "GAS did not confirm registration." };
    }
    return { ok: true, message: data.message ?? "Sheet registered." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Request failed." };
  }
}
