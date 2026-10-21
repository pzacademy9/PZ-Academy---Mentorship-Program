// src/app/api/admin/landing-sheet-sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isPageId } from "@/lib/validations/landing";
import { getSheetSyncStatus } from "@/lib/data/landing-sheet-sync";

/** What the sheet-sync review screen shows for one page. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const pageId = new URL(req.url).searchParams.get("pageId") ?? "";
  if (!isPageId(pageId)) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  try {
    return NextResponse.json(await getSheetSyncStatus(pageId));
  } catch (e) {
    if (e instanceof Error && e.message === "Page not found") return NextResponse.json({ error: "Page not found" }, { status: 404 });
    console.error("[landing-sheet-sync] status failed");
    return NextResponse.json({ error: "Could not load the sheet check. Please try again." }, { status: 500 });
  }
}
