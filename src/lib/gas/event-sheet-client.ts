// src/lib/gas/event-sheet-client.ts
import "server-only";
import type { RegistrationStatus } from "@/lib/landing/registration/config";

/**
 * Client for the landing-page actions in gas/sheets-sync/Code.gs. Same web app as
 * sheets-sync-client.ts (GAS_SHEETS_SYNC_URL). Sheet actions use SHEETS_SYNC_SECRET as
 * `token`; the Drive upload uses GAS_SHARED_SECRET as `secret`. Neither secret is ever
 * logged or returned. Every function returns a result instead of throwing; callers that
 * need retries (the outbox) turn `ok: false` into a thrown error themselves.
 */

type GasReply = Record<string, unknown> & { status?: unknown; message?: unknown };
const TIMEOUT_MS = 25_000;

async function postToGas(body: Record<string, unknown>): Promise<{ ok: true; data: GasReply } | { ok: false; message: string }> {
  const url = process.env.GAS_SHEETS_SYNC_URL;
  if (!url) return { ok: false, message: "GAS_SHEETS_SYNC_URL is not configured." };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, message: `Apps Script returned HTTP ${res.status}.` };
    const data = (await res.json().catch(() => null)) as GasReply | null;
    if (!data) return { ok: false, message: "Apps Script returned a non-JSON reply." };
    if (data.status !== "success") {
      return { ok: false, message: typeof data.message === "string" && data.message ? data.message : "Apps Script reported an error." };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: err instanceof Error && err.name === "TimeoutError" ? "Apps Script timed out." : "Could not reach Apps Script." };
  }
}

export async function createEventSheet(
  title: string,
  folderName: string = title,
): Promise<{ ok: true; sheetId: string; driveFolderId: string } | { ok: false; message: string }> {
  const token = process.env.SHEETS_SYNC_SECRET;
  if (!token) return { ok: false, message: "SHEETS_SYNC_SECRET is not configured." };
  const r = await postToGas({ token, action: "createEventSheet", title, folderName });
  if (!r.ok) return r;
  const { sheetId, driveFolderId } = r.data;
  if (typeof sheetId !== "string" || !sheetId || typeof driveFolderId !== "string" || !driveFolderId) {
    return { ok: false, message: "Apps Script did not return the new sheet." };
  }
  return { ok: true, sheetId, driveFolderId };
}

export async function appendRegistrationRows(sheetId: string, rows: string[][]): Promise<{ ok: boolean; message?: string }> {
  const token = process.env.SHEETS_SYNC_SECRET;
  if (!token) return { ok: false, message: "SHEETS_SYNC_SECRET is not configured." };
  const r = await postToGas({ token, action: "appendRegistrationRows", sheetId, rows });
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}

export interface StatusSheetRow { refId: string; email: string; status: RegistrationStatus; amountReceived: number | null }

/** Writes the current payment status (and amount received) onto existing sheet rows, matched on Ref ID + email. */
export async function applyRegistrationStatus(sheetId: string, rows: StatusSheetRow[]): Promise<{ ok: boolean }> {
  const token = process.env.SHEETS_SYNC_SECRET;
  if (!token) return { ok: false };
  const r = await postToGas({ token, action: "applyRegistrationStatus", sheetId, rows });
  return { ok: r.ok };
}

export interface VoucherFile { base64: string; mimeType: string; filename: string }

export async function uploadLandingVoucher(
  pageSlug: string,
  file: VoucherFile,
  folderId?: string | null,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const secret = process.env.GAS_SHARED_SECRET;
  if (!secret) return { ok: false, message: "GAS_SHARED_SECRET is not configured." };
  const r = await postToGas({
    action: "uploadLandingVoucher",
    secret,
    pageSlug,
    mimeType: file.mimeType,
    base64: file.base64,
    filename: file.filename,
    folderId: folderId ?? null,
  });
  if (!r.ok) return r;
  const url = r.data.url;
  if (typeof url !== "string" || !/^https:\/\//.test(url)) return { ok: false, message: "Apps Script did not return a file link." };
  return { ok: true, url };
}
