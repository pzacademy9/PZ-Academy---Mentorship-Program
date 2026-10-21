// src/app/api/admin/landing-sheet-sync/approve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isPageId } from "@/lib/validations/landing";
import { approveReport, ApproveRefused } from "@/lib/data/landing-sheet-sync";

export const maxDuration = 60;

const Body = z.object({
  pageId: z.string(),
  scannedAt: z.string().datetime({ offset: true }).nullable(),
  applyKeys: z.array(z.object({
    registrationId: z.string().uuid(),
    field: z.enum(["status", "amount", "name", "email", "whatsapp"]),
  })).max(5000),
});

/** Approves the first sheet check: ticked differences are taken from the sheet, the rest keep the app's values. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "That request was not understood. Refresh the page and try again." }, { status: 400 });
  if (!isPageId(body.data.pageId)) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  try {
    const result = await approveReport(body.data.pageId, body.data.applyKeys, body.data.scannedAt);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ApproveRefused) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error("[landing-sheet-sync] approve failed");
    return NextResponse.json({ error: "Could not finish the approval. Nothing was switched on; please try again." }, { status: 500 });
  }
}
