// src/app/api/admin/landing-sheet-sync/scan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isPageId } from "@/lib/validations/landing";
import { getPageSheetInfo } from "@/lib/data/landing-event-sheet";
import { requestSheetScan } from "@/lib/gas/event-sheet-client";

export const maxDuration = 60;

const REQUESTED = "Scan requested. Results appear in a minute.";

/** Asks Google Sheets to check this page's sheet now. A slow reply still counts: the check carries on there. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = z.object({ pageId: z.string() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "That request was not understood. Refresh the page and try again." }, { status: 400 });
  if (!isPageId(body.data.pageId)) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const page = await getPageSheetInfo(body.data.pageId).catch(() => undefined);
  if (page === undefined) return NextResponse.json({ error: "Could not load the page." }, { status: 500 });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  if (!page.sheetId) return NextResponse.json({ error: "This page does not have a sheet yet." }, { status: 422 });

  const r = await requestSheetScan(page.sheetId);
  if (!r.ok && !/time(d)?[\s-]?out/i.test(r.message ?? "")) {
    return NextResponse.json({ error: `Could not ask Google Sheets to check the sheet: ${r.message ?? "no reply"}` }, { status: 502 });
  }
  return NextResponse.json({ message: REQUESTED });
}
