// src/app/api/webhooks/landing-sheet-scan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listSheetsToScan, runScan } from "@/lib/data/landing-sheet-sync";

export const maxDuration = 60;

const MAX_ROWS = 5000;
const text = z.string().max(500);
const rowSchema = z.object({
  rowNumber: z.number().int().min(1),
  refId: text, email: text, name: text, whatsapp: text, status: text, amount: text, rowType: text,
});
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("listSheets") }),
  z.object({ action: z.literal("scan"), sheetId: z.string().min(1).max(500), rows: z.array(rowSchema).max(MAX_ROWS) }),
]);

/**
 * Receives full-sheet scans from the landing sheet Apps Script. The token is checked before any
 * database access; replies are plain and always HTTP 200 because the Apps Script ignores codes.
 */
export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch {
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." });
  }
}

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !process.env.SHEETS_SYNC_SECRET || body.token !== process.env.SHEETS_SYNC_SECRET) {
    return NextResponse.json({ status: "error", message: "Wrong password." });
  }

  if (body.action === "scan" && Array.isArray(body.rows) && body.rows.length > MAX_ROWS) {
    return NextResponse.json({ status: "error", message: `Too many rows (the limit is ${MAX_ROWS}).` });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Invalid input" });
  }

  if (parsed.data.action === "listSheets") {
    return NextResponse.json({ status: "success", sheets: await listSheetsToScan() });
  }

  const result = await runScan(parsed.data.sheetId, parsed.data.rows);
  if ("error" in result) {
    return NextResponse.json({ status: "error", message: "No landing page uses this sheet." });
  }
  return NextResponse.json({ status: "success", ...result });
}
