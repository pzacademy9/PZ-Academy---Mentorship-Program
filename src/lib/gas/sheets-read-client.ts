import "server-only";

/**
 * Typed client for the two sheet-read actions added to the GAS relay.
 *
 * Unlike pushStatusToSheet (fire-and-forget, swallows its own errors), these
 * calls DO surface failure: an admin importing a spreadsheet needs to know
 * that the read failed, because the alternative is a silently empty import.
 * This mirrors registerSheet's contract in sheets-sync-client.ts.
 */

export type SheetTab = { name: string; headers: string[]; rowCount: number };

export type SheetTabsResult =
  | { ok: true; sheetName: string; tabs: SheetTab[] }
  | { ok: false; message: string };

export type SheetRowsResult =
  | { ok: true; rows: string[][]; total: number }
  | { ok: false; message: string };

const PAGE_SIZE = 500;

async function callGas(payload: Record<string, unknown>): Promise<
  { ok: true; json: Record<string, unknown> } | { ok: false; message: string }
> {
  const url = process.env.GAS_SHEETS_SYNC_URL;
  const token = process.env.SHEETS_SYNC_SECRET;
  if (!url || !token) {
    return { ok: false, message: "Sheet reading is not configured (GAS_SHEETS_SYNC_URL / SHEETS_SYNC_SECRET missing)." };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...payload }),
    });
    if (!res.ok) return { ok: false, message: `Sheet service returned ${res.status}.` };

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json) return { ok: false, message: "Sheet service returned an unreadable response." };
    if (json.status !== "success") {
      return { ok: false, message: String(json.message ?? "Sheet service rejected the request.") };
    }
    return { ok: true, json };
  } catch (error) {
    console.error("[sheets-read] request failed:", error);
    return { ok: false, message: "Could not reach the sheet service." };
  }
}

export async function listSheetTabs(sheetId: string): Promise<SheetTabsResult> {
  const result = await callGas({ action: "listSheetTabs", sheetId });
  if (!result.ok) return result;

  const tabs = Array.isArray(result.json.tabs) ? (result.json.tabs as SheetTab[]) : [];
  return { ok: true, sheetName: String(result.json.sheetName ?? ""), tabs };
}

export async function readSheetRows(
  sheetId: string,
  tabName: string,
  offset: number,
  limit: number = PAGE_SIZE,
): Promise<SheetRowsResult> {
  const result = await callGas({ action: "readSheetRows", sheetId, tabName, offset, limit });
  if (!result.ok) return result;

  const rows = Array.isArray(result.json.rows) ? (result.json.rows as string[][]) : [];
  return { ok: true, rows, total: Number(result.json.total ?? rows.length) };
}

/**
 * Pages through an entire tab. Apps Script caps a single response, so a
 * 900-row cohort sheet needs two round trips; this hides that from callers.
 *
 * The page cap doubles as a runaway guard: 40 pages is 20,000 rows, far
 * beyond any real cohort sheet, so hitting it means something is wrong
 * rather than large.
 */
export async function readAllSheetRows(sheetId: string, tabName: string): Promise<SheetRowsResult> {
  const all: string[][] = [];
  let offset = 0;
  let total = 0;

  for (let page = 0; page < 40; page += 1) {
    const result = await readSheetRows(sheetId, tabName, offset, PAGE_SIZE);
    if (!result.ok) return result;

    all.push(...result.rows);
    total = result.total;
    offset += result.rows.length;

    if (result.rows.length === 0 || offset >= total) break;
  }

  return { ok: true, rows: all, total };
}

/** Extracts the spreadsheet id from a full Google Sheets URL, or returns a bare id unchanged. */
export function extractSheetId(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match?.[1]) return match[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(trimmed) ? trimmed : null;
}
